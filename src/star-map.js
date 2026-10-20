import { all } from './db.js';
import { dicts } from './dict.js';
import { hashString, provincePoint, seededUnit, STAR_WORLD } from './region-geo.js';

const CATEGORY_COLORS = {
  民间文学: '#7fa8d8',
  传统音乐: '#8fc4de',
  传统舞蹈: '#d99ab6',
  传统戏剧: '#d24b45',
  曲艺: '#e0bb45',
  '传统体育、游艺与杂技': '#7fbd92',
  传统美术: '#cf8a5e',
  传统技艺: '#c07898',
  传统医药: '#9cc48a',
  民俗: '#a89ed0',
};

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

function buildInheritorMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const projectId = Number(row.project_id);
    if (!map.has(projectId)) map.set(projectId, []);
    map.get(projectId).push({ id: Number(row.id), name: row.name, code: row.code });
  }
  return map;
}

function buildEdges(rows, nodesById) {
  const byInheritor = new Map();
  for (const row of rows) {
    const projectId = Number(row.project_id);
    if (!nodesById.has(projectId)) continue;
    if (!byInheritor.has(Number(row.id))) byInheritor.set(Number(row.id), { name: row.name, projects: [] });
    const item = byInheritor.get(Number(row.id));
    if (!item.projects.includes(projectId)) item.projects.push(projectId);
  }

  const edges = new Map();
  let sharedInheritors = 0;
  for (const item of byInheritor.values()) {
    if (item.projects.length < 2) continue;
    sharedInheritors += 1;
    for (let i = 0; i < item.projects.length; i += 1) {
      for (let j = i + 1; j < item.projects.length; j += 1) {
        const a = item.projects[i];
        const b = item.projects[j];
        const source = Math.min(a, b);
        const target = Math.max(a, b);
        const key = `${source}:${target}`;
        if (!edges.has(key)) edges.set(key, { source, target, inheritors: [] });
        const edge = edges.get(key);
        if (!edge.inheritors.includes(item.name)) edge.inheritors.push(item.name);
      }
    }
  }
  return { edges: [...edges.values()], sharedInheritors };
}

/**
 * 生成门户星图数据。只读取已发布项目与已发布传承人；
 * 坐标是行政中心示意坐标，不是行政区划地图。
 */
