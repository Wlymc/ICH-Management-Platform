import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PATHS } from './config.js';
import { all, get, insert, run } from './db.js';
import { nowIso, text, toInt } from './util.js';
import { categoryAliases } from './resources.js';
import { dicts } from './dict.js';
import { findProvinceInText } from './regions.js';
import { searchAll, hrefFor, snippet } from './search.js';

const CONFIG_PATH = path.join(PATHS.data, 'ai-config.json');

const DEFAULTS = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  model: 'glm-4-flash',
  apiKey: '',
  timeoutMs: 20000,
  temperature: 0.3,
  maxTokens: 600,
  enabled: true,
};

/** 允许发给模型的白名单（出域控制）：只发字段摘要，不发长文全文、图片、账号、日志 */
const OUTBOUND_FIELDS = ['名称', '类别', '级别', '批次', '年份', '省份', '姓名', '从业年限', '关键词', '摘要'];

/* ---------------- 配置 ---------------- */

export function loadConfig() {
  let fileConfig = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch {
    /* 配置损坏时退回默认值 */
  }
  const envEnabled = process.env.AI_ENABLED;
  return {
    ...DEFAULTS,
    ...fileConfig,
    baseUrl: process.env.AI_BASE_URL || fileConfig.baseUrl || DEFAULTS.baseUrl,
    model: process.env.AI_MODEL || fileConfig.model || DEFAULTS.model,
    apiKey: process.env.AI_API_KEY || fileConfig.apiKey || DEFAULTS.apiKey,
    enabled: envEnabled === undefined
      ? fileConfig.enabled ?? DEFAULTS.enabled
      : !['0', 'false', 'off', 'no'].includes(String(envEnabled).toLowerCase()),
  };
}

export function saveConfig(patch) {
  const current = loadConfig();
  const next = { ...current };
  if (patch.baseUrl !== undefined) next.baseUrl = text(patch.baseUrl, 300);
  if (patch.model !== undefined) next.model = text(patch.model, 120);
  if (patch.apiKey !== undefined) {
    // 空字符串表示不改动已保存的密钥；只有显式传入新值才覆盖
    const value = text(patch.apiKey, 400);
    if (value) next.apiKey = value;
  }
  if (patch.clearApiKey) next.apiKey = '';
  if (patch.timeoutMs !== undefined) next.timeoutMs = Math.min(Math.max(toInt(patch.timeoutMs, 20000), 3000), 120000);
  if (patch.maxTokens !== undefined) next.maxTokens = Math.min(Math.max(toInt(patch.maxTokens, 600), 64), 4000);
  if (patch.temperature !== undefined) {
    const value = Number(patch.temperature);
    next.temperature = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.3;
  }
  if (patch.enabled !== undefined) next.enabled = patch.enabled === true || patch.enabled === 1 || patch.enabled === 'true';
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

/** 对外只回显密钥后四位 */
export function publicConfig() {
  const config = loadConfig();
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    enabled: config.enabled,
    timeoutMs: config.timeoutMs,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    hasApiKey: Boolean(config.apiKey),
    apiKeyMasked: config.apiKey ? `${config.apiKey.slice(0, 4)}…${config.apiKey.slice(-4)}` : '',
  };
}

export function isReady() {
  const config = loadConfig();
  return Boolean(config.enabled && config.baseUrl && config.apiKey);
}

/* ---------------- 大模型客户端（OpenAI 兼容） ---------------- */

function joinUrl(baseUrl, suffix) {
  return `${String(baseUrl).replace(/\/+$/, '')}${suffix}`;
}

/**
 * 调用大模型。options 里的 baseUrl / model / apiKey 可临时覆盖配置，
 * 便于评测脚本在一条命令里切厂商，而不改动已保存的配置。
 */
