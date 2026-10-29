import { PAGE_SIZE } from './config.js';
import { all, count, get } from './db.js';
import { dicts } from './dict.js';
import { listAttachments } from './service.js';
import { clamp, paginate, toInt } from './util.js';
import { buildKnowledgeGraphData } from './knowledge-graph.js';
import { buildStarMapData } from './star-map.js';
import { MODELS, modelsForProject, modelAssetUrl } from './model-assets.js';

const PROJECT_SELECT = `SELECT t.*, c.name AS category_name, c.code AS category_code,
    c.summary AS category_summary, l.name AS level_name, r.name AS region_name,
    o.name AS organization_name
  FROM project t
  LEFT JOIN heritage_category c ON c.id = t.category_id
  LEFT JOIN heritage_level l ON l.id = t.level_id
  LEFT JOIN region r ON r.id = t.region_id
  LEFT JOIN organization o ON o.id = t.organization_id`;

const INHERITOR_SELECT = `SELECT t.*, l.name AS level_name, r.name AS region_name
  FROM inheritor t
  LEFT JOIN heritage_level l ON l.id = t.level_id
  LEFT JOIN region r ON r.id = t.region_id`;

const ORGANIZATION_SELECT = `SELECT t.*, r.name AS region_name
  FROM organization t LEFT JOIN region r ON r.id = t.region_id`;