export function buildStarMapData() {
  const d = dicts();
  const categoryById = new Map(d.categories.map((item) => [Number(item.id), item]));
  const levelById = new Map(d.levels.map((item) => [Number(item.id), item]));

  const projectRows = all(
    `SELECT p.id, p.code, p.name, p.category_id, p.level_id, p.region_id,
            p.published_year, p.batch, p.featured, p.keywords, p.summary, p.cover_path,
            (SELECT COUNT(*) FROM attachment a
              WHERE a.owner_type = 'project' AND a.owner_id = p.id AND a.kind = 'image') AS image_count,
            (SELECT COUNT(*) FROM attachment a
              WHERE a.owner_type = 'project' AND a.owner_id = p.id AND a.kind = 'audio') AS audio_count,
            (SELECT COUNT(*) FROM attachment a
              WHERE a.owner_type = 'project' AND a.owner_id = p.id AND a.kind = 'video') AS video_count,
            (SELECT COUNT(*) FROM attachment a
              WHERE a.owner_type = 'project' AND a.owner_id = p.id AND a.kind = 'document') AS document_count
     FROM project p
     WHERE p.status = 'published'
     ORDER BY p.id`,
  );

  const inheritorRows = all(
    `SELECT pi.project_id, i.id, i.code, i.name
     FROM project_inheritor pi
     JOIN project p ON p.id = pi.project_id
     JOIN inheritor i ON i.id = pi.inheritor_id
     WHERE p.status = 'published' AND i.status = 'published'
     ORDER BY pi.project_id, i.name`,
  );
  const inheritorsByProject = buildInheritorMap(inheritorRows);

  const nodes = projectRows.map((row) => {
    const category = categoryById.get(Number(row.category_id));
    const level = levelById.get(Number(row.level_id));
    const inheritors = inheritorsByProject.get(Number(row.id)) || [];
    const imageCount = Number(row.image_count || 0);
    const audioCount = Number(row.audio_count || 0);
    const videoCount = Number(row.video_count || 0);
    const documentCount = Number(row.document_count || 0);
    const province = provinceOf(row.region_id, d.regionById);
    const completeness = Math.min(
      1,
      (Math.min(imageCount, 3) / 3) * 0.52 +
        (audioCount ? 0.18 : 0) +
        (Math.min(inheritors.length, 2) / 2) * 0.3,
    );
    return {
      id: Number(row.id),
      code: row.code,
      name: row.name,
      categoryId: Number(row.category_id) || 0,
      category: category?.name || '未分类',
      categoryCode: category?.code || '',
      color: CATEGORY_COLORS[category?.name] || '#d9c48e',
      levelId: Number(row.level_id) || 0,
      level: level?.name || '未定级',
      levelWeight: Number(level?.weight || 1),
      regionId: Number(row.region_id) || null,
      regionLabel: row.region_id ? d.regionLabel(row.region_id) : '地区待补',
      provinceId: province ? Number(province.id) : null,
      province: province?.name || '地区待补',
      year: row.published_year ? Number(row.published_year) : null,
      batch: row.batch || '',
      featured: Boolean(row.featured),
      keywords: row.keywords || '',
      summary: row.summary || '',
      coverPath: row.cover_path || '',
      imageCount,
      audioCount,
      videoCount,
      documentCount,
      inheritorCount: inheritors.length,
      inheritors,
      completeness,
      missingInheritor: inheritors.length === 0,
      radius: 3.55 + Number(level?.weight || 1) * 0.68,
      x: 0,
      y: 0,
    };
  });

  const nodesById = new Map(nodes.map((node) => [Number(node.id), node]));
  const edgeResult = buildEdges(inheritorRows, nodesById);

  const groups = new Map();
  for (const node of nodes) {
    if (!groups.has(node.province)) groups.set(node.province, []);
    groups.get(node.province).push(node);
  }

  const provinces = [];
  for (const [name, items] of groups.entries()) {
    const base = provincePoint(name);
    const n = items.length;
    const spread = n <= 1 ? 0 : Math.min(92, 18 + Math.sqrt(n) * 8);
    const phase = ((hashString(name) % 360) * Math.PI) / 180;
    items.sort((a, b) => a.id - b.id);
    items.forEach((node, index) => {
      if (n === 1) {
        node.x = base.x + (seededUnit(node.id, 1) - 0.5) * 16;
        node.y = base.y + (seededUnit(node.id, 2) - 0.5) * 12;
        return;
      }
      const radius = spread * Math.sqrt((index + 0.72) / n);
      const angle = phase + index * 2.399963229728653;
      node.x = base.x + Math.cos(angle) * radius;
      node.y = base.y + Math.sin(angle) * radius * 0.78;
    });
    provinces.push({
      id: items[0]?.provinceId || null,
      name,
      x: base.x,
      y: base.y,
      count: n,
      radius: n >= 15 ? spread + 16 : 0,
      categories: [...new Set(items.map((item) => item.category))],
    });
  }

  const categoryCounts = new Map();
  const levelCounts = new Map();
  for (const node of nodes) {
    categoryCounts.set(node.categoryId, (categoryCounts.get(node.categoryId) || 0) + 1);
    levelCounts.set(node.levelId, (levelCounts.get(node.levelId) || 0) + 1);
  }

  const years = nodes.map((node) => node.year).filter((year) => Number.isFinite(year));
  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;

  return {
    generatedAt: new Date().toISOString(),
    world: STAR_WORLD,
    categories: d.categories.map((item) => ({
      id: Number(item.id),
      name: item.name,
      code: item.code,
      color: CATEGORY_COLORS[item.name] || '#d9c48e',
      total: categoryCounts.get(Number(item.id)) || 0,
    })),
    levels: d.levels.map((item) => ({
      id: Number(item.id),
      name: item.name,
      weight: Number(item.weight || 1),
      total: levelCounts.get(Number(item.id)) || 0,
    })),
    nodes,
    edges: edgeResult.edges,
    provinces: provinces.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN')),
    meta: {
      total: nodes.length,
      categoryTotal: nodes.length,
      provinceTotal: provinces.length,
      missingInheritor: nodes.filter((node) => node.missingInheritor).length,
      sharedInheritors: edgeResult.sharedInheritors,
      edgeTotal: edgeResult.edges.length,
      minYear,
      maxYear,
      imageTotal: nodes.reduce((sum, node) => sum + node.imageCount, 0),
      note: '星点位置为行政中心示意，未绘制行政边界；仅展示已发布内容。',
    },
  };
}
