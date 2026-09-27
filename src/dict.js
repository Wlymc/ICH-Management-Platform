import { all, get, insert, run, update, count } from './db.js';
import { toInt, text, longText } from './util.js';

export const DICT_KINDS = {
  category: {
    label: '非遗类别',
    table: 'heritage_category',
    columns: [
      { name: 'name', label: '类别名称', required: true },
      { name: 'code', label: '罗马数字代号' },
      { name: 'summary', label: '类别说明', type: 'textarea' },
      { name: 'sort_order', label: '排序', type: 'number' },
    ],
    order: 'sort_order, id',
    labelField: 'name',
  },
  level: {
    label: '名录级别',
    table: 'heritage_level',
    columns: [
      { name: 'name', label: '级别名称', required: true },
      { name: 'weight', label: '权重（越大越高）', type: 'number' },
      { name: 'sort_order', label: '排序', type: 'number' },
    ],
    order: 'sort_order, id',
    labelField: 'name',
  },
  region: {
    label: '行政区域',
    table: 'region',
    columns: [
      { name: 'name', label: '区域名称', required: true },
      { name: 'parent_id', label: '上级区域', type: 'ref', ref: 'region' },
      { name: 'region_level', label: '层级', type: 'select', options: ['province', 'city', 'county'] },
      { name: 'code', label: '行政区划代码' },
      { name: 'sort_order', label: '排序', type: 'number' },
    ],
    order: 'sort_order, name',
    labelField: 'name',
  },
  batch: {
    label: '公布批次',
    table: 'dict_item',
    scoped: true,
    columns: [
      { name: 'name', label: '批次名称', required: true },
      { name: 'sort_order', label: '排序', type: 'number' },
    ],
    order: 'sort_order, id',
    labelField: 'name',
  },
  org_type: {
    label: '基地类型',
    table: 'dict_item',
    scoped: true,
    columns: [
      { name: 'name', label: '类型名称', required: true },
      { name: 'sort_order', label: '排序', type: 'number' },
    ],
    order: 'sort_order, id',
    labelField: 'name',
  },
};

export function dictList(kind) {
  const spec = DICT_KINDS[kind];
  if (!spec) return [];
  if (spec.scoped) {
    return all(`SELECT * FROM dict_item WHERE kind = ? ORDER BY ${spec.order}`, [kind]);
  }
  return all(`SELECT * FROM ${spec.table} ORDER BY ${spec.order}`);
}

function normalize(kind, payload) {
  const spec = DICT_KINDS[kind];
  const data = {};
  for (const column of spec.columns) {
    if (!(column.name in payload)) continue;
    const raw = payload[column.name];
    if (column.type === 'number') data[column.name] = toInt(raw, 0) ?? 0;
    else if (column.type === 'textarea') data[column.name] = longText(raw, 2000);
    else if (column.type === 'ref') data[column.name] = toInt(raw, null);
    else data[column.name] = text(raw, 200);
  }
  if (spec.scoped) {
    data.kind = kind;
    if (!('sort_order' in data)) data.sort_order = 0;
  }
  return data;
}

export function dictCreate(kind, payload) {
  const spec = DICT_KINDS[kind];
  if (!spec) throw new Error('未知字典类型');
  const data = normalize(kind, payload);
  const name = data.name || '';
  if (!name) throw new Error('名称不能为空');
  const dup = get(
    spec.scoped
      ? 'SELECT id FROM dict_item WHERE kind = ? AND name = ?'
      : `SELECT id FROM ${spec.table} WHERE name = ?`,
    spec.scoped ? [kind, name] : [name],
  );
  if (dup) throw new Error(`「${name}」已存在`);
  if (!('sort_order' in data)) data.sort_order = 0;
  return insert(spec.table, data);
}

export function dictUpdate(kind, id, payload) {
  const spec = DICT_KINDS[kind];
  if (!spec) throw new Error('未知字典类型');
  const current = spec.scoped
    ? get('SELECT * FROM dict_item WHERE id = ? AND kind = ?', [id, kind])
    : get(`SELECT * FROM ${spec.table} WHERE id = ?`, [id]);
  if (!current) throw new Error('记录不存在');
  const data = normalize(kind, payload);
  delete data.kind;
  if (!Object.keys(data).length) return;
  update(spec.table, id, data);
}

const REFERENCE_CHECKS = [
  { sql: 'SELECT COUNT(*) AS n FROM project WHERE category_id = ?', kind: 'category', label: '非遗项目' },
  { sql: 'SELECT COUNT(*) AS n FROM project WHERE level_id = ?', kind: 'level', label: '非遗项目' },
  { sql: 'SELECT COUNT(*) AS n FROM inheritor WHERE level_id = ?', kind: 'level', label: '传承人' },
  { sql: 'SELECT COUNT(*) AS n FROM project WHERE region_id = ?', kind: 'region', label: '非遗项目' },
  { sql: 'SELECT COUNT(*) AS n FROM inheritor WHERE region_id = ?', kind: 'region', label: '传承人' },
  { sql: 'SELECT COUNT(*) AS n FROM organization WHERE region_id = ?', kind: 'region', label: '传承基地' },
  { sql: 'SELECT COUNT(*) AS n FROM region WHERE parent_id = ?', kind: 'region', label: '下级区域' },
];

export function dictUsage(kind, id) {
  return REFERENCE_CHECKS.filter((check) => check.kind === kind).map((check) => ({
    label: check.label,
    total: count(check.sql, [id]),
  }));
}

