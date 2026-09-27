import { PAGE_SIZE } from '../config.js';
import { all, get, count } from '../db.js';
import { dicts } from '../dict.js';
import { listAttachments } from '../service.js';
import { getResource } from '../resources.js';
import { clamp, paginate, toInt } from '../util.js';
import { sendNotFound, sendHtml, parseQuery } from '../http.js';
import { homeView, listView, projectDetailView, inheritorDetailView, organizationDetailView } from '../views/portal.js';

const PROJECT_SELECT = `SELECT t.*, c.name AS category_name, c.code AS category_code, c.sort_order AS category_order,
    l.name AS level_name, l.sort_order AS level_order, r.name AS region_name, o.name AS organization_name
  FROM project t
  LEFT JOIN heritage_category c ON c.id = t.category_id
  LEFT JOIN heritage_level l ON l.id = t.level_id
  LEFT JOIN region r ON r.id = t.region_id
  LEFT JOIN organization o ON o.id = t.organization_id`;

const INHERITOR_SELECT = `SELECT t.*, l.name AS level_name, l.sort_order AS level_order, r.name AS region_name
  FROM inheritor t
  LEFT JOIN heritage_level l ON l.id = t.level_id
  LEFT JOIN region r ON r.id = t.region_id`;

const ORG_SELECT = `SELECT t.*, r.name AS region_name FROM organization t LEFT JOIN region r ON r.id = t.region_id`;

