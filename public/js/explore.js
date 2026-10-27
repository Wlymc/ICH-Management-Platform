/* 非遗探索 V4：地域/时间双视角、正十边形门类图谱、保护星环与故事航线。 */
(() => {
  const root = document.querySelector('[data-explore-app]');
  if (!root) return;
  const svg = root.querySelector('[data-star-svg]');
  const bgLayer = root.querySelector('[data-star-bg]');
  const starLayer = root.querySelector('[data-star-layer]');
  const shell = root.querySelector('[data-star-shell]');
  const sphereCanvas = root.querySelector('[data-person-sphere]');
  const sphereCtx = sphereCanvas?.getContext('2d');
  const searchEl = root.querySelector('[data-explore-search]');
  const quickEl = root.querySelector('[data-explore-quick]');
  const stageEl = root.querySelector('.explore-stage');
  const detailEl = root.querySelector('[data-explore-detail]');
  const sideEl = root.querySelector('[data-explore-side]');
  const drawerEl = root.querySelector('[data-explore-drawer]');
  const drawerBodyEl = root.querySelector('[data-drawer-body]');
  const legendPanelEl = root.querySelector('[data-explore-legend-panel]');
  const drawerRailBtn = root.querySelector('[data-drawer-rail]');
  const drawerRailLabelEl = root.querySelector('[data-drawer-rail-label]');
  const drawerHeadingEl = root.querySelector('[data-drawer-heading]');
  const drawerTabButtons = [...root.querySelectorAll('[data-drawer-tab]')];
  const legendEl = root.querySelector('[data-explore-legend]');
  const legendTitleEl = root.querySelector('[data-explore-legend-title]');
  const miniSealEl = root.querySelector('[data-explore-mini-seal]');
  const statsEl = root.querySelector('[data-star-stats]');
  const tooltipEl = root.querySelector('[data-star-tooltip]');
  const lensTitleEl = root.querySelector('[data-lens-title]');
  const lensKickerEl = root.querySelector('[data-lens-kicker]');
  const lensSubEl = root.querySelector('[data-lens-sub]');
  const visualModeToolsEl = root.querySelector('[data-visual-mode-tools]');
  const regionModeButtons = [...root.querySelectorAll('[data-region-mode]')];
  const timePlayBtn = root.querySelector('[data-time-play]');
  const storyTrailEl = root.querySelector('[data-story-trail]');
  const storyProgressEl = root.querySelector('[data-story-progress]');
  const storyTitleEl = root.querySelector('[data-story-title]');
  const storyNoteEl = root.querySelector('[data-story-note]');
  const storyPrevBtn = root.querySelector('[data-story-prev]');
  const storyNextBtn = root.querySelector('[data-story-next]');
  const detailCloseBtn = root.querySelector('[data-detail-close]');
  const lensButtons = [...root.querySelectorAll('[data-explore-lens]')];
  const routeButtons = [...root.querySelectorAll('[data-explore-route]')];
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

  const LENS_META = {
    region: { title: '地域星图', kicker: 'REGIONAL CONSTELLATION', sub: '看省级星座里的项目密度、门类与缺环线索。' },
    project: { title: '项目星群', kicker: 'PROJECT CONSTELLATION', sub: '按门类浏览全部项目星点，点开即可读到地区与传承人。' },
    person: { title: '人物星群', kicker: 'INHERITOR CONSTELLATION', sub: '浏览全部传承人，按门类或地区寻找他们与项目的连接。' },
  };
  const LEVEL_COLORS = { 国家级: '#e0bb45', 省级: '#d24b45', 市级: '#7fa8d8', 县级: '#7fbd92' };
  const KIND_LABEL = { project: '项目', inheritor: '传承人', category: '门类', region: '地区', batch: '批次' };
  const BATCH_ORDER = ['第一批', '第二批', '第三批', '第四批', '第五批'];
  const BATCH_COLORS = { 第一批: '#e0bb45', 第二批: '#d79a62', 第三批: '#d26a61', 第四批: '#79a6bf', 第五批: '#88b897' };
  const TIME_RADII = { 第一批: 326, 第二批: 268, 第三批: 210, 第四批: 152, 第五批: 94 };
  const VIEW = { width: 1400, height: 820 };

  const state = {
    data: null,
    lens: 'region',
    regionMode: 'geo',
    query: '',
    personGroup: 'category',
    selected: null,
    detailOpen: false,
    drawerTab: 'detail',
    story: null,
    storyIndex: 0,
    storyRoutes: {},
    timeActive: 5,
    timeTimer: 0,
    layouts: {},
    graphById: new Map(),
    starProjectById: new Map(),
    starProjectsByProvince: new Map(),
    view: { x: 0, y: 0, scale: 1 },
    drag: null,
    suppressClick: false,
    pressedKey: null,
    hoverKey: null,
    backgroundReady: false,
    sphere: { rotX: -0.16, rotY: 0.4, dragging: false, moved: false, lastX: 0, lastY: 0, hover: null, points: [], raf: 0, width: 0, height: 0, dpr: 1 },
  };

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function shortProvince(name) {
    return String(name || '').replace(/壮族自治区$/, '').replace(/回族自治区$/, '').replace(/维吾尔自治区$/, '').replace(/自治区$/, '').replace(/特别行政区$/, '').replace(/[省市]$/, '');
  }
  function truncate(value, length) { const text = String(value || ''); return text.length > length ? `${text.slice(0, length)}…` : text; }
  function unit(seed, salt = 0) {
    let numeric = Number(seed);
    if (!Number.isFinite(numeric)) {
      numeric = 2166136261;
      for (const char of String(seed)) {
        numeric ^= char.codePointAt(0);
        numeric = Math.imul(numeric, 16777619);
      }
      numeric >>>= 0;
    }
    const value = Math.sin((numeric + salt * 91.7) * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }
  function keyOf(kind, id) { return `${kind}:${id}`; }
  function parseKey(key) { const index = String(key).indexOf(':'); return { kind: String(key).slice(0, index), id: String(key).slice(index + 1) }; }

  function normalizeGraphId(value) {
    const text = String(value);
    return text.includes(':') ? text.slice(text.indexOf(':') + 1) : text;
  }

  function buildMaps() {
    for (const node of state.data.graph.nodes) {
      node.id = normalizeGraphId(node.id);
      state.graphById.set(keyOf(node.kind, node.id), node);
    }
    for (const node of state.data.star.nodes) {
      state.starProjectById.set(keyOf('project', node.id), node);
      if (!state.starProjectsByProvince.has(node.province)) state.starProjectsByProvince.set(node.province, []);
      state.starProjectsByProvince.get(node.province).push(node);
    }
  }

  function projectGraphNode(id) { return state.graphById.get(keyOf('project', id)); }
  function personGraphNode(id) { return state.graphById.get(keyOf('inheritor', id)); }
  function categoryGraphNode(id) { return state.graphById.get(keyOf('category', id)); }
  function regionGraphNode(id) { return state.graphById.get(keyOf('region', id)); }

  function gridPositions(count, columns, x0, y0, gapX, gapY) {
    return Array.from({ length: count }, (_, index) => ({
      x: x0 + (index % columns) * gapX,
      y: y0 + Math.floor(index / columns) * gapY,
    }));
  }

  function placeCluster(items, hub, spread, phaseSeed) {
    const n = items.length;
    const phase = (unit(phaseSeed, 1) * Math.PI * 2);
    items.forEach((node, index) => {
      if (n === 1) { node.x = hub.x + 26; node.y = hub.y + 8; return; }
      const radius = 20 + spread * Math.sqrt((index + 0.55) / n);
      const angle = phase + index * 2.399963229728653;
      node.x = hub.x + Math.cos(angle) * radius;
      node.y = hub.y + Math.sin(angle) * radius * 0.8;
    });
  }

  function buildRegionLayout() {
    const sx = 1.12;
    const sy = 1.05;
    const hubs = state.data.star.provinces.filter((item) => item.count > 0).map((item) => ({
      key: keyOf('region', item.id || item.name),
      kind: 'region',
      id: item.id || item.name,
      label: item.name,
      x: item.x * sx + 18,
      y: item.y * sy + 20,
      count: item.count,
      color: '#d9bd76',
      ring: 16 + Math.sqrt(item.count) * 5,
      meta: `${item.count} 个项目`,
      searchText: `${item.name} ${item.categories.join(' ')} ${item.count} 个项目`,
    }));
    const hubByProvince = new Map(hubs.map((hub) => [hub.label, hub]));
    const nodes = state.data.star.nodes.map((node) => {
      const project = projectGraphNode(node.id);
      const completeness = Math.round(Number(node.completeness || 0) * 100);
      return {
        key: keyOf('project', node.id),
        kind: 'project',
        id: node.id,
        label: node.name,
        x: node.x * sx + 18,
        y: node.y * sy + 20,
        r: 3.4 + Number(node.levelWeight || 1) * 0.72,
        color: node.color,
        categoryId: node.categoryId,
        categoryName: node.category,
        levelName: node.level,
        regionLabel: node.regionLabel,
        province: node.province,
        hubKey: hubByProvince.get(node.province)?.key || '',
        missing: node.missingInheritor,
        completeness,
        imageCount: Number(node.imageCount || 0),
        audioCount: Number(node.audioCount || 0),
        batch: node.batch || '',
        year: node.year || null,
        project,
        meta: `${node.category} · ${node.level} · ${node.year || '年份待补'} · 档案 ${completeness}%`,
        searchText: `${node.name} ${node.category} ${node.level} ${node.regionLabel} ${node.keywords} ${(node.inheritors || []).map((p) => p.name).join(' ')} ${node.missingInheritor ? '缺环 无传承人' : ''} ${node.batch || ''}`,
      };
    });
    return { hubs, nodes, kind: 'geo' };
  }

  function buildCategoryProjectLayout() {
    const categories = state.data.graph.nodes
      .filter((node) => node.kind === 'category')
      .sort((a, b) => Number(a.id) - Number(b.id))
      .slice(0, 10);
    const center = { x: VIEW.width / 2, y: 410 };
    const radiusX = 356;
    const radiusY = 276;
    const positions = categories.map((_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, categories.length);
      return { x: center.x + Math.cos(angle) * radiusX, y: center.y + Math.sin(angle) * radiusY, angle };
    });
    const hubs = categories.map((category, index) => ({
      key: keyOf('category', category.id),
      kind: 'category',
      id: category.id,
      label: category.label,
      x: positions[index].x,
      y: positions[index].y,
      count: category.count,
      color: category.color,
      ring: 18 + Math.sqrt(category.count) * 5,
      vertexAngle: positions[index].angle,
      clusterRadius: category.count > 12 ? 74 : 54 + Math.sqrt(category.count) * 2.7,
      meta: `${category.count} 个项目`,
      searchText: `${category.label} ${category.code || ''} ${category.count} 个项目`,
    }));
    const hubById = new Map(hubs.map((hub) => [Number(hub.id), hub]));
    const byCategory = new Map();
    for (const project of state.data.graph.nodes.filter((node) => node.kind === 'project')) {
      if (!byCategory.has(Number(project.categoryId))) byCategory.set(Number(project.categoryId), []);
      byCategory.get(Number(project.categoryId)).push(project);
    }
    const nodes = [];
    for (const [categoryId, projects] of byCategory.entries()) {
      const hub = hubById.get(categoryId);
      if (!hub) continue;
      const items = projects.map((project) => {
        const starProject = state.starProjectById.get(keyOf('project', project.id));
        const completeness = Math.round(Number(starProject?.completeness || 0) * 100);
        return {
          key: keyOf('project', project.id),
          kind: 'project',
          id: project.id,
          label: project.label,
          x: 0,
          y: 0,
          r: project.levelName === '国家级' ? 6.2 : project.levelName === '省级' ? 5.4 : project.levelName === '市级' ? 4.8 : 4.2,
          color: project.color,
          categoryId: Number(project.categoryId),
          categoryName: project.categoryName,
          levelName: project.levelName,
          regionLabel: project.regionLabel,
          hubKey: hub.key,
          missing: Number(project.inheritorCount || 0) === 0,
          completeness,
          imageCount: Number(project.imageCount || 0),
          audioCount: Number(starProject?.audioCount || 0),
          batch: starProject?.batch || '',
          year: project.year || null,
          project,
          meta: `${project.categoryName} · ${project.levelName}${project.year ? ` · ${project.year}` : ''} · 档案 ${completeness}%`,
          searchText: `${project.label} ${project.categoryName} ${project.levelName} ${project.regionLabel} ${project.year || ''} ${starProject?.batch || ''} ${(project.inheritors || []).map((p) => p.name).join(' ')}${Number(project.inheritorCount || 0) === 0 ? ' 缺环 无传承人' : ''}`,
        };
      });
      const n = items.length;
      const innerCount = n > 12 ? Math.ceil(n / 2) : n;
      const outerCount = n - innerCount;
      const phase = unit(`project-${categoryId}`, 1) * Math.PI * 2;
      items.forEach((node, index) => {
        const outer = index >= innerCount;
        const ringIndex = outer ? index - innerCount : index;
        const ringCount = Math.max(1, outer ? outerCount : innerCount);
        const radius = n > 12 ? (outer ? 74 : 43) : 54 + Math.sqrt(n) * 2.7;
        const angle = phase + (ringIndex * Math.PI * 2) / ringCount + (outer ? Math.PI / ringCount : 0);
        node.x = hub.x + Math.cos(angle) * radius;
        node.y = hub.y + Math.sin(angle) * radius * 0.82;
      });
      nodes.push(...items);
    }
    return { hubs, nodes, kind: 'decagon', center, radiusX, radiusY, vertices: positions };
  }

  function buildTimeLayout() {
    const projects = state.data.star.nodes.filter((node) => BATCH_ORDER.includes(node.batch));
    const grouped = new Map(BATCH_ORDER.map((batch) => [batch, []]));
    for (const project of projects) grouped.get(project.batch).push(project);
    const center = { x: VIEW.width / 2, y: 410 };
    const rings = BATCH_ORDER.map((batch, batchIndex) => {
      const items = grouped.get(batch).sort((a, b) => Number(a.id) - Number(b.id));
      const years = items.map((item) => Number(item.year)).filter(Number.isFinite);
      const radius = TIME_RADII[batch];
      const nodes = items.map((project, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, items.length) + batchIndex * 0.13;
        const completeness = Math.round(Number(project.completeness || 0) * 100);
        return {
          key: keyOf('project', project.id),
          kind: 'project',
          id: project.id,
          label: project.name,
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
          r: 3.6 + Number(project.levelWeight || 1) * 0.65,
          color: project.color,
          categoryId: project.categoryId,
          categoryName: project.category,
          levelName: project.level,
          regionLabel: project.regionLabel,
          province: project.province,
          hubKey: keyOf('batch', batch),
          missing: project.missingInheritor,
          completeness,
          imageCount: Number(project.imageCount || 0),
          audioCount: Number(project.audioCount || 0),
          batch,
          batchIndex,
          year: project.year || null,
          meta: `${batch} · ${project.year || '年份待补'} · 档案 ${completeness}%`,
          searchText: `${project.name} ${batch} ${project.year || ''} ${project.category} ${project.level} ${project.regionLabel} ${(project.inheritors || []).map((p) => p.name).join(' ')}${project.missingInheritor ? ' 缺环 无传承人' : ''}`,
        };
      });
      return {
        batch,
        batchIndex,
        radius,
        count: items.length,
        yearLabel: years.length ? (Math.min(...years) === Math.max(...years) ? String(Math.min(...years)) : `${Math.min(...years)}—${Math.max(...years)}`) : '年份待补',
        nodes,
      };
    });
    const hubs = rings.map((ring) => ({
      key: keyOf('batch', ring.batch),
      kind: 'batch',
      id: ring.batch,
      label: ring.batch,
      x: center.x,
      y: center.y - ring.radius,
      count: ring.count,
      color: BATCH_COLORS[ring.batch],
      r: 8,
      batchIndex: ring.batchIndex,
      yearLabel: ring.yearLabel,
      meta: `${ring.yearLabel} · ${ring.count} 个项目`,
      searchText: `${ring.batch} ${ring.yearLabel} ${ring.count} 个项目`,
    }));
    return { hubs, nodes: rings.flatMap((ring) => ring.nodes), rings, kind: 'time', center };
  }

  function personPrimaryCategory(person) {
    for (const projectId of person.projectIds || []) {
      const project = projectGraphNode(projectId);
      if (project) return { id: Number(project.categoryId), label: project.categoryName };
    }
    return { id: 0, label: '门类待补' };
  }

  function personProvince(person) {
    const first = String(person.regionLabel || '').split('/')[0].trim();
    return first || '地区待补';
  }

  function buildPersonLayout(groupBy) {
    const persons = state.data.graph.nodes.filter((node) => node.kind === 'inheritor');
    const groups = new Map();
    if (groupBy === 'region') {
      for (const person of persons) {
        const province = personProvince(person);
        if (!groups.has(province)) groups.set(province, []);
        groups.get(province).push(person);
      }
    } else {
      for (const person of persons) {
        const category = personPrimaryCategory(person);
        if (!groups.has(category.label)) groups.set(category.label, []);
        groups.get(category.label).push(person);
      }
    }
    const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh-CN'));
    const positions = groupBy === 'region'
      ? gridPositions(entries.length, 6, 150, 130, 220, 150)
      : gridPositions(entries.length, 5, 180, 220, 260, 390);
    const hubs = entries.map(([label, items], index) => {
      const isRegion = groupBy === 'region';
      const region = isRegion ? state.data.graph.nodes.find((node) => node.kind === 'region' && node.label === label) : null;
      const category = !isRegion ? state.data.graph.nodes.find((node) => node.kind === 'category' && node.label === label) : null;
      const color = isRegion ? '#9cc48a' : (category?.color || '#c8a45c');
      return {
        key: isRegion ? keyOf('region', region?.id || label) : keyOf('category', category?.id || label),
        kind: isRegion ? 'region' : 'category',
        id: isRegion ? (region?.id || label) : (category?.id || label),
        label,
        x: positions[index].x,
        y: positions[index].y,
        count: items.length,
        color,
        ring: 14 + Math.sqrt(items.length) * 6,
        meta: `${items.length} 位传承人`,
        searchText: `${label} ${items.length} 位传承人`,
      };
    });
    const hubByLabel = new Map(hubs.map((hub) => [hub.label, hub]));
    const nodes = [];
    for (const [label, people] of entries) {
      const hub = hubByLabel.get(label);
      const nodesInGroup = people.map((person) => ({
        key: keyOf('inheritor', person.id),
        kind: 'inheritor',
        id: person.id,
        label: person.label,
        x: 0,
        y: 0,
        r: 4.3 + Math.min(3, (person.projectIds || []).length) * 1.15,
        color: LEVEL_COLORS[person.levelName] || '#7fa8d8',
        levelName: person.levelName,
        regionLabel: person.regionLabel,
        ethnic: person.ethnic,
        hubKey: hub.key,
        meta: `${person.levelName || ''} · ${person.regionLabel || ''} · ${(person.projectIds || []).length} 个项目`,
        searchText: `${person.label} ${person.levelName} ${person.regionLabel} ${person.ethnic} ${(person.projectIds || []).map((id) => projectGraphNode(id)?.label || '').join(' ')}`,
      }));
      placeCluster(nodesInGroup, hub, groupBy === 'region' ? 46 : 82, `person-${groupBy}-${label}`);
      nodes.push(...nodesInGroup);
    }
    return { hubs, nodes };
  }

  function buildLayouts() {
    state.layouts = {
      region: buildRegionLayout(),
      time: buildTimeLayout(),
      project: buildCategoryProjectLayout(),
      personCategory: buildPersonLayout('category'),
      personRegion: buildPersonLayout('region'),
    };
  }

  function currentLayout() {
    if (state.lens === 'person') return state.personGroup === 'region' ? state.layouts.personRegion : state.layouts.personCategory;
    if (state.lens === 'region' && state.regionMode === 'time') return state.layouts.time;
    return state.layouts[state.lens];
  }

  function renderBackground() {
    if (state.backgroundReady) return;
    state.backgroundReady = true;
    const stars = Array.from({ length: 280 }, (_, index) => {
      const x = unit(index, 1) * VIEW.width;
      const y = unit(index, 2) * VIEW.height;
      const r = 0.35 + unit(index, 3) * 0.9;
      const opacity = 0.07 + unit(index, 4) * 0.2;
      return `<circle class="star-bg-star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" opacity="${opacity.toFixed(2)}"/>`;
    }).join('');
    bgLayer.innerHTML = `
      <circle class="star-guide" cx="700" cy="410" r="330"/>
      <circle class="star-guide" cx="700" cy="410" r="470" opacity=".65"/>
      <path class="star-guide" d="M90 410H1310M700 40V780" opacity=".55"/>
      ${stars}`;
  }

  function applyTransform() {
    starLayer.setAttribute('transform', `translate(${state.view.x.toFixed(2)} ${state.view.y.toFixed(2)}) scale(${state.view.scale.toFixed(3)})`);
  }

  function resetView({ render = true } = {}) {
    state.view = { x: 0, y: 0, scale: 1 };
    applyTransform();
    if (render) renderMap();
  }

  function svgPoint(clientX, clientY) {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }

  function zoomAt(factor, clientX, clientY) {
    const point = svgPoint(clientX, clientY);
    const nextScale = clamp(state.view.scale * factor, 0.68, 4.5);
    const ratio = nextScale / state.view.scale;
    state.view.x = point.x - (point.x - state.view.x) * ratio;
    state.view.y = point.y - (point.y - state.view.y) * ratio;
    state.view.scale = nextScale;
    applyTransform();
  }

  function currentEntities() {
    const layout = currentLayout();
    return { layout, entities: [...layout.hubs, ...layout.nodes] };
  }

  function entityByKey(key) {
    return currentEntities().entities.find((entity) => entity.key === key) || null;
  }

  function matchesQuery(entity) {
    if (!state.query) return true;
    return String(entity.searchText || `${entity.label} ${entity.meta || ''}`).toLowerCase().includes(state.query.toLowerCase());
  }

  function entitySize(entity) {
    if (entity.kind === 'region' || entity.kind === 'category' || entity.kind === 'batch') return entity.r || 15;
    return entity.r || 5;
  }

  function hubMarkup(entity) {
    const selected = state.selected?.kind === entity.kind && String(state.selected.id) === String(entity.id);
    const dim = state.query && !matchesQuery(entity) ? ' is-dim' : '';
    const timeDim = entity.kind === 'batch' && Number(entity.batchIndex) > state.timeActive ? ' is-time-inactive' : '';
    if (entity.kind === 'batch') {
      const text = `${entity.label} · ${entity.yearLabel}`;
      const width = Math.max(96, Math.min(210, text.length * 11 + 24));
      return `<g class="star-hub star-batch${selected ? ' is-selected' : ''}${dim}${timeDim}" data-entity-key="${esc(entity.key)}" tabindex="0" role="button" aria-label="${esc(entity.label)}，${esc(entity.meta || '')}">
        <title>${esc(entity.label)} · ${esc(entity.meta || '')}</title>
        <line class="batch-tick" x1="${entity.x}" y1="${entity.y}" x2="${entity.x}" y2="${entity.y + 18}"/>
        <rect class="batch-label-bg" x="${entity.x - width / 2}" y="${entity.y - 13}" width="${width}" height="25" rx="12"/>
        <circle class="batch-dot" cx="${entity.x - width / 2 + 13}" cy="${entity.y}" r="3.5" fill="${esc(entity.color)}"/>
        <text class="batch-label" x="${entity.x + 7}" y="${entity.y + 4}">${esc(text)}</text>
        <text class="batch-count" x="${entity.x + width / 2 - 10}" y="${entity.y + 4}">${esc(String(entity.count))}</text>
      </g>`;
    }
    const label = entity.kind === 'region' ? shortProvince(entity.label) : truncate(entity.label, 10);
    const width = Math.max(68, Math.min(136, label.length * 13 + 24));
    const r = entity.r || 16;
    return `<g class="star-hub${selected ? ' is-selected' : ''}${dim}" data-entity-key="${esc(entity.key)}" tabindex="0" role="button" aria-label="${esc(entity.label)}，${esc(entity.meta || '')}">
      <title>${esc(entity.label)} · ${esc(entity.meta || '')}</title>
      <circle class="star-hub-ring" cx="${entity.x}" cy="${entity.y}" r="${r + 12}"/>
      <rect class="star-hub-core" x="${entity.x - 7}" y="${entity.y - 7}" width="14" height="14" transform="rotate(45 ${entity.x} ${entity.y})" fill="${esc(entity.color || '#d9bd76')}"/>
      <rect class="star-hub-label-bg" x="${entity.x - width / 2}" y="${entity.y + 15}" width="${width}" height="29" rx="5"/>
      <text class="star-hub-label" x="${entity.x}" y="${entity.y + 28}">${esc(label)}</text>
      <text class="star-hub-count" x="${entity.x}" y="${entity.y + 39}">${esc(entity.meta || '').replace(' 个项目', ' 项').replace(' 位传承人', ' 人')}</text>
    </g>`;
  }

  function nodeMarkup(entity) {
    const selected = state.selected?.kind === entity.kind && String(state.selected.id) === String(entity.id);
    const matched = matchesQuery(entity);
    const dim = state.query && !matched ? ' is-dim' : '';
    const timeDim = state.lens === 'region' && state.regionMode === 'time' && Number(entity.batchIndex) > state.timeActive ? ' is-time-inactive' : '';
    const showLabel = false;
    const r = entitySize(entity);
    const isPerson = entity.kind === 'inheritor';
    const completeness = Number(entity.completeness || 0);
    const body = isPerson
      ? `<circle class="entity-body" cx="${entity.x}" cy="${entity.y}" r="${r}"/>`
      : `<circle class="entity-body" cx="${entity.x}" cy="${entity.y}" r="${r}"/>`;
    return `<g class="star-entity${selected ? ' is-selected' : ''}${dim}${timeDim}" data-entity-key="${esc(entity.key)}" data-batch-index="${entity.batchIndex ?? ''}" tabindex="0" role="button" aria-label="${esc(entity.label)}，${esc(entity.meta || '')}">
      <title>${esc(entity.label)} · ${esc(entity.meta || '')}</title>
      <circle class="entity-halo" cx="${entity.x}" cy="${entity.y}" r="${r * 2.2}" fill="${esc(entity.color || '#d9bd76')}"/>
      ${body.replace('class="entity-body"', `class="entity-body" fill="${esc(entity.color || '#d9bd76')}"`)}
      ${entity.kind === 'project' && completeness > 0 ? `<circle class="protection-ring" cx="${entity.x}" cy="${entity.y}" r="${r + 4}" pathLength="100" stroke-dasharray="${completeness} ${100 - completeness}" transform="rotate(-90 ${entity.x} ${entity.y})"/>` : ''}
      ${entity.missing ? `<circle class="star-gap-ring" cx="${entity.x}" cy="${entity.y}" r="${r + 4}"/>` : ''}
      ${showLabel ? `<text class="entity-label" x="${entity.x}" y="${entity.y - r - 8}">${esc(truncate(entity.label, 13))}</text>` : ''}
    </g>`;
  }

  function buildSpherePoints() {
    if (state.sphere.points.length) return;
    const people = state.data.graph.nodes.filter((node) => node.kind === 'inheritor');
    const n = Math.max(1, people.length);
    state.sphere.points = people.map((person, index) => {
      const y = 1 - (index / Math.max(1, n - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = index * 2.399963229728653;
      return {
        person,
        key: keyOf('inheritor', person.id),
        x: Math.cos(theta) * radius,
        y,
        z: Math.sin(theta) * radius,
        baseSize: 4.3 + Math.min(3, (person.projectIds || []).length) * 1.15,
        color: LEVEL_COLORS[person.levelName] || '#7fa8d8',
        searchText: `${person.label} ${person.levelName} ${person.regionLabel} ${person.ethnic} ${(person.projectIds || []).map((id) => projectGraphNode(id)?.label || '').join(' ')}`,
        screenX: 0,
        screenY: 0,
        screenR: 0,
        depth: 0,
      };
    });
  }

  function resizeSphereCanvas() {
    const rect = shell.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(280, Math.round(rect.width));
    const height = Math.max(320, Math.round(rect.height));
    if (sphereCanvas.width !== Math.round(width * dpr) || sphereCanvas.height !== Math.round(height * dpr)) {
      sphereCanvas.width = Math.round(width * dpr);
      sphereCanvas.height = Math.round(height * dpr);
    }
    state.sphere.width = width;
    state.sphere.height = height;
    state.sphere.dpr = dpr;
  }

  function sphereProjected(point) {
    const sx = Math.sin(state.sphere.rotY);
    const cx = Math.cos(state.sphere.rotY);
    const sy = Math.sin(state.sphere.rotX);
    const cy = Math.cos(state.sphere.rotX);
    const x1 = point.x * cx + point.z * sx;
    const z1 = -point.x * sx + point.z * cx;
    const y1 = point.y * cy - z1 * sy;
    const z2 = point.y * sy + z1 * cy;
    const depth = (z2 + 1) / 2;
    const R = Math.min(state.sphere.width, state.sphere.height) * 0.36;
    const scale = 0.72 + depth * 0.38;
    return {
      x: state.sphere.width / 2 + x1 * R * scale,
      y: state.sphere.height / 2 + y1 * R * scale,
      z: z2,
      depth,
      r: point.baseSize * (0.72 + depth * 0.55),
    };
  }

  function renderSphereFrame() {
    if (!sphereCtx || state.lens !== 'person') return;
    const { width, height, dpr } = state.sphere;
    sphereCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sphereCtx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const R = Math.min(width, height) * 0.36;
    sphereCtx.save();
    sphereCtx.strokeStyle = 'rgba(200,164,92,.14)';
    sphereCtx.lineWidth = 1;
    sphereCtx.beginPath();
    sphereCtx.arc(cx, cy, R, 0, Math.PI * 2);
    sphereCtx.stroke();
    sphereCtx.setLineDash([4, 7]);
    for (const ratio of [0.4, 0.72]) {
      sphereCtx.beginPath();
      sphereCtx.ellipse(cx, cy, R, R * ratio, 0, 0, Math.PI * 2);
      sphereCtx.stroke();
    }
    sphereCtx.beginPath();
    sphereCtx.ellipse(cx, cy, R * 0.42, R, 0, 0, Math.PI * 2);
    sphereCtx.stroke();
    sphereCtx.setLineDash([]);
    sphereCtx.restore();

    const selectedKey = state.selected ? keyOf(state.selected.kind, state.selected.id) : '';
    const projected = state.sphere.points.map((point) => ({ point, p: sphereProjected(point) })).sort((a, b) => a.p.z - b.p.z);
    for (const { point, p } of projected) {
      point.screenX = p.x;
      point.screenY = p.y;
      point.screenR = Math.max(2.5, p.r + 5);
      point.depth = p.depth;
      const selected = point.key === selectedKey;
      const hovered = state.sphere.hover?.key === point.key;
      const matched = !state.query || matchesQuery({ ...point.person, key: point.key, searchText: point.searchText, meta: `${point.person.levelName || ''} ${point.person.regionLabel || ''}` });
      const alpha = (matched ? 0.26 + p.depth * 0.74 : 0.08) * (selected || hovered ? 1.25 : 1);
      sphereCtx.save();
      sphereCtx.globalAlpha = Math.min(1, alpha);
      if (selected || hovered) {
        const glow = sphereCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.6);
        glow.addColorStop(0, `${point.color}88`);
        glow.addColorStop(1, `${point.color}00`);
        sphereCtx.fillStyle = glow;
        sphereCtx.beginPath();
        sphereCtx.arc(p.x, p.y, p.r * 3.6, 0, Math.PI * 2);
        sphereCtx.fill();
      }
      sphereCtx.fillStyle = point.color;
      sphereCtx.beginPath();
      sphereCtx.arc(p.x, p.y, Math.max(1.8, p.r), 0, Math.PI * 2);
      sphereCtx.fill();
      if (selected || hovered) {
        sphereCtx.strokeStyle = '#f1ddb0';
        sphereCtx.lineWidth = 1.2;
        sphereCtx.beginPath();
        sphereCtx.arc(p.x, p.y, Math.max(1.8, p.r) + 4, 0, Math.PI * 2);
        sphereCtx.stroke();
      }
      sphereCtx.restore();
    }
    if (state.sphere.hover) {
      const hovered = state.sphere.points.find((point) => point.key === state.sphere.hover.key);
      if (hovered) {
        sphereCtx.save();
        sphereCtx.font = '12px KaiTi, STKaiti, "Kaiti SC", SimSun, serif';
        sphereCtx.textAlign = 'center';
        sphereCtx.textBaseline = 'bottom';
        sphereCtx.lineWidth = 3;
        sphereCtx.strokeStyle = '#091721';
        sphereCtx.fillStyle = '#f2dfb2';
        sphereCtx.strokeText(hovered.person.label, hovered.screenX, hovered.screenY - hovered.screenR - 5);
        sphereCtx.fillText(hovered.person.label, hovered.screenX, hovered.screenY - hovered.screenR - 5);
        sphereCtx.restore();
      }
    }
  }

  function sphereLoop() {
    if (state.lens !== 'person') { state.sphere.raf = 0; return; }
    if (!state.sphere.dragging && !state.sphere.hover && !reduceMotion) state.sphere.rotY += 0.0022;
    renderSphereFrame();
    state.sphere.raf = requestAnimationFrame(sphereLoop);
  }

  function startSphereLoop() {
    buildSpherePoints();
    resizeSphereCanvas();
    if (!state.sphere.raf) state.sphere.raf = requestAnimationFrame(sphereLoop);
  }

  function stopSphereLoop() {
    if (state.sphere.raf) cancelAnimationFrame(state.sphere.raf);
    state.sphere.raf = 0;
    state.sphere.hover = null;
  }

  function sphereHitTest(clientX, clientY) {
    const rect = sphereCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    let bestDistance = Infinity;
    for (const point of state.sphere.points) {
      const distance = Math.hypot(point.screenX - x, point.screenY - y);
      if (distance <= point.screenR + 5 && distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
    return best;
  }

  function decagonGuideMarkup(layout) {
    if (layout.kind !== 'decagon' || layout.hubs.length !== 10) return '';
    const points = layout.vertices.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const spokes = layout.vertices.map((point) => `<line class="decagon-spoke" x1="${layout.center.x}" y1="${layout.center.y}" x2="${point.x}" y2="${point.y}"/>`).join('');
    const clusters = layout.hubs.map((hub) => `<g class="category-cluster-orbit" style="--cluster-color:${esc(hub.color)}">
      <ellipse cx="${hub.x}" cy="${hub.y}" rx="${hub.clusterRadius}" ry="${hub.clusterRadius * 0.82}"/>
      ${hub.count > 12 ? `<ellipse cx="${hub.x}" cy="${hub.y}" rx="43" ry="${43 * 0.82}"/>` : ''}
    </g>`).join('');
    return `<g class="decagon-guide" aria-hidden="true">
      <polygon class="decagon-boundary" points="${points}"/>
      <circle class="decagon-orbit" cx="${layout.center.x}" cy="${layout.center.y}" r="${layout.radiusY * 0.62}"/>
      ${spokes}
      ${clusters}
      <circle class="decagon-core-ring" cx="${layout.center.x}" cy="${layout.center.y}" r="50"/>
      <text class="decagon-core-number" x="${layout.center.x}" y="${layout.center.y + 2}">${layout.nodes.length}</text>
      <text class="decagon-core-label" x="${layout.center.x}" y="${layout.center.y + 20}">十类非遗项目</text>
    </g>`;
  }

  function timeGuideMarkup(layout) {
    if (layout.kind !== 'time') return '';
    const rings = layout.rings.map((ring) => {
      const active = ring.batchIndex <= state.timeActive ? ' is-active' : '';
      return `<g class="time-ring${active}">
        <circle class="star-time-ring" cx="${layout.center.x}" cy="${layout.center.y}" r="${ring.radius}"/>
        <text class="star-time-year" x="${layout.center.x + 10}" y="${layout.center.y - ring.radius + 17}">${esc(ring.yearLabel)}</text>
      </g>`;
    }).join('');
    return `<g class="time-guide" aria-hidden="true">
      ${rings}
      <circle class="time-core-ring" cx="${layout.center.x}" cy="${layout.center.y}" r="52"/>
      <text class="time-core-number" x="${layout.center.x}" y="${layout.center.y + 2}">${layout.nodes.length}</text>
      <text class="time-core-label" x="${layout.center.x}" y="${layout.center.y + 20}">五批名录</text>
    </g>`;
  }

  function renderMap() {
    if (!state.data) return;
    const isTimeLens = state.lens === 'region' && state.regionMode === 'time';
    shell.classList.toggle('is-time', isTimeLens);
    if (state.lens === 'person') {
      svg.hidden = true;
      svg.style.display = 'none';
      sphereCanvas.hidden = false;
      sphereCanvas.style.display = 'block';
      shell.classList.add('is-person');
      startSphereLoop();
      const matched = state.sphere.points.filter((point) => matchesQuery({ ...point.person, key: point.key, searchText: point.searchText, meta: `${point.person.levelName || ''} ${point.person.regionLabel || ''}` })).length;
      statsEl.innerHTML = `三维人物球 · <b>${state.sphere.points.length}</b> 位传承人${state.query ? ` · 命中 <b>${matched}</b> 位` : ''} · 拖拽旋转`;
      return;
    }
    sphereCanvas.hidden = true;
    sphereCanvas.style.display = 'none';
    svg.hidden = false;
    svg.style.display = 'block';
    shell.classList.remove('is-person');
    stopSphereLoop();
    const layout = currentLayout();
    const selectedKey = state.selected ? keyOf(state.selected.kind, state.selected.id) : null;
    let focusLine = '';
    if (selectedKey) {
      const node = layout.nodes.find((entity) => entity.key === selectedKey);
      const hub = node ? layout.hubs.find((entity) => entity.key === node.hubKey) : null;
      if (node && hub) focusLine = `<line class="star-focus-link" x1="${node.x}" y1="${node.y}" x2="${hub.x}" y2="${hub.y}"/>`;
    }
    const hubs = layout.hubs.map(hubMarkup).join('');
    const nodes = layout.nodes.map(nodeMarkup).join('');
    const projectLinks = state.lens === 'project'
      ? layout.nodes.map((node) => {
        const hub = layout.hubs.find((item) => item.key === node.hubKey);
        return hub ? `<line class="decagon-project-link" x1="${hub.x}" y1="${hub.y}" x2="${node.x}" y2="${node.y}"/>` : '';
      }).join('')
      : '';
    const guide = state.lens === 'project' ? decagonGuideMarkup(layout) : (state.lens === 'region' && state.regionMode === 'time' ? timeGuideMarkup(layout) : '');
    starLayer.innerHTML = `${focusLine}${guide}${projectLinks}${nodes}${hubs}`;
    applyTransform();
    const matched = [...layout.hubs, ...layout.nodes].filter(matchesQuery);
    if (state.lens === 'project') {
      statsEl.innerHTML = `正十边形关系图 · <b>10</b> 个门类 · <b>${layout.nodes.length}</b> 个项目${state.query ? ` · 命中 <b>${matched.length}</b> 个对象` : ''}`;
    } else if (state.lens === 'region' && state.regionMode === 'time') {
      statsEl.innerHTML = `五批名录时间环 · 当前点亮 <b>${Math.min(state.timeActive + 1, layout.rings.length)}</b> / 5 批${state.query ? ` · 命中 <b>${matched.length}</b> 个对象` : ''}`;
    } else {
      statsEl.innerHTML = `可见 <b>${layout.nodes.length}</b> 个星点 · <b>${layout.hubs.length}</b> 个星群中心${state.query ? ` · 命中 <b>${matched.length}</b> 个对象` : ''}`;
    }
  }

  function showTooltip(entity, event) {
    if (!entity) { tooltipEl.hidden = true; return; }
    const kind = KIND_LABEL[entity.kind] || entity.kind;
    tooltipEl.innerHTML = `<strong>${esc(entity.label)}</strong><span>${esc(kind)} · ${esc(entity.meta || '')}</span>`;
    tooltipEl.hidden = false;
    const rect = shell.getBoundingClientRect();
    const width = tooltipEl.offsetWidth;
    const height = tooltipEl.offsetHeight;
    let left = event.clientX - rect.left + 14;
    let top = event.clientY - rect.top + 14;
    if (left + width > rect.width - 10) left = event.clientX - rect.left - width - 14;
    if (top + height > rect.height - 10) top = event.clientY - rect.top - height - 14;
    tooltipEl.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  }

  function centerEntity(entity, targetScale = 1.85) {
    if (!entity) return;
    const scale = Math.max(state.view.scale, targetScale);
    const shellWidth = Math.max(1, shell.clientWidth);
    const drawerWidth = state.detailOpen && window.innerWidth > 900 ? Math.min(sideEl.getBoundingClientRect().width + 28, shellWidth * 0.42) : 0;
    const visibleRatio = clamp((shellWidth - drawerWidth) / shellWidth, 0.56, 1);
    const focusX = (VIEW.width * visibleRatio) / 2;
    state.view.scale = scale;
    state.view.x = focusX - entity.x * scale;
    state.view.y = VIEW.height / 2 - entity.y * scale;
    applyTransform();
  }

  function relationButton(key, label, kind, color) {
    return `<button type="button" class="explore-list-item" data-entity-key="${esc(key)}"><i style="--item-color:${esc(color || '#c8a45c')}"></i><span>${esc(label)}</span><small>${esc(KIND_LABEL[kind] || kind)}</small></button>`;
  }

  function narratorPanel(project) {
    return `<section class="ai-narration explore-ai-narration" data-ai-narration data-project-id="${esc(project.id)}" data-project-name="${esc(project.label)}" data-mode="brief">
      <div class="explore-narrator-line">
        <div class="ai-narrator-avatar" aria-hidden="true">
          <span class="ai-avatar-ring"></span>
          <span class="ai-avatar-core">遗</span>
          <span class="ai-avatar-wave"><i></i><i></i><i></i></span>
        </div>
        <div>
          <span class="ai-narration-kicker">DIGITAL NARRATOR</span>
          <strong>听小遗讲解这个项目</strong>
          <span data-ai-voice-status>选择版本后生成讲解词</span>
        </div>
      </div>
      <div class="ai-narration-modes" role="group" aria-label="讲解版本">
        <button type="button" class="is-active" data-ai-narration-mode="brief" aria-pressed="true">简短版</button>
        <button type="button" data-ai-narration-mode="detailed" aria-pressed="false">详细版</button>
        <button type="button" data-ai-narration-mode="child" aria-pressed="false">儿童版</button>
      </div>
      <div class="ai-narration-actions">
        <button type="button" class="ai-narration-generate" data-ai-narrate>生成讲解词</button>
        <span class="ai-narration-hint" data-ai-narration-hint>约 1 分钟</span>
      </div>
      <div class="ai-narration-result" data-ai-narration-result hidden></div>
    </section>`;
  }

  function renderQuick() {
    if (state.lens === 'region') {
      if (state.regionMode === 'time') {
        quickEl.innerHTML = '<button type="button" data-quick="time-all">回看全时</button><button type="button" data-quick="gaps">缺环项目</button><button type="button" data-quick="persons">人物星群</button>';
      } else {
        quickEl.innerHTML = '<button type="button" data-quick="largest">项目最多</button><button type="button" data-quick="gaps">缺环项目</button><button type="button" data-quick="persons">人物星群</button>';
      }
    } else if (state.lens === 'project') {
      quickEl.innerHTML = '<button type="button" data-quick="categories">十大门类</button><button type="button" data-quick="gaps">缺环项目</button><button type="button" data-quick="persons">人物星群</button>';
    } else {
      quickEl.innerHTML = '<button type="button" data-quick="reset-sphere">复位球体</button><button type="button" data-quick="national">国家级</button><button type="button" data-quick="most-linked">关联最多</button>';
    }
  }

  function renderLegend() {
    if (!state.data) return;
    if (state.lens === 'region' && state.regionMode === 'time') {
      legendTitleEl.textContent = '时间星河';
      miniSealEl.textContent = '时';
      legendEl.innerHTML = BATCH_ORDER.map((batch, index) => `<div class="explore-legend-row"><i style="--legend-color:${BATCH_COLORS[batch]}"></i><span>${batch}</span><em>${state.layouts.time.rings[index]?.yearLabel || ''}</em></div>`).join('') + '<div class="explore-legend-row"><i class="is-ring"></i><span>朱砂虚线圈 · 缺环项目</span></div><div class="explore-legend-row"><i class="is-archive"></i><span>金色弧线 · 档案完整度</span></div>';
    } else if (state.lens === 'region' || state.lens === 'project') {
      legendTitleEl.textContent = state.lens === 'region' ? '地域星群' : '门类关系图';
      miniSealEl.textContent = '星';
      const categories = state.data.star.categories.filter((item) => item.total > 0);
      legendEl.innerHTML = categories.map((item) => `<div class="explore-legend-row"><i style="--legend-color:${esc(item.color)}"></i><span>${esc(item.name)}</span><em>${item.total}</em></div>`).join('') + '<div class="explore-legend-row"><i class="is-ring"></i><span>朱砂虚线圈 · 缺环项目</span></div><div class="explore-legend-row"><i class="is-archive"></i><span>金色弧线 · 档案完整度</span></div><div class="explore-legend-row"><i class="is-hub"></i><span>星群中心 · 可点击查看</span></div>';
    } else {
      legendTitleEl.textContent = '人物星群';
      miniSealEl.textContent = '人';
      legendEl.innerHTML = Object.entries(LEVEL_COLORS).map(([level, color]) => `<div class="explore-legend-row"><i style="--legend-color:${color}"></i><span>${level}</span></div>`).join('') + '<div class="explore-legend-row"><i class="is-hub"></i><span>星群中心 · 门类或地区</span></div>';
    }
  }

  function updateLensUi() {
    for (const button of lensButtons) {
      const on = button.dataset.exploreLens === state.lens;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    }
    const isTime = state.lens === 'region' && state.regionMode === 'time';
    const meta = isTime
      ? { title: '时间星河', kicker: 'CHRONOLOGICAL ORBITS', sub: '五批名录由外向内铺成时间环，沿年份看见非遗档案的累积。' }
      : LENS_META[state.lens];
    lensTitleEl.textContent = meta.title;
    lensKickerEl.textContent = meta.kicker;
    lensSubEl.textContent = state.lens === 'person' && state.personGroup === 'region' ? '按省级地区浏览全部传承人，点开人物即可看到关联项目。' : meta.sub;
    visualModeToolsEl.hidden = state.lens !== 'region';
    timePlayBtn.hidden = !isTime;
    timePlayBtn.textContent = state.timeTimer ? '暂停播放' : '播放五批';
    for (const button of regionModeButtons) {
      const active = button.dataset.regionMode === state.regionMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    renderQuick();
    renderLegend();
  }

  function lensIntro() {
    if (state.lens === 'region') {
      return `<p class="explore-detail-kind">地域星图 · 探索起点</p><h2 class="explore-detail-title">从地域看分布</h2><p class="explore-detail-sub">每个菱形中心是一个省级星群，周围星点代表项目。星点越大，名录级别越高。</p><div class="explore-interpretation">点击省级星群收拢视线，点击项目星点查看所属门类、地区与传承人。缺环项目以朱砂虚线圈标记。</div><dl class="explore-stat-grid"><div class="explore-stat"><dt>项目</dt><dd>${state.data.star.meta.total}</dd></div><div class="explore-stat"><dt>省级星群</dt><dd>${state.data.star.meta.provinceTotal}</dd></div><div class="explore-stat"><dt>缺环</dt><dd>${state.data.star.meta.missingInheritor}</dd></div><div class="explore-stat"><dt>关系</dt><dd>${state.data.graph.meta.edgeTotal}</dd></div></dl>`;
    }
    if (state.lens === 'project') {
      return `<p class="explore-detail-kind">项目星群 · 探索起点</p><h2 class="explore-detail-title">从门类看项目</h2><p class="explore-detail-sub">十个门类各自形成一个项目星群。项目星点按级别大小区分，点击即可直接展开关系。</p><div class="explore-interpretation">不用先选择中心。任意项目点开后，右侧会直接给出所属门类、地区、关联传承人与继续探索入口。</div><dl class="explore-stat-grid"><div class="explore-stat"><dt>项目</dt><dd>${state.data.graph.meta.projectTotal}</dd></div><div class="explore-stat"><dt>门类</dt><dd>${state.data.graph.meta.category}</dd></div><div class="explore-stat"><dt>传承人</dt><dd>${state.data.graph.meta.inheritorTotal}</dd></div><div class="explore-stat"><dt>关系</dt><dd>${state.data.graph.meta.edgeTotal}</dd></div></dl>`;
    }
    return `<p class="explore-detail-kind">人物星群 · 探索起点</p><h2 class="explore-detail-title">从人物看传承</h2><p class="explore-detail-sub">全部 ${state.data.graph.meta.inheritorTotal} 位已发布传承人分布在一个可旋转的三维球体上。</p><div class="explore-interpretation">拖拽球体旋转，悬停查看人物，点击任意人物，右侧直接显示其项目与门类关系。人物颜色表示认定级别，大小表示关联项目数量。</div><dl class="explore-stat-grid"><div class="explore-stat"><dt>传承人</dt><dd>${state.data.graph.meta.inheritorTotal}</dd></div><div class="explore-stat"><dt>国家级</dt><dd>${state.data.graph.nodes.filter((node) => node.kind === 'inheritor' && node.levelName === '国家级').length}</dd></div><div class="explore-stat"><dt>省级</dt><dd>${state.data.graph.nodes.filter((node) => node.kind === 'inheritor' && node.levelName === '省级').length}</dd></div><div class="explore-stat"><dt>关系</dt><dd>${state.data.graph.meta.edgeTotal}</dd></div></dl>`;
  }

  function renderSearchResults() {
    const { entities } = currentEntities();
    const results = entities.filter(matchesQuery).slice(0, 60);
    if (!results.length) {
      detailEl.innerHTML = `<p class="explore-detail-kind">搜索结果</p><h2 class="explore-detail-title">没有找到「${esc(state.query)}」</h2><p class="explore-detail-empty">试试项目名、传承人姓名、门类或地区。</p>`;
      return;
    }
    detailEl.innerHTML = `<p class="explore-detail-kind">搜索结果 · ${esc(LENS_META[state.lens].title)}</p><h2 class="explore-detail-title">命中 ${results.length} 个对象</h2><p class="explore-detail-sub">关键词「${esc(state.query)}」。点击结果即可直接查看档案。</p><div class="explore-list">${results.map((entity) => relationButton(entity.key, entity.label, entity.kind, entity.color)).join('')}</div>`;
  }

  function renderProjectDetail(project) {
    const tags = [project.categoryName, project.levelName, project.regionLabel, project.year ? `${project.year} 年` : ''].filter(Boolean).map((item) => `<span class="explore-detail-tag">${esc(item)}</span>`).join('');
    const regions = (project.provinceIds || []).map((id) => regionGraphNode(id)).filter(Boolean);
    const category = categoryGraphNode(project.categoryId);
    const persons = (project.inheritors || []).map((person) => personGraphNode(person.id)).filter(Boolean);
    const starProject = state.starProjectById.get(keyOf('project', project.id));
    const completeness = Math.round(Number(starProject?.completeness || 0) * 100);
    detailEl.innerHTML = `
      <p class="explore-detail-kind" style="--detail-color:${esc(project.color)}">项目 · ${esc(project.categoryName)}</p>
      <h2 class="explore-detail-title">${esc(project.label)}</h2>
      <div class="explore-detail-tags">${tags}${Number(project.inheritorCount || 0) === 0 ? '<span class="explore-detail-tag is-gap">缺环 · 无传承人</span>' : ''}</div>
      <p class="explore-interpretation">该项目属于${esc(project.categoryName || '未分类')}，位于${esc(project.regionLabel || '地区待补')}，现有 ${project.inheritorCount || 0} 位关联传承人。点击下方关系即可直接切换对象。</p>
      <div class="archive-meter" style="--archive-value:${completeness}%"><span><i></i></span><p><em>档案完整度</em><b>${completeness}%</b></p></div>
      <dl class="explore-stat-grid"><div class="explore-stat"><dt>公布年份</dt><dd>${project.year || '待补'}</dd></div><div class="explore-stat"><dt>名录批次</dt><dd>${esc(starProject?.batch || '待补')}</dd></div><div class="explore-stat"><dt>关联传承人</dt><dd>${project.inheritorCount || 0} 位</dd></div><div class="explore-stat"><dt>档案图片</dt><dd>${project.imageCount || 0} 张</dd></div></dl>
      <div class="explore-detail-section"><h3>关系速览</h3><div class="explore-list">${category ? relationButton(keyOf('category', category.id), category.label, 'category', category.color) : ''}${regions.map((region) => relationButton(keyOf('region', region.id), region.label, 'region', '#9cc48a')).join('')}${persons.map((person) => relationButton(keyOf('inheritor', person.id), person.label, 'inheritor', LEVEL_COLORS[person.levelName] || '#7fa8d8')).join('')}</div></div>
      <div class="explore-detail-section"><h3>数字讲解员</h3>${narratorPanel(project)}</div>
      ${project.summary ? `<div class="explore-detail-section"><h3>项目摘录</h3><p>${esc(truncate(project.summary, 160))}</p></div>` : ''}
      <a class="explore-detail-link" href="${esc(project.detailHref || `/projects/${project.id}`)}">查看完整档案 →</a>`;
  }

  function renderPersonDetail(person) {
    const projects = (person.projectIds || []).map((id) => projectGraphNode(id)).filter(Boolean);
    const categories = new Map();
    for (const project of projects) if (project.categoryId) categories.set(project.categoryId, project.categoryName);
    const levelColor = LEVEL_COLORS[person.levelName] || '#7fa8d8';
    const tags = [person.levelName, person.ethnic, person.regionLabel].filter(Boolean).map((item) => `<span class="explore-detail-tag">${esc(item)}</span>`).join('');
    detailEl.innerHTML = `
      <p class="explore-detail-kind" style="--detail-color:${levelColor}">传承人 · ${esc(person.levelName || '级别待补')}</p>
      <h2 class="explore-detail-title">${esc(person.label)}</h2>
      <div class="explore-detail-tags">${tags}</div>
      <p class="explore-interpretation">${esc(person.label)}关联 ${projects.length} 个项目，分布于${esc(person.regionLabel || '地区待补')}。点击项目或门类即可直接切换档案。</p>
      <dl class="explore-stat-grid"><div class="explore-stat"><dt>关联项目</dt><dd>${projects.length} 项</dd></div><div class="explore-stat"><dt>涉及门类</dt><dd>${categories.size}</dd></div><div class="explore-stat"><dt>所在地</dt><dd>${esc(person.regionLabel || '—')}</dd></div><div class="explore-stat"><dt>民族</dt><dd>${esc(person.ethnic || '—')}</dd></div></dl>
      <div class="explore-detail-section"><h3>关联项目</h3>${projects.length ? `<div class="explore-list">${projects.map((project) => relationButton(keyOf('project', project.id), project.label, 'project', project.color)).join('')}</div>` : '<p class="explore-detail-empty">暂无已发布关联项目。</p>'}</div>
      <div class="explore-detail-section"><h3>涉及门类</h3><div class="explore-list">${[...categories.entries()].map(([id, label]) => relationButton(keyOf('category', id), label, 'category', state.data.graph.nodes.find((node) => node.kind === 'category' && Number(node.id) === Number(id))?.color || '#c8a45c')).join('') || '<p class="explore-detail-empty">暂无门类数据。</p>'}</div></div>
      <a class="explore-detail-link" href="${esc(person.detailHref || `/inheritors/${person.id}`)}">查看人物档案 →</a>`;
  }

  function renderHubDetail(entity) {
    if (entity.kind === 'batch') {
      const ring = state.layouts.time.rings.find((item) => item.batch === entity.label);
      const projects = ring?.nodes || [];
      const people = new Set(projects.flatMap((project) => (projectGraphNode(project.id)?.inheritors || []).map((person) => person.id)));
      detailEl.innerHTML = `
        <p class="explore-detail-kind" style="--detail-color:${esc(entity.color)}">名录批次 · 时间环</p>
        <h2 class="explore-detail-title">${esc(entity.label)}</h2>
        <p class="explore-interpretation">${esc(entity.label)}项目集中公布于 ${esc(entity.yearLabel)}，共 ${projects.length} 个项目、${people.size} 位关联传承人。点击项目可直接查看档案。</p>
        <dl class="explore-stat-grid"><div class="explore-stat"><dt>公布年份</dt><dd>${esc(entity.yearLabel)}</dd></div><div class="explore-stat"><dt>项目</dt><dd>${projects.length}</dd></div><div class="explore-stat"><dt>传承人</dt><dd>${people.size}</dd></div><div class="explore-stat"><dt>缺环项目</dt><dd>${projects.filter((project) => project.missing).length}</dd></div></dl>
        <div class="explore-detail-section"><h3>本批项目</h3><div class="explore-list">${projects.slice(0, 16).map((project) => relationButton(keyOf('project', project.id), project.label, 'project', project.color)).join('')}</div></div>`;
      return;
    }
    if (entity.kind === 'category') {
      const category = categoryGraphNode(entity.id);
      const projects = state.data.graph.nodes.filter((node) => node.kind === 'project' && Number(node.categoryId) === Number(entity.id));
      const people = state.data.graph.nodes.filter((node) => node.kind === 'inheritor' && personPrimaryCategory(node).id === Number(entity.id));
      detailEl.innerHTML = `
        <p class="explore-detail-kind" style="--detail-color:${esc(entity.color)}">门类 · 星群中心</p>
        <h2 class="explore-detail-title">${esc(entity.label)}</h2>
        <p class="explore-interpretation">该门类关联 ${projects.length} 个项目，${people.length} 位传承人。点击项目或人物可直接切换档案。</p>
        <dl class="explore-stat-grid"><div class="explore-stat"><dt>项目</dt><dd>${projects.length}</dd></div><div class="explore-stat"><dt>传承人</dt><dd>${people.length}</dd></div><div class="explore-stat"><dt>缺环项目</dt><dd>${projects.filter((node) => Number(node.inheritorCount || 0) === 0).length}</dd></div><div class="explore-stat"><dt>门类编号</dt><dd>${esc(category?.code || '—')}</dd></div></dl>
        <div class="explore-detail-section"><h3>项目</h3><div class="explore-list">${projects.slice(0, 12).map((project) => relationButton(keyOf('project', project.id), project.label, 'project', project.color)).join('')}</div></div>
        <div class="explore-detail-section"><h3>人物</h3><div class="explore-list">${people.slice(0, 12).map((person) => relationButton(keyOf('inheritor', person.id), person.label, 'inheritor', LEVEL_COLORS[person.levelName] || '#7fa8d8')).join('')}</div></div>
        ${category?.detailHref ? `<a class="explore-detail-link" href="${esc(category.detailHref)}">查看该门类项目 →</a>` : ''}`;
      return;
    }
    const region = regionGraphNode(entity.id);
    const projects = state.data.graph.nodes.filter((node) => node.kind === 'project' && (node.provinceIds || []).includes(Number(entity.id)));
    const people = state.data.graph.nodes.filter((node) => node.kind === 'inheritor' && personProvince(node) === entity.label);
    detailEl.innerHTML = `
      <p class="explore-detail-kind" style="--detail-color:#9cc48a">地区 · 星群中心</p>
      <h2 class="explore-detail-title">${esc(entity.label)}</h2>
      <p class="explore-interpretation">该地区共有 ${projects.length} 个项目、${people.length} 位传承人。点击项目或人物即可直接切换档案。</p>
      <dl class="explore-stat-grid"><div class="explore-stat"><dt>项目</dt><dd>${projects.length}</dd></div><div class="explore-stat"><dt>传承人</dt><dd>${people.length}</dd></div><div class="explore-stat"><dt>缺环项目</dt><dd>${projects.filter((node) => Number(node.inheritorCount || 0) === 0).length}</dd></div><div class="explore-stat"><dt>覆盖门类</dt><dd>${new Set(projects.map((node) => node.categoryName)).size}</dd></div></dl>
      <div class="explore-detail-section"><h3>项目</h3><div class="explore-list">${projects.slice(0, 12).map((project) => relationButton(keyOf('project', project.id), project.label, 'project', project.color)).join('')}</div></div>
      <div class="explore-detail-section"><h3>人物</h3><div class="explore-list">${people.slice(0, 12).map((person) => relationButton(keyOf('inheritor', person.id), person.label, 'inheritor', LEVEL_COLORS[person.levelName] || '#7fa8d8')).join('')}</div></div>
      ${region?.detailHref ? `<a class="explore-detail-link" href="${esc(region.detailHref)}">查看该地区全部项目 →</a>` : ''}`;
  }

  function updateDrawerUi() {
    const open = state.detailOpen;
    const tab = state.drawerTab;
    sideEl.classList.toggle('is-detail-open', open);
    sideEl.classList.toggle('is-collapsed', !open);
    stageEl.classList.toggle('is-drawer-open', open);
    drawerEl.hidden = !open;
    drawerRailBtn.hidden = open;
    detailCloseBtn.hidden = !open;
    detailEl.hidden = !open || tab !== 'detail';
    legendPanelEl.hidden = !open || tab !== 'legend';
    drawerRailLabelEl.textContent = state.selected ? '档案' : '图例';
    drawerHeadingEl.textContent = tab === 'legend'
      ? '星群读法'
      : state.query
        ? '搜索结果'
        : state.selected
          ? `${KIND_LABEL[state.selected.kind] || '非遗'}档案`
          : '探索说明';
    for (const button of drawerTabButtons) {
      const active = button.dataset.drawerTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    }
  }

  function setDrawerTab(tab) {
    state.drawerTab = tab === 'legend' ? 'legend' : 'detail';
    if (state.drawerTab === 'legend') renderLegend();
    updateDrawerUi();
    drawerBodyEl.scrollTop = 0;
  }

  function openDrawer(tab = 'detail') {
    state.detailOpen = true;
    setDrawerTab(tab);
  }

  function closeDrawer() {
    state.detailOpen = false;
    updateDrawerUi();
    const entity = state.selected
      ? currentEntities().entities.find((item) => item.kind === state.selected.kind && String(item.id) === String(state.selected.id))
      : null;
    if (entity) centerEntity(entity, state.view.scale);
  }

  function renderDetail() {
    updateDrawerUi();
    if (!state.data || !state.detailOpen || state.drawerTab !== 'detail') return;
    if (state.query) { renderSearchResults(); return; }
    if (!state.selected) { detailEl.innerHTML = lensIntro(); return; }
    if (state.selected.kind === 'project') {
      const project = projectGraphNode(state.selected.id);
      if (project) renderProjectDetail(project);
    } else if (state.selected.kind === 'inheritor') {
      const person = personGraphNode(state.selected.id);
      if (person) renderPersonDetail(person);
    } else {
      const entity = currentEntities().entities.find((item) => item.kind === state.selected.kind && String(item.id) === String(state.selected.id));
      if (entity) renderHubDetail(entity);
    }
    updateDrawerUi();
  }

  function updateUrl() {
    const params = new URLSearchParams();
    params.set('lens', state.lens);
    if (state.lens === 'region' && state.regionMode === 'time') params.set('view', 'time');
    if (state.lens === 'person' && state.personGroup === 'region') params.set('group', 'region');
    if (state.query) params.set('q', state.query);
    if (state.selected) {
      const key = { project: 'project', inheritor: 'inheritor', category: 'category', region: 'region', batch: 'batch' }[state.selected.kind];
      if (key) params.set(key, String(state.selected.id));
    }
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  }

  function selectEntity(kind, id, { syncUrl = true, center = true, stayInLens = false, targetScale = 1.85 } = {}) {
    if (!kind || id === undefined || id === null) return;
    if (state.query) { state.query = ''; searchEl.value = ''; }
    state.detailOpen = true;
    state.drawerTab = 'detail';
    let targetLens = state.lens;
    if (!stayInLens) {
      if (kind === 'project') targetLens = 'project';
      else if (kind === 'inheritor') targetLens = 'person';
      else if (kind === 'category') {
        if (state.lens === 'region' || (state.lens === 'person' && state.personGroup === 'region')) targetLens = 'project';
      } else if (kind === 'region') {
        if (state.lens !== 'region' && !(state.lens === 'person' && state.personGroup === 'region')) targetLens = 'region';
      }
    }
    if (targetLens !== state.lens) {
      state.lens = targetLens;
      state.query = '';
      searchEl.value = '';
      resetView({ render: false });
    }
    state.selected = { kind, id };
    updateLensUi();
    renderMap();
    renderDetail();
    if (center) {
      const entity = currentEntities().entities.find((item) => item.kind === kind && String(item.id) === String(id));
      if (entity) centerEntity(entity, targetScale);
    }
    if (syncUrl) updateUrl();
  }

  function setLens(lens, { syncUrl = true } = {}) {
    if (!['region', 'project', 'person'].includes(lens)) return;
    stopTimePlay();
    state.lens = lens;
    state.query = '';
    state.selected = null;
    state.detailOpen = false;
    state.drawerTab = 'detail';
    searchEl.value = '';
    resetView({ render: false });
    updateLensUi();
    renderMap();
    renderDetail();
    if (syncUrl) updateUrl();
  }

  function setPersonGroup(group, { syncUrl = true } = {}) {
    state.personGroup = group === 'region' ? 'region' : 'category';
    state.query = '';
    state.selected = null;
    state.detailOpen = false;
    state.drawerTab = 'detail';
    searchEl.value = '';
    resetView({ render: false });
    updateLensUi();
    renderMap();
    renderDetail();
    if (syncUrl) updateUrl();
  }

  function setSearch(value, { syncUrl = true } = {}) {
    state.query = String(value || '').trim();
    searchEl.value = state.query;
    if (state.query) state.selected = null;
    state.detailOpen = Boolean(state.query);
    state.drawerTab = 'detail';
    renderMap();
    renderDetail();
    if (syncUrl) updateUrl();
  }

  function setRegionMode(mode, { syncUrl = true } = {}) {
    stopTimePlay();
    state.regionMode = mode === 'time' ? 'time' : 'geo';
    state.timeActive = BATCH_ORDER.length;
    state.query = '';
    state.selected = null;
    state.detailOpen = false;
    state.drawerTab = 'detail';
    searchEl.value = '';
    resetView({ render: false });
    updateLensUi();
    renderMap();
    renderDetail();
    if (syncUrl) updateUrl();
  }

  function stopTimePlay() {
    if (state.timeTimer) window.clearInterval(state.timeTimer);
    state.timeTimer = 0;
  }

  function toggleTimePlay() {
    if (state.timeTimer) {
      stopTimePlay();
      updateLensUi();
      return;
    }
    if (state.lens !== 'region' || state.regionMode !== 'time') return;
    state.timeActive = 0;
    renderMap();
    state.timeTimer = window.setInterval(() => {
      state.timeActive += 1;
      renderMap();
      if (state.timeActive >= BATCH_ORDER.length - 1) {
        stopTimePlay();
        updateLensUi();
      }
    }, 760);
    updateLensUi();
  }

  function applyQuick(action) {
    if (state.lens === 'region') {
      if (action === 'time-all') {
        stopTimePlay();
        state.timeActive = BATCH_ORDER.length;
        renderMap();
        updateLensUi();
      } else if (action === 'largest') {
        const hub = currentLayout().hubs.slice().sort((a, b) => b.count - a.count)[0];
        if (hub) selectEntity(hub.kind, hub.id);
      } else if (action === 'gaps') {
        state.lens = 'project';
        setLens('project', { syncUrl: false });
        setSearch('缺环');
      } else if (action === 'persons') {
        setLens('person');
      }
      return;
    }
    if (state.lens === 'project') {
      if (action === 'categories') {
        const hub = currentLayout().hubs[0];
        if (hub) selectEntity(hub.kind, hub.id);
      } else if (action === 'gaps') {
        setSearch('缺环');
      } else if (action === 'persons') {
        setLens('person');
      }
      return;
    }
    if (action === 'reset-sphere') {
      state.sphere.rotX = -0.16;
      state.sphere.rotY = 0.4;
      state.sphere.hover = null;
      renderSphereFrame();
    } else if (action === 'national') {
      setSearch('国家级');
    } else if (action === 'most-linked') {
      const person = state.data.graph.nodes.filter((node) => node.kind === 'inheritor').sort((a, b) => (b.projectIds?.length || 0) - (a.projectIds?.length || 0))[0];
      if (person) selectEntity('inheritor', person.id);
    }
  }

  function buildStoryRoutes() {
    const projects = state.data.graph.nodes.filter((node) => node.kind === 'project');
    const people = state.data.graph.nodes.filter((node) => node.kind === 'inheritor');
    const jiangsu = state.layouts.region.hubs.find((item) => item.label === '江苏省');
    const jiangsuProject = jiangsu
      ? projects.find((project) => (project.provinceIds || []).includes(Number(jiangsu.id)) && Number(project.inheritorCount || 0) > 0)
      : null;
    const jiangsuPerson = jiangsuProject?.inheritors?.[0] ? personGraphNode(jiangsuProject.inheritors[0].id) : null;
    const gapProject = projects.find((project) => Number(project.inheritorCount || 0) === 0);
    const gapCategory = gapProject ? categoryGraphNode(gapProject.categoryId) : null;
    const gapRegion = gapProject?.provinceIds?.length ? regionGraphNode(gapProject.provinceIds[0]) : null;
    const hubProject = projects.slice().sort((a, b) => (b.inheritorCount || 0) - (a.inheritorCount || 0))[0];
    const hubPerson = hubProject?.inheritors?.[0] ? personGraphNode(hubProject.inheritors[0].id) : people[0];
    const linkedProject = hubPerson?.projectIds?.map((id) => projectGraphNode(id)).find((project) => project && project.id !== hubProject?.id) || hubProject;

    state.storyRoutes = {
      jiangsu: {
        title: '沿运河看江苏',
        steps: [
          jiangsu && { lens: 'region', kind: 'region', id: jiangsu.id, title: '进入江苏省级星群', note: `先看 ${jiangsu.count} 个项目如何在同一地域星区聚拢。` },
          jiangsuProject && { lens: 'project', kind: 'project', id: jiangsuProject.id, title: `看见「${jiangsuProject.label}」`, note: `镜头转入正十边形门类关系图，定位 ${jiangsuProject.categoryName} 顶点。` },
          jiangsuPerson && { lens: 'person', kind: 'inheritor', id: jiangsuPerson.id, title: `遇见${jiangsuPerson.label}`, note: '人物球中点亮关联人物，继续查看其项目与门类。' },
        ].filter(Boolean),
      },
      gaps: {
        title: '追踪一个缺环',
        steps: [
          gapProject && { lens: 'project', kind: 'project', id: gapProject.id, title: `缺环项目「${gapProject.label}」`, note: '朱砂虚线圈标记尚无关联传承人的项目。' },
          gapCategory && { lens: 'project', kind: 'category', id: gapCategory.id, title: `${gapCategory.label}门类全貌`, note: `回到 ${gapCategory.label} 顶点，比较同类项目的档案完整度。` },
          gapRegion && { lens: 'region', kind: 'region', id: gapRegion.id, title: `回到${gapRegion.label}`, note: '换一个视角，看缺环项目所在的省级星群与周边项目。' },
        ].filter(Boolean),
      },
      chain: {
        title: '一门技艺到一个人',
        steps: [
          hubProject && { lens: 'project', kind: 'project', id: hubProject.id, title: `从「${hubProject.label}」出发`, note: `这是关联传承人最多的项目之一，位于 ${hubProject.categoryName} 顶点。` },
          hubPerson && { lens: 'person', kind: 'inheritor', id: hubPerson.id, title: `连接 ${hubPerson.label}`, note: '人物球定位到关联人物，继续看其项目关系。' },
          linkedProject && { lens: 'project', kind: 'project', id: linkedProject.id, title: `抵达「${linkedProject.label}」`, note: '从人物再走回项目，完成项目、人物、门类的三步串联。' },
        ].filter(Boolean),
      },
    };
  }

  function renderStoryTrail() {
    if (!state.story || !state.story.steps.length) {
      storyTrailEl.hidden = true;
      return;
    }
    const step = state.story.steps[state.storyIndex];
    storyTrailEl.hidden = false;
    storyProgressEl.textContent = `${String(state.storyIndex + 1).padStart(2, '0')} / ${String(state.story.steps.length).padStart(2, '0')}`;
    storyTitleEl.textContent = step.title;
    storyNoteEl.textContent = step.note;
    storyPrevBtn.disabled = state.storyIndex === 0;
    storyNextBtn.textContent = state.storyIndex === state.story.steps.length - 1 ? '完成航线' : '下一步 →';
  }

  function goStoryStep(index) {
    if (!state.story) return;
    if (index >= state.story.steps.length) {
      state.story = null;
      renderStoryTrail();
      return;
    }
    const step = state.story.steps[Math.max(0, index)];
    state.storyIndex = Math.max(0, index);
    state.lens = step.lens;
    if (step.lens === 'region') state.regionMode = 'geo';
    state.query = '';
    searchEl.value = '';
    state.selected = { kind: step.kind, id: step.id };
    state.detailOpen = true;
    state.drawerTab = 'detail';
    resetView({ render: false });
    updateLensUi();
    renderMap();
    renderDetail();
    const entity = currentEntities().entities.find((item) => item.kind === step.kind && String(item.id) === String(step.id));
    if (entity) centerEntity(entity, step.kind === 'region' ? 1.08 : 1.2);
    updateUrl();
    renderStoryTrail();
  }

  function startStory(route) {
    const story = state.storyRoutes[route];
    if (!story?.steps.length) return;
    state.story = story;
    state.storyIndex = 0;
    goStoryStep(0);
  }

  function initEvents() {
    for (const button of lensButtons) button.addEventListener('click', () => setLens(button.dataset.exploreLens));
    for (const button of routeButtons) button.addEventListener('click', () => startStory(button.dataset.exploreRoute));
    for (const button of regionModeButtons) button.addEventListener('click', () => setRegionMode(button.dataset.regionMode));
    for (const button of drawerTabButtons) button.addEventListener('click', () => setDrawerTab(button.dataset.drawerTab));
    drawerRailBtn.addEventListener('click', () => openDrawer(state.selected ? 'detail' : 'legend'));
    timePlayBtn.addEventListener('click', toggleTimePlay);
    storyPrevBtn.addEventListener('click', () => goStoryStep(state.storyIndex - 1));
    storyNextBtn.addEventListener('click', () => goStoryStep(state.storyIndex + 1));
    root.querySelector('[data-story-close]').addEventListener('click', () => {
      state.story = null;
      renderStoryTrail();
    });
    detailCloseBtn.addEventListener('click', closeDrawer);
    quickEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-quick]');
      if (button) applyQuick(button.dataset.quick);
    });
    root.querySelector('[data-explore-reset]').addEventListener('click', () => {
      stopTimePlay();
      state.query = '';
      state.selected = null;
      state.detailOpen = false;
      state.drawerTab = 'detail';
      state.story = null;
      state.timeActive = BATCH_ORDER.length;
      searchEl.value = '';
      resetView({ render: false });
      updateLensUi();
      renderMap();
      renderDetail();
      renderStoryTrail();
      updateUrl();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.detailOpen) closeDrawer();
    });
    searchEl.addEventListener('input', () => setSearch(searchEl.value));
    searchEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const first = currentEntities().entities.find(matchesQuery);
      if (first) {
        searchEl.blur();
        selectEntity(first.kind, first.id);
      }
    });

    root.querySelector('[data-star-zoom-in]').addEventListener('click', () => {
      const rect = shell.getBoundingClientRect();
      zoomAt(1.3, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    root.querySelector('[data-star-zoom-out]').addEventListener('click', () => {
      const rect = shell.getBoundingClientRect();
      zoomAt(1 / 1.3, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    root.querySelector('[data-star-zoom-reset]').addEventListener('click', () => resetView());

    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * 0.0012), event.clientX, event.clientY);
    }, { passive: false });

    svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      state.pressedKey = event.target.closest?.('[data-entity-key]')?.dataset.entityKey || null;
      svg.setPointerCapture?.(event.pointerId);
      state.drag = { startX: event.clientX, startY: event.clientY, viewX: state.view.x, viewY: state.view.y, moved: false };
      state.suppressClick = false;
      svg.classList.add('is-dragging');
    });

    svg.addEventListener('pointermove', (event) => {
      if (state.drag) {
        const dxScreen = event.clientX - state.drag.startX;
        const dyScreen = event.clientY - state.drag.startY;
        if (Math.hypot(dxScreen, dyScreen) > 4) {
          state.drag.moved = true;
          state.suppressClick = true;
        }
        if (state.drag.moved) {
          const ctm = svg.getScreenCTM();
          state.view.x = state.drag.viewX + dxScreen / (ctm?.a || 1);
          state.view.y = state.drag.viewY + dyScreen / (ctm?.d || 1);
          applyTransform();
          tooltipEl.hidden = true;
        }
        return;
      }
      const target = event.target.closest?.('[data-entity-key]');
      if (!target) { tooltipEl.hidden = true; return; }
      const entity = entityByKey(target.dataset.entityKey);
      showTooltip(entity, event);
    });

    const endDrag = () => {
      state.drag = null;
      svg.classList.remove('is-dragging');
      setTimeout(() => { state.suppressClick = false; }, 0);
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('pointerleave', () => { if (!state.drag) tooltipEl.hidden = true; });

    svg.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-entity-key]');
      const key = target?.dataset.entityKey || state.pressedKey;
      state.pressedKey = null;
      if (state.suppressClick || !key) return;
      const parsed = parseKey(key);
      selectEntity(parsed.kind, parsed.kind === 'project' || parsed.kind === 'inheritor' ? Number(parsed.id) : parsed.id, { center: true, stayInLens: true, targetScale: 1.35 });
    });
    svg.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target.closest?.('[data-entity-key]');
      if (!target) return;
      event.preventDefault();
      const parsed = parseKey(target.dataset.entityKey);
      selectEntity(parsed.kind, parsed.kind === 'project' || parsed.kind === 'inheritor' ? Number(parsed.id) : parsed.id, { stayInLens: true, targetScale: 1.35 });
    });

    sphereCanvas.addEventListener('pointerdown', (event) => {
      sphereCanvas.setPointerCapture?.(event.pointerId);
      state.sphere.dragging = true;
      state.sphere.moved = false;
      state.sphere.lastX = event.clientX;
      state.sphere.lastY = event.clientY;
      state.sphere.hover = null;
      tooltipEl.hidden = true;
      sphereCanvas.classList.add('is-dragging');
    });
    sphereCanvas.addEventListener('pointermove', (event) => {
      if (state.sphere.dragging) {
        const dx = event.clientX - state.sphere.lastX;
        const dy = event.clientY - state.sphere.lastY;
        if (Math.hypot(dx, dy) > 2) state.sphere.moved = true;
        state.sphere.rotY += dx * 0.006;
        state.sphere.rotX = clamp(state.sphere.rotX + dy * 0.006, -1.25, 1.25);
        state.sphere.lastX = event.clientX;
        state.sphere.lastY = event.clientY;
        tooltipEl.hidden = true;
        return;
      }
      const point = sphereHitTest(event.clientX, event.clientY);
      state.sphere.hover = point;
      if (point) {
        showTooltip({ kind: 'inheritor', label: point.person.label, meta: `${point.person.levelName || ''} · ${point.person.regionLabel || ''}` }, event);
      } else {
        tooltipEl.hidden = true;
      }
    });
    const endSphereDrag = (event) => {
      const wasDragging = state.sphere.dragging;
      const moved = state.sphere.moved;
      state.sphere.dragging = false;
      sphereCanvas.classList.remove('is-dragging');
      if (wasDragging && !moved) {
        const point = sphereHitTest(event.clientX, event.clientY);
        if (point) selectEntity('inheritor', point.person.id, { center: false, stayInLens: true });
      }
      state.sphere.moved = false;
    };
    sphereCanvas.addEventListener('pointerup', endSphereDrag);
    sphereCanvas.addEventListener('pointercancel', () => {
      state.sphere.dragging = false;
      state.sphere.moved = false;
      sphereCanvas.classList.remove('is-dragging');
    });
    sphereCanvas.addEventListener('pointerleave', () => {
      if (!state.sphere.dragging) {
        state.sphere.hover = null;
        tooltipEl.hidden = true;
      }
    });
    window.addEventListener('resize', () => {
      if (state.lens === 'person') {
        resizeSphereCanvas();
        renderSphereFrame();
      }
    });

    detailEl.addEventListener('click', (event) => {
      const target = event.target.closest('[data-entity-key]');
      if (!target) return;
      const parsed = parseKey(target.dataset.entityKey);
      const existsHere = currentEntities().entities.some((entity) => entity.key === target.dataset.entityKey);
      selectEntity(parsed.kind, parsed.kind === 'project' || parsed.kind === 'inheritor' ? Number(parsed.id) : parsed.id, { stayInLens: existsHere });
    });
  }

  async function init() {
    initEvents();
    renderBackground();
    detailEl.innerHTML = '<p class="explore-detail-empty">正在读取非遗档案…</p>';
    try {
      const response = await fetch(root.dataset.api || '/api/explore', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.ok || !payload.data?.star || !payload.data?.graph) throw new Error(payload?.error || '探索数据为空');
      state.data = payload.data;
      buildMaps();
      buildLayouts();
      buildStoryRoutes();

      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      const requestedLens = params.get('lens') || (mode === 'star' ? 'region' : mode === 'graph' ? 'project' : 'region');
      state.lens = ['region', 'project', 'person'].includes(requestedLens) ? requestedLens : 'region';
      state.regionMode = params.get('view') === 'time' ? 'time' : 'geo';
      state.personGroup = params.get('group') === 'region' ? 'region' : 'category';
      state.query = params.get('q') || '';
      state.detailOpen = Boolean(state.query);
      state.drawerTab = 'detail';
      searchEl.value = state.query;
      updateLensUi();
      renderMap();
      renderDetail();
      renderStoryTrail();

      let selected = null;
      const project = params.get('project');
      const inheritor = params.get('inheritor');
      const category = params.get('category');
      const region = params.get('region') || params.get('province');
      const batch = params.get('batch');
      const node = params.get('node');
      if (node) {
        const match = String(node).match(/^([picr]):(.+)$/);
        if (match) {
          const kinds = { p: 'project', i: 'inheritor', c: 'category', r: 'region' };
          selected = { kind: kinds[match[1]], id: match[2] };
        }
      } else if (project) selected = { kind: 'project', id: project };
      else if (inheritor) selected = { kind: 'inheritor', id: inheritor };
      else if (category) selected = { kind: 'category', id: category };
      else if (batch && BATCH_ORDER.includes(batch)) selected = { kind: 'batch', id: batch };
      else if (region) {
        const hub = state.layouts.region.hubs.find((item) => String(item.id) === String(region) || item.label === region);
        if (hub) selected = { kind: 'region', id: hub.id };
      }
      if (selected) {
        const stayInLens = state.lens === 'region' && selected.kind === 'project';
        selectEntity(selected.kind, selected.kind === 'project' || selected.kind === 'inheritor' ? Number(selected.id) : selected.id, { syncUrl: false, center: true, stayInLens });
      }
      else updateUrl();
    } catch (error) {
      detailEl.innerHTML = `<p class="explore-detail-empty">探索数据加载失败：${esc(error.message || '请刷新重试')}</p>`;
      statsEl.textContent = '数据加载失败';
    }
  }

  init();
})();
