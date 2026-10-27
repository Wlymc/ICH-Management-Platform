import { h } from '../util.js';
import { portalLayout } from './layout.js';

/** 非遗探索 V4：地域/时间双视角、正十边形门类图谱、三维人物球与故事航线。 */
export function exploreView({ data }) {
  const star = data?.star?.meta || { total: 0, provinceTotal: 0, missingInheritor: 0 };
  const graph = data?.graph?.meta || { total: 0, edgeTotal: 0, projectTotal: 0, inheritorTotal: 0 };
  return portalLayout({
    title: '非遗探索',
    description: '从地域星图、项目星群与人物星群三个视角探索中国非物质文化遗产。',
    active: 'explore',
    bodyClass: 'explore-page',
    styles: ['css/explore.css'],
    scripts: ['js/explore.js', 'js/public-ai.js'],
    body: `
  <div class="explore-app" data-explore-app data-api="/api/explore">
    <header class="explore-hero">
      <div class="explore-hero-copy">
        <p class="explore-eyebrow">非遗数字探索 · 星群卷</p>
        <h1>从一方水土，读懂一门手艺</h1>
        <p class="explore-subtitle">在地域、时间、项目与人物之间穿行。星点不只是一条记录，也能读出档案完整度、名录批次与彼此关系。</p>
        <div class="explore-meta-line">
          <span><b data-explore-meta-projects>${h(String(star.total || graph.projectTotal || 0))}</b> 个项目</span>
          <span><b data-explore-meta-provinces>${h(String(star.provinceTotal || 0))}</b> 个省级地区</span>
          <span><b data-explore-meta-inheritors>${h(String(graph.inheritorTotal || 0))}</b> 位传承人</span>
          <span><b data-explore-meta-edges>${h(String(graph.edgeTotal || 0))}</b> 条关系</span>
        </div>
      </div>
      <div class="explore-seal" aria-hidden="true"><span>非遗</span><span>探索</span></div>
    </header>

    <nav class="explore-lenses" aria-label="探索镜">
      <button type="button" class="explore-lens is-active" data-explore-lens="region" aria-pressed="true">
        <span class="lens-index">壹</span>
        <span><strong>地域星图</strong><small>省级星座与项目星点</small></span>
        <em>${h(String(star.provinceTotal || 0))} 个星区</em>
      </button>
      <button type="button" class="explore-lens" data-explore-lens="project" aria-pressed="false">
        <span class="lens-index">贰</span>
        <span><strong>项目星群</strong><small>按门类浏览全部项目</small></span>
        <em>${h(String(graph.projectTotal || 0))} 颗星</em>
      </button>
      <button type="button" class="explore-lens" data-explore-lens="person" aria-pressed="false">
        <span class="lens-index">叁</span>
        <span><strong>人物星群</strong><small>浏览全部传承人与关联项目</small></span>
        <em>${h(String(graph.inheritorTotal || 0))} 位</em>
      </button>
    </nav>

    <section class="explore-toolbar" aria-label="探索工具">
      <label class="explore-search">
        <span>寻迹</span>
        <input type="search" data-explore-search placeholder="搜索项目、传承人、门类、地区" autocomplete="off">
      </label>
      <div class="explore-quick" data-explore-quick></div>
      <button type="button" class="explore-reset" data-explore-reset>重置</button>
    </section>

    <div class="explore-stage">
      <section class="explore-visual">
        <div class="visual-head">
          <div>
            <p class="visual-kicker" data-lens-kicker>REGIONAL CONSTELLATION</p>
            <h2 data-lens-title>地域星图</h2>
            <p data-lens-sub>看省级星座里的项目密度、门类与缺环线索。</p>
          </div>
          <div class="visual-head-tools">
            <div class="visual-mode-tools" data-visual-mode-tools>
              <div class="explore-segmented" aria-label="地域展示方式">
                <button type="button" class="is-active" data-region-mode="geo" aria-pressed="true">地域星图</button>
                <button type="button" data-region-mode="time" aria-pressed="false">时间星河</button>
              </div>
              <button type="button" class="time-play" data-time-play hidden>播放五批</button>
            </div>
            <div class="visual-legend">
              <span><i class="legend-star"></i>项目 / 人物</span>
              <span><i class="legend-hub"></i>星群中心</span>
              <span><i class="legend-archive"></i>档案环</span>
              <span><i class="legend-gap"></i>缺环</span>
            </div>
          </div>
        </div>
        <div class="star-shell" data-star-shell>
          <canvas class="person-sphere" data-person-sphere hidden></canvas>
          <svg class="star-svg" data-star-svg viewBox="0 0 1400 820" role="img" aria-label="非遗星群">
            <g data-star-bg></g>
            <g data-star-layer></g>
          </svg>
          <div class="star-tooltip" data-star-tooltip hidden></div>
          <div class="story-trail" data-story-trail hidden>
            <div class="story-trail-copy">
              <span data-story-progress>01 / 03</span>
              <strong data-story-title>故事航线</strong>
              <p data-story-note></p>
            </div>
            <div class="story-trail-actions">
              <button type="button" data-story-prev title="上一步" aria-label="上一步">←</button>
              <button type="button" class="is-primary" data-story-next>下一步 →</button>
              <button type="button" data-story-close title="退出航线" aria-label="退出航线">×</button>
            </div>
          </div>
          <div class="star-zoom-tools">
            <button type="button" data-star-zoom-in title="放大">＋</button>
            <button type="button" data-star-zoom-out title="缩小">－</button>
            <button type="button" data-star-zoom-reset title="复位">⌂</button>
          </div>
          <div class="star-footer"><span data-star-stats>正在读取星群…</span><span>拖拽平移 · 滚轮缩放 · 点击星点查看档案</span></div>
        </div>
      </section>

      <aside class="explore-side is-collapsed" data-explore-side>
        <button type="button" class="explore-drawer-rail" data-drawer-rail aria-label="打开阅读图例">
          <i aria-hidden="true">读</i>
          <span data-drawer-rail-label>图例</span>
        </button>
        <section class="explore-drawer" data-explore-drawer hidden>
          <header class="explore-drawer-head">
            <div>
              <p class="explore-panel-kicker">EXPLORE DRAWER</p>
              <h2 data-drawer-heading>非遗档案</h2>
            </div>
            <button type="button" class="explore-detail-close" data-detail-close title="收起档案" aria-label="收起档案">×</button>
          </header>
          <div class="explore-drawer-tabs" role="tablist" aria-label="抽屉内容">
            <button type="button" class="is-active" data-drawer-tab="detail" role="tab" aria-selected="true">档案</button>
            <button type="button" data-drawer-tab="legend" role="tab" aria-selected="false">图例</button>
          </div>
          <div class="explore-drawer-body" data-drawer-body>
            <section class="explore-detail" data-explore-detail>
              <p class="explore-detail-empty">正在读取非遗档案…</p>
            </section>
            <section class="explore-legend-panel" data-explore-legend-panel hidden>
              <div class="explore-panel-head">
                <div><p class="explore-panel-kicker">READING</p><h2 data-explore-legend-title>星群读法</h2></div>
                <span class="explore-mini-seal" data-explore-mini-seal aria-hidden="true">星</span>
              </div>
              <div class="explore-legend" data-explore-legend></div>
            </section>
          </div>
        </section>
      </aside>
    </div>

    <section class="explore-routes" aria-label="推荐探索路线">
      <div class="routes-head"><p class="visual-kicker">CURATED PATHS</p><h2>推荐探索路线</h2></div>
      <div class="routes-grid">
        <button type="button" class="route-card" data-explore-route="jiangsu"><span><i>01</i>沿运河看江苏</span><small>三步从地域星群走到项目与传承人</small></button>
        <button type="button" class="route-card" data-explore-route="gaps"><span><i>02</i>追踪一个缺环</span><small>从无传承人项目反查门类与地区</small></button>
        <button type="button" class="route-card" data-explore-route="chain"><span><i>03</i>一门技艺到一个人</span><small>逐步展开项目、人物与另一条关联</small></button>
      </div>
    </section>

    <p class="explore-disclaimer">星点位置为行政区示意，未绘制边界；时间星河按名录批次分层。档案环表示图片、录音与传承人信息的综合完整度，仅展示已发布内容。</p>
  </div>`,
  });
}
