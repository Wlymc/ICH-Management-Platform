import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicApi } from '../api/client';
import { ErrorState, LoadingState } from '../components/common';
import { PersonSphere } from '../components/PersonSphere';
import { usePageMeta } from '../hooks/usePageMeta';
import type { ExploreData, GraphNode, StarNode, StarProvince } from '../types';

type Lens = 'region' | 'project' | 'person';
type Selection =
  | { kind: 'project'; node: StarNode }
  | { kind: 'province'; node: StarProvince }
  | { kind: 'graph'; node: GraphNode }
  | null;

const LENS_COPY: Record<
  Lens,
  { index: string; title: string; note: string; kicker: string; summary: string }
> = {
  region: {
    index: '壹',
    title: '地域星图',
    note: '省级星座与项目星点',
    kicker: 'REGIONAL CONSTELLATION',
    summary: '看省级星座里的项目密度、门类与缺环线索。',
  },
  project: {
    index: '贰',
    title: '项目星群',
    note: '按门类浏览全部项目',
    kicker: 'PROJECT CONSTELLATION',
    summary: '沿门类与地区关系辨认项目之间的文化脉络。',
  },
  person: {
    index: '叁',
    title: '人物星群',
    note: '浏览传承人与关联项目',
    kicker: 'INHERITOR CONSTELLATION',
    summary: '从一位传承人出发，找到他守护的项目与技艺。',
  },
};

const BACK_STARS = Array.from({ length: 150 }, (_, index) => ({
  x: 28 + ((index * 173) % 1140),
  y: 18 + ((index * 97) % 680),
  r: index % 17 === 0 ? 1.3 : index % 5 === 0 ? 0.9 : 0.55,
  opacity: 0.16 + ((index * 13) % 34) / 100,
}));

function graphMeta(node: GraphNode) {
  return [node.categoryName, node.levelName, node.regionLabel].filter(Boolean).join(' · ');
}

function truncate(value: string, max: number) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

interface DecagonNode extends GraphNode {
  renderX: number;
  renderY: number;
  angle?: number;
  projectCount?: number;
}

interface DecagonLayout {
  categories: DecagonNode[];
  projects: DecagonNode[];
  center: { x: number; y: number };
  vertices: Array<{ x: number; y: number }>;
}

const LEVEL_COLORS: Record<string, string> = {
  国家级: '#e0bb45',
  省级: '#d24b45',
  市级: '#7fa8d8',
  县级: '#7fbd92',
};

function buildDecagonLayout(
  graph: ExploreData['graph'],
  query: string,
  activeCategoryId: string,
  projectFilter: string,
): DecagonLayout {
  const center = { x: graph.world.width / 2, y: graph.world.height / 2 - 20 };
  const radiusX = 430;
  const radiusY = 332;
  const allCategories = graph.nodes
    .filter((node) => node.kind === 'category')
    .sort((left, right) => Number(left.id.replace(/^c:/, '')) - Number(right.id.replace(/^c:/, '')))
    .slice(0, 10);
  const allProjects = graph.nodes.filter((node) => node.kind === 'project');
  const projectsByCategory = new Map<string, GraphNode[]>();
  for (const project of allProjects) {
    const key = project.categoryName || '';
    if (!projectsByCategory.has(key)) projectsByCategory.set(key, []);
    projectsByCategory.get(key)?.push(project);
  }

  const categories = allCategories.map((category, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, allCategories.length);
    return {
      ...category,
      renderX: center.x + Math.cos(angle) * radiusX,
      renderY: center.y + Math.sin(angle) * radiusY,
      angle,
      projectCount: projectsByCategory.get(category.label)?.length || 0,
    };
  });

  const projects: DecagonNode[] = [];
  for (const category of categories) {
    if (activeCategoryId && category.id !== activeCategoryId) continue;
    const items = (projectsByCategory.get(category.label) || []).filter((project) => {
      const searchable = `${project.label} ${graphMeta(project)}`.toLocaleLowerCase('zh-CN');
      const matchesQuery = !query || searchable.includes(query);
      if (!matchesQuery) return false;
      if (projectFilter === 'national') return project.levelName === '国家级';
      if (projectFilter === 'gap') return Number(project.inheritorCount || 0) === 0;
      return true;
    });
    const innerCount = items.length > 12 ? Math.ceil(items.length / 2) : items.length;
    items.forEach((project, index) => {
      const outer = index >= innerCount;
      const ringIndex = outer ? index - innerCount : index;
      const ringCount = Math.max(1, outer ? items.length - innerCount : innerCount);
      const radius = items.length > 12 ? (outer ? 86 : 48) : 58 + Math.sqrt(items.length) * 2.2;
      const outward = category.angle || 0;
      const spread = outer ? 1.3 : 1.04;
      const angle = ringCount === 1
        ? outward
        : outward - spread + (ringIndex / (ringCount - 1)) * spread * 2;
      projects.push({
        ...project,
        renderX: category.renderX + Math.cos(angle) * radius,
        renderY: category.renderY + Math.sin(angle) * radius * 0.82,
      });
    });
  }

  return {
    categories,
    projects,
    center,
    vertices: categories.map((category) => ({ x: category.renderX, y: category.renderY })),
  };
}

