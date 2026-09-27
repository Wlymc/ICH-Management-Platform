import fs from 'node:fs';
import path from 'node:path';
import { PATHS, UPLOAD } from '../config.js';
import { all, count, get, run } from '../db.js';
import {
  DICT_KINDS,
  dictCreate,
  dictDelete,
  dictList,
  dictUpdate,
  invalidateDicts,
  resolveRef,
} from '../dict.js';
import {
  RESOURCES,
  getResource,
  importFields,
} from '../resources.js';
import {
  addAttachment,
  bulkAction,
  createRow,
  dashboardStats,
  deleteAttachment,
  deleteRow,
  getRow,
  listAttachments,
  listResource,
  normalizePayload,
  reviewRow,
  submitRow,
  updateRow,
  validatePayload,
  writeAudit,
} from '../service.js';
import {
  createUser,
  deleteUser,
  listUsers,
  login,
  logout,
  clearCookie,
  publicUser,
  requireRole,
  sessionCookie,
  updateUser,
} from '../auth.js';
import { decodeTextBuffer, h, nowIso, safeFileName, text, toInt, token, uid } from '../util.js';
import { parseCsv, rowsToObjects, toCsv } from '../report/csv.js';
import { buildXlsx } from '../report/xlsx.js';
import { readXlsx } from '../report/xlsx-read.js';
import {
  clientIp,
  fail,
  ok,
  parseQuery,
  readJson,
  sameOrigin,
  sendBuffer,
  sendJson,
} from '../http.js';

const PATH_TO_RESOURCE = {
  projects: 'project',
  inheritors: 'inheritor',
  organizations: 'organization',
};

/** 同时接受单数与复数形式的资源名 */
function resolveResourceKey(raw) {
  const value = String(raw || '');
  if (getResource(value)) return value;
  if (PATH_TO_RESOURCE[value]) return PATH_TO_RESOURCE[value];
  const singular = value.endsWith('s') ? value.slice(0, -1) : value;
  return getResource(singular) ? singular : null;
}

const STATUS_LABEL = {
  draft: '草稿',
  pending: '待审核',
  published: '已发布',
  rejected: '已退回',
  archived: '已归档',
};

const HEADER_OVERRIDES = {
  category_id: '类别',
  level_id: '级别',
  region_id: '申报地区',
  protection_unit: '保护单位',
  summary: '简介',
  intro: '简介',
  feature: '技艺特征',
  video_url: '视频链接',
  featured: '精选',
};

const TEMPLATE_FIELDS = {
  project: ['code', 'name', 'category_id', 'level_id', 'batch', 'published_year', 'region_id', 'protection_unit', 'summary', 'keywords', 'history', 'feature', 'lineage', 'video_url', 'featured'],
  inheritor: ['code', 'name', 'gender', 'ethnic', 'birth_month', 'level_id', 'region_id', 'batch', 'certified_year', 'address', 'story_title', 'experience', 'skill', 'honors', 'video_url', 'featured'],
  organization: ['code', 'name', 'org_type', 'region_id', 'founded_year', 'is_open', 'open_hours', 'address', 'manager', 'phone', 'email', 'traffic', 'experience', 'intro', 'featured'],
};

function headerFor(resource, field) {
  return HEADER_OVERRIDES[field.name] || field.label;
}

function templateColumns(resource) {
  return TEMPLATE_FIELDS[resource.key]
    .map((name) => resource.fields.find((field) => field.name === name))
    .filter(Boolean);
}

function exportHeaders(resource) {
  return [...templateColumns(resource).map((field) => headerFor(resource, field)), '状态'];
}

function exportRow(resource, field, row) {
  const value = row[field.name];
  if (field.type === 'bool') return Number(value) ? '是' : '否';
  if (field.type === 'ref') {
    if (field.ref === 'category') return get('SELECT name FROM heritage_category WHERE id = ?', [value])?.name || '';
    if (field.ref === 'level') return get('SELECT name FROM heritage_level WHERE id = ?', [value])?.name || '';
    if (field.ref === 'organization') return get('SELECT name FROM organization WHERE id = ?', [value])?.name || '';
    if (field.ref === 'region') {
      const parts = [];
      let node = value ? get('SELECT id, name, parent_id FROM region WHERE id = ?', [value]) : null;
      let guard = 0;
      while (node && guard < 6) {
        parts.unshift(node.name);
        node = node.parent_id ? get('SELECT id, name, parent_id FROM region WHERE id = ?', [node.parent_id]) : null;
        guard += 1;
      }
      return parts.join(' / ');
    }
  }
  return value === null || value === undefined ? '' : String(value);
}