export async function chat(messages, options = {}) {
  const config = loadConfig();
  const baseUrl = options.baseUrl || config.baseUrl;
  const apiKey = options.apiKey || config.apiKey;
  const model = options.model || config.model;
  if (!config.enabled && !options.force) return { ok: false, error: 'AI 功能未启用', code: 'disabled' };
  if (!baseUrl || !apiKey) return { ok: false, error: '未配置服务地址或密钥', code: 'unconfigured' };
  const started = Date.now();
  try {
    const response = await fetch(joinUrl(baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || undefined,
        messages,
        temperature: options.temperature ?? config.temperature,
        max_tokens: options.maxTokens ?? config.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? config.timeoutMs),
    });
    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}：${raw.slice(0, 200)}`, code: 'http', status: response.status };
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: '返回内容不是合法 JSON', code: 'parse' };
    }
    const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
    return {
      ok: true,
      content: String(content).trim(),
      model: data.model || model,
      tokens: (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0),
      costMs: Date.now() - started,
    };
  } catch (error) {
    const name = error?.name;
    const code = error?.cause?.code || '';
    const reason =
      name === 'TimeoutError' || name === 'AbortError'
        ? '请求超时'
        : code === 'ENOTFOUND' || code === 'EAI_AGAIN'
          ? '域名解析失败'
          : code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EACCES'
            ? '网络不可达'
            : error?.message || '未知错误';
    return { ok: false, error: reason, code: 'network' };
  }
}

export async function testConnection() {
  const result = await chat(
    [
      { role: 'system', content: '你是连通性测试助手，只回一句话。' },
      { role: 'user', content: '请回复：连接成功' },
    ],
    { maxTokens: 32, timeoutMs: 15000 },
  );
  return {
    ok: result.ok,
    model: result.model || loadConfig().model,
    reply: result.ok ? result.content.slice(0, 80) : '',
    costMs: result.costMs || 0,
    error: result.ok ? '' : result.error,
    code: result.ok ? '' : result.code,
  };
}

/* ---------------- 指令规则引擎（不调用大模型） ---------------- */

const LEVEL_NAMES = ['国家级', '省级', '市级', '县级'];
const BATCH_NAMES = ['第一批', '第二批', '第三批', '第四批', '第五批'];
const STATUS_WORDS = { 草稿: 'draft', 待审核: 'pending', 已发布: 'published', 已退回: 'rejected', 已下架: 'archived' };

function detectTarget(raw) {
  if (/传承人|传人|传承者|师傅|艺人/.test(raw)) return 'inheritor';
  if (/基地|体验点|保护单位|传习所/.test(raw)) return 'organization';
  return 'project';
}

export function parseQuery(input) {
  const raw = String(input || '').trim();
  const target = detectTarget(raw);
  const d = dicts();
  const labels = [];
  const filters = {};

  // 类别
  const category = d.categories.find(
    (item) => categoryAliases(item.name).some((alias) => raw.includes(alias)),
  );
  if (category) {
    filters.category_id = category.id;
    labels.push(`类别：${category.name}`);
  }

  // 级别
  const level = d.levels.find((item) => raw.includes(item.name));
  if (level) {
    filters.level_id = level.id;
    labels.push(`级别：${level.name}`);
  }

  // 省份
  const provinceName = findProvinceInText(raw);
  if (provinceName) {
    const province = d.regions.find((r) => r.name === provinceName && r.region_level === 'province');
    if (province) {
      filters.region_id = province.id;
      labels.push(`省份：${provinceName}`);
    }
  }

  // 批次
  const batch = BATCH_NAMES.find((item) => raw.includes(item));
  if (batch) {
    filters.batch = batch;
    labels.push(`批次：${batch}`);
  }

  // 状态
  const statusWord = Object.keys(STATUS_WORDS).find((word) => raw.includes(word));
  if (statusWord) {
    filters.status = STATUS_WORDS[statusWord];
    labels.push(`状态：${statusWord}`);
  }

  // 从业年限（出生年月缺失时的替代口径）
  const careerMatch = raw.match(/(?:从业|从艺|学艺|传承)\s*(?:超过|大于|不少于|满|达|已有)?\s*(\d+)\s*年/);
  if (careerMatch) {
    filters.minCareerYears = Number(careerMatch[1]);
    labels.push(`从业不少于 ${filters.minCareerYears} 年`);
  }

  // 年龄（缺少出生年月，按从业年限近似并在界面标注口径）
  const ageMatch = raw.match(/(\d+)\s*(?:岁|周岁)/);
  if (ageMatch) {
    const age = Number(ageMatch[1]);
    filters.minCareerYears = Math.max(Number(filters.minCareerYears || 0), Math.max(age - 22, 1));
    labels.push(`年龄 ${age} 岁以上（按从业年限 ≥ ${filters.minCareerYears} 年近似，出生年月待补录）`);
  }

  // 近 N 年未更新
  const recentMatch = raw.match(/近\s*([一二三四五六七八九十\d]+)\s*年/);
  if (recentMatch && /未更新|没有更新|无更新|未录入|停滞/.test(raw)) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const years = map[recentMatch[1]] || Number(recentMatch[1]) || 0;
    if (years) {
      filters.staleYears = years;
      labels.push(`近 ${years} 年未更新`);
    }
  }

  const topMatch = raw.match(/(?:前|最多|排名前|top)\s*(\d+)/i) || raw.match(/(\d+)\s*(?:个|项|位|条)/);
  const topN = topMatch ? Math.min(Number(topMatch[1]), 50) : 10;

  return { target, filters, labels, topN };
}

function buildWhere(target, filters) {
  const table = target === 'inheritor' ? 'inheritor' : target === 'organization' ? 'organization' : 'project';
  const where = [`t.status = 'published'`];
  const params = [];
  if (target === 'inheritor') {
    if (filters.level_id) {
      where.push('t.level_id = ?');
      params.push(filters.level_id);
    }
    if (filters.region_id) {
      where.push('t.region_id = ?');
      params.push(filters.region_id);
    }
    if (filters.batch) {
      where.push('t.batch = ?');
      params.push(filters.batch);
    }
    if (filters.status) {
      where[0] = 't.status = ?';
      params.unshift(filters.status);
    }
    if (filters.minCareerYears) {
      where.push('t.career_start_year IS NOT NULL AND (? - t.career_start_year) >= ?');
      params.push(new Date().getFullYear(), filters.minCareerYears);
    }
    if (filters.staleYears) {
      where.push("t.updated_at <= date('now', ?)");
      params.push(`-${filters.staleYears} years`);
    }
  } else if (target === 'organization') {
    if (filters.region_id) {
      where.push('t.region_id = ?');
      params.push(filters.region_id);
    }
  } else {
    if (filters.category_id) {
      where.push('t.category_id = ?');
      params.push(filters.category_id);
    }
    if (filters.level_id) {
      where.push('t.level_id = ?');
      params.push(filters.level_id);
    }
    if (filters.region_id) {
      where.push('(t.region_id = ? OR EXISTS (SELECT 1 FROM project_region pr WHERE pr.project_id = t.id AND pr.region_id = ?))');
      params.push(filters.region_id, filters.region_id);
    }
    if (filters.batch) {
      where.push('t.batch = ?');
      params.push(filters.batch);
    }
    if (filters.status) {
      where[0] = 't.status = ?';
      params.unshift(filters.status);
    }
    if (filters.staleYears) {
      where.push("t.updated_at <= date('now', ?)");
      params.push(`-${filters.staleYears} years`);
    }
  }
  return { table, clause: `WHERE ${where.join(' AND ')}`, params };
}

function titleColumn(target) {
  return 'name';
}

/**
 * 执行指令型查询：返回命中数与可点击的直达链接。
 * audience='public' 时只给门户链接（游客不该看到任何管理端地址）。
 */
export function runQuery(input, { user, audience = 'admin' } = {}) {
  const parsed = parseQuery(input);
  const { table, clause, params } = buildWhere(parsed.target, parsed.filters);
  const total = get(`SELECT COUNT(*) AS n FROM ${table} t ${clause}`, params).n;
  const rows = all(
    `SELECT t.id, t.${titleColumn(parsed.target)} AS title FROM ${table} t ${clause} ORDER BY t.id LIMIT ?`,
    [...params, parsed.topN],
  );

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed.filters)) {
    if (['category_id', 'level_id', 'region_id', 'batch', 'status'].includes(key)) query.set(key, String(value));
  }
  const links = [];
  if (parsed.filters.status) query.set('status', parsed.filters.status);

  const adminBase = parsed.target === 'inheritor' ? '/admin/inheritors' : parsed.target === 'organization' ? '/admin/organizations' : '/admin/projects';
  const publicBase = parsed.target === 'inheritor' ? '/inheritors' : parsed.target === 'organization' ? '/organizations' : '/projects';
  const queryString = query.toString();
  const isPublic = audience === 'public';
  if (!isPublic) {
    links.push({ label: `在管理端查看（${total} 条）`, href: queryString ? `${adminBase}?${queryString}` : adminBase });
  }
  if (!parsed.filters.status || parsed.filters.status === 'published') {
    const publicQuery = new URLSearchParams();
    for (const key of ['category_id', 'level_id', 'region_id']) {
      if (query.get(key)) publicQuery.set(key, query.get(key));
    }
    const href = publicQuery.toString() ? `${publicBase}?${publicQuery.toString()}` : publicBase;
    links.push({ label: isPublic ? `查看全部（${total} 条）` : '在公众门户查看', href });
  }
  for (const row of rows) {
    if (parsed.target === 'organization') continue;
    links.push({
      label: `${row.title}`,
      href: `/${parsed.target === 'inheritor' ? 'inheritors' : 'projects'}/${row.id}`,
      detail: true,
    });
  }

  const targetLabel = parsed.target === 'inheritor' ? '传承人' : parsed.target === 'organization' ? '传承基地' : '非遗项目';
  const description = parsed.labels.length
    ? `筛选条件：${parsed.labels.join('；')}`
    : '未识别到具体筛选条件，已按全部已发布内容统计';

  let reply = `按「${description}」共找到 ${total} 条${targetLabel}${total > parsed.topN ? `，下面列出前 ${parsed.topN} 条` : ''}。`;
  if (total === 0 && parsed.filters.staleYears) {
    reply += `\n\n（口径说明：「近 ${parsed.filters.staleYears} 年未更新」按档案的更新时间判断。刚完成批量导入时所有记录的更新时间都是最近，因此结果为 0 属于正常现象。）`;
  }
  if (total === 0 && !parsed.labels.length) {
    reply = '没有识别出可执行的筛选条件。可以试试：「传统技艺类项目」「内蒙古的民俗项目」「列出第五批国家级项目」「从业超过 30 年的传承人」。';
  }
  void user;
  return { kind: 'query', reply, total, parsed, links: links.slice(0, parsed.topN + 2) };
}

/* ---------------- 问答（检索增强 + 降级） ---------------- */

/** 提问常用词，检索前先剔除，避免整句匹配不到任何资料 */
const QUESTION_STOPWORDS = [
  '请问', '帮我', '我想', '想知道', '告诉我', '介绍一下', '解释一下', '讲解一下',
  '是什么', '什么意思', '有哪些', '有什么', '怎么样', '怎么回事', '为什么', '如何', '怎么',
  '解释', '介绍', '讲解', '说明', '一下', '哪些', '什么', '多少', '是否', '可以', '能不能',
  '它的', '它的', '相关', '关于', '以及', '还有', '这个', '那个', '这种', '以及',
];

/**
 * 从自然语言问题里抽取检索关键词。
 * 先给出去掉疑问词后的整串（能命中完整项目名），再按长度从长到短给出子串，
 * 解决「苏绣用什么材料」这类整句检索命中 0 条的问题。
 */
export function extractKeywords(input, { max = 40 } = {}) {
  const question = String(input || '').trim();
  if (!question) return [];
  let cleaned = question.replace(/[，。！？、；：""''（）【】《》,.!?;:()\[\]<>]/g, ' ');
  for (const word of QUESTION_STOPWORDS) cleaned = cleaned.split(word).join(' ');
  const tokens = cleaned
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const candidates = [];
  const push = (value) => {
    const item = value.trim();
    if (item.length >= 2 && !candidates.includes(item)) candidates.push(item);
  };
  if (tokens.length) push(tokens.join(''));
  for (const token of tokens) {
    push(token);
    // 生成 2-6 字子串，长词优先
    for (let size = Math.min(6, token.length); size >= 2; size -= 1) {
      for (let start = 0; start + size <= token.length; start += 1) {
        push(token.slice(start, start + size));
      }
    }
  }
  // 整句本身也作为候选（用于精确项目名，如「格萨（斯）尔」）
  push(question);
  candidates.sort((a, b) => b.length - a.length);
  return candidates.slice(0, max);
}

/** 多轮检索：整串优先，命中不足时用关键词补齐 */
export function retrieve(question, { limit = 6 } = {}) {
  const results = [];
  const seen = new Set();
  const merge = (hits) => {
    for (const hit of hits) {
      const key = `${hit.type}#${hit.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(hit);
    }
  };
  merge(searchAll(question, { limit }));
  if (results.length >= limit) return results.slice(0, limit);
  for (const keyword of extractKeywords(question)) {
    if (results.length >= limit) break;
    merge(searchAll(keyword, { limit: limit - results.length }));
  }
  return results.slice(0, limit);
}

