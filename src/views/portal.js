import { BRAND, PORTAL } from '../config.js';
import { h, truncate } from '../util.js';
import { uploadUrl, portalLayout } from './layout.js';
import { emptyState, gallery, guestAiPanel, levelChip, paginationBar, videoEmbed } from './components.js';

function coverOr(filePath, label, className = 'card-cover') {
  const url = uploadUrl(filePath);
  if (!url) {
    return `<div class="${className} cover-empty"><span>${h(label)}</span></div>`;
  }
  return `<div class="${className}"><img src="${h(url)}" alt="${h(label)}" loading="lazy"></div>`;
}

function projectCard(project) {
  const tags = [project.category_name, project.level_name].filter(Boolean);
  return `<a class="card card-project" href="/projects/${project.id}">
    ${coverOr(project.cover_path, project.name)}
    <div class="card-body">
      <div class="card-tags">${tags.map((t) => `<span class="chip chip-plain">${h(t)}</span>`).join('')}</div>
      <h3 class="card-title">${h(project.name)}</h3>
      <p class="card-text">${h(truncate(project.summary, 82))}</p>
      <div class="card-foot">
        <span class="card-loc">${h(project.region_label || project.region_name || '')}</span>
        <span class="card-go">查看详情 →</span>
      </div>
    </div>
  </a>`;
}

function personMark(name) {
  const mark = Array.from(String(name || '传')).slice(0, 2).join('');
  return `<span class="person-seal" aria-hidden="true">${h(mark)}</span>`;
}

function inheritorCard(person) {
  const region = person.region_label || person.region_name || '地区待补';
  const story = person.story_title || '传承实践与人物档案';
  const skill = truncate(person.skill || person.experience || '记录其从艺经历、技艺特点与代表项目。', 64);
  return `<a class="card card-person" href="/inheritors/${person.id}">
    ${personMark(person.name)}
    <div class="card-body person-card-body">
      <div class="person-card-head">
        <span class="person-card-kicker">传承人人物志</span>
        <div class="card-tags">${levelChip(person.level_name)}${person.ethnic ? `<span class="chip chip-plain">${h(person.ethnic)}</span>` : ''}</div>
      </div>
      <h3 class="card-title person-card-name">${h(person.name)}</h3>
      <p class="person-card-story">${h(story)}</p>
      <p class="person-card-skill">${h(skill)}</p>
      <div class="card-foot person-card-foot">
        <span>${h(region)}${person.batch ? ` · ${h(person.batch)}` : ''}</span>
        <span class="card-go">阅读人物志 →</span>
      </div>
    </div>
  </a>`;
}

function organizationCard(org) {
  return `<a class="card card-org" href="/organizations/${org.id}">
    ${coverOr(org.cover_path, org.name)}
    <div class="card-body">
      <div class="card-tags">
        <span class="chip chip-plain">${h(org.org_type || '传承基地')}</span>
        ${org.is_open ? '<span class="chip chip-green">对外开放</span>' : '<span class="chip chip-plain">预约开放</span>'}
      </div>
      <h3 class="card-title">${h(org.name)}</h3>
      <p class="card-text">${h(truncate(org.experience || org.intro, 78))}</p>
      <ul class="card-meta-list">
        <li><b>地址</b>${h(org.address || '详见馆内公告')}</li>
        <li><b>开放</b>${h(org.open_hours || '请电话咨询')}</li>
        ${org.phone ? `<li><b>电话</b>${h(org.phone)}</li>` : ''}
      </ul>
      <div class="card-foot"><span class="card-loc">${h(org.region_label || org.region_name || '')}</span><span class="card-go">探访信息 →</span></div>
    </div>
  </a>`;
}

/**
 * 探访线索卡片：只展示官方名录能支撑的事实（所属地区、项目数、传承人数、代表项目），
 * 不展示任何未经核实的地址与电话。
 */