function publicFileUrl(filePath) {
  if (!filePath) return '';
  if (/^https?:\/\//.test(filePath)) return filePath;
  return `/uploads/${String(filePath).split('/').map(encodeURIComponent).join('/')}`;
}

function regionIds(regionId) {
  const d = dicts();
  const rootId = Number(regionId);
  if (!Number.isFinite(rootId) || !d.regionById.has(rootId)) return [];
  const ids = [rootId];
  const queue = [rootId];
  let guard = 0;
  while (queue.length && guard < 500) {
    const current = queue.shift();
    for (const region of d.regions) {
      if (Number(region.parent_id) === Number(current)) {
        ids.push(Number(region.id));
        queue.push(Number(region.id));
      }
    }
    guard += 1;
  }
  return ids;
}

function decorateRegion(row) {
  const d = dicts();
  return {
    ...row,
    region_label: row.region_id
      ? d.regionLabel(row.region_id)
      : row.region_name || row.region_text || '',
  };
}

function projectDto(row) {
  const item = decorateRegion(row);
  const projects = modelsForProject(item.id).map((model) => ({
    id: model.id,
    title: model.title,
    relationLabel: model.relationLabel,
    author: model.author,
    license: model.license,
    licenseUrl: model.licenseUrl,
    sourceUrl: model.sourceUrl,
    note: model.note,
    featured: Boolean(model.featured),
    url: modelAssetUrl(model),
  }));
  return {
    id: Number(item.id),
    code: item.code || '',
    name: item.name || '',
    categoryId: Number(item.category_id) || null,
    categoryName: item.category_name || '',
    categoryCode: item.category_code || '',
    levelId: Number(item.level_id) || null,
    levelName: item.level_name || '',
    batch: item.batch || '',
    publishedYear: item.published_year || null,
    regionId: Number(item.region_id) || null,
    regionLabel: item.region_label || '',
    regionText: item.region_text || '',
    summary: item.summary || '',
    history: item.history || '',
    feature: item.feature || '',
    lineage: item.lineage || '',
    keywords: item.keywords || '',
    protectionUnit: item.protection_unit || '',
    organizationId: Number(item.organization_id) || null,
    organizationName: item.organization_name || '',
    contentSource: item.content_source || '',
    sourceCode: item.source_code || '',
    sourceUrl: item.source_url || '',
    featured: Boolean(item.featured),
    coverUrl: publicFileUrl(item.cover_path),
    videoUrl: item.video_url || '',
    models: projects,
  };
}

function inheritorDto(row) {
  const item = decorateRegion(row);
  return {
    id: Number(item.id),
    code: item.code || '',
    name: item.name || '',
    gender: item.gender || '',
    ethnic: item.ethnic || '',
    birthMonth: item.birth_month || '',
    levelId: Number(item.level_id) || null,
    levelName: item.level_name || '',
    regionId: Number(item.region_id) || null,
    regionLabel: item.region_label || '',
    batch: item.batch || '',
    certifiedYear: item.certified_year || null,
    careerStartYear: item.career_start_year || null,
    address: item.address || '',
    experience: item.experience || '',
    storyTitle: item.story_title || '',
    skill: item.skill || '',
    honors: item.honors || '',
    sourceCode: item.source_code || '',
    sourceUrl: item.source_url || '',
    dataNote: item.data_note || '',
    featured: Boolean(item.featured),
    photoUrl: publicFileUrl(item.photo_path),
    videoUrl: item.video_url || '',
  };
}

function organizationDto(row, { includeContact = false } = {}) {
  const item = decorateRegion(row);
  return {
    id: Number(item.id),
    code: item.code || '',
    name: item.name || '',
    orgType: item.org_type || '',
    regionId: Number(item.region_id) || null,
    regionLabel: item.region_label || '',
    address: includeContact ? item.address || '' : '',
    manager: includeContact ? item.manager || '' : '',
    phone: includeContact ? item.phone || '' : '',
    email: includeContact ? item.email || '' : '',
    foundedYear: item.founded_year || null,
    isOpen: Boolean(item.is_open),
    openHours: item.open_hours || '',
    traffic: item.traffic || '',
    experience: item.experience || '',
    intro: item.intro || '',
    verified: Boolean(item.verified),
    sourceUrl: item.source_url || '',
    coverUrl: publicFileUrl(item.cover_path),
  };
}

function attachmentDto(row) {
  return {
    id: Number(row.id),
    kind: row.kind || '',
    title: row.title || '',
    fileName: row.file_name || '',
    url: publicFileUrl(row.file_path),
    externalUrl: row.external_url || '',
    mimeType: row.mime_type || '',
    note: row.note || '',
    sourceKind: row.source_kind || '',
    sourceUrl: row.source_url || '',
    license: row.license || '',
    photographer: row.photographer || '',
  };
}

const PROJECT_IDS_WITH_MODELS = [...new Set(MODELS.map((model) => Number(model.projectId)).filter(Boolean))];

function applyProjectFilters(query) {
  const where = [`t.status = 'published'`];
  const params = [];
  const keyword = String(query.q || query.keyword || '').trim().slice(0, 80);
  if (keyword) {
    where.push(`(IFNULL(t.name,'') LIKE ? OR IFNULL(t.keywords,'') LIKE ? OR
      IFNULL(t.summary,'') LIKE ? OR IFNULL(t.protection_unit,'') LIKE ? OR
      IFNULL(t.code,'') LIKE ?)`);
    params.push(...Array(5).fill(`%${keyword}%`));
  }
  const categoryId = toInt(query.category_id || query.category, 0);
  if (categoryId) {
    where.push('t.category_id = ?');
    params.push(categoryId);
  }
  const levelId = toInt(query.level_id || query.level, 0);
  if (levelId) {
    where.push('t.level_id = ?');
    params.push(levelId);
  }
  const regionId = toInt(query.region_id || query.region, 0);
  if (regionId) {
    const ids = regionIds(regionId);
    if (ids.length) {
      where.push(`t.region_id IN (${ids.map(() => '?').join(', ')})`);
      params.push(...ids);
    }
  }
  const has3d = String(query.has_3d || '').trim().toLowerCase();
  if (['1', 'true', 'with'].includes(has3d)) {
    if (PROJECT_IDS_WITH_MODELS.length) {
      where.push(`t.id IN (${PROJECT_IDS_WITH_MODELS.map(() => '?').join(', ')})`);
      params.push(...PROJECT_IDS_WITH_MODELS);
    } else {
      where.push('0 = 1');
    }
  } else if (['0', 'false', 'without'].includes(has3d)) {
    if (PROJECT_IDS_WITH_MODELS.length) {
      where.push(`t.id NOT IN (${PROJECT_IDS_WITH_MODELS.map(() => '?').join(', ')})`);
      params.push(...PROJECT_IDS_WITH_MODELS);
    }
  }
  if (query.featured === '1') where.push('t.featured = 1');
  return { clause: `WHERE ${where.join(' AND ')}`, params, keyword };
}

function projectSort(query) {
  const direction = query.dir === 'asc' ? 'ASC' : 'DESC';
  if (query.sort === 'published_year') return `t.published_year ${direction}, t.name ASC`;
  if (query.sort === 'name') return 't.name ASC';
  return `t.updated_at ${direction}`;
}

export function listPublicProjects(query = {}) {
  const { clause, params, keyword } = applyProjectFilters(query);
  const total = count(`SELECT COUNT(*) AS n FROM project t ${clause}`, params);
  const pageSize = clamp(toInt(query.pageSize, PAGE_SIZE), 1, 60);
  const pageInfo = paginate(total, toInt(query.page, 1), pageSize);
  const items = all(
    `${PROJECT_SELECT} ${clause} ORDER BY ${projectSort(query)} LIMIT ? OFFSET ?`,
    [...params, pageInfo.pageSize, pageInfo.offset],
  ).map(projectDto);
  return { ...pageInfo, keyword, items };
}

export function getPublicProject(id) {
  const row = get(`${PROJECT_SELECT} WHERE t.id = ? AND t.status = 'published'`, [id]);
  if (!row) return null;
  const project = projectDto(row);
  const inheritors = all(
    `SELECT i.*, l.name AS level_name, r.name AS region_name
     FROM project_inheritor pi
     JOIN inheritor i ON i.id = pi.inheritor_id
     LEFT JOIN heritage_level l ON l.id = i.level_id
     LEFT JOIN region r ON r.id = i.region_id
     WHERE pi.project_id = ? AND i.status = 'published'
     ORDER BY pi.is_representative DESC, i.name`,
    [id],
  ).map(inheritorDto);
  const relatedProjects = all(
    `${PROJECT_SELECT}
     WHERE t.status = 'published' AND t.category_id = ? AND t.id <> ?
     ORDER BY CASE WHEN t.region_id = ? THEN 0 ELSE 1 END, t.featured DESC, t.id
     LIMIT 3`,
    [row.category_id, id, row.region_id || 0],
  ).map(projectDto);
  const organization = row.organization_id
    ? get(`${ORGANIZATION_SELECT} WHERE t.id = ? AND t.status = 'published'`, [
        row.organization_id,
      ])
    : null;
  return {
    project,
    inheritors,
    relatedProjects,
    organization: organization
      ? organizationDto(organization, { includeContact: Boolean(organization.verified) })
      : null,
    attachments: listAttachments('project', id).map(attachmentDto),
  };
}

export function listPublicInheritors(query = {}) {
  const where = [`t.status = 'published'`];
  const params = [];
  const keyword = String(query.q || query.keyword || '').trim().slice(0, 80);
  if (keyword) {
    where.push(`(IFNULL(t.name,'') LIKE ? OR IFNULL(t.skill,'') LIKE ? OR
      IFNULL(t.story_title,'') LIKE ? OR IFNULL(t.address,'') LIKE ? OR
      IFNULL(t.code,'') LIKE ?)`);
    params.push(...Array(5).fill(`%${keyword}%`));
  }
  const levelId = toInt(query.level_id || query.level, 0);
  if (levelId) {
    where.push('t.level_id = ?');
    params.push(levelId);
  }
  const regionId = toInt(query.region_id || query.region, 0);
  if (regionId) {
    const ids = regionIds(regionId);
    if (ids.length) {
      where.push(`t.region_id IN (${ids.map(() => '?').join(', ')})`);
      params.push(...ids);
    }
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = count(`SELECT COUNT(*) AS n FROM inheritor t ${clause}`, params);
  const pageSize = clamp(toInt(query.pageSize, PAGE_SIZE), 1, 60);
  const pageInfo = paginate(total, toInt(query.page, 1), pageSize);
  const direction = query.dir === 'asc' ? 'ASC' : 'DESC';
  const order =
    query.sort === 'name'
      ? 't.name ASC'
      : query.sort === 'certified_year'
        ? `t.certified_year ${direction}, t.name ASC`
        : `t.updated_at ${direction}`;
  const items = all(
    `${INHERITOR_SELECT} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, pageInfo.pageSize, pageInfo.offset],
  ).map(inheritorDto);
  return { ...pageInfo, keyword, items };
}

export function getPublicInheritor(id) {
  const row = get(`${INHERITOR_SELECT} WHERE t.id = ? AND t.status = 'published'`, [id]);
  if (!row) return null;
  const projects = all(
    `${PROJECT_SELECT}
     JOIN project_inheritor pi ON pi.project_id = t.id
     WHERE pi.inheritor_id = ? AND t.status = 'published'
     ORDER BY pi.is_representative DESC, t.featured DESC, t.id`,
    [id],
  ).map(projectDto);
  const sameCategory = projects.length
    ? all(
        `${INHERITOR_SELECT}
         WHERE t.status = 'published' AND t.id <> ? AND t.level_id = ?
           AND EXISTS (
             SELECT 1 FROM project_inheritor pi
             JOIN project p ON p.id = pi.project_id
             WHERE pi.inheritor_id = t.id AND p.category_id = ?
           )
         ORDER BY t.featured DESC, t.id LIMIT 3`,
        [id, row.level_id || 0, projects[0].categoryId || 0],
      ).map(inheritorDto)
    : [];
  return {
    inheritor: inheritorDto(row),
    projects,
    sameCategory,
    attachments: listAttachments('inheritor', id).map(attachmentDto),
  };
}

export function listPublicOrganizations(query = {}) {
  const where = [`t.status = 'published'`];
  const params = [];
  const keyword = String(query.q || '').trim().slice(0, 80);
  if (keyword) {
    where.push(`(IFNULL(t.name,'') LIKE ? OR IFNULL(t.intro,'') LIKE ? OR IFNULL(t.address,'') LIKE ?)`);
    params.push(...Array(3).fill(`%${keyword}%`));
  }
  const regionId = toInt(query.region_id || query.region, 0);
  if (regionId) {
    const ids = regionIds(regionId);
    if (ids.length) {
      where.push(`t.region_id IN (${ids.map(() => '?').join(', ')})`);
      params.push(...ids);
    }
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = count(`SELECT COUNT(*) AS n FROM organization t ${clause}`, params);
  const pageInfo = paginate(total, toInt(query.page, 1), 12);
  const rows = all(
    `${ORGANIZATION_SELECT} ${clause} ORDER BY t.featured DESC, t.name LIMIT ? OFFSET ?`,
    [...params, pageInfo.pageSize, pageInfo.offset],
  );
  return {
    ...pageInfo,
    keyword,
    items: rows.map((row) => organizationDto(row, { includeContact: Boolean(row.verified) })),
  };
}

export function getPublicOrganization(id) {
  const row = get(`${ORGANIZATION_SELECT} WHERE t.id = ? AND t.status = 'published'`, [id]);
  if (!row) return null;
  const projects = all(
    `${PROJECT_SELECT} WHERE t.organization_id = ? AND t.status = 'published' ORDER BY t.featured DESC, t.id`,
    [id],
  ).map(projectDto);
  return {
    organization: organizationDto(row, { includeContact: Boolean(row.verified) }),
    projects,
    attachments: listAttachments('organization', id).map(attachmentDto),
  };
}

export function publicVisitGuideData() {
  const provinces = all(
    `SELECT r.id, r.name,
       (SELECT COUNT(*) FROM project p WHERE p.status = 'published'
          AND (p.region_id = r.id
               OR EXISTS (
                 SELECT 1 FROM project_region pr
                 WHERE pr.project_id = p.id AND pr.region_id = r.id
               ))) AS project_count,
       (SELECT COUNT(*) FROM inheritor i
        WHERE i.status = 'published' AND i.region_id = r.id) AS inheritor_count
     FROM region r
     WHERE r.region_level = 'province'
     ORDER BY project_count DESC, r.sort_order`,
  )
    .map((row) => ({
      id: Number(row.id),
      name: row.name,
      projectCount: Number(row.project_count),
      inheritorCount: Number(row.inheritor_count),
      samples: [],
    }))
    .filter((item) => item.projectCount > 0 || item.inheritorCount > 0);

  for (const province of provinces.slice(0, 12)) {
    province.samples = all(
      `SELECT p.id, p.name
       FROM project p
       WHERE p.status = 'published'
         AND (p.region_id = ?
              OR EXISTS (
                SELECT 1 FROM project_region pr
                WHERE pr.project_id = p.id AND pr.region_id = ?
              ))
       ORDER BY p.featured DESC, p.name
       LIMIT 3`,
      [province.id, province.id],
    ).map((item) => ({ id: Number(item.id), name: item.name }));
  }

  const verifiedOrganizations = all(
    `${ORGANIZATION_SELECT}
     WHERE t.status = 'published' AND t.verified = 1
     ORDER BY t.featured DESC, t.name`,
  ).map((row) => organizationDto(row, { includeContact: true }));

  return {
    provinces,
    verifiedOrganizations,
    meta: {
      provinceTotal: provinces.length,
      projectTotal: provinces.reduce((sum, item) => sum + item.projectCount, 0),
      inheritorTotal: provinces.reduce((sum, item) => sum + item.inheritorCount, 0),
      verifiedOrganizationTotal: verifiedOrganizations.length,
    },
  };
}

export function publicHomeData() {
  const projectTotal = count("SELECT COUNT(*) AS n FROM project WHERE status='published'");
  const inheritorTotal = count("SELECT COUNT(*) AS n FROM inheritor WHERE status='published'");
  const organizationTotal = count("SELECT COUNT(*) AS n FROM organization WHERE status='published'");
  const attachmentTotal = count('SELECT COUNT(*) AS n FROM attachment');
  const categories = all(
    `SELECT c.id, c.name, c.code, c.summary,
       (SELECT COUNT(*) FROM project p WHERE p.category_id = c.id AND p.status='published') AS total
     FROM heritage_category c ORDER BY c.sort_order, c.id`,
  ).map((row) => ({ ...row, id: Number(row.id), total: Number(row.total) }));
  const featuredProjects = all(
    `${PROJECT_SELECT} WHERE t.status='published' AND t.featured=1
     ORDER BY t.updated_at DESC LIMIT 6`,
  ).map(projectDto);
  const featuredInheritors = all(
    `${INHERITOR_SELECT} WHERE t.status='published' AND t.featured=1
     ORDER BY t.updated_at DESC LIMIT 4`,
  ).map(inheritorDto);
  return {
    stats: {
      projects: projectTotal,
      inheritors: inheritorTotal,
      organizations: organizationTotal,
      attachments: attachmentTotal,
    },
    categories,
    featuredProjects,
    featuredInheritors,
  };
}

export function publicModelGalleryData() {
  const projectIds = [...new Set(MODELS.map((model) => Number(model.projectId)).filter(Boolean))];
  const projects = projectIds
    .map((id) =>
      get(
        `${PROJECT_SELECT} WHERE t.id = ? AND t.status = 'published'`,
        [id],
      ),
    )
    .filter(Boolean)
    .map((row) => {
      const project = projectDto(row);
      const inheritors = all(
        `SELECT i.id, i.name, l.name AS level_name
         FROM project_inheritor pi
         JOIN inheritor i ON i.id = pi.inheritor_id
         LEFT JOIN heritage_level l ON l.id = i.level_id
         WHERE pi.project_id = ? AND i.status = 'published'
         ORDER BY pi.is_representative DESC, i.name
         LIMIT 4`,
        [project.id],
      ).map((item) => ({
        id: Number(item.id),
        name: item.name || '',
        levelName: item.level_name || '',
      }));
      return { ...project, inheritors };
    })
    .filter((project) => project.models.length > 0);

  const categories = [];
  const categoryMap = new Map();
  for (const project of projects) {
    if (!project.categoryId) continue;
    if (!categoryMap.has(project.categoryId)) {
      const item = {
        id: project.categoryId,
        name: project.categoryName,
        projectCount: 0,
        modelCount: 0,
      };
      categoryMap.set(project.categoryId, item);
      categories.push(item);
    }
    const item = categoryMap.get(project.categoryId);
    item.projectCount += 1;
    item.modelCount += project.models.length;
  }

  return {
    stats: {
      projects: projects.length,
      models: projects.reduce((sum, project) => sum + project.models.length, 0),
      categories: categories.length,
    },
    categories,
    projects,
  };
}

export function publicExploreData() {
  return { star: buildStarMapData(), graph: buildKnowledgeGraphData() };
}

export function publicFilterOptions() {
  const d = dicts();
  return {
    categories: d.categories,
    levels: d.levels,
    regions: d.regions
      .filter((region) => region.region_level === 'province')
      .map((region) => ({ id: Number(region.id), label: d.regionLabel(region.id) })),
  };
}