function buildContext(hits) {
  const lines = [];
  for (const hit of hits) {
    const typeLabel = hit.type === 'project' ? '非遗项目' : hit.type === 'inheritor' ? '传承人' : '知识条目';
    lines.push(`【${typeLabel}】${hit.title}：${hit.snippet}`);
  }
  return lines.join('\n');
}

function degradedReply(question, hits, audience = 'admin') {
  const prefix = audience === 'public' ? '当前为站内检索模式（AI 能力暂时不可用）' : '当前为大模型不可用时的本地检索模式';
  if (!hits.length) {
    return `暂未在站内资料中检索到与「${question}」相关的内容。可以换一个更具体的项目名、技艺或传承人姓名再试，例如「苗族古歌」「苏绣」「格萨（斯）尔」。`;
  }
  const lines = hits.slice(0, 3).map((hit, index) => {
    const label = hit.type === 'project' ? '项目' : hit.type === 'inheritor' ? '传承人' : '知识';
    return `${index + 1}. [${label}] ${hit.title}：${hit.snippet}`;
  });
  return `${prefix}，以下是与「${question}」相关的站内资料：\n\n${lines.join('\n')}`;
}

export async function answerQuestion(question, { user, audience = 'admin', maxTokens, model, baseUrl, apiKey, force } = {}) {
  const hits = retrieve(question, { limit: 6 });
  const sources = hits.map((hit) => ({
    type: hit.type,
    id: hit.id,
    title: hit.title,
    href: hrefFor(hit.type, hit.id),
    snippet: hit.snippet,
  }));

  const override = model || baseUrl || apiKey;
  if (!override && !isReady()) {
    return { kind: 'answer', reply: degradedReply(question, hits, audience), sources, degraded: true, reason: '未配置大模型' };
  }

  const context = buildContext(hits);
  const messages = [
    {
      role: 'system',
      content: [
        '你是「非遗数字管理平台」的助手，面向文化馆工作人员与公众介绍中国国家级非物质文化遗产。',
        '只依据「站内资料」回答；资料没有的内容，明确说“站内资料中没有相关信息”，不要编造。',
        '回答用中文，简明清晰，200 字以内；可以分点，但不要用 Markdown 表格。',
        '不要在回答里复述资料编号或链接，系统会另外展示来源列表。',
      ].join('\n'),
    },
    { role: 'user', content: `站内资料：\n${context || '（没有检索到相关资料）'}\n\n问题：${question}` },
  ];
  const result = await chat(messages, { maxTokens, model, baseUrl, apiKey, force });
  if (!result.ok) {
    return { kind: 'answer', reply: degradedReply(question, hits, audience), sources, degraded: true, reason: result.error };
  }
  void user;
  return {
    kind: 'answer',
    reply: result.content,
    sources,
    degraded: false,
    model: result.model,
    tokens: result.tokens,
  };
}

