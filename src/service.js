import { all, count, get, insert, run, transaction, update } from './db.js';
import {
  GROUPS,
  RESOURCES,
  STATUS,
  fieldOf,
  getResource,
  importFields,
  listFields,
} from './resources.js';
import { dicts, invalidateDicts, resolveRef, resolveRegion } from './dict.js';
import { clamp, nowIso, paginate, text, longText, toInt } from './util.js';

export const SORTABLE = ['updated_at', 'created_at', 'name', 'code', 'published_year', 'certified_year'];

export function canEdit(user, row) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(row.created_by) === Number(user.id) && ['draft', 'rejected'].includes(row.status);
}

export function canDelete(user, row) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(row.created_by) === Number(user.id) && row.status === 'draft';
}

export function canSubmit(user, row) {
  if (!user) return false;
  if (user.role === 'admin') return ['draft', 'rejected'].includes(row.status);
  return Number(row.created_by) === Number(user.id) && ['draft', 'rejected'].includes(row.status);
}

export function canReview(user) {
  return user?.role === 'admin';
}

/** 把表单或导入的原始值规范化为数据库列 */
export function normalizePayload(resource, payload, { partial = false } = {}) {
  const data = {};
  for (const field of resource.fields) {
    if (!(field.name in payload)) continue;
    const raw = payload[field.name];
    switch (field.type) {
      case 'ref':
        data[field.name] = resolveRef(field.ref, raw);
        break;
      case 'year':
        data[field.name] = toInt(raw, null);
        break;
      case 'bool':
        data[field.name] = raw === true || raw === 1 || raw === '1' || raw === '是' || raw === 'true' ? 1 : 0;
        break;
      case 'textarea':
        data[field.name] = longText(raw, 20000);
        break;
      default:
        data[field.name] = text(raw, 400);
    }
  }
  if (!partial) {
    for (const field of resource.fields) {
      if (!(field.name in data) && field.type === 'bool') data[field.name] = 0;
    }
  }
  return data;
}

export function validatePayload(resource, data, { isCreate = false } = {}) {
  const errors = [];
  for (const field of resource.fields) {
    const required = field.required || (isCreate && field.name === resource.codeField);
    if (!required) continue;
    const value = data[field.name];
    if (value === null || value === undefined || value === '') {
      errors.push(`${field.label}不能为空`);
    }
  }
  if (data.code) {
    const dup = get(`SELECT id FROM ${resource.table} WHERE code = ?`, [data.code]);
    if (dup) errors.push(`编号「${data.code}」已存在`);
  }
  return errors;
}

function regionScope(regionId) {
  const d = dicts();
  const node = d.regionById.get(Number(regionId));
  if (!node) return [Number(regionId)];
  const ids = [node.id];
  const queue = [node.id];
  let guard = 0;
  while (queue.length && guard < 500) {
    const current = queue.shift();
    for (const region of d.regions) {
      if (Number(region.parent_id) === Number(current)) {
        ids.push(region.id);
        queue.push(region.id);
      }
    }
    guard += 1;
  }
  return ids;
}