function provinceCard(province) {
  const samples = (province.samples || [])
    .map((item) => `<a class="visit-sample" href="/projects/${item.id}">${h(item.name)}</a>`)
    .join('');
  return `<article class="card card-visit">
    <div class="card-body">
      <div class="card-tags">
        <span class="chip chip-plain">${h(province.name)}</span>
        ${province.projectCount ? `<span class="chip chip-red">项目 ${province.projectCount}</span>` : ''}
        ${province.inheritorCount ? `<span class="chip chip-green">传承人 ${province.inheritorCount}</span>` : ''}
      </div>
      <h3 class="card-title">${h(province.name)}的非遗线索</h3>
      ${samples ? `<div class="visit-samples">${samples}</div>` : '<p class="card-text">该地区暂无已发布项目。</p>'}
      <p class="visit-hint">具体保护单位、开放时间与预约方式，请以当地文化和旅游部门公布信息为准。</p>
      <div class="card-foot">
        <span class="card-loc">共 ${province.projectCount} 个国家级项目</span>
        <a class="card-go" href="/projects?region_id=${province.id}">查看全部 →</a>
      </div>
    </div>
  </article>`;
}

export function homeView(data) {
  const { stats, categories, projects, inheritors, organizations, images, regions, levels, visitProvinces = [] } = data;
  const categoryCards = categories
    .map(
      (c) => `<a class="cat-card" href="/projects?category_id=${c.id}">
        <span class="cat-code">${h(c.code)}</span>
        <span class="cat-name">${h(c.name)}</span>
        <span class="cat-count">${c.total} 项</span>
      </a>`,
    )
    .join('');

  const regionChips = regions
    .map((r) => `<a class="chip chip-link" href="/projects?region_id=${r.id}">${h(r.name)}<em>${r.total}</em></a>`)
    .join('');

  const levelBars = levels
    .map((l) => {
      const max = Math.max(...levels.map((x) => x.total), 1);
      const pct = Math.round((l.total / max) * 100);
      return `<div class="level-bar"><span class="level-bar-label">${h(l.name)}</span>
        <span class="level-bar-track"><i style="width:${pct}%"></i></span>
        <span class="level-bar-value">${l.total}</span></div>`;
    })
    .join('');

  const galleryItems = images
    .map(
      (img) => `<a class="wall-item" href="${h(img.href)}">
        <img src="${h(uploadUrl(img.file_path))}" alt="${h(img.title)}" loading="lazy">
        <span class="wall-caption">${h(truncate(img.title, 18))}</span>
      </a>`,
    )
    .join('');

  const body = `
  <section class="hero">
    <div class="wrap hero-inner">
      <p class="hero-eyebrow">非物质文化遗产 · 数字资源平台</p>
      <h1 class="hero-title">${h(BRAND.name)}</h1>
      <p class="hero-sub">${h(BRAND.subtitle)}</p>
      <form class="hero-search" action="/projects" method="get" role="search">
        <input type="search" name="q" placeholder="输入项目名称、传承人、技艺关键词，例如：蓝印花布" aria-label="搜索非遗项目">
        <button type="submit">开始探索</button>
      </form>
      <div class="hero-stats">
        <div><strong>${stats.projects}</strong><span>非遗项目</span></div>
        <div><strong>${stats.inheritors}</strong><span>传承人</span></div>
        <div><strong>${stats.organizations}</strong><span>传承基地</span></div>
        <div><strong>${stats.attachments}</strong><span>影像档案</span></div>
      </div>
    </div>
  </section>

  <section class="wrap section ai-section">
    <div class="ai-card">
      <div class="ai-head">
        <div>
          <h2 class="section-title">问一问数字讲解员 · 小遗</h2>
          <p class="section-sub">可以提问、语音输入，也可以让讲解员朗读回答。内容基于站内已发布非遗档案。</p>
        </div>
        <span class="ai-badge">数字展厅 · 语音导览</span>
      </div>
      ${guestAiPanel({
        uid: 'home',
        variant: 'inline',
        intro: '欢迎来到非遗数字展厅。我是讲解员小遗，可以为你介绍项目、朗读回答，也支持语音提问。',
        placeholder: '例如：苏绣用什么材料 / 内蒙古有哪些非遗',
      })}
      <p class="ai-footnote">AI 只做介绍与查询，不会修改任何档案；回答仅供了解，权威信息以官方名录与保护单位公布为准。</p>
    </div>
  </section>

  ${
    PORTAL.showExplore
      ? `<section class="wrap section star-teaser-section">
    <a class="star-teaser" href="/explore">
      <div class="star-teaser-copy">
        <p class="star-teaser-eyebrow">夜观 · 非遗探索</p>
        <h2>从地理星区到关系谱系，换一种方式看非遗</h2>
        <p>先用省级星区看分布，再进入关系谱系读项目、传承人与门类之间的联系。两种探索方式共用一个深色工作台。</p>
        <span class="star-teaser-cta">进入探索 →</span>
      </div>
      <div class="star-teaser-visual" aria-hidden="true">
        <span class="star-teaser-orbit orbit-a"></span>
        <span class="star-teaser-orbit orbit-b"></span>
        <i class="star-dot dot-a"></i><i class="star-dot dot-b"></i><i class="star-dot dot-c"></i>
        <i class="star-dot dot-d"></i><i class="star-dot dot-e"></i><i class="star-dot dot-f"></i>
        <b>星</b>
      </div>
    </a>
  </section>`
      : ''
  }

  <section class="wrap section">
    <header class="section-head">
      <div><h2 class="section-title">十大门类，从这里开始逛</h2><p class="section-sub">按项目类别进入，看看这片土地上流传下来的手艺、曲调与风俗。</p></div>
      <a class="section-more" href="/projects">浏览全部项目 →</a>
    </header>
    <div class="cat-grid">${categoryCards}</div>
  </section>

  <section class="wrap section">
    <header class="section-head">
      <div><h2 class="section-title">精选非遗推荐</h2><p class="section-sub">由保护机构推荐的必看项目，适合第一次了解非遗的你。</p></div>
      <a class="section-more" href="/projects?featured=1">更多推荐 →</a>
    </header>
    <div class="card-grid">${projects.length ? projects.map(projectCard).join('') : emptyState('暂无推荐项目')}</div>
  </section>

  <section class="wrap section">
    <header class="section-head">
      <div><h2 class="section-title">传承人故事</h2><p class="section-sub">一门手艺背后，是一个人的大半辈子。</p></div>
      <a class="section-more" href="/inheritors">全部传承人 →</a>
    </header>
    <div class="card-grid">${inheritors.length ? inheritors.map(inheritorCard).join('') : emptyState('暂无传承人数据')}</div>
  </section>

  ${
    PORTAL.showVisitSection
      ? `<section class="wrap section">
    <header class="section-head">
      <div><h2 class="section-title">探访线索</h2><p class="section-sub">按地区看看国家级非遗分布在哪些地方，方便规划实地探访。</p></div>
      <a class="section-more" href="/organizations">查看全部地区 →</a>
    </header>
    <div class="card-grid">${visitProvinces.length ? visitProvinces.slice(0, 6).map(provinceCard).join('') : emptyState('暂无探访线索')}</div>
    <p class="visit-disclaimer">说明：本栏目只展示官方名录可支撑的地区与项目信息，不含未经核实的地址与电话；出行前请以当地文化和旅游部门公布信息为准。</p>
  </section>`
      : ''
  }

  <section class="wrap section">
    <div class="split-panel">
      <div class="panel-box">
        <h2 class="section-title">按地区逛非遗</h2>
        <p class="section-sub">从城市到区县，找到离你最近的非遗。</p>
        <div class="chip-row">${regionChips}</div>
      </div>
      <div class="panel-box">
        <h2 class="section-title">名录级别分布</h2>
        <p class="section-sub">国家级、省级、市级、县级四级名录体系。</p>
        <div class="level-bars">${levelBars}</div>
      </div>
    </div>
  </section>

  <section class="wrap section">
    <header class="section-head">
      <div><h2 class="section-title">数字影像墙</h2><p class="section-sub">项目采集的现场影像、作品细节与传承记录。</p></div>
    </header>
    <div class="wall-grid">${galleryItems || emptyState('暂无影像资料', '管理员上传档案图片后将在此展示。')}</div>
  </section>
  `;
  return portalLayout({
    title: '',
    description: BRAND.subtitle,
    active: 'home',
    body,
    scripts: ['js/public-ai.js'],
  });
}