function buildExportRows(resource, items) {
  const fields = templateColumns(resource);
  return items.map((row) => [...fields.map((field) => exportRow(resource, field, row)), STATUS_LABEL[row.status] || row.status]);
}

function columnWidthsFor(resource) {
  return [...templateColumns(resource).map((field) => Math.max(10, Math.min(50, Math.round((field.width || 120) / 8)))), 10];
}

/* ---------------- 导入 ---------------- */

function importHeaderMap(resource) {
  const map = new Map();
  for (const field of importFields(resource)) {
    const names = new Set([
      headerFor(resource, field),
      field.label,
      field.name,
      ...(field.aliases || []),
    ]);
    for (const name of names) {
      map.set(name, field);
      map.set(name.replace(/\s/g, ''), field);
    }
  }
  return map;
}

function parseMatrixFromUpload({ filename, base64, content }) {
  if (base64) {
    const buffer = Buffer.from(String(base64).replace(/^data:[^,]+,/, ''), 'base64');
    if (buffer.length > 12 * 1024 * 1024) throw bad('文件过大，导入文件请控制在 12MB 以内');
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
    if (isZip || /\.xlsx$/i.test(filename || '')) {
      return readXlsx(buffer);
    }
    return parseCsv(decodeTextBuffer(buffer));
  }
  if (typeof content === 'string') return parseCsv(content);
  throw bad('未收到文件内容');
}

