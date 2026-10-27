import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicApi } from '../api/client';
import { ErrorState, LoadingState } from '../components/common';
import { usePageMeta } from '../hooks/usePageMeta';
import type { GraphNode, StarNode, StarProvince } from '../types';

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
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
    width: number;
  } | null>(null);
  const query = useQuery({ queryKey: ['explore'], queryFn: publicApi.explore });

  usePageMeta({
    title: '非遗探索',
    description:
      '从地域星图、项目星群与人物星群三个视角探索中国非物质文化遗产，查看项目、地区与传承之间的关系。',
  });

  const setLens = (next: Lens) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('lens', next);
    nextParams.delete('project');
    nextParams.delete('inheritor');
    setParams(nextParams);
    setSelection(null);
    setKeyword('');
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
      setSelection({ kind: 'project', node });
      setPanelOpen(true);
      setZoom(1.55);
      setPan({
        x: query.data.star.world.width / 2 - node.x,
        y: query.data.star.world.height / 2 - node.y,
      });
      return;
    }

    if (lens === 'project' && Number.isFinite(projectId) && projectId > 0) {
      const node = query.data.graph.nodes.find((item) => item.id === `p:${projectId}`);
      if (!node) return;
      setSelection({ kind: 'graph', node });
      setPanelOpen(true);
      setZoom(1.55);
      setPan({
        x: query.data.graph.world.width / 2 - node.x,
        y: query.data.graph.world.height / 2 - node.y,
      });
      return;
    }

    if (lens === 'person' && Number.isFinite(inheritorId) && inheritorId > 0) {
      const node = query.data.graph.nodes.find((item) => item.id === `i:${inheritorId}`);
      if (!node) return;
      setSelection({ kind: 'graph', node });
      setPanelOpen(true);
      setZoom(1.55);
      setPan({
        x: query.data.graph.world.width / 2 - node.x,
        y: query.data.graph.world.height / 2 - node.y,
      });
    }
  }, [lens, params, query.data]);

  const visibleProjects = useMemo(() => {
    if (!query.data) return [];
    return query.data.star.nodes.filter((node) =>
      `${node.name} ${node.category} ${node.level} ${node.province} ${node.regionLabel}`
        .toLocaleLowerCase('zh-CN')
        .includes(deferredKeyword),
    );
  }, [deferredKeyword, query.data]);

  const visibleProvinces = useMemo(() => {
    if (!query.data) return [];
    const projectProvinces = new Set(visibleProjects.map((node) => node.province));
    return query.data.star.provinces.filter(
      (province) =>
        province.name.toLocaleLowerCase('zh-CN').includes(deferredKeyword) ||
        projectProvinces.has(province.name),
    );
  }, [deferredKeyword, query.data, visibleProjects]);

  const graphNodes = useMemo(() => {
    if (!query.data) return [];
    return query.data.graph.nodes
      .filter((node) =>
        lens === 'project'
          ? ['project', 'category', 'region'].includes(node.kind)
          : ['inheritor', 'project'].includes(node.kind),
      )
      .filter((node) =>
        `${node.label} ${graphMeta(node)}`.toLocaleLowerCase('zh-CN').includes(deferredKeyword),
      );
  }, [deferredKeyword, lens, query.data]);

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
  const visibleGraphIds = new Set(graphNodes.map((node) => node.id));
  const graphById = new Map(graph.nodes.map((node) => [node.id, node]));
  const selectedProject = selection?.kind === 'project' ? selection.node : null;
  const selectedProvince = selection?.kind === 'province' ? selection.node : null;
  const selectedGraph = selection?.kind === 'graph' ? selection.node : null;
  const selectedProvinceProjects = selectedProvince
    ? star.nodes.filter((node) => node.province === selectedProvince.name).slice(0, 6)
    : [];
  const missingProject = star.nodes.find((node) => node.missingInheritor);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const beginDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest('.star-entity, .star-hub')) return;
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
    const nextParams = new URLSearchParams(params);
    nextParams.set('project', String(node.id));
    nextParams.delete('inheritor');
    setParams(nextParams, { replace: true });
  };

  const openGraphNode = (node: GraphNode) => {
    setSelection({ kind: 'graph', node });
    setPanelOpen(true);
    if (node.kind !== 'project' && node.kind !== 'inheritor') return;
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
            {star.categories.slice(0, 3).map((category) => (
              <button type="button" onClick={() => setKeyword(category.name)} key={category.id}>
                {category.name}
              </button>
            ))}
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

            <div className={`star-shell${lens === 'person' ? ' is-person' : ''}`}>
              <svg
                className="star-svg"
                viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
                role="img"
                aria-label={`${copy.title}，${lens === 'region' ? visibleProjects.length : graphNodes.length} 个可见节点`}
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
                        return (
                          <line
                            className="decagon-project-link"
                            x1={province.x}
                            y1={province.y}
                            x2={node.x}
                            y2={node.y}
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
                          onClick={() => {
                            setSelection({ kind: 'province', node: province });
                            setPanelOpen(true);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              setSelection({ kind: 'province', node: province });
                              setPanelOpen(true);
                            }
                          }}
                          key={province.name}
                        >
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
                              className="entity-halo"
                              cx={node.x}
                              cy={node.y}
                              r={node.radius * 2.4}
                              fill={node.color}
                            />
                            <circle
                              className="entity-body"
                              cx={node.x}
                              cy={node.y}
                              r={node.radius}
                              fill={node.color}
                            />
                            <circle
                              className="entity-hit"
                              cx={node.x}
                              cy={node.y}
                              r={Math.max(node.radius * 1.8, 9)}
                            />
                            {node.completeness > 0.15 ? (
                              <circle
                                className="protection-ring"
                                cx={node.x}
                                cy={node.y}
                                r={node.radius + 4}
                                strokeDasharray={`${archiveLength} ${Math.max(5, 20 - archiveLength)}`}
                              />
                            ) : null}
                            {node.missingInheritor ? (
                              <circle
                                className="star-gap-ring"
                                cx={node.x}
                                cy={node.y}
                                r={node.radius + 7}
                              />
                            ) : null}
                            {active ? (
                              <text
                                className="entity-label"
                                x={node.x}
                                y={node.y - node.radius - 8}
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
                    <g>
                      {graph.edges
                        .filter(
                          (edge) =>
                            visibleGraphIds.has(edge.source) && visibleGraphIds.has(edge.target),
                        )
                        .map((edge) => {
                          const from = graphById.get(edge.source);
                          const to = graphById.get(edge.target);
                          if (!from || !to) return null;
                          return (
                            <line
                              className="decagon-project-link"
                              x1={from.x}
                              y1={from.y}
                              x2={to.x}
                              y2={to.y}
                              key={edge.id}
                            />
                          );
                        })}
                    </g>
                    <g>
                      {graphNodes.map((node) => {
                        const active = selectedGraph?.id === node.id;
                        const radius =
                          node.kind === 'project' ? 7 : node.kind === 'inheritor' ? 5.5 : 12;
                        return (
                          <g
                            className={`star-entity${active ? ' is-selected' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              openGraphNode(node);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                openGraphNode(node);
                              }
                            }}
                            key={node.id}
                          >
                            <circle
                              className="entity-halo"
                              cx={node.x}
                              cy={node.y}
                              r={radius * 2.5}
                              fill={node.color}
                            />
                            <circle
                              className="entity-body"
                              cx={node.x}
                              cy={node.y}
                              r={radius}
                              fill={node.color}
                            />
                            <circle
                              className="entity-hit"
                              cx={node.x}
                              cy={node.y}
                              r={Math.max(radius * 1.8, 9)}
                            />
                            {node.kind !== 'project' ? (
                              <text className="entity-label" x={node.x} y={node.y + radius + 13}>
                                {truncate(node.label, 12)}
                              </text>
                            ) : active ? (
                              <text className="entity-label" x={node.x} y={node.y - radius - 8}>
                                {truncate(node.label, 14)}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                    </g>
                  </>
                )}
              </svg>

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
              <div className="star-footer">
                <span>
                  当前显示 <b>{lens === 'region' ? visibleProjects.length : graphNodes.length}</b>{' '}
                  个节点
                </span>
                <span>拖拽平移 · 滚轮缩放 · 点击星点查看档案</span>
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
                      {selectedProject?.name ||
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
                  {selectedProject ? (
                    <div className="explore-detail">
                      <p className="explore-detail-kind">非遗项目</p>
                      <h2 className="explore-detail-title">{selectedProject.name}</h2>
                      <p className="explore-detail-sub">
                        {selectedProject.category} · {selectedProject.level} ·{' '}
                        {selectedProject.regionLabel}
                      </p>
                      <div className="explore-detail-section is-first">
                        <h3>项目摘要</h3>
                        <p>
                          {selectedProject.summary
                            ? truncate(selectedProject.summary, 150)
                            : '站内档案暂未补充项目摘要，可打开完整档案查看现有记录。'}
                        </p>
                      </div>
                      <div className="explore-detail-tags">
                        <span className="explore-detail-tag">{selectedProject.province}</span>
                        {selectedProject.batch ? (
                          <span className="explore-detail-tag">{selectedProject.batch}</span>
                        ) : null}
                        {selectedProject.missingInheritor ? (
                          <span className="explore-detail-tag is-gap">传承人档案待补</span>
                        ) : (
                          <span className="explore-detail-tag">
                            {selectedProject.inheritorCount || 0} 位关联传承人
                          </span>
                        )}
                      </div>
                      <div className="explore-stat-grid">
                        <div className="explore-stat">
                          <dt>公布年份</dt>
                          <dd>{selectedProject.year || '待补'}</dd>
                        </div>
                        <div className="explore-stat">
                          <dt>关联传承人</dt>
                          <dd>{selectedProject.inheritorCount || 0}</dd>
                        </div>
                        <div className="explore-stat">
                          <dt>图片档案</dt>
                          <dd>{selectedProject.imageCount || 0}</dd>
                        </div>
                        <div className="explore-stat">
                          <dt>音频档案</dt>
                          <dd>{selectedProject.audioCount || 0}</dd>
                        </div>
                      </div>
                      <div className="archive-meter">
                        <span>
                          <i
                            style={{
                              width: `${Math.max(4, Math.round(selectedProject.completeness * 100))}%`,
                            }}
                          />
                        </span>
                        <p>
                          <span>档案完整度</span>
                          <b>{Math.round(selectedProject.completeness * 100)}%</b>
                        </p>
                      </div>
                      {selectedProject.inheritors.length ? (
                        <div className="explore-detail-section">
                          <h3>代表性传承人</h3>
                          <div className="explore-list">
                            {selectedProject.inheritors.slice(0, 4).map((person) => (
                              <Link
                                className="explore-list-item"
                                to={`/inheritors/${person.id}`}
                                key={person.id}
                              >
                                <i />
                                {person.name}
                                <small>{person.code}</small>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <Link className="explore-detail-link" to={`/projects/${selectedProject.id}`}>
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
                    </div>
                  ) : selectedGraph ? (
                    <div className="explore-detail">
                      <p className="explore-detail-kind">
                        {selectedGraph.kind === 'inheritor'
                          ? '传承人'
                          : selectedGraph.kind === 'project'
                            ? '非遗项目'
                            : selectedGraph.kind === 'category'
                              ? '非遗门类'
                              : '地区'}
                      </p>
                      <h2 className="explore-detail-title">{selectedGraph.label}</h2>
                      <p className="explore-detail-sub">
                        {graphMeta(selectedGraph) || copy.summary}
                      </p>
                      {selectedGraph.detailHref ? (
                        <Link className="explore-detail-link" to={selectedGraph.detailHref}>
                          查看完整档案 →
                        </Link>
                      ) : null}
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