/** 详情页右下角的悬浮入口：不遮挡正文，点开才展开对话面板 */
function floatingAi(context, { projectId = null } = {}) {
  const hasProject = Number.isInteger(Number(projectId)) && Number(projectId) > 0;
  return `<div class="ai-fab" data-ai-fab>
    <button class="ai-fab-toggle" type="button" data-ai-toggle aria-label="打开数字讲解员">讲解</button>
    <div class="ai-fab-panel" data-ai-panel hidden>
      <header class="ai-fab-head">
        <strong>${hasProject ? '数字讲解员 · 小遗' : 'AI 小助手'}</strong>
        <button type="button" class="ai-fab-close" data-ai-close aria-label="收起">×</button>
      </header>
      ${guestAiPanel({
        uid: 'detail',
        variant: 'fab',
        intro: `关于${h(context)}，你可以问我它的来历、技艺特点或相关项目。`,
        placeholder: `就${h(context)}提问…`,
        projectId: hasProject ? Number(projectId) : null,
        projectName: hasProject ? context : '',
      })}
    </div>
  </div>`;
}

function filterBar({ resource, query, dicts, levels, categories, regions, extra = '' }) {
  const isProject = resource.key === 'project';
  const isPerson = resource.key === 'inheritor';
  const categoryOptions = categories
    .map((c) => `<option value="${c.id}"${String(query.category_id) === String(c.id) ? ' selected' : ''}>${h(c.name)}</option>`)
    .join('');
  const levelOptions = levels
    .map((l) => `<option value="${l.id}"${String(query.level_id) === String(l.id) ? ' selected' : ''}>${h(l.name)}</option>`)
    .join('');
  const regionOptions = regions
    .map((r) => `<option value="${r.id}"${String(query.region_id) === String(r.id) ? ' selected' : ''}>${h(r.label)}</option>`)
    .join('');
  const sortOptions = (isPerson
    ? [
        { value: 'updated_at', label: '最近更新' },
        { value: 'certified_year', label: '认定年份' },
        { value: 'name', label: '姓名排序' },
      ]
    : [
        { value: 'updated_at', label: '最近更新' },
        { value: 'published_year', label: '公布年份' },
        { value: 'certified_year', label: '认定年份' },
        { value: 'name', label: '名称排序' },
      ])
    .map((o) => `<option value="${o.value}"${query.sort === o.value ? ' selected' : ''}>${h(o.label)}</option>`)
    .join('');
  const categoryField = isProject
    ? `<select name="category_id"><option value="">全部类别</option>${categoryOptions}</select>`
    : '';

  return `<form class="filter-bar${isPerson ? ' filter-bar-person' : ''}" method="get" action="${resource.publicPath}">
    <input class="filter-search" type="search" name="q" value="${h(query.q || '')}" placeholder="${isPerson ? '搜索姓名、技艺、地区' : '搜索名称、地区、关键词'}">
    ${categoryField}
    <select name="level_id"><option value="">全部级别</option>${levelOptions}</select>
    <select name="region_id"><option value="">全部地区</option>${regionOptions}</select>
    <select name="sort">${sortOptions}</select>
    ${extra}
    <button class="btn btn-primary" type="submit">筛选</button>
    <a class="btn btn-ghost" href="${resource.publicPath}">重置</a>
  </form>`;
}