async function handleImport(req, res, user, resourceKey) {
  const resource = getResource(resourceKey);
  const body = await readJson(req);
  const matrix = parseMatrixFromUpload(body);
  if (!matrix.length) throw bad('文件内容为空');

  const headerRow = matrix[0].map((cell) => String(cell).trim().replace(/^\uFEFF/, ''));
  const map = importHeaderMap(resource);
  const mapped = headerRow.map((header) => map.get(header) || map.get(header.replace(/\s/g, '')) || null);
  const statusColumn = headerRow.findIndex((header) => header === '状态' || header === 'status');

  const known = mapped.filter(Boolean).length;
  if (!known) {
    throw bad(`未识别到有效列。请下载导入模板后按模板填写，当前表头：${headerRow.slice(0, 8).join('、')}`);
  }

  const result = { total: 0, imported: 0, failed: [] };
  const ip = clientIp(req);
  for (let index = 1; index < matrix.length; index += 1) {
    const cells = matrix[index];
    if (!cells.some((cell) => String(cell ?? '').trim() !== '')) continue;
    result.total += 1;
    try {
      const payload = {};
      mapped.forEach((field, column) => {
        if (!field) return;
        const raw = cells[column] === undefined ? '' : String(cells[column]).trim();
        if (raw === '') return;
        payload[field.name] = raw;
      });
      for (const field of importFields(resource)) {
        if (!(field.name in payload)) continue;
        if (field.type === 'ref') {
          const resolved = resolveRef(field.ref, payload[field.name]);
          if (!resolved) throw bad(`${field.label}「${payload[field.name]}」未匹配到字典数据`);
          payload[field.name] = resolved;
        }
      }
      const data = normalizePayload(resource, payload);
      const errors = validatePayload(resource, data, { isCreate: true });
      if (errors.length) throw bad(errors.join('；'));
      const timestamp = nowIso();
      const insertData = {
        ...data,
        status: 'draft',
        created_by: user.id,
        created_at: timestamp,
        updated_at: timestamp,
      };
      if (user.role === 'admin' && statusColumn >= 0) {
        const rawStatus = String(cells[statusColumn] ?? '').trim();
        const key = Object.keys(STATUS_LABEL).find((k) => STATUS_LABEL[k] === rawStatus);
        if (key) insertData.status = key;
      }
      const columns = Object.keys(insertData);
      const inserted = run(
        `INSERT INTO ${resource.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((c) => insertData[c]),
      );
      result.imported += 1;
      void inserted;
    } catch (error) {
      result.failed.push({ line: index + 1, message: error.message });
    }
  }
  writeAudit(user, 'import', resource.key, null, `导入 ${resource.label}`, `成功 ${result.imported} 条，失败 ${result.failed.length} 条`, ip);
  invalidateDicts();
  return result;
}

/* ---------------- 导出 ---------------- */

function handleExport(res, user, resourceKey, format, query) {
  const resource = getResource(resourceKey);
  const pageInfo = listResource(resource, { ...query, page: 1, pageSize: 100000 }, user, { pageSize: 100000 });
  const rows = buildExportRows(resource, pageInfo.items);
  const headers = exportHeaders(resource);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const baseName = `${resource.label}_${stamp}`;
  if (format === 'xlsx') {
    const buffer = buildXlsx({
      sheetName: resource.label.slice(0, 28),
      headers,
      rows,
      columnWidths: columnWidthsFor(resource),
    });
    sendBuffer(res, buffer, { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', downloadName: `${baseName}.xlsx` });
  } else {
    const buffer = Buffer.from(toCsv([headers, ...rows]), 'utf8');
    sendBuffer(res, buffer, { mime: 'text/csv; charset=utf-8', downloadName: `${baseName}.csv` });
  }
  writeAudit(user, 'export', resource.key, null, `导出 ${resource.label}`, `导出 ${rows.length} 条（${format}）`);
}

function handleTemplate(res, resourceKey) {
  const resource = getResource(resourceKey);
  const headers = exportHeaders(resource);
  const sample = templateSample(resource);
  const buffer = Buffer.from(toCsv([headers, sample]), 'utf8');
  sendBuffer(res, buffer, { mime: 'text/csv; charset=utf-8', downloadName: `${resource.label}_导入模板.csv` });
}

function templateSample(resource) {
  const fields = templateColumns(resource);
  return fields.map((field) => {
    if (field.type === 'bool') return '否';
    if (field.type === 'year') return '2011';
    if (field.type === 'ref') {
      const first = field.ref === 'category'
        ? get('SELECT name FROM heritage_category ORDER BY sort_order LIMIT 1')?.name
        : field.ref === 'level'
          ? get("SELECT name FROM heritage_level WHERE name = '省级'")?.name
          : field.ref === 'region'
            ? (() => {
                const county = get("SELECT id FROM region WHERE region_level = 'county' ORDER BY sort_order LIMIT 1");
                if (!county) return '';
                const row = get('SELECT id, name, parent_id FROM region WHERE id = ?', [county.id]);
                const parent = row.parent_id ? get('SELECT name, parent_id FROM region WHERE id = ?', [row.parent_id]) : null;
                const grand = parent?.parent_id ? get('SELECT name FROM region WHERE id = ?', [parent.parent_id]) : null;
                return [grand?.name, parent?.name, row.name].filter(Boolean).join(' / ');
              })()
            : get('SELECT name FROM organization ORDER BY id LIMIT 1')?.name;
      return first || '';
    }
    if (field.name === 'code') return '示例-001（请填写唯一编号）';
    return `示例${field.label}`;
  }).concat(['草稿']);
}

function bad(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/* ---------------- 上传 ---------------- */

function saveUpload({ filename, mimeType, base64, ownerType, ownerId }, user) {
  const extension = UPLOAD.allowed[mimeType];
  if (!extension) throw bad(`不支持的文件类型：${mimeType || '未知'}。允许 图片(jpg/png/webp/gif)、音频(mp3/wav/ogg)、PDF、Word、纯文本。`);
  const buffer = Buffer.from(String(base64).replace(/^data:[^,]+,/, ''), 'base64');
  if (!buffer.length) throw bad('文件内容为空');
  if (buffer.length > UPLOAD.maxBytes) throw bad(`文件超过 ${Math.round(UPLOAD.maxBytes / 1024 / 1024)}MB 限制`);
  const month = new Date().toISOString().slice(0, 7);
  const relative = `${month}/${uid('f')}${extension}`;
  const target = path.join(PATHS.uploads, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  void user;
  void ownerType;
  void ownerId;
  return { relative, size: buffer.length, original: safeFileName(filename) };
}

function kindFromMime(mimeType) {
  if (String(mimeType).startsWith('image/')) return 'image';
  if (String(mimeType).startsWith('audio/')) return 'audio';
  if (String(mimeType).startsWith('video/')) return 'video';
  return 'document';
}

/* ---------------- 主入口 ---------------- */

export async function handleApi(req, res, url, user) {
  const pathname = url.pathname;
  const query = parseQuery(url);
  const method = req.method.toUpperCase();
  const ip = clientIp(req);

  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) {
    fail(res, 403, '请求来源不合法');
    return true;
  }

  // 认证
  if (pathname === '/api/auth/login') {
    if (method !== 'POST') return fail(res, 405, '方法不允许'), true;
    const body = await readJson(req);
    const { token: sessionToken, user: profile } = login(body.username, body.password, ip);
    const payload = Buffer.from(JSON.stringify({ ok: true, data: profile, error: null }), 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': payload.length,
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(sessionToken),
    });
    res.end(payload);
    return true;
  }

  if (!user) {
    fail(res, 401, '请先登录');
    return true;
  }

  if (pathname === '/api/auth/logout') {
    logout(req, user, ip);
    const payload = Buffer.from(JSON.stringify({ ok: true, data: { loggedOut: true }, error: null }), 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': payload.length,
      'Cache-Control': 'no-store',
      'Set-Cookie': clearCookie(),
    });
    res.end(payload);
    return true;
  }

  if (pathname === '/api/auth/me') {
    ok(res, publicUser(user));
    return true;
  }

  if (pathname === '/api/stats/dashboard') {
    ok(res, dashboardStats());
    return true;
  }

  if (pathname === '/api/users') {
    requireRole(user, 'admin', '仅管理员可管理账号');
    if (method === 'GET') {
      ok(res, listUsers());
      return true;
    }
    if (method === 'POST') {
      const body = await readJson(req);
      const id = createUser(body);
      writeAudit(user, 'user', 'user', id, body.displayName || body.username, '新增账号', ip);
      ok(res, { id });
      return true;
    }
    fail(res, 405, '方法不允许');
    return true;
  }

  const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userMatch) {
    requireRole(user, 'admin', '仅管理员可管理账号');
    const id = Number(userMatch[1]);
    if (method === 'PUT') {
      const body = await readJson(req);
      updateUser(id, body);
      writeAudit(user, 'user', 'user', id, body.displayName || '', '修改账号', ip);
      ok(res, { id });
      return true;
    }
    if (method === 'DELETE') {
      const target = listUsers().find((item) => Number(item.id) === id);
      deleteUser(id, user.id);
      writeAudit(user, 'user', 'user', id, target?.display_name || '', '删除账号', ip);
      ok(res, { id });
      return true;
    }
    fail(res, 405, '方法不允许');
    return true;
  }

  // 字典
  if (pathname === '/api/dict') {
    const payload = {};
    for (const kind of Object.keys(DICT_KINDS)) payload[kind] = dictList(kind);
    ok(res, payload);
    return true;
  }

  const dictKindMatch = pathname.match(/^\/api\/dict\/([a-z_]+)$/);
  if (dictKindMatch) {
    const kind = dictKindMatch[1];
    if (!DICT_KINDS[kind]) {
      fail(res, 400, '未知字典类型');
      return true;
    }
    if (method === 'GET') {
      ok(res, dictList(kind));
      return true;
    }
    requireRole(user, 'admin', '仅管理员可维护字典');
    if (method === 'POST') {
      const body = await readJson(req);
      const id = dictCreate(kind, body);
      invalidateDicts();
      writeAudit(user, 'dict', kind, id, body.name || '', `新增${DICT_KINDS[kind].label}`, ip);
      ok(res, { id });
      return true;
    }
    fail(res, 405, '方法不允许');
    return true;
  }

  const dictItemMatch = pathname.match(/^\/api\/dict\/([a-z_]+)\/(\d+)$/);
  if (dictItemMatch) {
    requireRole(user, 'admin', '仅管理员可维护字典');
    const [, kind, rawId] = dictItemMatch;
    if (!DICT_KINDS[kind]) {
      fail(res, 400, '未知字典类型');
      return true;
    }
    const id = Number(rawId);
    if (method === 'PUT') {
      const body = await readJson(req);
      dictUpdate(kind, id, body);
      invalidateDicts();
      writeAudit(user, 'dict', kind, id, body.name || '', `修改${DICT_KINDS[kind].label}`, ip);
      ok(res, { id });
      return true;
    }
    if (method === 'DELETE') {
      dictDelete(kind, id);
      invalidateDicts();
      writeAudit(user, 'dict', kind, id, '', `删除${DICT_KINDS[kind].label}`, ip);
      ok(res, { id });
      return true;
    }
    fail(res, 405, '方法不允许');
    return true;
  }

  // 导出 / 模板
  const exportMatch = pathname.match(/^\/api\/export\/([a-z]+)\.(xlsx|csv)$/);
  if (exportMatch) {
    const resourceKey = resolveResourceKey(exportMatch[1]);
    if (!resourceKey) {
      fail(res, 400, '未知资源');
      return true;
    }
    handleExport(res, user, resourceKey, exportMatch[2], query);
    return true;
  }

  const templateMatch = pathname.match(/^\/api\/template\/([a-z]+)\.csv$/);
  if (templateMatch) {
    const resourceKey = resolveResourceKey(templateMatch[1]);
    if (!resourceKey) {
      fail(res, 400, '未知资源');
      return true;
    }
    handleTemplate(res, resourceKey);
    return true;
  }

  const importMatch = pathname.match(/^\/api\/import\/([a-z]+)$/);
  if (importMatch) {
    const resourceKey = resolveResourceKey(importMatch[1]);
    if (!resourceKey) {
      fail(res, 400, '未知资源');
      return true;
    }
    const result = await handleImport(req, res, user, resourceKey);
    ok(res, result);
    return true;
  }

  // 通用文件上传（表单里的封面图等）
  if (pathname === '/api/upload') {
    const body = await readJson(req);
    const saved = saveUpload(body, user);
    ok(res, { path: saved.relative, size: saved.size, name: saved.original });
    return true;
  }

  // 多媒体档案
  if (pathname === '/api/attachments') {
    if (method === 'GET') {
      ok(res, listAttachments(String(query.ownerType || ''), toInt(query.ownerId, 0)));
      return true;
    }
    if (method === 'POST') {
      const body = await readJson(req);
      const ownerResource = getResource(String(body.ownerType || ''));
      if (!ownerResource) {
        fail(res, 400, '归属对象不正确');
        return true;
      }
      const ownerId = toInt(body.ownerId, 0);
      const owner = get(`SELECT * FROM ${ownerResource.table} WHERE id = ?`, [ownerId]);
      if (!owner) {
        fail(res, 404, '归属记录不存在');
        return true;
      }
      let filePath = '';
      let size = 0;
      let fileName = text(body.fileName, 200);
      let mimeType = text(body.mimeType, 120);
      let kind = body.kind;
      let externalUrl = text(body.externalUrl, 500);
      if (body.externalUrl) {
        kind = body.kind || 'video';
        externalUrl = text(body.externalUrl, 500);
      } else if (body.base64) {
        const saved = saveUpload({ ...body, filename: fileName }, user);
        filePath = saved.relative;
        size = saved.size;
        fileName = saved.original;
        kind = kind || kindFromMime(mimeType);
      } else {
        fail(res, 400, '请提供文件内容或外部链接');
        return true;
      }
      const id = addAttachment(
        {
          ownerType: body.ownerType,
          ownerId,
          kind,
          title: body.title,
          note: body.note,
          fileName,
          filePath,
          fileSize: size,
          mimeType,
          externalUrl,
        },
        user,
        ip,
      );
      if (kind === 'image' && !owner.cover_path) {
        run(`UPDATE ${ownerResource.table} SET cover_path = ? WHERE id = ?`, [filePath, ownerId]);
      }
      ok(res, { id, filePath });
      return true;
    }
    fail(res, 405, '方法不允许');
    return true;
  }

  const attachMatch = pathname.match(/^\/api\/attachments\/(\d+)$/);
  if (attachMatch) {
    if (method !== 'DELETE') {
      fail(res, 405, '方法不允许');
      return true;
    }
    const row = deleteAttachment(Number(attachMatch[1]), user, ip);
    if (row.file_path) {
      const target = path.join(PATHS.uploads, row.file_path);
      if (fs.existsSync(target)) {
        try {
          fs.unlinkSync(target);
        } catch {
          /* 忽略删除失败 */
        }
      }
    }
    ok(res, { id: Number(attachMatch[1]) });
    return true;
  }

  // 操作记录
  const historyMatch = pathname.match(/^\/api\/history\/([a-z]+)\/(\d+)$/);
  if (historyMatch) {
    const historyResource = getResource(resolveResourceKey(historyMatch[1]));
    if (!historyResource) {
      fail(res, 400, '未知资源');
      return true;
    }
    const target = get(`SELECT * FROM ${historyResource.table} WHERE id = ?`, [Number(historyMatch[2])]);
    if (!target) {
      fail(res, 404, '记录不存在');
      return true;
    }
    if (user.role !== 'admin' && Number(target.created_by) !== Number(user.id)) {
      fail(res, 403, '只能查看自己录入档案的操作记录');
      return true;
    }
    const rows = all(
      'SELECT * FROM audit_log WHERE target_type = ? AND target_id = ? ORDER BY id DESC LIMIT 30',
      [historyResource.key, Number(historyMatch[2])],
    );
    ok(res, rows);
    return true;
  }

  // 资源 CRUD
  const bulkMatch = pathname.match(/^\/api\/([a-z]+)\/bulk$/);
  if (bulkMatch) {
    const resource = getResource(resolveResourceKey(bulkMatch[1]));
    if (!resource) {
      fail(res, 400, '未知资源');
      return true;
    }
    const body = await readJson(req);
    const ids = (body.ids || []).map((id) => toInt(id, 0)).filter(Boolean);
    if (!ids.length) {
      fail(res, 400, '请先选择记录');
      return true;
    }
    const result = bulkAction(resource, ids, body.action, user, ip);
    ok(res, result, { warning: result.failed.length ? `有 ${result.failed.length} 条操作失败` : null });
    return true;
  }

  const submitMatch = pathname.match(/^\/api\/([a-z]+)\/(\d+)\/submit$/);
  if (submitMatch) {
    const resource = getResource(resolveResourceKey(submitMatch[1]));
    if (!resource) {
      fail(res, 400, '未知资源');
      return true;
    }
    submitRow(resource, Number(submitMatch[2]), user, ip);
    ok(res, { id: Number(submitMatch[2]), status: 'pending' });
    return true;
  }

  const reviewMatch = pathname.match(/^\/api\/([a-z]+)\/(\d+)\/review$/);
  if (reviewMatch) {
    const resource = getResource(resolveResourceKey(reviewMatch[1]));
    if (!resource) {
      fail(res, 400, '未知资源');
      return true;
    }
    const body = await readJson(req);
    reviewRow(resource, Number(reviewMatch[2]), body.action, body.note, user, ip);
    ok(res, { id: Number(reviewMatch[2]), action: body.action });
    return true;
  }

  const itemMatch = pathname.match(/^\/api\/([a-z]+)\/(\d+)$/);
  if (itemMatch) {
    const resource = getResource(resolveResourceKey(itemMatch[1]));
    if (!resource) {
      fail(res, 400, '未知资源');
      return true;
    }
    const id = Number(itemMatch[2]);
    if (method === 'GET') {
      const row = getRow(resource, id);
      if (!row) {
        fail(res, 404, '记录不存在');
        return true;
      }
      ok(res, row);
      return true;
    }
    if (method === 'PUT') {
      const body = await readJson(req);
      updateRow(resource, id, body, user, ip);
      ok(res, { id });
      return true;
    }
    if (method === 'DELETE') {
      deleteRow(resource, id, user, ip);
      ok(res, { id });
      return true;
    }
    fail(res, 405, '方法不允许');
    return true;
  }

  const listMatch = pathname.match(/^\/api\/([a-z]+)$/);
  if (listMatch) {
    const resource = getResource(resolveResourceKey(listMatch[1]));
    if (!resource) {
      fail(res, 400, '未知资源');
      return true;
    }
    if (method === 'GET') {
      ok(res, listResource(resource, query, user, { pageSize: toInt(query.pageSize, 15) }));
      return true;
    }
    if (method === 'POST') {
      const body = await readJson(req);
      const id = createRow(resource, body, user, ip);
      ok(res, { id, status: 'draft' });
      return true;
    }
    fail(res, 405, '方法不允许');
    return true;
  }

  void count;
  void token;
  void h;
  return false;
}
