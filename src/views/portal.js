import { BRAND } from '../config.js';
import { h, truncate } from '../util.js';
import { uploadUrl, portalLayout } from './layout.js';
import { emptyState, gallery, levelChip, paginationBar, videoEmbed } from './components.js';

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

function inheritorCard(person) {
  return `<a class="card card-person" href="/inheritors/${person.id}">
    ${coverOr(person.photo_path, person.name, 'card-portrait')}
    <div class="card-body">
      <div class="card-tags">${levelChip(person.level_name)}<span class="chip chip-plain">${h(person.gender || '')}${person.ethnic ? ` · ${h(person.ethnic)}` : ''}</span></div>
      <h3 class="card-title">${h(person.name)}</h3>
      <p class="card-story">${h(truncate(person.story_title || person.skill || '长期从事非遗技艺传承实践', 54))}</p>
      <div class="card-foot"><span class="card-loc">${h(person.region_label || person.region_name || '')}</span><span class="card-go">了解传承故事 →</span></div>
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

export function homeView(data) {
  const { stats, categories, projects, inheritors, organizations, images, regions, levels } = data;
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

  <section class="wrap section">
    <header class="section-head">
      <div><h2 class="section-title">探访体验点</h2><p class="section-sub">可以到场看、可以动手做——这些传习基地与展示馆对公众开放。</p></div>
      <a class="section-more" href="/organizations">查看全部体验点 →</a>
    </header>
    <div class="card-grid">${organizations.length ? organizations.map(organizationCard).join('') : emptyState('暂无开放体验点')}</div>
  </section>

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
  });
}

function filterBar({ resource, query, dicts, levels, categories, regions, extra = '' }) {
  const categoryOptions = categories
    .map((c) => `<option value="${c.id}"${String(query.category_id) === String(c.id) ? ' selected' : ''}>${h(c.name)}</option>`)
    .join('');
  const levelOptions = levels
    .map((l) => `<option value="${l.id}"${String(query.level_id) === String(l.id) ? ' selected' : ''}>${h(l.name)}</option>`)
    .join('');
  const regionOptions = regions
    .map((r) => `<option value="${r.id}"${String(query.region_id) === String(r.id) ? ' selected' : ''}>${h(r.label)}</option>`)
    .join('');
  const sortOptions = [
    { value: 'updated_at', label: '最近更新' },
    { value: 'published_year', label: '公布年份' },
    { value: 'certified_year', label: '认定年份' },
    { value: 'name', label: '名称排序' },
  ]
    .map((o) => `<option value="${o.value}"${query.sort === o.value ? ' selected' : ''}>${h(o.label)}</option>`)
    .join('');

  return `<form class="filter-bar" method="get" action="${resource.publicPath}">
    <input class="filter-search" type="search" name="q" value="${h(query.q || '')}" placeholder="搜索名称、地区、关键词">
    <select name="category_id"><option value="">全部类别</option>${categoryOptions}</select>
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

  const body = `
  <section class="page-head">
    <div class="wrap">
      <nav class="breadcrumb"><a href="/">首页</a><i>/</i><span>${h(resource.label)}</span></nav>
      <h1 class="page-title">${h(isOrg ? '探访体验点' : resource.label)}</h1>
      <p class="page-sub">${h(
        isOrg
          ? '对公众开放的传习所、展示馆与传承基地，可到场参观、参与体验活动。'
          : isPerson
            ? '各级代表性传承人及其技艺与传承故事。'
            : '已发布的非物质文化遗产代表性项目，可按类别、级别与地区筛选。',
      )}</p>
    </div>
  </section>
  <section class="wrap section">
    ${filterBar({ resource, query, dicts, levels, categories, regions })}
    <div class="list-summary">共找到 <strong>${pageInfo.total}</strong> 条结果${query.q ? `，关键词「${h(query.q)}」` : ''}</div>
    <div class="card-grid">${cards || emptyState('没有符合条件的记录', '试试减少筛选条件或更换关键词。')}</div>
    ${paginationBar(resource.publicPath, query, pageInfo)}
  </section>`;
  return portalLayout({
    title: resource.label,
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
    ['所属类别', project.category_name],
    ['名录级别', project.level_name],
    ['公布批次', project.batch],
    ['公布年份', project.published_year],
    ['申报地区', project.region_label],
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
    </aside>
  </section>`;
  return portalLayout({
    title: project.name,
    description: truncate(project.summary, 120),
    active: 'projects',
    body,
  });
}

export function inheritorDetailView(data) {
  const { person, projects, attachments, sameCategory } = data;
  const meta = [
    ['编号', person.code],
    ['性别', person.gender],
    ['民族', person.ethnic],
    ['出生年月', person.birth_month],
    ['认定级别', person.level_name],
    ['认定批次', person.batch],
    ['所在地', person.region_label],
    ['传习场所', person.address],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<div class="meta-item"><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`)
    .join('');

  const body = `
  <section class="detail-hero detail-hero-person">
    <div class="wrap detail-hero-inner">
      <nav class="breadcrumb"><a href="/">首页</a><i>/</i><a href="/inheritors">传承人</a><i>/</i><span>${h(person.name)}</span></nav>
      <div class="person-head">
        ${person.photo_path ? `<div class="person-photo"><img src="${h(uploadUrl(person.photo_path))}" alt="${h(person.name)}" loading="lazy"></div>` : ''}
        <div>
          <div class="detail-tags">${levelChip(person.level_name)}${person.ethnic ? `<span class="chip chip-solid">${h(person.ethnic)}</span>` : ''}</div>
          <h1 class="detail-title">${h(person.name)}</h1>
          ${person.story_title ? `<p class="detail-lead">${h(person.story_title)}</p>` : ''}
        </div>
      </div>
    </div>
  </section>
  <section class="wrap detail-body">
    <div class="detail-main">
      <dl class="meta-grid">${meta}</dl>
      ${person.experience ? `<section class="block"><h2 class="section-title">从艺经历</h2><p class="prose">${h(person.experience)}</p></section>` : ''}
      ${person.skill ? `<section class="block"><h2 class="section-title">技艺特点</h2><p class="prose">${h(person.skill)}</p></section>` : ''}
      ${person.honors ? `<section class="block"><h2 class="section-title">代表作品与荣誉</h2><p class="prose">${h(person.honors)}</p></section>` : ''}
      ${person.video_url ? `<section class="block"><h2 class="section-title">影像资料</h2>${videoEmbed(person.video_url)}</section>` : ''}
      ${gallery(attachments, { title: '影像档案' })}
      ${projects.length ? `<section class="block"><h2 class="section-title">代表性项目</h2><div class="card-grid">${projects.map(projectCard).join('')}</div></section>` : ''}
      ${sameCategory.length ? `<section class="block"><h2 class="section-title">同类传承人</h2><div class="card-grid">${sameCategory.map(inheritorCard).join('')}</div></section>` : ''}
    </div>
    <aside class="detail-side">
      <div class="side-card"><h3>联系与探访</h3><p>希望向传承人学习或采访记录，可联系当地保护单位协助对接，请尊重传承人的正常生活与工作安排。</p></div>
    </aside>
  </section>`;
  return portalLayout({
    title: `${person.name} · 传承人`,
    description: truncate(person.story_title || person.skill || `${person.name} - ${BRAND.name}`, 120),
    active: 'inheritors',
    body,
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