function regionScope(regionId) {
  const d = dicts();
  const ids = [Number(regionId)];
  const queue = [Number(regionId)];
  let guard = 0;
  while (queue.length && guard < 400) {
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

function decorateRegion(rows) {
  const d = dicts();
  for (const row of rows) {
    row.region_label = row.region_id ? d.regionLabel(row.region_id) : row.region_name || '';
  }
  return rows;
}

function publicList({ select, table, query, searchColumns = ['t.name'], order = 't.updated_at DESC' }) {
  const where = [`t.status = 'published'`];
  const params = [];

  const keyword = String(query.q || '').trim().slice(0, 60);
  if (keyword) {
    where.push(`(${searchColumns.map((c) => `IFNULL(${c}, '') LIKE ?`).join(' OR ')})`);
    for (const _ of searchColumns) params.push(`%${keyword}%`);
  }
  const numericFilters = [
    ['category_id', 't.category_id'],
    ['level_id', 't.level_id'],
    ['category', 't.category_id'],
    ['level', 't.level_id'],
  ];
  for (const [key, column] of numericFilters) {
    if (!query[key]) continue;
    where.push(`${column} = ?`);
    params.push(toInt(query[key], 0));
  }
  for (const key of ['region_id', 'region']) {
    if (!query[key]) continue;
    const ids = regionScope(toInt(query[key], 0));
    where.push(`t.region_id IN (${ids.map(() => '?').join(', ')})`);
    params.push(...ids);
  }
  if (query.featured === '1') where.push('t.featured = 1');
  if (query.open === '1') where.push('t.is_open = 1');

  const clause = `WHERE ${where.join(' AND ')}`;
  const total = count(`SELECT COUNT(*) AS n FROM ${table} t ${clause}`, params);
  const pageSize = clamp(toInt(query.pageSize, PAGE_SIZE), 4, 48);
  const pageInfo = paginate(total, toInt(query.page, 1), pageSize);
  const dir = query.dir === 'asc' ? 'ASC' : 'DESC';
  let orderClause = order;
  if (query.sort === 'name') orderClause = 't.name ASC';
  else if (query.sort === 'published_year') orderClause = `t.published_year ${dir}, t.name ASC`;
  else if (query.sort === 'certified_year') orderClause = `t.certified_year ${dir}, t.name ASC`;
  else if (query.sort === 'updated_at') orderClause = `t.updated_at ${dir}`;

  const items = all(`${select} ${clause} ORDER BY ${orderClause} LIMIT ? OFFSET ?`, [
    ...params,
    pageInfo.pageSize,
    pageInfo.offset,
  ]);
  decorateRegion(items);
  return { ...pageInfo, items };
}

function homeData() {
  const d = dicts();
  const categoryCounts = all(
    `SELECT category_id, COUNT(*) AS n FROM project WHERE status = 'published' GROUP BY category_id`,
  );
  const categories = d.categories.map((c) => ({
    ...c,
    total: Number(categoryCounts.find((row) => Number(row.category_id) === Number(c.id))?.n || 0),
  }));
  const levelCounts = all(`SELECT level_id, COUNT(*) AS n FROM project WHERE status = 'published' GROUP BY level_id`);
  const levels = d.levels.map((l) => ({
    ...l,
    total: Number(levelCounts.find((row) => Number(row.level_id) === Number(l.id))?.n || 0),
  }));

  let projects = all(
    `${PROJECT_SELECT} WHERE t.status = 'published' AND t.featured = 1 ORDER BY l.sort_order, t.updated_at DESC LIMIT 6`,
  );
  if (!projects.length) {
    projects = all(`${PROJECT_SELECT} WHERE t.status = 'published' ORDER BY t.updated_at DESC LIMIT 6`);
  }
  decorateRegion(projects);

  let inheritors = all(
    `${INHERITOR_SELECT} WHERE t.status = 'published' AND t.featured = 1 ORDER BY l.sort_order, t.name LIMIT 4`,
  );
  if (!inheritors.length) {
    inheritors = all(`${INHERITOR_SELECT} WHERE t.status = 'published' ORDER BY t.updated_at DESC LIMIT 4`);
  }
  decorateRegion(inheritors);

  const organizations = decorateRegion(
    all(
      `${ORG_SELECT} WHERE t.status = 'published' AND t.is_open = 1 ORDER BY t.featured DESC, t.updated_at DESC LIMIT 6`,
    ),
  );

  const regionCounts = all(
    `SELECT region_id, COUNT(*) AS n FROM project WHERE status = 'published' AND region_id IS NOT NULL GROUP BY region_id`,
  );
  const cityLevel = all("SELECT id, name FROM region WHERE region_level = 'city' ORDER BY sort_order");
  const regions = cityLevel
    .map((city) => {
      const ids = regionScope(city.id);
      const total = regionCounts
        .filter((row) => ids.includes(Number(row.region_id)))
        .reduce((sum, row) => sum + Number(row.n), 0);
      return { id: city.id, name: city.name, total };
    })
    .filter((item) => item.total > 0);

  const images = all(
    `SELECT a.file_path, a.title, a.owner_type, a.owner_id FROM attachment a WHERE a.kind = 'image' ORDER BY a.id DESC LIMIT 10`,
  );
  const imageItems = images.map((img) => ({
    ...img,
    href:
      img.owner_type === 'project'
        ? `/projects/${img.owner_id}`
        : img.owner_type === 'inheritor'
          ? `/inheritors/${img.owner_id}`
          : `/organizations/${img.owner_id}`,
  }));

  const stats = {
    projects: count("SELECT COUNT(*) AS n FROM project WHERE status = 'published'"),
    inheritors: count("SELECT COUNT(*) AS n FROM inheritor WHERE status = 'published'"),
    organizations: count("SELECT COUNT(*) AS n FROM organization WHERE status = 'published'"),
    attachments: count('SELECT COUNT(*) AS n FROM attachment'),
  };

  return { stats, categories, levels, projects, inheritors, organizations, images: imageItems, regions };
}

export function handlePortal(req, res, url) {
  const pathname = url.pathname;
  const query = parseQuery(url);
  const d = dicts();
  const regionOptions = () => d.regions.map((r) => ({ id: r.id, label: d.regionLabel(r.id) }));

  if (pathname === '/') {
    sendHtml(res, homeView(homeData()));
    return true;
  }

  if (pathname === '/projects' || pathname === '/inheritors' || pathname === '/organizations') {
    const config = {
      '/projects': {
        key: 'project',
        select: PROJECT_SELECT,
        table: 'project',
        searchColumns: ['t.name', 't.keywords', 't.summary', 't.protection_unit', 't.code'],
        order: 'l.sort_order, t.updated_at DESC',
      },
      '/inheritors': {
        key: 'inheritor',
        select: INHERITOR_SELECT,
        table: 'inheritor',
        searchColumns: ['t.name', 't.skill', 't.story_title', 't.address', 't.code'],
        order: 'l.sort_order, t.updated_at DESC',
      },
      '/organizations': {
        key: 'organization',
        select: ORG_SELECT,
        table: 'organization',
        searchColumns: ['t.name', 't.address', 't.experience', 't.intro', 't.org_type'],
        order: 't.is_open DESC, t.updated_at DESC',
      },
    }[pathname];
    const pageInfo = publicList({ ...config, query });
    sendHtml(res, listView({
      resource: getResource(config.key),
      pageInfo,
      query,
      categories: d.categories,
      levels: d.levels,
      regions: regionOptions(),
    }));
    return true;
  }

  const projectMatch = pathname.match(/^\/projects\/(\d+)$/);
  if (projectMatch) {
    const id = Number(projectMatch[1]);
    const project = get(`${PROJECT_SELECT} WHERE t.id = ? AND t.status = 'published'`, [id]);
    if (!project) {
      sendNotFound(res);
      return true;
    }
    decorateRegion([project]);
    const inheritors = decorateRegion(
      all(
        `SELECT i.*, l.name AS level_name FROM project_inheritor pi
         JOIN inheritor i ON i.id = pi.inheritor_id
         LEFT JOIN heritage_level l ON l.id = i.level_id
         WHERE pi.project_id = ? AND i.status = 'published'
         ORDER BY pi.is_representative DESC, i.name`,
        [id],
      ),
    );
    const organization = project.organization_id
      ? get('SELECT * FROM organization WHERE id = ?', [project.organization_id])
      : null;
    const relatedProjects = decorateRegion(
      all(
        `${PROJECT_SELECT} WHERE t.status = 'published' AND t.category_id IS ? AND t.id <> ? ORDER BY t.updated_at DESC LIMIT 3`,
        [project.category_id, id],
      ),
    );
    sendHtml(
      res,
      projectDetailView({
        project,
        inheritors,
        attachments: listAttachments('project', id),
        organization,
        relatedProjects,
        related: inheritors,
      }),
    );
    return true;
  }

  const inheritorMatch = pathname.match(/^\/inheritors\/(\d+)$/);
  if (inheritorMatch) {
    const id = Number(inheritorMatch[1]);
    const person = get(`${INHERITOR_SELECT} WHERE t.id = ? AND t.status = 'published'`, [id]);
    if (!person) {
      sendNotFound(res);
      return true;
    }
    decorateRegion([person]);
    const projects = decorateRegion(
      all(
        `${PROJECT_SELECT} JOIN project_inheritor pi ON pi.project_id = t.id
         WHERE pi.inheritor_id = ? AND t.status = 'published' ORDER BY t.name`,
        [id],
      ),
    );
    const categoryIds = [...new Set(projects.map((item) => item.category_id).filter(Boolean))];
    const categoryPlaceholders = categoryIds.length ? categoryIds.map(() => '?').join(', ') : 'NULL';
    const sameCategory = decorateRegion(
      all(
        `${INHERITOR_SELECT} WHERE t.status = 'published' AND t.id <> ?
         AND (t.level_id IS ?
           OR EXISTS (
             SELECT 1 FROM project_inheritor pi2 JOIN project p2 ON p2.id = pi2.project_id
             WHERE pi2.inheritor_id = t.id AND p2.category_id IN (${categoryPlaceholders})
           ))
         ORDER BY l.sort_order LIMIT 3`,
        [id, person.level_id, ...categoryIds],
      ),
    );
    sendHtml(
      res,
      inheritorDetailView({ person, projects, attachments: listAttachments('inheritor', id), sameCategory }),
    );
    return true;
  }

  const orgMatch = pathname.match(/^\/organizations\/(\d+)$/);
  if (orgMatch) {
    const id = Number(orgMatch[1]);
    const org = get(`${ORG_SELECT} WHERE t.id = ? AND t.status = 'published'`, [id]);
    if (!org) {
      sendNotFound(res);
      return true;
    }
    decorateRegion([org]);
    const projects = decorateRegion(
      all(`${PROJECT_SELECT} WHERE t.organization_id = ? AND t.status = 'published' ORDER BY t.name`, [id]),
    );
    sendHtml(res, organizationDetailView({ org, projects, attachments: listAttachments('organization', id) }));
    return true;
  }

  return false;
}
