import { ADMIN_PAGE_SIZE } from '../config.js';
import { all, get } from '../db.js';
import { DICT_KINDS, dictList } from '../dict.js';
import { RESOURCES, getResource } from '../resources.js';
import {
  getInheritorProjects,
  getProjectInheritors,
  listAttachments,
  listLogs,
  listResource,
  pendingCount,
  workbench,
} from '../service.js';
import { listUsers } from '../auth.js';
import { viewDicts } from '../viewcontext.js';
import { toInt } from '../util.js';
import { parseQuery, redirect, sendHtml, sendError } from '../http.js';
import {
  detailPageView,
  dictView,
  formPageView,
  listPageView,
  loginView,
  logsView,
  reviewsView,
  screenBody,
  usersView,
  workbenchView,
} from '../views/admin.js';
import { loginLayout, screenLayout, adminLayout } from '../views/layout.js';

const PATH_TO_RESOURCE = {
  projects: 'project',
  inheritors: 'inheritor',
  organizations: 'organization',
};

function totalPending() {
  return Object.keys(RESOURCES).reduce((sum, key) => sum + pendingCount(RESOURCES[key]), 0);
}

const SIMPLE_ADMIN_PATHS = new Set([
  '/admin', '/admin/', '/admin/login', '/admin/work',
  '/admin/dashboard', '/admin/reviews', '/admin/dict', '/admin/users', '/admin/logs',
]);
const RESOURCE_PATH_PATTERN = /^\/admin\/(projects|inheritors|organizations)(?:\/(new|\d+)(?:\/(edit))?)?$/;

/** 判断是否是管理端已知页面，避免把乱码路径塞进登录后的 next 参数 */
function isKnownAdminPath(pathname) {
  return SIMPLE_ADMIN_PATHS.has(pathname) || RESOURCE_PATH_PATTERN.test(pathname);
}

/** 只允许把 /admin 内部地址作为登录后的跳转目标 */
function safeNextPath(pathname) {
  if (!pathname || !isKnownAdminPath(pathname) || pathname.startsWith('/admin/login')) return '/admin/work';
  return pathname;
}

function decodeMaybe(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value);
  }
}