function buildRegionProjectPositions(star: ExploreData['star']) {
  const positions = new Map<number, { x: number; y: number }>();
  const groups = new Map<string, StarNode[]>();
  for (const node of star.nodes) {
    if (!groups.has(node.province)) groups.set(node.province, []);
    groups.get(node.province)?.push(node);
  }
  for (const province of star.provinces) {
    const items = groups.get(province.name) || [];
    const innerCount = items.length > 10 ? Math.ceil(items.length / 2) : items.length;
    const outerCount = items.length - innerCount;
    const seed = [...province.name].reduce((sum, char) => sum + char.codePointAt(0)!, 0);
    const phase = ((seed % 360) * Math.PI) / 180;
    items.forEach((node, index) => {
      const outer = index >= innerCount;
      const ringIndex = outer ? index - innerCount : index;
      const ringCount = Math.max(1, outer ? outerCount : innerCount);
      const radius = items.length > 10 ? (outer ? 82 : 52) : 58 + Math.min(16, items.length * 1.8);
      const angle =
        phase +
        (ringIndex * Math.PI * 2) / ringCount +
        (outer ? Math.PI / ringCount : 0);
      positions.set(node.id, {
        x: province.x + Math.cos(angle) * radius,
        y: province.y + Math.sin(angle) * radius * 0.8,
      });
    });
  }
  return positions;
}

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const initialLens = params.get('lens');
  const lens: Lens = initialLens === 'project' || initialLens === 'person' ? initialLens : 'region';
  const [keyword, setKeyword] = useState('');
  const deferredKeyword = useDeferredValue(keyword.trim().toLocaleLowerCase('zh-CN'));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState<Selection>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [quickFilter, setQuickFilter] = useState('all');
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
    width: number;
  } | null>(null);
  const viewAnimationRef = useRef(0);
  const viewFallbackRef = useRef(0);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const query = useQuery({ queryKey: ['explore'], queryFn: publicApi.explore });

  usePageMeta({
    title: '非遗探索',
    description:
      '从地域星图、项目星群与人物星群三个视角探索中国非物质文化遗产，查看项目、地区与传承之间的关系。',
  });

  useEffect(
    () => () => {
      cancelAnimationFrame(viewAnimationRef.current);
      window.clearTimeout(viewFallbackRef.current);
    },
    [],
  );

  useEffect(() => {
    zoomRef.current = zoom;
    panRef.current = pan;
  }, [pan, zoom]);

  const setLens = (next: Lens) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('lens', next);
    nextParams.delete('project');
    nextParams.delete('inheritor');
    setParams(nextParams);
    setSelection(null);
    setKeyword('');
    setQuickFilter('all');
    setActiveCategoryId('');
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (!query.data) return;
    const projectId = Number(params.get('project'));
    const inheritorId = Number(params.get('inheritor'));

    if (lens === 'region' && Number.isFinite(projectId) && projectId > 0) {
      const node = query.data.star.nodes.find((item) => item.id === projectId);
      if (!node) return;
      const position = buildRegionProjectPositions(query.data.star).get(node.id);
      setSelection({ kind: 'project', node });
      setPanelOpen(true);
      setZoom(1.55);
      setPan({
        x:
          (position?.x || node.x) -
          query.data.star.world.width / 2 -
          query.data.star.world.width * 0.07,
        y: (position?.y || node.y) - query.data.star.world.height / 2,
      });
      return;
    }

    if (lens === 'project' && Number.isFinite(projectId) && projectId > 0) {
      const graphNode = query.data.graph.nodes.find((item) => item.id === `p:${projectId}`);
      if (!graphNode) return;
      const layout = buildDecagonLayout(query.data.graph, '', '', 'all');
      const node = layout.projects.find((item) => item.id === `p:${projectId}`);
      setSelection({ kind: 'graph', node: graphNode });
      setPanelOpen(true);
      setZoom(1.55);
      if (node) {
        setPan({
          x: node.renderX - query.data.graph.world.width / 2 - query.data.graph.world.width * 0.07,
          y: node.renderY - query.data.graph.world.height / 2,
        });
      }
      return;
    }

    if (lens === 'person' && Number.isFinite(inheritorId) && inheritorId > 0) {
      const node = query.data.graph.nodes.find((item) => item.id === `i:${inheritorId}`);
      if (!node) return;
      setSelection({ kind: 'graph', node });
      setPanelOpen(true);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [lens, params, query.data]);

  const visibleProjects = useMemo(() => {
    if (!query.data) return [];
    return query.data.star.nodes.filter((node) => {
      const matchesKeyword = `${node.name} ${node.category} ${node.level} ${node.province} ${node.regionLabel}`
        .toLocaleLowerCase('zh-CN')
        .includes(deferredKeyword);
      if (!matchesKeyword) return false;
      if (quickFilter === 'national') return node.level === '国家级';
      if (quickFilter === 'linked') return !node.missingInheritor;
      if (quickFilter === 'gap') return node.missingInheritor;
      return true;
    });
  }, [deferredKeyword, query.data, quickFilter]);

  const regionProjectPositions = useMemo(
    () => (query.data ? buildRegionProjectPositions(query.data.star) : new Map<number, { x: number; y: number }>()),
    [query.data],
  );

  const visibleProvinces = useMemo(() => {
    if (!query.data) return [];
    const projectProvinces = new Set(visibleProjects.map((node) => node.province));
    return query.data.star.provinces.filter(
      (province) =>
        province.name.toLocaleLowerCase('zh-CN').includes(deferredKeyword) ||
        projectProvinces.has(province.name),
    );
  }, [deferredKeyword, query.data, visibleProjects]);

  const decagonLayout = useMemo(() => {
    if (!query.data) {
      return { categories: [], projects: [], center: { x: 0, y: 0 }, vertices: [] } satisfies DecagonLayout;
    }
    return buildDecagonLayout(query.data.graph, deferredKeyword, activeCategoryId, quickFilter);
  }, [activeCategoryId, deferredKeyword, query.data, quickFilter]);

  const personNodes = useMemo(() => {
    if (!query.data) return [];
    const projectCounts = new Map<string, number>();
    for (const edge of query.data.graph.edges) {
      if (edge.type !== 'inheritance') continue;
      projectCounts.set(edge.target, (projectCounts.get(edge.target) || 0) + 1);
    }
    return query.data.graph.nodes
      .filter((node) => node.kind === 'inheritor')
      .map((node) => ({ ...node, inheritorCount: projectCounts.get(node.id) || 0 }))
      .filter((node) => {
        const matchesKeyword = `${node.label} ${graphMeta(node)}`
          .toLocaleLowerCase('zh-CN')
          .includes(deferredKeyword);
        if (!matchesKeyword) return false;
        if (quickFilter === 'national') return node.levelName === '国家级';
        if (quickFilter === 'provincial') return node.levelName === '省级';
        if (quickFilter === 'linked') return Number(node.inheritorCount || 0) > 0;
        return true;
      });
  }, [deferredKeyword, query.data, quickFilter]);

  if (query.isPending) return <LoadingState label="正在展开非遗星图…" />;
  if (query.isError) return <ErrorState error={query.error} />;

  const copy = LENS_COPY[lens];
  const star = query.data.star;
  const graph = query.data.graph;
  const world = lens === 'region' ? star.world : graph.world;
  const viewWidth = world.width / zoom;
  const viewHeight = world.height / zoom;
  const viewX = world.width / 2 - viewWidth / 2 + pan.x;
  const viewY = world.height / 2 - viewHeight / 2 + pan.y;
  const graphById = new Map(graph.nodes.map((node) => [node.id, node]));
  const selectedProject = selection?.kind === 'project' ? selection.node : null;
  const selectedProvince = selection?.kind === 'province' ? selection.node : null;
  const selectedGraph = selection?.kind === 'graph' ? selection.node : null;
  const selectedGraphProject =
    selectedGraph?.kind === 'project'
      ? star.nodes.find((node) => String(node.id) === selectedGraph.id.replace(/^p:/, ''))
      : null;
  const drawerProject = selectedProject || selectedGraphProject;
  const selectedPersonProjects =
    selectedGraph?.kind === 'inheritor'
      ? graph.edges
          .filter((edge) => edge.type === 'inheritance' && edge.target === selectedGraph.id)
          .map((edge) => graphById.get(edge.source))
          .filter((node): node is GraphNode => Boolean(node))
      : [];
  const selectedCategoryProjects =
    selectedGraph?.kind === 'category'
      ? star.nodes.filter((node) => node.category === selectedGraph.label)
      : [];
  const decagonCategoryByName = new Map(
    decagonLayout.categories.map((category) => [category.label, category]),
  );
  const starNodeById = new Map(star.nodes.map((node) => [node.id, node]));
  const personFocusId =
    selectedGraph?.kind === 'inheritor'
      ? selectedGraph.id
      : deferredKeyword
        ? personNodes[0]?.id || ''
        : '';
  const selectedProvinceProjects = selectedProvince
    ? star.nodes.filter((node) => node.province === selectedProvince.name).slice(0, 6)
    : [];
  const missingProject = star.nodes.find((node) => node.missingInheritor);

  const animateView = (
    nextZoom: number,
    nextPan: { x: number; y: number },
    duration = 520,
  ) => {
    cancelAnimationFrame(viewAnimationRef.current);
    window.clearTimeout(viewFallbackRef.current);
    const startZoom = zoomRef.current;
    const startPan = panRef.current;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || duration <= 0) {
      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const zoomValue = startZoom + (nextZoom - startZoom) * eased;
      const panValue = {
        x: startPan.x + (nextPan.x - startPan.x) * eased,
        y: startPan.y + (nextPan.y - startPan.y) * eased,
      };
      zoomRef.current = zoomValue;
      panRef.current = panValue;
      setZoom(zoomValue);
      setPan(panValue);
      if (progress < 1) viewAnimationRef.current = requestAnimationFrame(step);
    };
    viewAnimationRef.current = requestAnimationFrame(step);
    viewFallbackRef.current = window.setTimeout(() => {
      if (
        Math.abs(zoomRef.current - nextZoom) > 0.01 ||
        Math.abs(panRef.current.x - nextPan.x) > 1 ||
        Math.abs(panRef.current.y - nextPan.y) > 1
      ) {
        zoomRef.current = nextZoom;
        panRef.current = nextPan;
        setZoom(nextZoom);
        setPan(nextPan);
      }
    }, duration + 40);
  };

  const focusPan = (x: number, y: number) => ({
    x: x - world.width / 2 - (window.innerWidth > 900 ? world.width * 0.07 : 0),
    y: y - world.height / 2,
  });

  const resetView = () => {
    animateView(1, { x: 0, y: 0 });
  };

  const focusProvince = (province: StarProvince) => {
    setSelection({ kind: 'province', node: province });
    setPanelOpen(true);
    animateView(1.85, focusPan(province.x, province.y));
  };

  const beginDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest('.star-entity, .star-hub')) return;
    cancelAnimationFrame(viewAnimationRef.current);
    window.clearTimeout(viewFallbackRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panX: pan.x,
      panY: pan.y,
      width: rect.width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const openProject = (node: StarNode) => {
    setSelection({ kind: 'project', node });
    setPanelOpen(true);
    const position = regionProjectPositions.get(node.id) || node;
    animateView(1.4, focusPan(position.x, position.y), 420);
    const nextParams = new URLSearchParams(params);
    nextParams.set('project', String(node.id));
    nextParams.delete('inheritor');
    setParams(nextParams, { replace: true });
  };

  const openGraphNode = (node: GraphNode) => {
    setSelection({ kind: 'graph', node });
    setPanelOpen(true);
    if (node.kind === 'category') {
      const nextCategory = activeCategoryId === node.id ? '' : node.id;
      setActiveCategoryId(nextCategory);
      setQuickFilter('all');
      const category = decagonLayout.categories.find((item) => item.id === node.id);
      if (category) {
        animateView(
          nextCategory ? 1.78 : 1,
          nextCategory ? focusPan(category.renderX, category.renderY) : { x: 0, y: 0 },
          520,
        );
      }
      return;
    }
    if (node.kind !== 'project' && node.kind !== 'inheritor') return;
    if (node.kind === 'project' && 'renderX' in node && 'renderY' in node) {
      animateView(
        1.38,
        focusPan(Number(node.renderX), Number(node.renderY)),
        360,
      );
    }
    const nextParams = new URLSearchParams(params);
    if (node.kind === 'project') {
      nextParams.set('project', node.id.replace(/^p:/, ''));
      nextParams.delete('inheritor');
    } else {
      nextParams.set('inheritor', node.id.replace(/^i:/, ''));
      nextParams.delete('project');
    }
    setParams(nextParams, { replace: true });
  };

  const jumpToPerson = (inheritorId: number) => {
    const person = graphById.get(`i:${inheritorId}`);
    if (!person) return;
    const nextParams = new URLSearchParams(params);
    nextParams.set('lens', 'person');
    nextParams.set('inheritor', String(inheritorId));
    nextParams.delete('project');
    setParams(nextParams, { replace: true });
    setSelection({ kind: 'graph', node: person });
    setPanelOpen(true);
    setKeyword('');
    setQuickFilter('all');
    animateView(1, { x: 0, y: 0 }, 260);
  };

  const jumpToProject = (projectId: number) => {
    const project = graphById.get(`p:${projectId}`);
    if (!project) return;
    const nextParams = new URLSearchParams(params);
    nextParams.set('lens', 'project');
    nextParams.set('project', String(projectId));
    nextParams.delete('inheritor');
    setParams(nextParams, { replace: true });
    setSelection({ kind: 'graph', node: project });
    setPanelOpen(true);
    setKeyword('');
    setQuickFilter('all');
    setActiveCategoryId('');
    animateView(1, { x: 0, y: 0 }, 260);
  };

  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const scale = world.width / Math.max(drag.width, 1) / zoom;
    setPan({
      x: drag.panX - (event.clientX - drag.clientX) * scale,
      y: drag.panY - ((event.clientY - drag.clientY) * (world.height / 620)) / zoom,
    });
  };

  return (
    <div className="explore-page">
      <div className="explore-app">
        <header className="explore-hero">
          <div className="explore-hero-copy">
            <p className="explore-eyebrow">非遗数字探索 · 星群卷</p>
            <h1>从一方水土，读懂一门手艺</h1>
            <p className="explore-subtitle">
              在地域、项目与人物之间穿行。星点不只是记录，也能读出档案完整度、名录批次与彼此关系。
            </p>
            <div className="explore-meta-line">
              <span>
                <b>{star.meta.total}</b> 个项目
              </span>
              <span>
                <b>{star.meta.provinceTotal}</b> 个省级地区
              </span>
              <span>
                <b>{graph.meta.inheritorTotal}</b> 位传承人
              </span>
              <span>
                <b>{graph.meta.edgeTotal}</b> 条关系
              </span>
            </div>
          </div>
          <div className="explore-seal" aria-hidden="true">
            <span>非遗</span>
            <span>探索</span>
          </div>
        </header>

        <nav className="explore-lenses" aria-label="探索镜">
          {(Object.keys(LENS_COPY) as Lens[]).map((value) => {
            const item = LENS_COPY[value];
            return (
              <button
                type="button"
                className={`explore-lens${lens === value ? ' is-active' : ''}`}
                aria-pressed={lens === value}
                onClick={() => setLens(value)}
                key={value}
              >
                <span className="lens-index">{item.index}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.note}</small>
                </span>
                <em>
                  {value === 'region'
                    ? `${star.meta.provinceTotal} 个星区`
                    : value === 'project'
                      ? `${graph.meta.projectTotal} 颗星`
                      : `${graph.meta.inheritorTotal} 位`}
                </em>
              </button>
            );
          })}
        </nav>

        <section className="explore-toolbar" aria-label="探索工具">
          <label className="explore-search">
            <span>寻迹</span>
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索项目、传承人、门类、地区"
              autoComplete="off"
            />
          </label>
          <div className="explore-quick">
            {lens === 'region' ? (
              <>
                <button
                  type="button"
                  className={quickFilter === 'all' ? 'is-active' : ''}
                  onClick={() => setQuickFilter('all')}
                >
                  全部
                </button>
                <button
                  type="button"
                  className={quickFilter === 'national' ? 'is-active' : ''}
                  onClick={() => setQuickFilter('national')}
                >
                  国家级
                </button>
                <button
                  type="button"
                  className={quickFilter === 'linked' ? 'is-active' : ''}
                  onClick={() => setQuickFilter('linked')}
                >
                  有传承人
                </button>
                <button
                  type="button"
                  className={quickFilter === 'gap' ? 'is-active' : ''}
                  onClick={() => setQuickFilter('gap')}
                >
                  档案待补
                </button>
              </>
            ) : lens === 'project' ? (
              <>
                <select
                  className="explore-category-select"
                  aria-label="按门类筛选项目"
                  value={activeCategoryId}
                  onChange={(event) => {
                    setActiveCategoryId(event.target.value);
                    setQuickFilter('all');
                  }}
                >
                  <option value="">十大门类</option>
                  {star.categories.map((category) => (
                    <option value={`c:${category.id}`} key={category.id}>
                      {category.name} · {category.total}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={quickFilter === 'national' ? 'is-active' : ''}
                  onClick={() => setQuickFilter((value) => (value === 'national' ? 'all' : 'national'))}
                >
                  国家级
                </button>
                <button
                  type="button"
                  className={quickFilter === 'gap' ? 'is-active' : ''}
                  onClick={() => setQuickFilter((value) => (value === 'gap' ? 'all' : 'gap'))}
                >
                  档案待补
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={quickFilter === 'all' ? 'is-active' : ''}
                  onClick={() => setQuickFilter('all')}
                >
                  全部
                </button>
                <button
                  type="button"
                  className={quickFilter === 'national' ? 'is-active' : ''}
                  onClick={() => setQuickFilter('national')}
                >
                  国家级
                </button>
                <button
                  type="button"
                  className={quickFilter === 'provincial' ? 'is-active' : ''}
                  onClick={() => setQuickFilter('provincial')}
                >
                  省级
                </button>
                <button
                  type="button"
                  className={quickFilter === 'linked' ? 'is-active' : ''}
                  onClick={() => {
                    setQuickFilter('linked');
                    const counts = new Map<string, number>();
                    for (const edge of query.data.graph.edges) {
                      if (edge.type === 'inheritance') {
                        counts.set(edge.target, (counts.get(edge.target) || 0) + 1);
                      }
                    }
                    const person = query.data.graph.nodes
                      .filter((node) => node.kind === 'inheritor')
                      .sort(
                        (left, right) =>
                          (counts.get(right.id) || 0) - (counts.get(left.id) || 0),
                      )[0];
                    if (person) setSelection({ kind: 'graph', node: person });
                  }}
                >
                  关联最多
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            className="explore-reset"
            onClick={() => {
              setKeyword('');
              resetView();
            }}
          >
            重置
          </button>
        </section>

        <section className={`explore-stage${panelOpen ? ' is-drawer-open' : ''}`}>
          <section className="explore-visual">
            <div className="visual-head">
              <div>
                <p className="visual-kicker">{copy.kicker}</p>
                <h2>{copy.title}</h2>
                <p>{copy.summary}</p>
                <div className="explore-path" aria-label="当前探索路径">
                  {lens === 'region' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelection(null);
                          resetView();
                        }}
                      >
                        全国
                      </button>
                      {selectedProvince ? <span>› {selectedProvince.name}</span> : null}
                      {selectedProject ? <span>› {truncate(selectedProject.name, 12)}</span> : null}
                    </>
                  ) : lens === 'project' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelection(null);
                          setActiveCategoryId('');
                          setQuickFilter('all');
                          resetView();
                        }}
                      >
                        十大门类
                      </button>
                      {selectedGraph?.kind === 'category' ? <span>› {selectedGraph.label}</span> : null}
                      {selectedGraph?.kind === 'project' ? (
                        <span>› {truncate(selectedGraph.label, 14)}</span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelection(null);
                          setQuickFilter('all');
                        }}
                      >
                        全部人物
                      </button>
                      {selectedGraph?.kind === 'inheritor' ? <span>› {selectedGraph.label}</span> : null}
                    </>
                  )}
                </div>
              </div>
              <div className="visual-head-tools">
                <div className="visual-legend">
                  <span>
                    <i className="legend-star" />
                    项目 / 人物
                  </span>
                  <span>
                    <i className="legend-hub" />
                    星群中心
                  </span>
                  <span>
                    <i className="legend-archive" />
                    档案环
                  </span>
                  <span>
                    <i className="legend-gap" />
                    缺环
                  </span>
                </div>
              </div>
            </div>

            <div
              className={`star-shell ${
                lens === 'person'
                  ? 'is-person'
                  : lens === 'region'
                    ? 'is-region-3d'
                    : 'is-project-3d'
              }`}
            >
              {lens === 'person' ? (
                <PersonSphere
                  people={personNodes}
                  selectedId={personFocusId}
                  query={deferredKeyword}
                  onSelect={openGraphNode}
                />
              ) : (
                <svg
                  className="star-svg"
                  viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
                  role="img"
                  aria-label={`${copy.title}，${lens === 'region' ? visibleProjects.length : decagonLayout.projects.length} 个可见节点`}
                  onPointerDown={beginDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={() => {
                    dragRef.current = null;
                  }}
                  onPointerCancel={() => {
                    dragRef.current = null;
                  }}
                  onWheel={(event) => {
                    event.preventDefault();
                    setZoom((value) =>
                      Math.min(2.4, Math.max(0.7, value + (event.deltaY > 0 ? -0.12 : 0.12))),
                    );
                  }}
                >
                {lens === 'region' ? (
                  <g className="region-3d-floor" aria-hidden="true">
                    <ellipse cx="700" cy="430" rx="560" ry="340" />
                    <ellipse cx="700" cy="430" rx="420" ry="250" />
                    <ellipse cx="700" cy="430" rx="270" ry="160" />
                    <path d="M140 430H1260M230 260H1170M230 600H1170" />
                    <path d="M700 90V770M470 130L930 730M930 130L470 730" />
                  </g>
                ) : null}
                <g aria-hidden="true">
                  {BACK_STARS.map((item, index) => (
                    <circle
                      className="star-bg-star"
                      cx={item.x}
                      cy={item.y}
                      r={item.r}
                      opacity={item.opacity}
                      key={index}
                    />
                  ))}
                </g>

                {lens === 'region' ? (
                  <>
                    <g>
                      {visibleProvinces.map((province) => (
                        <circle
                          className="star-cluster-ring"
                          cx={province.x}
                          cy={province.y}
                          r={Math.max(province.radius || 24, 24)}
                          key={`ring-${province.name}`}
                        />
                      ))}
                    </g>
                    <g>
                      {visibleProjects.map((node) => {
                        const province = star.provinces.find((item) => item.name === node.province);
                        if (!province) return null;
                        const position = regionProjectPositions.get(node.id) || node;
                        return (
                          <line
                            className="decagon-project-link"
                            x1={province.x}
                            y1={province.y}
                            x2={position.x}
                            y2={position.y}
                            key={`link-${node.id}`}
                          />
                        );
                      })}
                    </g>
                    <g>
                      {visibleProvinces.map((province) => (
                        <g
                          className={`star-hub${selectedProvince?.name === province.name ? ' is-selected' : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => focusProvince(province)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              focusProvince(province);
                            }
                          }}
                          key={province.name}
                        >
                          <ellipse
                            className="star-hub-shadow"
                            cx={province.x}
                            cy={province.y + 14}
                            rx={20}
                            ry={5}
                          />
                          <line
                            className="star-hub-stem"
                            x1={province.x}
                            y1={province.y + 6}
                            x2={province.x}
                            y2={province.y + 14}
                          />
                          <circle
                            className="star-hub-ring"
                            cx={province.x}
                            cy={province.y}
                            r={province.count >= 15 ? 24 : 19}
                          />
                          <rect
                            className="star-hub-core"
                            x={province.x - 4}
                            y={province.y - 4}
                            width="8"
                            height="8"
                            fill="#d9bd76"
                            transform={`rotate(45 ${province.x} ${province.y})`}
                          />
                          <rect
                            className="star-hub-label-bg"
                            x={province.x - 34}
                            y={province.y + 14}
                            width="68"
                            height="20"
                            rx="4"
                          />
                          <text className="star-hub-label" x={province.x} y={province.y + 28}>
                            {province.name.replace(/省|市|自治区|壮族|回族|维吾尔|特别行政区/g, '')}
                          </text>
                          <text className="star-hub-count" x={province.x} y={province.y + 46}>
                            {province.count} 个项目
                          </text>
                        </g>
                      ))}
                    </g>
                    <g>
                      {visibleProjects.map((node) => {
                        const active = selectedProject?.id === node.id;
                        const archiveLength = Math.max(2, Math.round(node.completeness * 15));
                        const position = regionProjectPositions.get(node.id) || node;
                        return (
                          <g
                            className={`star-entity${active ? ' is-selected' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              openProject(node);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                openProject(node);
                              }
                            }}
                            key={node.id}
                          >
                            <title>{`${node.name} · ${node.category} · ${node.level}`}</title>
                            <circle
                              className="entity-floor-shadow"
                              cx={position.x}
                              cy={position.y + 5}
                              r={Math.max(2.2, node.radius * 0.55)}
                            />
                            <circle
                              className="entity-halo"
                              cx={position.x}
                              cy={position.y}
                              r={node.radius * 2.4}
                              fill={node.color}
                            />
                            <circle
                              className="entity-body"
                              cx={position.x}
                              cy={position.y}
                              r={node.radius}
                              fill={node.color}
                            />
                            <circle
                              className="entity-hit"
                              cx={position.x}
                              cy={position.y}
                              r={Math.max(node.radius * 1.8, 9)}
                            />
                            {node.completeness > 0.15 ? (
                              <circle
                                className="protection-ring"
                                cx={position.x}
                                cy={position.y}
                                r={node.radius + 4}
                                strokeDasharray={`${archiveLength} ${Math.max(5, 20 - archiveLength)}`}
                              />
                            ) : null}
                            {node.missingInheritor ? (
                              <circle
                                className="star-gap-ring"
                                cx={position.x}
                                cy={position.y}
                                r={node.radius + 7}
                              />
                            ) : null}
                            {active ? (
                              <text
                                className="entity-label"
                                x={position.x}
                                y={position.y - node.radius - 8}
                              >
                                {truncate(node.name, 12)}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                    </g>
                  </>
                ) : (
                  <>
                    <g className="decagon-guide" aria-hidden="true">
                      <ellipse
                        className="decagon-floor"
                        cx={decagonLayout.center.x}
                        cy={decagonLayout.center.y}
                        rx={485}
                        ry={365}
                      />
                      <polygon
                        className="decagon-boundary"
                        points={decagonLayout.vertices
                          .map((vertex) => `${vertex.x},${vertex.y}`)
                          .join(' ')}
                      />
                      <circle
                        className="decagon-center-orbit"
                        cx={decagonLayout.center.x}
                        cy={decagonLayout.center.y}
                        r={250}
                      />
                      {decagonLayout.vertices.map((vertex, index) => (
                        <line
                          className="decagon-spoke"
                          x1={decagonLayout.center.x}
                          y1={decagonLayout.center.y}
                          x2={vertex.x}
                          y2={vertex.y}
                          key={`spoke-${index}`}
                        />
                      ))}
                      <circle
                        className="decagon-core-ring"
                        cx={decagonLayout.center.x}
                        cy={decagonLayout.center.y}
                        r={54}
                      />
                      <text
                        className="decagon-core-number"
                        x={decagonLayout.center.x}
                        y={decagonLayout.center.y + 2}
                      >
                        {decagonLayout.projects.length}
                      </text>
                      <text
                        className="decagon-core-label"
                        x={decagonLayout.center.x}
                        y={decagonLayout.center.y + 21}
                      >
                        十类非遗项目
                      </text>
                    </g>
                    <g className="decagon-project-links" aria-hidden="true">
                      {decagonLayout.projects.map((project) => {
                        const category = decagonCategoryByName.get(project.categoryName || '');
                        if (!category) return null;
                        return (
                          <line
                            className="decagon-project-link"
                            x1={category.renderX}
                            y1={category.renderY}
                            x2={project.renderX}
                            y2={project.renderY}
                            key={`project-link-${project.id}`}
                          />
                        );
                      })}
                    </g>
                    <g>
                      {decagonLayout.projects.map((project) => {
                        const active = selectedGraph?.id === project.id;
                        const starProject = starNodeById.get(Number(project.id.replace(/^p:/, '')));
                        const radius = project.levelName === '国家级' ? 6.6 : 5.2;
                        return (
                          <g
                            className={`star-entity decagon-project${active ? ' is-selected' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => openGraphNode(project)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                openGraphNode(project);
                              }
                            }}
                            key={project.id}
                          >
                            <title>{`${project.label} · ${graphMeta(project)}`}</title>
                            <circle
                              className="entity-floor-shadow"
                              cx={project.renderX}
                              cy={project.renderY + 6}
                              r={Math.max(2.5, radius * 0.58)}
                            />
                            <circle
                              className="entity-halo"
                              cx={project.renderX}
                              cy={project.renderY}
                              r={radius * 2.5}
                              fill={project.color}
                            />
                            <circle
                              className="entity-body"
                              cx={project.renderX}
                              cy={project.renderY}
                              r={radius}
                              fill={project.color}
                            />
                            <circle
                              className="entity-hit"
                              cx={project.renderX}
                              cy={project.renderY}
                              r={Math.max(radius * 1.8, 9)}
                            />
                            {starProject && starProject.completeness > 0.15 ? (
                              <circle
                                className="protection-ring"
                                cx={project.renderX}
                                cy={project.renderY}
                                r={radius + 4}
                                strokeDasharray={`${Math.max(2, Math.round(starProject.completeness * 18))} 18`}
                              />
                            ) : null}
                            {starProject?.missingInheritor ? (
                              <circle
                                className="star-gap-ring"
                                cx={project.renderX}
                                cy={project.renderY}
                                r={radius + 7}
                              />
                            ) : null}
                            {active ? (
                              <text
                                className="entity-label"
                                x={project.renderX}
                                y={project.renderY - radius - 8}
                              >
                                {truncate(project.label, 14)}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                    </g>
                    <g>
                      {decagonLayout.categories.map((category) => {
                        const active =
                          selectedGraph?.id === category.id || activeCategoryId === category.id;
                        const dimmed =
                          Boolean(activeCategoryId) && activeCategoryId !== category.id;
                        const labelX = category.renderX - Math.cos(category.angle || 0) * 58;
                        const labelY = category.renderY - Math.sin(category.angle || 0) * 58;
                        return (
                          <g
                            className={`star-hub decagon-hub${active ? ' is-selected' : ''}${dimmed ? ' is-dim' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => openGraphNode(category)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                openGraphNode(category);
                              }
                            }}
                            key={category.id}
                          >
                            <ellipse
                              className="star-hub-shadow"
                              cx={category.renderX}
                              cy={category.renderY + 16}
                              rx={24}
                              ry={6}
                            />
                            <line
                              className="star-hub-stem"
                              x1={category.renderX}
                              y1={category.renderY + 6}
                              x2={category.renderX}
                              y2={category.renderY + 16}
                            />
                            <circle
                              className="star-hub-ring"
                              cx={category.renderX}
                              cy={category.renderY}
                              r={28}
                            />
                            <rect
                              className="star-hub-core"
                              x={category.renderX - 6}
                              y={category.renderY - 6}
                              width={12}
                              height={12}
                              fill={category.color}
                              transform={`rotate(45 ${category.renderX} ${category.renderY})`}
                            />
                            <rect
                              className="decagon-hub-label-bg"
                              x={labelX - 52}
                              y={labelY - 16}
                              width={104}
                              height={31}
                              rx={5}
                            />
                            <text
                              className="decagon-hub-label"
                              x={labelX}
                              y={labelY - 2}
                            >
                              {truncate(category.label, 9)}
                            </text>
                            <text
                              className="decagon-hub-count"
                              x={labelX}
                              y={labelY + 10}
                            >
                              {category.projectCount} 项
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  </>
                )}
                </svg>
              )}

              {lens !== 'person' ? (
                <div className="star-zoom-tools">
                  <button
                    type="button"
                    title="放大"
                    aria-label="放大星图"
                    onClick={() => setZoom((value) => Math.min(2.4, value + 0.15))}
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    title="缩小"
                    aria-label="缩小星图"
                    onClick={() => setZoom((value) => Math.max(0.7, value - 0.15))}
                  >
                    －
                  </button>
                  <button type="button" title="复位" aria-label="复位星图" onClick={resetView}>
                    ⌂
                  </button>
                </div>
              ) : null}
              <div className="star-footer">
                <span>
                  当前显示{' '}
                  <b>
                    {lens === 'region'
                      ? visibleProjects.length
                      : lens === 'project'
                        ? decagonLayout.projects.length
                        : personNodes.length}
                  </b>{' '}
                  个节点
                </span>
                <span>
                  {lens === 'person'
                    ? '拖拽旋转 · 悬停查看人物 · 点击打开档案'
                    : '拖拽平移 · 滚轮缩放 · 点击星点查看档案'}
                </span>
              </div>
              <div className="star-legend-strip" aria-label="星图图例">
                {(lens === 'person'
                  ? Object.entries(LEVEL_COLORS).map(([label, color]) => ({ label, color }))
                  : star.categories.map((category) => ({
                      label: category.name,
                      color: category.color,
                    }))
                ).map((item) => (
                  <i
                    className="star-legend-dot"
                    style={{ background: item.color }}
                    title={item.label}
                    key={item.label}
                  />
                ))}
                <span className="star-legend-separator" />
                <i className="star-legend-archive" title="档案完整度" />
                <span>档案环</span>
                <i className="star-legend-gap" title="传承人缺环" />
                <span>缺环</span>
              </div>
            </div>
          </section>

          <aside className={`explore-side ${panelOpen ? 'is-detail-open' : 'is-collapsed'}`}>
            {panelOpen ? (
              <section className="explore-drawer">
                <header className="explore-drawer-head">
                  <div>
                    <p className="explore-panel-kicker">EXPLORE DRAWER</p>
                    <h2>
                      {drawerProject?.name ||
                        selectedProvince?.name ||
                        selectedGraph?.label ||
                        copy.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="explore-detail-close"
                    onClick={() => setPanelOpen(false)}
                    aria-label="收起非遗档案"
                  >
                    ×
                  </button>
                </header>
                <div className="explore-drawer-body">
                  {drawerProject ? (
                    <div className="explore-detail">
                      <p className="explore-detail-kind">非遗项目</p>
                      <h2 className="explore-detail-title">{drawerProject.name}</h2>
                      <p className="explore-detail-sub">
                        {drawerProject.category} · {drawerProject.level} ·{' '}
                        {drawerProject.regionLabel}
                      </p>
                      <div className="explore-detail-section is-first">
                        <h3>项目摘要</h3>
                        <p>
                          {drawerProject.summary
                            ? truncate(drawerProject.summary, 150)
                            : '站内档案暂未补充项目摘要，可打开完整档案查看现有记录。'}
                        </p>
                      </div>
                      <div className="explore-detail-tags">
                        <span className="explore-detail-tag">{drawerProject.province}</span>
                        {drawerProject.batch ? (
                          <span className="explore-detail-tag">{drawerProject.batch}</span>
                        ) : null}
                        {drawerProject.missingInheritor ? (
                          <span className="explore-detail-tag is-gap">传承人档案待补</span>
                        ) : (
                          <span className="explore-detail-tag">
                            {drawerProject.inheritorCount || 0} 位关联传承人
                          </span>
                        )}
                      </div>
                      <div className="explore-stat-grid">
                        <div className="explore-stat">
                          <dt>公布年份</dt>
                          <dd>{drawerProject.year || '待补'}</dd>
                        </div>
                        <div className="explore-stat">
                          <dt>关联传承人</dt>
                          <dd>{drawerProject.inheritorCount || 0}</dd>
                        </div>
                        <div className="explore-stat">
                          <dt>图片档案</dt>
                          <dd>{drawerProject.imageCount || 0}</dd>
                        </div>
                        <div className="explore-stat">
                          <dt>音频档案</dt>
                          <dd>{drawerProject.audioCount || 0}</dd>
                        </div>
                      </div>
                      <div className="archive-meter">
                        <span>
                          <i
                            style={{
                              width: `${Math.max(4, Math.round(drawerProject.completeness * 100))}%`,
                            }}
                          />
                        </span>
                        <p>
                          <span>档案完整度</span>
                          <b>{Math.round(drawerProject.completeness * 100)}%</b>
                        </p>
                      </div>
                      {drawerProject.inheritors.length ? (
                        <div className="explore-detail-section">
                          <h3>代表性传承人</h3>
                          <div className="explore-list">
                            {drawerProject.inheritors.slice(0, 4).map((person) => (
                              <button
                                type="button"
                                className="explore-list-item"
                                onClick={() => jumpToPerson(person.id)}
                                key={person.id}
                              >
                                <i />
                                {person.name}
                                <small>{person.code}</small>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="explore-cross-actions">
                        {drawerProject.inheritors[0] ? (
                          <button
                            type="button"
                            onClick={() => jumpToPerson(drawerProject.inheritors[0].id)}
                          >
                            在人物星群查看
                          </button>
                        ) : null}
                        <button type="button" onClick={() => jumpToProject(drawerProject.id)}>
                          在项目星群定位
                        </button>
                      </div>
                      <Link className="explore-detail-link" to={`/projects/${drawerProject.id}`}>
                        打开完整项目档案 →
                      </Link>
                    </div>
                  ) : selectedProvince ? (
                    <div className="explore-detail">
                      <p className="explore-detail-kind">省级星区</p>
                      <h2 className="explore-detail-title">{selectedProvince.name}</h2>
                      <div className="explore-stat-grid">
                        <div className="explore-stat">
                          <dt>项目</dt>
                          <dd>{selectedProvince.count}</dd>
                        </div>
                        <div className="explore-stat">
                          <dt>门类</dt>
                          <dd>{selectedProvince.categories.length}</dd>
                        </div>
                      </div>
                      <div className="explore-detail-tags">
                        {selectedProvince.categories.slice(0, 5).map((category) => (
                          <span className="explore-detail-tag" key={category}>
                            {category}
                          </span>
                        ))}
                      </div>
                      <div className="explore-detail-section">
                        <h3>代表项目</h3>
                        <div className="explore-list">
                          {selectedProvinceProjects.map((project) => (
                            <button
                              type="button"
                              className="explore-list-item"
                              onClick={() => openProject(project)}
                              key={project.id}
                            >
                              <i style={{ background: project.color }} />
                              {project.name}
                              <small>{project.category}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="explore-cross-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setLens('project');
                            setKeyword(selectedProvince.name);
                          }}
                        >
                          在项目星群中查看
                        </button>
                        <button type="button" onClick={resetView}>
                          回到全国
                        </button>
                      </div>
                    </div>
                  ) : selectedGraph ? (
                    <div className="explore-detail">
                      {selectedGraph.kind === 'inheritor' ? (
                        <>
                          <p className="explore-detail-kind">传承人</p>
                          <h2 className="explore-detail-title">{selectedGraph.label}</h2>
                          <p className="explore-detail-sub">
                            {graphMeta(selectedGraph) || '人物星群中的传承人节点'}
                          </p>
                          <div className="explore-stat-grid">
                            <div className="explore-stat">
                              <dt>认定级别</dt>
                              <dd>{selectedGraph.levelName || '待补'}</dd>
                            </div>
                            <div className="explore-stat">
                              <dt>关联项目</dt>
                              <dd>{selectedPersonProjects.length}</dd>
                            </div>
                          </div>
                          <div className="explore-detail-section">
                            <h3>守护的项目</h3>
                            {selectedPersonProjects.length ? (
                              <div className="explore-list">
                                {selectedPersonProjects.slice(0, 8).map((project) => (
                                  <button
                                    type="button"
                                    className="explore-list-item"
                                    onClick={() => jumpToProject(Number(project.id.replace(/^p:/, '')))}
                                    key={project.id}
                                  >
                                    <i style={{ background: project.color }} />
                                    {project.label}
                                    <small>{project.categoryName || '项目'}</small>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p>暂未记录已发布关联项目。</p>
                            )}
                          </div>
                          {selectedGraph.detailHref ? (
                            <Link className="explore-detail-link" to={selectedGraph.detailHref}>
                              查看完整人物档案 →
                            </Link>
                          ) : null}
                        </>
                      ) : selectedGraph.kind === 'category' ? (
                        <>
                          <p className="explore-detail-kind">非遗门类</p>
                          <h2 className="explore-detail-title">{selectedGraph.label}</h2>
                          <p className="explore-detail-sub">
                            该门类在项目星群中关联 {selectedCategoryProjects.length} 个项目。
                          </p>
                          <div className="explore-detail-section">
                            <h3>代表项目</h3>
                            <div className="explore-list">
                              {selectedCategoryProjects.slice(0, 8).map((project) => (
                                <button
                                  type="button"
                                  className="explore-list-item"
                                  onClick={() => jumpToProject(project.id)}
                                  key={project.id}
                                >
                                  <i style={{ background: project.color }} />
                                  {project.name}
                                  <small>{project.level}</small>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="explore-cross-actions">
                            <button
                              type="button"
                              onClick={() => {
                                const nextParams = new URLSearchParams(params);
                                nextParams.set('lens', 'project');
                                nextParams.delete('project');
                                nextParams.delete('inheritor');
                                setParams(nextParams, { replace: true });
                                setSelection(null);
                                setActiveCategoryId(selectedGraph.id);
                                setQuickFilter('all');
                                setKeyword('');
                                resetView();
                              }}
                            >
                              仅看该门类
                            </button>
                            {selectedGraph.detailHref ? (
                              <Link to={selectedGraph.detailHref}>查看门类档案</Link>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="explore-detail-kind">地区</p>
                          <h2 className="explore-detail-title">{selectedGraph.label}</h2>
                          <p className="explore-detail-sub">{graphMeta(selectedGraph)}</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="explore-detail">
                      <p className="explore-detail-kind">星群读法</p>
                      <h2 className="explore-detail-title">{copy.title}</h2>
                      <p className="explore-detail-sub">{copy.summary}</p>
                      <div className="explore-stat-grid">
                        <div className="explore-stat">
                          <dt>项目</dt>
                          <dd>{star.meta.total}</dd>
                        </div>
                        <div className="explore-stat">
                          <dt>传承人</dt>
                          <dd>{graph.meta.inheritorTotal}</dd>
                        </div>
                        <div className="explore-stat">
                          <dt>省级星区</dt>
                          <dd>{star.meta.provinceTotal}</dd>
                        </div>
                        <div className="explore-stat">
                          <dt>关系</dt>
                          <dd>{graph.meta.edgeTotal}</dd>
                        </div>
                      </div>
                      <div className="explore-legend">
                        {star.categories.map((category) => (
                          <div className="explore-legend-row" key={category.id}>
                            <i style={{ background: category.color }} />
                            <span>{category.name}</span>
                            <em>{category.total}</em>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <button
                type="button"
                className="explore-drawer-rail"
                onClick={() => setPanelOpen(true)}
                aria-label="打开星群图例"
              >
                <i aria-hidden="true">读</i>
                <span>图例</span>
              </button>
            )}
          </aside>
        </section>

        <section className="explore-routes" aria-label="推荐探索路线">
          <div className="routes-head">
            <p className="visual-kicker">CURATED PATHS</p>
            <h2>推荐探索路线</h2>
          </div>
          <div className="routes-grid">
            <button
              type="button"
              className="route-card"
              onClick={() => {
                setLens('region');
                setKeyword('江苏省');
              }}
            >
              <span>
                <i>01</i>沿运河看江苏
              </span>
              <small>从省级星区进入项目与传承人</small>
            </button>
            <button
              type="button"
              className="route-card"
              disabled={!missingProject}
              onClick={() => {
                if (!missingProject) return;
                setLens('region');
                setKeyword(missingProject.name);
                setSelection({ kind: 'project', node: missingProject });
                setPanelOpen(true);
              }}
            >
              <span>
                <i>02</i>追踪一个缺环
              </span>
              <small>从传承人档案待补项目反查门类与地区</small>
            </button>
            <button type="button" className="route-card" onClick={() => setLens('person')}>
              <span>
                <i>03</i>一门技艺到一个人
              </span>
              <small>沿人物星群找到项目与另一条关联</small>
            </button>
          </div>
        </section>

        <p className="explore-disclaimer">
          星点位置为行政区示意，未绘制行政边界。档案环表示图片、录音与传承人信息的综合完整度，仅展示已发布内容。
        </p>
      </div>
    </div>
  );
}
