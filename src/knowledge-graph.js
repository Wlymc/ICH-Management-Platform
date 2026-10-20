import { all } from './db.js';
import { dicts } from './dict.js';
import { hashString, seededUnit } from './region-geo.js';

const COLORS = {
  民间文学: '#7fa8d8', 传统音乐: '#8fc4de', 传统舞蹈: '#d99ab6', 传统戏剧: '#d24b45',
  曲艺: '#e0bb45', '传统体育、游艺与杂技': '#7fbd92', 传统美术: '#cf8a5e',
  传统技艺: '#c07898', 传统医药: '#9cc48a', 民俗: '#a89ed0',
};

export const GRAPH_WORLD = { width: 1500, height: 900 };

function provinceOf(regionId, regions) {
  let node = regions.get(Number(regionId));
  let guard = 0;
  while (node && guard < 8) {
    if (node.region_level === 'province') return node;
    node = node.parent_id ? regions.get(Number(node.parent_id)) : null;
    guard += 1;
  }
  return null;
}

export function buildKnowledgeGraphData() {
  const d = dicts();
  const categories = d.categories.map((item) => ({ ...item, color: COLORS[item.name] || '#b99a53' }));
  const categoryById = new Map(categories.map((item) => [Number(item.id), item]));
  const levelById = new Map(d.levels.map((item) => [Number(item.id), item]));

  const projects = all(
    `SELECT p.id,p.code,p.name,p.category_id,p.level_id,p.region_id,p.published_year,
            p.featured,p.summary,
            (SELECT COUNT(*) FROM attachment a WHERE a.owner_type='project' AND a.owner_id=p.id AND a.kind='image') AS image_count
     FROM project p WHERE p.status='published' ORDER BY p.category_id, p.id`,
  );
  const inheritors = all(
    `SELECT i.id,i.code,i.name,i.level_id,i.region_id,i.ethnic
     FROM inheritor i WHERE i.status='published' ORDER BY i.id`,
  );
  const relations = all(
    `SELECT pi.project_id, i.id, i.name
     FROM project_inheritor pi
     JOIN project p ON p.id=pi.project_id
     JOIN inheritor i ON i.id=pi.inheritor_id
     WHERE p.status='published' AND i.status='published'`,
  );
  const multiRegions = all('SELECT project_id, region_id FROM project_region');
  const knowledgeRows = all(
    `SELECT id,kind,title,summary,project_id FROM knowledge_entry WHERE status='published' ORDER BY id LIMIT 200`,
  );

  const regionsByProject = new Map();
  for (const row of multiRegions) {
    if (!regionsByProject.has(Number(row.project_id))) regionsByProject.set(Number(row.project_id), []);
    if (!regionsByProject.get(Number(row.project_id)).includes(Number(row.region_id))) {
      regionsByProject.get(Number(row.project_id)).push(Number(row.region_id));
    }
  }

  const inheritorsByProject = new Map();
  const projectsByInheritor = new Map();
  for (const row of relations) {
    const pid = Number(row.project_id);
    const iid = Number(row.id);
    if (!inheritorsByProject.has(pid)) inheritorsByProject.set(pid, []);
    inheritorsByProject.get(pid).push({ id: iid, name: row.name });
    if (!projectsByInheritor.has(iid)) projectsByInheritor.set(iid, []);
    if (!projectsByInheritor.get(iid).includes(pid)) projectsByInheritor.get(iid).push(pid);
  }

  const nodes = [];
  const edges = [];
  const categoryNodes = new Map();
  const projectNodes = new Map();
  const inheritorNodes = new Map();
  const regionNodes = new Map();
  const knowledgeNodes = new Map();

  const columns = 5;
  const categoryList = categories.filter((item) => projects.some((project) => Number(project.category_id) === Number(item.id)));
  categoryList.forEach((category, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const node = {
      id: `c:${category.id}`,
      kind: 'category',
      label: category.name,
      code: category.code,
      color: category.color,
      x: 180 + col * 285,
      y: 240 + row * 390,
      count: projects.filter((project) => Number(project.category_id) === Number(category.id)).length,
      detailHref: `/projects?category_id=${category.id}`,
    };
    categoryNodes.set(Number(category.id), node);
    nodes.push(node);
  });

  for (const project of projects) {
    const category = categoryById.get(Number(project.category_id));
    const level = levelById.get(Number(project.level_id));
    const projectRegions = new Set([
      ...(project.region_id ? [Number(project.region_id)] : []),
      ...(regionsByProject.get(Number(project.id)) || []),
    ]);
    const provinceIds = new Set();
    for (const regionId of projectRegions) {
      const province = provinceOf(regionId, d.regionById);
      if (province) provinceIds.add(Number(province.id));
    }
    const node = {
      id: `p:${project.id}`,
      kind: 'project',
      label: project.name,
      code: project.code,
      color: category?.color || '#b99a53',
      categoryId: Number(project.category_id),
      categoryName: category?.name || '未分类',
      levelId: Number(project.level_id),
      levelName: level?.name || '未定级',
      regionId: Number(project.region_id) || null,
      regionLabel: project.region_id ? d.regionLabel(project.region_id) : '地区待补',
      provinceIds: [...provinceIds],
      year: project.published_year ? Number(project.published_year) : null,
      featured: Boolean(project.featured),
      summary: project.summary || '',
      imageCount: Number(project.image_count || 0),
      inheritors: inheritorsByProject.get(Number(project.id)) || [],
      inheritorCount: (inheritorsByProject.get(Number(project.id)) || []).length,
      detailHref: `/projects/${project.id}`,
    };
    projectNodes.set(Number(project.id), node);
    nodes.push(node);
  }

  const projectsGrouped = new Map();
  for (const node of projectNodes.values()) {
    if (!projectsGrouped.has(node.categoryId)) projectsGrouped.set(node.categoryId, []);
    projectsGrouped.get(node.categoryId).push(node);
  }
  for (const [categoryId, items] of projectsGrouped.entries()) {
    const parent = categoryNodes.get(categoryId);
    if (!parent) continue;
    const n = items.length;
    const spread = n <= 1 ? 0 : Math.min(112, 38 + Math.sqrt(n) * 18);
    const phase = ((hashString(parent.label) % 360) * Math.PI) / 180;
    items.sort((a, b) => Number(a.id.split(':')[1]) - Number(b.id.split(':')[1]));
    items.forEach((node, index) => {
      if (n === 1) {
        node.x = parent.x;
        node.y = parent.y + 44;
        return;
      }
      const radius = 28 + (spread - 28) * Math.sqrt((index + 0.65) / n);
      const angle = phase + index * 2.399963229728653;
      node.x = parent.x + Math.cos(angle) * radius;
      node.y = parent.y + Math.sin(angle) * radius * 0.8;
    });
  }

  for (const person of inheritors) {
    const linked = (projectsByInheritor.get(Number(person.id)) || []).map((id) => projectNodes.get(id)).filter(Boolean);
    const level = levelById.get(Number(person.level_id));
    const baseX = linked.length ? linked.reduce((sum, node) => sum + node.x, 0) / linked.length : GRAPH_WORLD.width / 2;
    const baseY = linked.length ? linked.reduce((sum, node) => sum + node.y, 0) / linked.length : GRAPH_WORLD.height / 2;
    const angle = (hashString(`inheritor:${person.id}`) % 360) * Math.PI / 180;
    const radius = 20 + seededUnit(person.id, 2) * 22;
    const node = {
      id: `i:${person.id}`,
      kind: 'inheritor',
      label: person.name,
      code: person.code,
      color: '#2f4858',
      levelName: level?.name || '未定级',
      regionLabel: person.region_id ? d.regionLabel(person.region_id) : '地区待补',
      ethnic: person.ethnic || '',
      projectIds: projectsByInheritor.get(Number(person.id)) || [],
      x: baseX + Math.cos(angle) * radius,
      y: baseY + Math.sin(angle) * radius * 0.8,
      detailHref: `/inheritors/${person.id}`,
    };
    inheritorNodes.set(Number(person.id), node);
    nodes.push(node);
  }

  const regionCounts = new Map();
  for (const project of projectNodes.values()) {
    for (const regionId of project.provinceIds) regionCounts.set(regionId, (regionCounts.get(regionId) || 0) + 1);
  }
  const regionList = [...regionCounts.entries()]
    .map(([id, count]) => ({ id, count, region: d.regionById.get(id) }))
    .filter((item) => item.region)
    .sort((a, b) => b.count - a.count || a.region.name.localeCompare(b.region.name, 'zh-CN'));
  regionList.forEach((item, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, regionList.length);
    const node = {
      id: `r:${item.id}`,
      kind: 'region',
      label: item.region.name,
      code: item.region.code || '',
      color: '#8a6a3f',
      count: item.count,
      x: GRAPH_WORLD.width / 2 + Math.cos(angle) * 690,
      y: GRAPH_WORLD.height / 2 + Math.sin(angle) * 420,
      detailHref: `/projects?region_id=${item.id}`,
    };
    regionNodes.set(Number(item.id), node);
    nodes.push(node);
  });

  for (const entry of knowledgeRows) {
    const project = entry.project_id ? projectNodes.get(Number(entry.project_id)) : null;
    const node = {
      id: `k:${entry.id}`,
      kind: 'knowledge',
      label: entry.title,
      code: entry.kind || '知识',
      color: '#7a6a58',
      summary: entry.summary || '',
      x: (project?.x || GRAPH_WORLD.width / 2) + (seededUnit(entry.id, 7) - 0.5) * 36,
      y: (project?.y || GRAPH_WORLD.height / 2) + (seededUnit(entry.id, 8) - 0.5) * 36,
      detailHref: '/admin/knowledge',
    };
    knowledgeNodes.set(Number(entry.id), node);
    nodes.push(node);
  }

  for (const project of projectNodes.values()) {
    const category = categoryNodes.get(project.categoryId);
    if (category) edges.push({ id: `pc:${project.id}:${category.id}`, source: project.id, target: category.id, type: 'category' });
    for (const person of project.inheritors) {
      if (inheritorNodes.has(person.id)) {
        edges.push({ id: `pi:${project.id}:${person.id}`, source: project.id, target: `i:${person.id}`, type: 'inheritance' });
      }
    }
    for (const regionId of project.provinceIds) {
      if (regionNodes.has(regionId)) {
        edges.push({ id: `pr:${project.id}:${regionId}`, source: project.id, target: `r:${regionId}`, type: 'region' });
      }
    }
  }
  for (const entry of knowledgeRows) {
    if (entry.project_id && projectNodes.has(Number(entry.project_id))) {
      edges.push({ id: `pk:${entry.project_id}:${entry.id}`, source: `p:${entry.project_id}`, target: `k:${entry.id}`, type: 'knowledge' });
    }
  }

  const countByKind = {};
  for (const node of nodes) countByKind[node.kind] = (countByKind[node.kind] || 0) + 1;

  return {
    generatedAt: new Date().toISOString(),
    world: GRAPH_WORLD,
    nodes,
    edges,
    categories: categoryList.map((item) => ({ id: item.id, name: item.name, code: item.code, color: item.color, count: categoryNodes.get(Number(item.id))?.count || 0 })),
    meta: {
      ...countByKind,
      total: nodes.length,
      edgeTotal: edges.length,
      categoryTotal: categoryList.length,
      projectTotal: projectNodes.size,
      inheritorTotal: inheritorNodes.size,
      regionTotal: regionNodes.size,
      knowledgeTotal: knowledgeNodes.size,
      note: '图谱只展示已发布项目与已发布传承人；关系来自档案中的类别、省份与项目—传承人关联。',
    },
  };
}