export function listView({ resource, pageInfo, query, dicts, categories, levels, regions }) {
  const isPerson = resource.key === 'inheritor';
  const isOrg = resource.key === 'organization';
  const cards = pageInfo.items
    .map((item) => (isPerson ? inheritorCard(item) : isOrg ? organizationCard(item) : projectCard(item)))
    .join('');

  const pageHead = isPerson
    ? `<section class="page-head page-head-inheritors">
    <div class="wrap">
      <nav class="breadcrumb"><a href="/">首页</a><i>/</i><span>传承人</span></nav>
      <div class="inheritor-title-row">
        <div>
          <p class="page-eyebrow">人物志 · 口述与技艺</p>
          <h1 class="page-title">传承人人物志</h1>
          <p class="page-sub">以人为轴，读一门手艺的来处、坚守与新生。这里记录代表性传承人的从艺经历、技艺特点与代表项目。</p>
        </div>
        <div class="inheritor-tally"><strong>${pageInfo.total}</strong><span>位已发布传承人</span></div>
      </div>
    </div>
  </section>`
    : `<section class="page-head">
    <div class="wrap">
      <nav class="breadcrumb"><a href="/">首页</a><i>/</i><span>${h(resource.label)}</span></nav>
      <h1 class="page-title">${h(isOrg ? '探访体验点' : resource.label)}</h1>
      <p class="page-sub">${h(
        isOrg
          ? '对公众开放的传习所、展示馆与传承基地，可到场参观、参与体验活动。'
          : '已发布的非物质文化遗产代表性项目，可按类别、级别与地区筛选。',
      )}</p>
    </div>
  </section>`;

  const body = `
  ${pageHead}
  <section class="wrap section">
    ${filterBar({ resource, query, dicts, levels, categories, regions })}
    <div class="list-summary">共找到 <strong>${pageInfo.total}</strong> 条结果${query.q ? `，关键词「${h(query.q)}」` : ''}</div>
    <div class="card-grid${isPerson ? ' person-card-grid' : ''}">${cards || emptyState('没有符合条件的记录', '试试减少筛选条件或更换关键词。')}</div>
    ${paginationBar(resource.publicPath, query, pageInfo)}
  </section>`;
  return portalLayout({
    title: isPerson ? '传承人人物志' : resource.label,
    description: `${resource.label}列表 - ${BRAND.name}`,
    active: resource.key === 'inheritor' ? 'inheritors' : isOrg ? 'organizations' : 'projects',
    body,
    keyword: query.q || '',
  });
}