export function dictDelete(kind, id) {
  const spec = DICT_KINDS[kind];
  if (!spec) throw new Error('未知字典类型');
  const usage = dictUsage(kind, id);
  const blocked = usage.find((item) => item.total > 0);
  if (blocked) throw new Error(`该条目已被 ${blocked.total} 条「${blocked.label}」使用，无法删除`);
  if (kind === 'batch' || kind === 'org_type') {
    const column = kind === 'batch' ? 'batch' : 'org_type';
    const tables = kind === 'batch' ? ['project', 'inheritor'] : ['organization'];
    for (const table of tables) {
      const used = count(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = (SELECT name FROM dict_item WHERE id = ?)`, [id]);
      if (used > 0) throw new Error('该条目已被档案数据使用，无法删除');
    }
  }
  run(`DELETE FROM ${spec.table} WHERE id = ?${spec.scoped ? ' AND kind = ?' : ''}`, spec.scoped ? [id, kind] : [id]);
}

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 3000;

export function dicts(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheTime < CACHE_TTL) return cache;
  const categories = dictList('category');
  const levels = dictList('level');
  const regions = dictList('region');
  const batches = dictList('batch');
  const orgTypes = dictList('org_type');

  const regionById = new Map(regions.map((r) => [r.id, r]));
  const regionLabel = (id) => {
    const parts = [];
    let node = regionById.get(Number(id));
    let guard = 0;
    while (node && guard < 6) {
      parts.unshift(node.name);
      node = node.parent_id ? regionById.get(Number(node.parent_id)) : null;
      guard += 1;
    }
    return parts.join(' / ');
  };

  const categoryById = new Map(categories.map((c) => [c.id, c.name]));
  const levelById = new Map(levels.map((l) => [l.id, l.name]));
  const organizations = all('SELECT id, code, name, org_type, region_id, is_open, open_hours, address, manager, phone, email, traffic, experience, status FROM organization ORDER BY name');
  const organizationById = new Map(organizations.map((o) => [o.id, o]));

  const lookup = {
    category: new Map(categories.map((c) => [c.name, c.id])),
    level: new Map(levels.map((l) => [l.name, l.id])),
    region: new Map(regions.map((r) => [r.name, r.id])),
    'region-path': new Map(regions.map((r) => [regionLabel(r.id), r.id])),
    organization: new Map(organizations.map((o) => [o.name, o.id])),
    batch: new Set(batches.map((b) => b.name)),
    org_type: new Set(orgTypes.map((t) => t.name)),
  };

  cache = {
    categories,
    levels,
    regions,
    batches,
    orgTypes,
    organizations,
    regionById,
    regionLabel,
    categoryById,
    levelById,
    organizationById,
    lookup,
  };
  cacheTime = now;
  return cache;
}

export function invalidateDicts() {
  cache = null;
  cacheTime = 0;
}

/** 解析行政区划文本（支持"江苏省 / 南京市 / 秦淮区"或仅名称），返回 region_id */
export function resolveRegion(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const byId = get('SELECT id FROM region WHERE id = ?', [Number(raw)]);
    if (byId) return byId.id;
  }
  const d = dicts();
  if (d.lookup['region-path'].has(raw)) return d.lookup['region-path'].get(raw);
  const normalized = raw.replace(/\s*[/>、]\s*/g, '/');
  if (d.lookup['region-path'].has(normalized)) return d.lookup['region-path'].get(normalized);
  const tail = normalized.split('/').pop();
  const matches = d.regions.filter((r) => r.name === tail || `${r.name}` === raw);
  if (matches.length === 1) return matches[0].id;
  return null;
}

export function resolveRef(refName, value) {
  if (value === null || value === undefined || value === '') return null;
  if (refName === 'region') return resolveRegion(value);
  const d = dicts();
  if (refName === 'category') {
    if (/^\d+$/.test(String(value))) {
      const row = get('SELECT id FROM heritage_category WHERE id = ?', [Number(value)]);
      if (row) return row.id;
    }
    return d.lookup.category.get(String(value).trim()) ?? null;
  }
  if (refName === 'level') {
    if (/^\d+$/.test(String(value))) {
      const row = get('SELECT id FROM heritage_level WHERE id = ?', [Number(value)]);
      if (row) return row.id;
    }
    return d.lookup.level.get(String(value).trim()) ?? null;
  }
  if (refName === 'organization') {
    if (/^\d+$/.test(String(value))) {
      const row = get('SELECT id FROM organization WHERE id = ?', [Number(value)]);
      if (row) return row.id;
    }
    return d.lookup.organization.get(String(value).trim()) ?? null;
  }
  return null;
}

export function labelFor(resource, field, row) {
  const d = dicts();
  const value = row[field.name];
  if (value === null || value === undefined || value === '') {
    return field.type === 'bool' ? (value ? '是' : '否') : '';
  }
  switch (field.type) {
    case 'ref':
      if (field.ref === 'category') return d.categoryById.get(Number(value)) || '';
      if (field.ref === 'level') return d.levelById.get(Number(value)) || '';
      if (field.ref === 'region') return d.regionLabel(value);
      if (field.ref === 'organization') return d.organizationById.get(Number(value))?.name || '';
      return String(value);
    case 'bool':
      return Number(value) ? '是' : '否';
    default:
      return String(value);
  }
}