/** 入口：判断是指令型还是问答型，并记录会话 */
export async function runCopilot(input, { user, sessionId, audience = 'admin', maxTokens } = {}) {
  const question = String(input || '').trim();
  if (!question) throw Object.assign(new Error('请输入问题或指令'), { statusCode: 400 });

  const { isQueryIntent } = detectIntent(question);

  const guest = audience === 'public';
  const id = sessionId || crypto.randomUUID();
  if (!guest && !get('SELECT id FROM ai_session WHERE id = ?', [id])) {
    insert('ai_session', {
      id,
      user_id: user ? Number(user.id) : null,
      title: question.slice(0, 40),
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }
  // 游客请求不建会话记录，避免会话表膨胀
  if (!guest) {
    insert('ai_message', {
      session_id: id,
      role: 'user',
      content: question,
      kind: isQueryIntent ? 'query' : 'answer',
      degraded: 0,
      links: '[]',
      sources: '[]',
      model: '',
      tokens: 0,
      created_at: nowIso(),
    });
  }

  const result = isQueryIntent
    ? runQuery(question, { user, audience })
    : await answerQuestion(question, { user, audience, maxTokens });

  if (!guest) {
    insert('ai_message', {
      session_id: id,
      role: 'assistant',
      content: result.reply,
      kind: result.kind,
      degraded: result.degraded ? 1 : 0,
      links: JSON.stringify(result.links || []),
      sources: JSON.stringify(result.sources || []),
      model: result.model || '',
      tokens: result.tokens || 0,
      created_at: nowIso(),
    });
    run('UPDATE ai_session SET updated_at = ? WHERE id = ?', [nowIso(), id]);
  }

  // 出域审计：记录本次发送给模型的字段白名单与命中来源
  run(
    `INSERT INTO audit_log (user_id, user_name, action, target_type, target_id, target_name, detail, ip, created_at)
     VALUES (?, ?, 'ai', 'ai_session', NULL, ?, ?, '', ?)`,
    [
      user ? Number(user.id) : null,
      guest ? '游客' : user ? user.display_name : '匿名',
      result.kind === 'query' ? (guest ? '游客指令查询' : 'AI 指令查询') : guest ? '游客问答' : 'AI 问答',
      `${result.kind}｜命中 ${(result.sources || []).length} 条来源${result.degraded ? '｜本地降级' : ''}｜出域字段：${OUTBOUND_FIELDS.join('/')}`,
      nowIso(),
    ],
  );

  return { sessionId: guest ? undefined : id, ...result };
}

/**
 * 意图判定：出现筛选动词，或识别到明确筛选条件且不带疑问词 → 指令型。
 * 抽成独立函数，接口层限流与编排层共用同一套判定，避免口径不一致。
 */
export function detectIntent(question) {
  const text = String(question || '');
  const hasQueryVerb = /(找出|筛[选出]|列出|哪些|多少|统计|查询|有没有|查看|挑[选出]|给我看|找一?下?)/.test(text);
  const hasQuestionWord = /(怎么|如何|为什么|是什么|什么意思|解释|介绍|讲讲|讲解|说明一下)/.test(text);
  const parsed = parseQuery(text);
  const hasFilters = parsed.labels.length > 0;
  return { isQueryIntent: !hasQuestionWord && (hasQueryVerb || hasFilters), parsed };
}

export function listSessions(user, limit = 20) {
  const params = [];
  let clause = '';
  if (user && user.role !== 'admin') {
    clause = 'WHERE user_id = ?';
    params.push(Number(user.id));
  }
  return all(
    `SELECT id, title, created_at, updated_at FROM ai_session ${clause} ORDER BY updated_at DESC LIMIT ?`,
    [...params, limit],
  );
}

export function getSession(id, user) {
  const session = get('SELECT * FROM ai_session WHERE id = ?', [id]);
  if (!session) return null;
  if (user && user.role !== 'admin' && Number(session.user_id) !== Number(user.id)) return null;
  const messages = all('SELECT * FROM ai_message WHERE session_id = ? ORDER BY id', [id]).map((row) => ({
    ...row,
    links: safeParse(row.links),
    sources: safeParse(row.sources),
  }));
  return { session, messages };
}

function safeParse(value) {
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
}

export const KNOWLEDGE_KINDS = [
  '术语', '材料', '技法', '纹样', '唱腔', '动作', '仪式', '节令', '流派', '历史事件', '其他',
];

export { OUTBOUND_FIELDS, snippet };