export function handleAdmin(req, res, url, user) {
  const pathname = url.pathname;
  const query = parseQuery(url);

  // 未知的 /admin/xxx 直接交给 404，不再重定向到登录页
  if (!isKnownAdminPath(pathname)) return false;

  if (pathname === '/admin/login') {
    if (user) {
      redirect(res, safeNextPath(decodeMaybe(query.next)));
      return true;
    }
    const error = decodeMaybe(query.error);
    sendHtml(res, loginLayout({ body: loginView({ error }) }));
    return true;
  }

  if (!user) {
    const next = safeNextPath(pathname);
    redirect(res, `/admin/login?next=${encodeURIComponent(next)}`);
    return true;
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    redirect(res, '/admin/work');
    return true;
  }

  if (pathname === '/admin/work') {
    sendHtml(res, workbenchView({ user, data: workbench(user) }));
    return true;
  }

  if (pathname === '/admin/dashboard') {
    sendHtml(res, screenLayout({ title: '数据大屏', body: screenBody() }));
    return true;
  }

  if (pathname === '/admin/reviews') {
    if (user.role !== 'admin') {
      sendHtml(res, adminLayout({
        title: '审核中心',
        user,
        active: 'reviews',
        crumbs: [{ label: '审核中心' }],
        pendingTotal: totalPending(),
        body: '<div class="panel"><p class="pad muted">仅管理员可访问审核中心。</p></div>',
      }));
      return true;
    }
    const groups = [
      { key: 'project', label: '非遗项目', path: 'projects', table: 'project' },
      { key: 'inheritor', label: '传承人', path: 'inheritors', table: 'inheritor' },
      { key: 'organization', label: '传承基地 / 保护单位', path: 'organizations', table: 'organization' },
    ].map((group) => ({
      ...group,
      items: all(
        `SELECT t.*, u.display_name AS created_by_name FROM ${group.table} t
         LEFT JOIN app_user u ON u.id = t.created_by
         WHERE t.status = 'pending' ORDER BY t.updated_at ASC`,
      ),
    }));
    sendHtml(res, reviewsView({ groups, user, pendingTotal: totalPending(), query }));
    return true;
  }

  if (pathname === '/admin/dict') {
    const kind = DICT_KINDS[query.kind] ? query.kind : 'category';
    sendHtml(
      res,
      dictView({
        kind,
        items: dictList(kind),
        dicts: viewDicts(),
        user,
        pendingTotal: totalPending(),
        readOnly: user.role !== 'admin',
      }),
    );
    return true;
  }

  if (pathname === '/admin/users') {
    if (user.role !== 'admin') {
      sendHtml(res, adminLayout({
        title: '用户管理',
        user,
        active: 'users',
        crumbs: [{ label: '用户管理' }],
        pendingTotal: totalPending(),
        body: '<div class="panel"><p class="pad muted">仅管理员可访问用户管理。</p></div>',
      }));
      return true;
    }
    sendHtml(res, usersView({ users: listUsers(), user, pendingTotal: totalPending() }));
    return true;
  }

  if (pathname === '/admin/logs') {
    if (user.role !== 'admin') {
      sendHtml(res, adminLayout({
        title: '操作日志',
        user,
        active: 'logs',
        crumbs: [{ label: '操作日志' }],
        pendingTotal: totalPending(),
        body: '<div class="panel"><p class="pad muted">操作日志包含全平台账号的操作记录，仅管理员可查看。你可以在工作台看到自己的最近录入。</p></div>',
      }));
      return true;
    }
    sendHtml(
      res,
      logsView({ pageInfo: listLogs(query), query, user, pendingTotal: totalPending() }),
    );
    return true;
  }

  const resourceMatch = pathname.match(RESOURCE_PATH_PATTERN);
  if (resourceMatch) {
    const resourceKey = PATH_TO_RESOURCE[resourceMatch[1]];
    const resource = getResource(resourceKey);
    const segment = resourceMatch[2];
    const isEdit = resourceMatch[3] === 'edit';
    const dicts = viewDicts();

    if (!segment) {
      const pageInfo = listResource(resource, { ...query, pageSize: query.pageSize || ADMIN_PAGE_SIZE }, user, {
        pageSize: ADMIN_PAGE_SIZE,
      });
      sendHtml(
        res,
        listPageView({ resource, pageInfo, query, user, dicts, pendingTotal: totalPending() }),
      );
      return true;
    }

    if (segment === 'new') {
      sendHtml(
        res,
        formPageView({
          resource,
          row: { status: 'draft', featured: 0, is_open: 0 },
          user,
          dicts,
          mode: 'create',
          relations: { inheritorIds: [], projectIds: [] },
          pendingTotal: totalPending(),
        }),
      );
      return true;
    }

    const id = toInt(segment, 0);
    const row = get(`SELECT * FROM ${resource.table} WHERE id = ?`, [id]);
    if (!row) {
      sendError(res, Object.assign(new Error('记录不存在或已被删除'), { statusCode: 404 }));
      return true;
    }

    if (isEdit) {
      const relations =
        resource.key === 'project'
          ? { inheritorIds: getProjectInheritors(id).map((p) => p.id) }
          : resource.key === 'inheritor'
            ? { projectIds: getInheritorProjects(id).map((p) => p.id) }
            : {};
      sendHtml(
        res,
        formPageView({
          resource,
          row,
          user,
          dicts,
          mode: 'edit',
          relations,
          pendingTotal: totalPending(),
        }),
      );
      return true;
    }

    const relations =
      resource.key === 'project'
        ? {
            inheritors: getProjectInheritors(id).map((person) => ({
              ...person,
              level_name: dicts.levelById.get(Number(person.level_id)) || '',
              region_label: person.region_id ? dicts.regionLabel(person.region_id) : '',
            })),
          }
        : resource.key === 'inheritor'
          ? {
              projects: getInheritorProjects(id).map((project) => ({
                ...project,
                category_name: dicts.categoryById.get(Number(project.category_id)) || '',
                level_name: dicts.levelById.get(Number(project.level_id)) || '',
              })),
            }
          : {
              projects: all(
                `SELECT p.*, c.name AS category_name, l.name AS level_name FROM project p
                 LEFT JOIN heritage_category c ON c.id = p.category_id
                 LEFT JOIN heritage_level l ON l.id = p.level_id
                 WHERE p.organization_id = ? ORDER BY p.name`,
                [id],
              ),
            };

    const audit = all(
      'SELECT * FROM audit_log WHERE target_type = ? AND target_id = ? ORDER BY id DESC LIMIT 12',
      [resource.key, id],
    );

    sendHtml(
      res,
      detailPageView({
        resource,
        row,
        user,
        dicts,
        relations,
        attachments: listAttachments(resource.key, id),
        pendingTotal: totalPending(),
        audit,
      }),
    );
    return true;
  }

  return false;
}
