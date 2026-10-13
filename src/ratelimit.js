import { db, get, run } from './db.js';

/**
 * 游客接口限流（按 IP + 时间窗）。
 *
 * 规则：
 *   - 整体：每 IP 每分钟 6 次、每日 200 次
 *   - 问答型（消耗模型额度）：额外限制每分钟 3 次
 *   - 指令型（本地规则，零成本）：放宽到每分钟 15 次
 */
export const RATE_RULES = {
  ask: [
    { suffix: 'ask', limit: 3, ttlMs: 60 * 1000 },
    { suffix: 'min', limit: 6, ttlMs: 60 * 1000 },
    { suffix: 'day', limit: 200, ttlMs: 24 * 60 * 60 * 1000 },
  ],
  query: [
    { suffix: 'qmin', limit: 15, ttlMs: 60 * 1000 },
    { suffix: 'day', limit: 200, ttlMs: 24 * 60 * 60 * 1000 },
  ],
  general: [
    { suffix: 'min', limit: 6, ttlMs: 60 * 1000 },
    { suffix: 'day', limit: 200, ttlMs: 24 * 60 * 60 * 1000 },
  ],
};

/**
 * 演示模式：答辩现场多人共用同一出口 IP，容易触发限流导致全场被锁。
 * 用环境变量切换档位：
 *   set GUEST_AI_LIMIT=relaxed   宽松（问答 20/分、指令 60/分、每日 2000）
 *   set GUEST_AI_LIMIT=off       基本关闭（仍保留每日 5000 次的总兜底）
 * 默认 normal。
 */
const PROFILES = {
  relaxed: {
    ask: [
      { suffix: 'ask', limit: 20, ttlMs: 60 * 1000 },
      { suffix: 'min', limit: 30, ttlMs: 60 * 1000 },
      { suffix: 'day', limit: 2000, ttlMs: 24 * 60 * 60 * 1000 },
    ],
    query: [
      { suffix: 'qmin', limit: 60, ttlMs: 60 * 1000 },
      { suffix: 'day', limit: 2000, ttlMs: 24 * 60 * 60 * 1000 },
    ],
  },
  off: {
    ask: [{ suffix: 'day', limit: 5000, ttlMs: 24 * 60 * 60 * 1000 }],
    query: [{ suffix: 'day', limit: 5000, ttlMs: 24 * 60 * 60 * 1000 }],
  },
};

export function activeLimitProfile() {
  const value = String(process.env.GUEST_AI_LIMIT || 'normal').toLowerCase();
  return PROFILES[value] ? value : 'normal';
}

function rulesFor(kind) {
  const profile = PROFILES[activeLimitProfile()];
  if (profile) return profile[kind] || profile.ask || RATE_RULES.general;
  return RATE_RULES[kind] || RATE_RULES.general;
}

function bucketKey(ip, suffix, now) {
  if (suffix === 'day') return `${ip}|day|${new Date(now).toISOString().slice(0, 10)}`;
  return `${ip}|${suffix}|${Math.floor(now / 60000)}`;
}

/** 清掉过期行；不需要每次请求都清 */
export function pruneRateLimit(now = Date.now()) {
  run('DELETE FROM rate_limit WHERE expires_at < ?', [now]);
}

/**
 * 检查并记账。
 * 返回 { allowed, reason, retryAfterMs, remaining }
 */
export function checkRateLimit(ip, kind = 'general', now = Date.now()) {
  const rules = rulesFor(kind);
  const key = String(ip || 'unknown');
  const buckets = rules.map((rule) => ({ ...rule, bucket: bucketKey(key, rule.suffix, now) }));

  for (const item of buckets) {
    const row = get('SELECT hits, expires_at FROM rate_limit WHERE bucket = ?', [item.bucket]);
    if (row && Number(row.hits) >= item.limit) {
      return {
        allowed: false,
        reason: item.suffix === 'day' ? '今日提问次数已达上限' : '提问太频繁',
        retryAfterMs: Math.max(Number(row.expires_at) - now, 1000),
        limit: item.limit,
      };
    }
  }

  for (const item of buckets) {
    const expiresAt = now + item.ttlMs;
    run(
      `INSERT INTO rate_limit (bucket, hits, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1, expires_at = excluded.expires_at`,
      [item.bucket, expiresAt],
    );
  }

  const main = buckets[0];
  const current = get('SELECT hits FROM rate_limit WHERE bucket = ?', [main.bucket]);
  return {
    allowed: true,
    remaining: Math.max(main.limit - Number(current?.hits || 0), 0),
    limit: main.limit,
  };
}

export function rateLimitStats() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM rate_limit WHERE expires_at > ?').get(Date.now());
  return { activeBuckets: Number(row.n) };
}