export function buildQuery(resource, query, user, { publicOnly = false } = {}) {
  const where = [];
  const params = [];

  if (publicOnly) {
    where.push(`t.status = 'published'`);
  } else if (query.status) {
    if (query.status === 'mine') {
      where.push('t.created_by = ?');
      params.push(Number(user?.id ?? -1));
    } else if (query.status === 'todo') {
      where.push("t.status IN ('draft', 'rejected') AND t.created_by = ?");
      params.push(Number(user?.id ?? -1));
    } else if (STATUS[query.status]) {
      where.push('t.status = ?');
      params.push(query.status);
    }
  }
  if (query.mine === '1' && user) {
    where.push('t.created_by = ?');
    params.push(Number(user.id));
  }

  for (const field of resource.fields) {
    if (!field.filter) continue;
    const raw = query[field.name];
    if (raw === undefined || raw === null || raw === '') continue;
    if (field.type === 'ref' && field.ref === 'region') {
      const id = resolveRegion(raw);
      if (id) {
        const ids = regionScope(id);
        where.push(`t.${field.name} IN (${ids.map(() => '?').join(', ')})`);
        params.push(...ids);
      }
    } else {
      where.push(`t.${field.name} = ?`);
      params.push(String(raw));
    }
  }

  const keyword = text(query.q || query.keyword, 80);
  if (keyword) {
    const searchable = resource.fields.filter((field) => field.search);
    const cols = searchable.length ? searchable.map((field) => `t.${field.name}`) : [`t.${resource.titleField}`];
    const extra = ['t.code'];
    if (resource.key === 'project') extra.push('t.keywords', 't.summary', 't.protection_unit');
    if (resource.key === 'inheritor') extra.push('t.skill', 't.story_title', 't.address');
    if (resource.key === 'organization') extra.push('t.address', 't.experience', 't.intro');
    const searchColumns = [...new Set([...cols, ...extra])];
    where.push(`(${searchColumns.map((c) => `IFNULL(${c}, '') LIKE ?`).join(' OR ')})`);
    for (const _ of searchColumns) params.push(`%${keyword}%`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { clause, params };
}

export function listResource(resource, query, user, options = {}) {
  const { clause, params } = buildQuery(resource, query, user, options);
  const total = count(`SELECT COUNT(*) AS n FROM ${resource.table} t ${clause}`, params);
  const pageSize = clamp(toInt(query.pageSize, options.pageSize ?? 15), 1, 200);
  const pageInfo = paginate(total, toInt(query.page, 1), pageSize);
  const sortKey = SORTABLE.includes(query.sort) ? query.sort : resource.defaultSort;
  const sortDir = query.dir === 'asc' ? 'ASC' : 'DESC';
  const items = all(
    `SELECT t.* FROM ${resource.table} t ${clause} ORDER BY t.${sortKey} ${sortDir} LIMIT ? OFFSET ?`,
    [...params, pageInfo.pageSize, pageInfo.offset],
  );
  return { ...pageInfo, items, sort: sortKey, dir: query.dir === 'asc' ? 'asc' : 'desc' };
}

export function getRow(resource, id) {
  return get(`SELECT * FROM ${resource.table} WHERE id = ?`, [id]);
}

export function writeAudit(user, action, targetType, targetId, targetName, detail = '', ip = '') {
  insert('audit_log', {
    user_id: user ? user.id : null,
    user_name: user ? user.display_name : '匿名',
    action,
    target_type: targetType,
    target_id: targetId ?? null,
    target_name: targetName ?? '',
    detail,
    ip,
    created_at: nowIso(),
  });
}

export function createRow(resource, payload, user, ip = '') {
  const data = normalizePayload(resource, payload);
  const errors = validatePayload(resource, data, { isCreate: true });
  if (errors.length) {
    const error = new Error(errors.join('；'));
    error.statusCode = 400;
    throw error;
  }
  const timestamp = nowIso();
  data.status = 'draft';
  data.created_by = user.id;
  data.created_at = timestamp;
  data.updated_at = timestamp;
  const id = transaction(() => {
    const newId = insert(resource.table, data);
    if (resource.hasRelation && Array.isArray(payload.__inheritors)) {
      setProjectInheritors(newId, payload.__inheritors);
    }
    if (resource.hasRelation && Array.isArray(payload.__projects)) {
      setInheritorProjects(newId, payload.__projects);
    }
    return newId;
  });
  writeAudit(user, 'create', resource.key, id, data[resource.titleField], '新建记录', ip);
  return id;
}

export function updateRow(resource, id, payload, user, ip = '') {
  const row = getRow(resource, id);
  if (!row) throw notFound();
  if (!canEdit(user, row)) throw forbidden('当前状态下无权编辑该记录');
  const data = normalizePayload(resource, payload, { partial: true });
  const merged = { ...row, ...data };
  const errors = [];
  for (const field of resource.fields) {
    if (!field.required) continue;
    const value = merged[field.name];
    if (value === null || value === undefined || value === '') errors.push(`${field.label}不能为空`);
  }
  if (data.code && data.code !== row.code) {
    const dup = get(`SELECT id FROM ${resource.table} WHERE code = ? AND id <> ?`, [data.code, id]);
    if (dup) errors.push(`编号「${data.code}」已存在`);
  }
  if (errors.length) {
    const error = new Error(errors.join('；'));
    error.statusCode = 400;
    throw error;
  }
  data.updated_at = nowIso();
  transaction(() => {
    update(resource.table, id, data);
    if (resource.hasRelation && Array.isArray(payload.__inheritors)) {
      setProjectInheritors(id, payload.__inheritors);
    }
    if (resource.hasRelation && Array.isArray(payload.__projects)) {
      setInheritorProjects(id, payload.__projects);
    }
  });
  writeAudit(user, 'update', resource.key, id, merged[resource.titleField], '更新记录', ip);
  return id;
}

export function deleteRow(resource, id, user, ip = '') {
  const row = getRow(resource, id);
  if (!row) throw notFound();
  if (!canDelete(user, row)) throw forbidden('无权删除该记录');
  transaction(() => {
    if (resource.key === 'project') run('DELETE FROM project_inheritor WHERE project_id = ?', [id]);
    if (resource.key === 'inheritor') run('DELETE FROM project_inheritor WHERE inheritor_id = ?', [id]);
    run('DELETE FROM attachment WHERE owner_type = ? AND owner_id = ?', [resource.key, id]);
    run(`DELETE FROM ${resource.table} WHERE id = ?`, [id]);
  });
  writeAudit(user, 'delete', resource.key, id, row[resource.titleField], '删除记录及其多媒体档案', ip);
}

export function bulkAction(resource, ids, action, user, ip = '') {
  const results = { ok: 0, failed: [] };
  for (const id of ids) {
    try {
      if (action === 'submit') submitRow(resource, id, user, ip);
      else if (action === 'delete') deleteRow(resource, id, user, ip);
      else throw new Error('未知操作');
      results.ok += 1;
    } catch (error) {
      const row = getRow(resource, id);
      results.failed.push(`${row?.[resource.titleField] || `#${id}`}：${error.message}`);
    }
  }
  return results;
}

export function submitRow(resource, id, user, ip = '') {
  const row = getRow(resource, id);
  if (!row) throw notFound();
  if (!canSubmit(user, row)) throw forbidden('当前状态下无法提交审核');
  const missing = [];
  for (const field of resource.fields) {
    if (!field.required) continue;
    const value = row[field.name];
    if (value === null || value === undefined || value === '') missing.push(field.label);
  }
  if (missing.length) {
    const error = new Error(`以下必填项尚未填写：${missing.join('、')}`);
    error.statusCode = 400;
    throw error;
  }
  update(resource.table, id, { status: 'pending', review_note: '', updated_at: nowIso() });
  writeAudit(user, 'submit', resource.key, id, row[resource.titleField], '提交审核', ip);
}

export function reviewRow(resource, id, action, note, user, ip = '') {
  if (!canReview(user)) throw forbidden('仅管理员可执行审核');
  const row = getRow(resource, id);
  if (!row) throw notFound();
  if (row.status !== 'pending') {
    const error = new Error('仅待审核状态的记录可以审核');
    error.statusCode = 400;
    throw error;
  }
  const approving = action === 'approve';
  if (!approving && !text(note, 500)) {
    const error = new Error('退回时必须填写审核意见');
    error.statusCode = 400;
    throw error;
  }
  update(resource.table, id, {
    status: approving ? 'published' : 'rejected',
    review_note: longText(note, 1000),
    reviewed_by: user.id,
    review_at: nowIso(),
    updated_at: nowIso(),
  });
  writeAudit(
    user,
    approving ? 'approve' : 'reject',
    resource.key,
    id,
    row[resource.titleField],
    approving ? '审核通过并发布' : `退回：${text(note, 120)}`,
    ip,
  );
}

export function pendingCount(resource) {
  return count(`SELECT COUNT(*) AS n FROM ${resource.table} WHERE status = 'pending'`);
}

/* ---------------- 关联关系 ---------------- */

export function getProjectInheritors(projectId) {
  return all(
    `SELECT i.*, pi.is_representative FROM project_inheritor pi
     JOIN inheritor i ON i.id = pi.inheritor_id
     WHERE pi.project_id = ? ORDER BY pi.is_representative DESC, i.name`,
    [projectId],
  );
}

export function getInheritorProjects(inheritorId) {
  return all(
    `SELECT p.*, pi.is_representative FROM project_inheritor pi
     JOIN project p ON p.id = pi.project_id
     WHERE pi.inheritor_id = ? ORDER BY p.name`,
    [inheritorId],
  );
}

export function getOrganizationProjects(organizationId, { publicOnly = false } = {}) {
  return all(
    `SELECT * FROM project WHERE organization_id = ?${publicOnly ? " AND status = 'published'" : ''} ORDER BY name`,
    [organizationId],
  );
}

export function setProjectInheritors(projectId, inheritorIds) {
  run('DELETE FROM project_inheritor WHERE project_id = ?', [projectId]);
  const seen = new Set();
  const first = Array.isArray(inheritorIds) && inheritorIds.length ? inheritorIds[0] : null;
  for (const value of inheritorIds || []) {
    const id = toInt(value, null);
    if (!id || seen.has(id)) continue;
    if (!get('SELECT id FROM inheritor WHERE id = ?', [id])) continue;
    seen.add(id);
    run('INSERT OR IGNORE INTO project_inheritor (project_id, inheritor_id, is_representative) VALUES (?, ?, ?)', [
      projectId,
      id,
      Number(id) === Number(first) ? 1 : 1,
    ]);
  }
}

export function setInheritorProjects(inheritorId, projectIds) {
  run('DELETE FROM project_inheritor WHERE inheritor_id = ?', [inheritorId]);
  for (const value of projectIds || []) {
    const id = toInt(value, null);
    if (!id) continue;
    if (!get('SELECT id FROM project WHERE id = ?', [id])) continue;
    run('INSERT OR IGNORE INTO project_inheritor (project_id, inheritor_id, is_representative) VALUES (?, ?, 1)', [id, inheritorId]);
  }
}

/* ---------------- 多媒体档案 ---------------- */

export function listAttachments(ownerType, ownerId) {
  return all('SELECT * FROM attachment WHERE owner_type = ? AND owner_id = ? ORDER BY kind, id DESC', [ownerType, ownerId]);
}

export function addAttachment(data, user, ip = '') {
  const id = insert('attachment', {
    owner_type: data.ownerType,
    owner_id: data.ownerId,
    kind: data.kind,
    title: text(data.title, 120),
    note: longText(data.note, 500),
    file_name: text(data.fileName, 200),
    file_path: text(data.filePath, 300),
    file_size: toInt(data.fileSize, 0) ?? 0,
    mime_type: text(data.mimeType, 120),
    external_url: text(data.externalUrl, 500),
    uploaded_by: user.id,
    created_at: nowIso(),
  });
  const owner = getOwner(resourceOfOwner(data.ownerType), data.ownerId);
  writeAudit(user, 'upload', data.ownerType, data.ownerId, owner?.name || '', `新增${data.kind}档案`, ip);
  return id;
}

export function deleteAttachment(id, user, ip = '') {
  const row = get('SELECT * FROM attachment WHERE id = ?', [id]);
  if (!row) throw notFound();
  const ownerResource = resourceOfOwner(row.owner_type);
  const owner = getOwner(ownerResource, row.owner_id);
  if (!owner) throw notFound();
  if (!canEdit(user, owner)) throw forbidden('无权删除该档案');
  run('DELETE FROM attachment WHERE id = ?', [id]);
  // 若被删除的是封面/肖像图，同步清空引用，避免门户出现失效图片
  const imageColumn = row.owner_type === 'inheritor' ? 'photo_path' : 'cover_path';
  if (row.file_path) {
    const current = get(`SELECT ${imageColumn} AS path FROM ${ownerResource.table} WHERE id = ?`, [row.owner_id]);
    if (current && current.path === row.file_path) {
      run(`UPDATE ${ownerResource.table} SET ${imageColumn} = '' WHERE id = ?`, [row.owner_id]);
    }
  }
  writeAudit(user, 'delete', 'attachment', id, row.title || row.file_name, `删除${row.kind}档案`, ip);
  return row;
}

export function resourceOfOwner(ownerType) {
  return getResource(ownerType);
}

export function getOwner(resource, id) {
  if (!resource) return null;
  return get(`SELECT * FROM ${resource.table} WHERE id = ?`, [id]);
}

export function ownAttachment(ownerType, ownerId, attachmentId) {
  const row = get('SELECT * FROM attachment WHERE id = ?', [attachmentId]);
  return row && row.owner_type === ownerType && Number(row.owner_id) === Number(ownerId) ? row : null;
}

/* ---------------- 统计 ---------------- */

function countBy(table, column, extraWhere = '', params = []) {
  return all(
    `SELECT ${column} AS key, COUNT(*) AS n FROM ${table} ${extraWhere ? `WHERE ${extraWhere}` : ''} GROUP BY ${column} ORDER BY n DESC`,
    params,
  );
}

export function dashboardStats() {
  const d = dicts();
  const pub = "status = 'published'";
  const totalProjects = count('SELECT COUNT(*) AS n FROM project');
  const totalInheritors = count('SELECT COUNT(*) AS n FROM inheritor');
  const totalOrgs = count('SELECT COUNT(*) AS n FROM organization');
  const totalAttachments = count('SELECT COUNT(*) AS n FROM attachment');
  const published = {
    projects: count(`SELECT COUNT(*) AS n FROM project WHERE ${pub}`),
    inheritors: count(`SELECT COUNT(*) AS n FROM inheritor WHERE ${pub}`),
    organizations: count(`SELECT COUNT(*) AS n FROM organization WHERE ${pub}`),
  };
  const statusRows = [];
  for (const key of Object.keys(RESOURCES)) {
    const rows = countBy(RESOURCES[key].table, 'status');
    for (const row of rows) {
      statusRows.push({ resource: key, status: row.key, total: Number(row.n) });
    }
  }

  const categoryRows = countBy('project', 'category_id', pub);
  const byCategory = categoryRows.map((row) => ({
    name: d.categoryById.get(Number(row.key)) || '未分类',
    value: Number(row.n),
  }));

  const levelRows = countBy('project', 'level_id', pub);
  const byLevel = d.levels.map((level) => ({
    name: level.name,
    value: Number(levelRows.find((row) => Number(row.key) === level.id)?.n || 0),
  })).reverse();

  const yearRows = all(
    `SELECT published_year AS year, COUNT(*) AS n FROM project
     WHERE ${pub} AND published_year IS NOT NULL GROUP BY published_year ORDER BY published_year`,
  );

  const regionRows = countBy('project', 'region_id', pub);
  const byRegion = regionRows
    .map((row) => {
      const region = d.regionById.get(Number(row.key));
      const parent = region?.parent_id ? d.regionById.get(Number(region.parent_id)) : null;
      const grand = parent?.parent_id ? d.regionById.get(Number(parent.parent_id)) : null;
      const label = grand ? `${grand.name}·${parent?.name || ''}·${region?.name || ''}` : parent ? `${parent.name}·${region?.name || ''}` : region?.name || '未标注';
      return { name: label, value: Number(row.n) };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const inheritorLevelRows = countBy('inheritor', 'level_id', pub);
  const byInheritorLevel = d.levels.map((level) => ({
    name: level.name,
    value: Number(inheritorLevelRows.find((row) => Number(row.key) === level.id)?.n || 0),
  }));

  const attachmentKinds = countBy('attachment', 'kind');
  const byAttachmentKind = attachmentKinds.map((row) => ({
    name: { image: '图片', audio: '音频', video: '视频', document: '文档' }[row.key] || row.key,
    value: Number(row.n),
  }));

  const recentLogs = all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 8');
  const recentProjects = all(
    `SELECT id, code, name, status, updated_at FROM project ORDER BY id DESC LIMIT 6`,
  );
  const pendingByResource = Object.keys(RESOURCES).map((key) => ({
    key,
    label: RESOURCES[key].label,
    total: pendingCount(RESOURCES[key]),
  }));
  const recentTrend = all(
    `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n FROM audit_log
     GROUP BY month ORDER BY month DESC LIMIT 12`,
  ).reverse();

  return {
    totals: {
      projects: totalProjects,
      inheritors: totalInheritors,
      organizations: totalOrgs,
      attachments: totalAttachments,
      published,
      categories: d.categories.length,
      regions: d.regions.length,
      openOrganizations: count(`SELECT COUNT(*) AS n FROM organization WHERE is_open = 1 AND ${pub}`),
    },
    byCategory,
    byLevel,
    byInheritorLevel,
    byYear: yearRows.map((row) => ({ name: String(row.year), value: Number(row.n) })),
    byRegion,
    byAttachmentKind,
    statusRows,
    pendingByResource,
    recentLogs,
    recentProjects,
    recentTrend: recentTrend.map((row) => ({ name: row.month, value: Number(row.n) })),
    generatedAt: nowIso(),
  };
}

export function workbench(user) {
  const d = dicts();
  const mine = all(
    `SELECT 'project' AS kind, id, name, status, updated_at FROM project WHERE created_by = ?
     UNION ALL
     SELECT 'inheritor' AS kind, id, name, status, updated_at FROM inheritor WHERE created_by = ?
     ORDER BY updated_at DESC LIMIT 8`,
    [user.id, user.id],
  );
  // 录入员的待办：自己的草稿与已退回（管理员看的是全局待审核队列）
  const myStatus = {};
  for (const status of ['draft', 'pending', 'rejected', 'published']) {
    myStatus[status] = Object.values(RESOURCES).reduce(
      (sum, resource) =>
        sum + count(`SELECT COUNT(*) AS n FROM ${resource.table} WHERE created_by = ? AND status = ?`, [user.id, status]),
      0,
    );
  }
  return {
    pending: Object.keys(RESOURCES).map((key) => ({
      key,
      label: RESOURCES[key].label,
      total: pendingCount(RESOURCES[key]),
    })),
    myStatus,
    mine,
    stats: dashboardStats(),
    cards: d.categories.map((category, index) => ({
      name: category.name,
      code: category.code,
      total: count("SELECT COUNT(*) AS n FROM project WHERE status = 'published' AND category_id = ?", [category.id]),
      index,
    })),
  };
}

export function listLogs(query = {}) {
  const where = [];
  const params = [];
  const keyword = text(query.q, 60);
  if (keyword) {
    where.push("(IFNULL(user_name,'') LIKE ? OR IFNULL(target_name,'') LIKE ? OR IFNULL(detail,'') LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (query.action) {
    where.push('action = ?');
    params.push(query.action);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = count(`SELECT COUNT(*) AS n FROM audit_log ${clause}`, params);
  const pageInfo = paginate(total, toInt(query.page, 1), 20);
  const items = all(
    `SELECT * FROM audit_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageInfo.pageSize, pageInfo.offset],
  );
  return { ...pageInfo, items };
}

export function notFound(message = '记录不存在') {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

export function forbidden(message = '没有操作权限') {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

export { STATUS, GROUPS, importFields, listFields, fieldOf, getResource, invalidateDicts };