export function projectDetailView(data) {
  const { project, inheritors, attachments, related, organization, relatedProjects } = data;
  const tags = [project.category_name, project.level_name, project.batch].filter(Boolean);
  const meta = [
    ['项目编号', project.code],
    ['官方编号', project.source_code],
    ['所属类别', project.category_name],
    ['名录级别', project.level_name],
    ['公布批次', project.batch],
    ['公布年份', project.published_year],
    ['申报地区', project.region_text || project.region_label],
    ['保护单位', project.organization_name || project.protection_unit],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<div class="meta-item"><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`)
    .join('');

  const personCards = inheritors.length
    ? `<section class="block"><h2 class="section-title">代表性传承人</h2>
        <div class="card-grid">${inheritors.map((p) => inheritorCard({ ...p, region_label: p.region_label })).join('')}</div></section>`
    : '';

  const visitBlock = organization
    ? `<section class="block visit-card">
        <h2 class="section-title">如何体验 / 探访</h2>
        <p class="visit-lead">该项目由 <strong>${h(organization.name)}</strong> 保护传承，可前往实地参观体验。</p>
        <div class="visit-grid">
          <div><dt>开放时间</dt><dd>${h(organization.open_hours || '请电话咨询')}</dd></div>
          <div><dt>地址</dt><dd>${h(organization.address || '—')}</dd></div>
          <div><dt>预约电话</dt><dd>${h(organization.phone || '—')}</dd></div>
          <div><dt>交通提示</dt><dd>${h(organization.traffic || '—')}</dd></div>
        </div>
        ${organization.experience ? `<p class="visit-exp">可参与体验：${h(organization.experience)}</p>` : ''}
        <a class="btn btn-primary" href="/organizations/${organization.id}">查看基地详情 →</a>
      </section>`
    : '';

  const relatedBlock = relatedProjects.length
    ? `<section class="block"><h2 class="section-title">同类非遗推荐</h2>
        <div class="card-grid">${relatedProjects.map(projectCard).join('')}</div></section>`
    : '';

  const body = `
  <section class="detail-hero"${project.cover_path ? ` style="--cover:url('${h(uploadUrl(project.cover_path))}')"` : ''}>
    <div class="wrap detail-hero-inner">
      <nav class="breadcrumb"><a href="/">首页</a><i>/</i><a href="/projects">逛非遗</a><i>/</i><span>${h(project.name)}</span></nav>
      <div class="detail-tags">${tags.map((t) => `<span class="chip chip-solid">${h(t)}</span>`).join('')}</div>
      <h1 class="detail-title">${h(project.name)}</h1>
      <p class="detail-lead">${h(project.summary)}</p>
    </div>
  </section>
  <section class="wrap detail-body">
    <div class="detail-main">
      <dl class="meta-grid">${meta}</dl>
      ${
        PORTAL.showContentSource && project.content_source
          ? `<p class="content-source">内容来源：${h(project.content_source)}${project.content_source.includes('AI') ? '（AI 起草，已由人工校对）' : ''}</p>`
          : ''
      }
      ${project.history ? `<section class="block"><h2 class="section-title">历史渊源</h2><p class="prose">${h(project.history)}</p></section>` : ''}
      ${project.feature ? `<section class="block"><h2 class="section-title">技艺特征与表现形态</h2><p class="prose">${h(project.feature)}</p></section>` : ''}
      ${project.lineage ? `<section class="block"><h2 class="section-title">传承谱系</h2><p class="prose">${h(project.lineage)}</p></section>` : ''}
      ${project.video_url ? `<section class="block"><h2 class="section-title">影像资料</h2>${videoEmbed(project.video_url)}</section>` : ''}
      ${gallery(attachments)}
      ${personCards}
      ${visitBlock}
      ${relatedBlock}
    </div>
    <aside class="detail-side">
      <div class="side-card">
        <h3>游客提示</h3>
        <p>本页信息由保护单位报送并经审核发布，如需参观或参与体验，建议提前电话确认开放时间与预约要求。</p>
      </div>
      ${project.keywords ? `<div class="side-card"><h3>关键词</h3><div class="chip-row">${String(project.keywords).split(/[、,，;；]+/).filter(Boolean).map((k) => `<a class="chip chip-link" href="/projects?q=${encodeURIComponent(k)}">${h(k)}</a>`).join('')}</div></div>` : ''}
      ${related && related.length ? `<div class="side-card"><h3>相关传承人</h3><ul class="side-list">${related.map((r) => `<li><a href="/inheritors/${r.id}">${h(r.name)}</a><span>${h(r.level_name || '')}</span></li>`).join('')}</ul></div>` : ''}
      ${PORTAL.showExplore ? `<div class="side-card star-locate-card"><h3>从关系里看</h3><p>把项目放回地理星区与关系谱系，看看它与门类、地区、传承人之间的关系。</p><div class="side-action-row"><a class="btn btn-primary" href="/explore?lens=region&project=${project.id}">星图定位</a><a class="btn btn-ghost" href="/explore?lens=project&project=${project.id}">查看谱系</a></div></div>` : ''}
    </aside>
  </section>
  ${floatingAi(project.name, { projectId: project.id })}`;
  return portalLayout({
    title: project.name,
    description: truncate(project.summary, 120),
    active: 'projects',
    body,
    scripts: ['js/public-ai.js'],
  });
}

function personNarrative(index, title, content) {
  if (!String(content || '').trim()) return '';
  return `<section class="block person-narrative">
    <div class="person-narrative-index" aria-hidden="true">${h(index)}</div>
    <div class="person-narrative-body">
      <h2 class="section-title">${h(title)}</h2>
      <p class="prose">${h(content)}</p>
    </div>
  </section>`;
}

export function inheritorDetailView(data) {
  const { person, projects, attachments, sameCategory } = data;
  const meta = [
    ['档案编号', person.code],
    ['官方编号', person.source_code],
    ['性别', person.gender],
    ['民族', person.ethnic],
    ['出生年月', person.birth_month],
    ['从艺起始', person.career_start_year ? `${person.career_start_year} 年` : ''],
    ['认定级别', person.level_name],
    ['认定批次', person.batch],
    ['所在地', person.region_label],
    ['传习场所', person.address],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<div class="meta-item"><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`)
    .join('');

  const mark = Array.from(String(person.name || '传')).slice(0, 2).join('');
  const watermark = Array.from(String(person.name || '传'))[0] || '传';
  const story = person.story_title || truncate(person.skill || person.experience || '人物档案与传承实践记录', 110);
  const facts = [
    ['认定级别', person.level_name],
    ['所在地', person.region_label],
    ['民族', person.ethnic],
    ['从艺起始', person.career_start_year ? `${person.career_start_year} 年` : ''],
  ].filter(([, value]) => value);
  const nonImageAttachments = attachments.filter((item) => item.kind !== 'image');
  const sideProjects = projects
    .map((project) => `<li><a href="/projects/${project.id}">${h(project.name)}</a><em>${h(project.category_name || '')}</em></li>`)
    .join('');

  const body = `
  <section class="detail-hero inheritor-hero">
    <span class="inheritor-hero-watermark" aria-hidden="true">${h(watermark)}</span>
    <div class="wrap detail-hero-inner">
      <nav class="breadcrumb"><a href="/">首页</a><i>/</i><a href="/inheritors">传承人</a><i>/</i><span>${h(person.name)}</span></nav>
      <div class="inheritor-hero-grid">
        <div class="inheritor-seal" aria-hidden="true"><span>${h(mark)}</span></div>
        <div class="inheritor-hero-copy">
          <div class="detail-tags">${levelChip(person.level_name)}${person.ethnic ? `<span class="chip chip-solid">${h(person.ethnic)}</span>` : ''}${person.batch ? `<span class="chip chip-solid">${h(person.batch)}</span>` : ''}</div>
          <p class="inheritor-hero-kicker">代表性传承人 · 人物志</p>
          <h1 class="detail-title">${h(person.name)}</h1>
          <p class="detail-lead">${h(story)}</p>
          ${facts.length ? `<div class="inheritor-hero-facts">${facts.map(([label, value]) => `<span><b>${h(value)}</b><em>${h(label)}</em></span>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>
  </section>
  <section class="wrap detail-body">
    <div class="detail-main">
      <dl class="meta-grid meta-grid-person">${meta}</dl>
      ${personNarrative('01', '从艺经历', person.experience)}
      ${personNarrative('02', '技艺特点', person.skill)}
      ${personNarrative('03', '代表作品与荣誉', person.honors)}
      ${person.video_url ? `<section class="block person-media-block"><div class="person-narrative-index" aria-hidden="true">影</div><div class="person-narrative-body"><h2 class="section-title">影像资料</h2>${videoEmbed(person.video_url)}</div></section>` : ''}
      ${gallery(nonImageAttachments, { title: '影音与文献' })}
      ${projects.length ? `<section class="block person-related-block"><h2 class="section-title">代表性项目</h2><div class="card-grid">${projects.map(projectCard).join('')}</div></section>` : ''}
      ${sameCategory.length ? `<section class="block person-related-block"><h2 class="section-title">同类传承人</h2><div class="card-grid person-card-grid">${sameCategory.map(inheritorCard).join('')}</div></section>` : ''}
    </div>
    <aside class="detail-side">
      <div class="side-card person-profile-card">
        <span class="side-card-eyebrow">PERSONAL ARCHIVE</span>
        <h3>${h(person.name)}</h3>
        <dl class="side-facts">${facts.map(([label, value]) => `<div><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl>
        ${person.code ? `<p class="side-code">档案编号 · ${h(person.code)}</p>` : ''}
      </div>
      ${projects.length ? `<div class="side-card"><h3>传承项目</h3><ul class="side-list">${sideProjects}</ul></div>` : ''}
      <div class="side-card"><h3>联系与探访</h3><p>希望向传承人学习或采访记录，可联系当地保护单位协助对接，请尊重传承人的正常生活与工作安排。</p></div>
      <div class="side-card side-note-card"><h3>资料说明</h3><p>本页以文字、口述与项目档案呈现传承人信息；内容用于非遗知识普及与教学演示。</p></div>
      ${PORTAL.showExplore ? `<div class="side-card star-locate-card"><h3>关系谱系</h3><p>从传承人出发，查看其关联项目、门类与地区在关系谱系中的位置。</p><a class="btn btn-ghost btn-block" href="/explore?lens=person&inheritor=${person.id}">查看关系谱系 →</a></div>` : ''}
    </aside>
  </section>
  ${floatingAi(`${person.name}的相关内容`)}`;

  return portalLayout({
    title: `${person.name} · 传承人人物志`,
    description: truncate(person.story_title || person.skill || `${person.name} - ${BRAND.name}`, 120),
    active: 'inheritors',
    body,
    scripts: ['js/public-ai.js'],
  });
}

/**
 * 探访线索页：按省级行政区聚合，只呈现官方名录可支撑的事实。
 * 已核实（verified=1）的基地才展示地址与电话。
 */
export function visitGuideView({ provinces = [], verifiedOrganizations = [] }) {
  const cards = provinces.map(provinceCard).join('');
  const verifiedBlock = verifiedOrganizations.length
    ? `<section class="section">
        <header class="section-head"><div><h2 class="section-title">已核实的保护单位</h2><p class="section-sub">以下信息已由保护单位或当地文旅部门核实。</p></div></header>
        <div class="card-grid">${verifiedOrganizations
          .map(
            (org) => `<article class="card card-visit"><div class="card-body">
              <div class="card-tags"><span class="chip chip-green">已核实</span><span class="chip chip-plain">${h(org.org_type || '保护单位')}</span></div>
              <h3 class="card-title">${h(org.name)}</h3>
              <ul class="card-meta-list">
                <li><b>地址</b>${h(org.address || '—')}</li>
                <li><b>开放</b>${h(org.open_hours || '请电话咨询')}</li>
                <li><b>电话</b>${h(org.phone || '—')}</li>
              </ul>
              ${org.source_url ? `<p class="visit-hint">来源：<a href="${h(org.source_url)}" target="_blank" rel="noopener">${h(org.source_url)}</a></p>` : ''}
            </div></article>`,
          )
          .join('')}</div>
      </section>`
    : '';

  const body = `
  <section class="page-head">
    <div class="wrap">
      <nav class="breadcrumb"><a href="/">首页</a><i>/</i><span>探访线索</span></nav>
      <h1 class="page-title">探访线索</h1>
      <p class="page-sub">按地区查看国家级非遗分布，规划你的实地探访路线。</p>
    </div>
  </section>
  <section class="wrap section">
    <div class="visit-note">
      <b>关于本栏目</b>
      <p>这里只展示官方名录可支撑的地区与项目信息。具体保护单位、开放时间与预约方式因机构而异，请以当地文化和旅游部门公布信息为准；我们不会展示未核实的联系方式。</p>
    </div>
    <div class="card-grid">${cards || emptyState('暂无探访线索')}</div>
  </section>
  <div class="wrap">${verifiedBlock}</div>`;

  return portalLayout({
    title: '探访线索',
    description: `国家级非遗分布与探访线索 - ${BRAND.name}`,
    active: 'organizations',
    body,
    scripts: ['js/public-ai.js'],
  });
}

export function organizationDetailView(data) {
  const { org, projects, attachments } = data;
  const meta = [
    ['单位编号', org.code],
    ['单位类型', org.org_type],
    ['所在地区', org.region_label],
    ['成立年份', org.founded_year],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<div class="meta-item"><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`)
    .join('');

  const body = `
  <section class="detail-hero"${org.cover_path ? ` style="--cover:url('${h(uploadUrl(org.cover_path))}')"` : ''}>
    <div class="wrap detail-hero-inner">
      <nav class="breadcrumb"><a href="/">首页</a><i>/</i><a href="/organizations">探访体验点</a><i>/</i><span>${h(org.name)}</span></nav>
      <div class="detail-tags">
        <span class="chip chip-solid">${h(org.org_type || '传承基地')}</span>
        ${org.is_open ? '<span class="chip chip-green">对公众开放</span>' : '<span class="chip chip-plain">预约开放</span>'}
      </div>
      <h1 class="detail-title">${h(org.name)}</h1>
      <p class="detail-lead">${h(truncate(org.intro, 140))}</p>
    </div>
  </section>
  <section class="wrap detail-body">
    <div class="detail-main">
      <section class="block visit-card">
        <h2 class="section-title">探访信息</h2>
        <div class="visit-grid">
          <div><dt>开放时间</dt><dd>${h(org.open_hours || '请电话咨询')}</dd></div>
          <div><dt>详细地址</dt><dd>${h(org.address || '—')}</dd></div>
          <div><dt>预约电话</dt><dd>${h(org.phone || '—')}</dd></div>
          <div><dt>联系人</dt><dd>${h(org.manager || '—')}</dd></div>
          <div class="is-wide"><dt>交通提示</dt><dd>${h(org.traffic || '—')}</dd></div>
        </div>
        ${org.experience ? `<p class="visit-exp">可参与体验：${h(org.experience)}</p>` : ''}
      </section>
      <dl class="meta-grid">${meta}</dl>
      ${org.intro ? `<section class="block"><h2 class="section-title">单位简介</h2><p class="prose">${h(org.intro)}</p></section>` : ''}
      ${projects.length ? `<section class="block"><h2 class="section-title">在此保护传承的项目</h2><div class="card-grid">${projects.map(projectCard).join('')}</div></section>` : ''}
      ${gallery(attachments, { title: '场馆影像' })}
    </div>
    <aside class="detail-side">
      <div class="side-card"><h3>参观须知</h3><p>团队参观与手作体验建议提前 3 个工作日电话预约；进入传习场所请听从工作人员安排，爱护展品与工具。</p></div>
      ${org.email ? `<div class="side-card"><h3>联系邮箱</h3><p>${h(org.email)}</p></div>` : ''}
    </aside>
  </section>`;
  return portalLayout({
    title: org.name,
    description: truncate(org.intro, 120),
    active: 'organizations',
    body,
  });
}
