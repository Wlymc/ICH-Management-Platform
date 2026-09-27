import crypto from 'node:crypto';

export function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/** HTML 转义，所有模板输出都必须经过它 */
export function h(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function attr(value) {
  return h(value);
}

export function uid(prefix = '') {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export function token(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function text(value, max = 100) {
  if (value === null || value === undefined) return '';
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

export function longText(value, max = 20000) {
  if (value === null || value === undefined) return '';
  const s = String(value).replace(/\r\n/g, '\n').trim();
  return s.length > max ? s.slice(0, max) : s;
}

export function toInt(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

export function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(/[、,，;；/|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function summarize(before, after) {
  const keys = Object.keys(after);
  const changed = keys.filter((k) => String(before?.[k] ?? '') !== String(after[k] ?? ''));
  return changed.slice(0, 8).map((k) => `${k} 变更`).join('，') || '无字段变化';
}

export function truncate(str, len = 120) {
  const s = text(str, 10000);
  return s.length > len ? `${s.slice(0, len)}…` : s;
}

export function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/** GBK / UTF-8 BOM 自动识别解码，适配中文版 Excel 导出的 CSV */
export function decodeTextBuffer(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3));
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2));
  }
  const strict = new TextDecoder('utf-8', { fatal: false });
  const utf8 = strict.decode(buffer);
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch {
    return utf8;
  }
}

export function safeFileName(name) {
  return String(name || 'file')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .slice(0, 80);
}

export function relativeTime(iso) {
  if (!iso) return '';
  const t = new Date(iso.replace(' ', 'T')).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return iso.slice(0, 10);
}

export function sortItems(items, sortKey, sortDir) {
  const dir = sortDir === 'asc' ? 1 : -1;
  if (!sortKey) return items;
  return [...items].sort((a, b) => {
    const av = a?.[sortKey] ?? '';
    const bv = b?.[sortKey] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'zh-Hans-CN') * dir;
  });
}

export function paginate(total, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = clamp(page || 1, 1, totalPages);
  return { page: current, pageSize, total, totalPages, offset: (current - 1) * pageSize };
}
