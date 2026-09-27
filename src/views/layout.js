import { ASSET_VERSION, BRAND } from '../config.js';
import { h } from '../util.js';

export function asset(path) {
  return `/assets/${path}?v=${ASSET_VERSION}`;
}

export function uploadUrl(filePath) {
  if (!filePath) return '';
  if (/^https?:\/\//.test(filePath)) return filePath;
  return `/uploads/${String(filePath).split('/').map(encodeURIComponent).join('/')}`;
}

const PORTAL_NAV = [
  { href: '/', label: '首页', key: 'home' },
  { href: '/projects', label: '逛非遗', key: 'projects' },
  { href: '/inheritors', label: '传承人', key: 'inheritors' },
  { href: '/organizations', label: '探访体验点', key: 'organizations' },
];

export function portalLayout({ title, description = '', active = '', body, keyword = '', bodyClass = '' }) {
  const fullTitle = title ? `${title} · ${BRAND.name}` : BRAND.name;
  const nav = PORTAL_NAV.map(
    (item) =>
      `<a class="nav-link${active === item.key ? ' is-active' : ''}" href="${item.href}">${h(item.label)}</a>`,
  ).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(fullTitle)}</title>
<meta name="description" content="${h(description || BRAND.subtitle)}">
<meta property="og:title" content="${h(fullTitle)}">
<meta property="og:description" content="${h(description || BRAND.subtitle)}">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#a8322d"/><text x="16" y="22" font-size="16" text-anchor="middle" fill="#fff" font-family="sans-serif">非</text></svg>')}">
<link rel="stylesheet" href="${asset('css/app.css')}">
<link rel="stylesheet" href="${asset('css/portal.css')}">
</head>
<body class="portal ${bodyClass}">
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/">
      <span class="brand-seal">非</span>
      <span class="brand-text"><strong>${h(BRAND.name)}</strong><em>${h(BRAND.organization)}</em></span>
    </a>
    <nav class="site-nav">${nav}</nav>
    <div class="header-actions">
      <form class="header-search" action="/projects" method="get" role="search">
        <input type="search" name="q" placeholder="搜索项目、传承人、技艺" value="${h(keyword)}" aria-label="站内搜索">
        <button type="submit" aria-label="搜索">搜索</button>
      </form>
      <a class="ghost-link" href="/admin">管理端</a>
    </div>
  </div>
</header>
<main class="site-main">${body}</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div>
      <p class="footer-brand">${h(BRAND.name)}</p>
      <p class="footer-sub">${h(BRAND.subtitle)}</p>
    </div>
    <div class="footer-links">
      <a href="/projects">非遗项目</a>
      <a href="/inheritors">传承人</a>
      <a href="/organizations">探访体验点</a>
      <a href="/admin">管理端登录</a>
    </div>
  </div>
  <div class="wrap footer-note">${h(BRAND.footerNote)}</div>
</footer>
</body>
</html>`;
}

const ADMIN_NAV = [
  { href: '/admin/work', label: '工作台', key: 'work', icon: '◆' },
  { href: '/admin/dashboard', label: '数据大屏', key: 'dashboard', icon: '◈' },
  { href: '/admin/projects', label: '非遗项目', key: 'project', icon: '▣' },
  { href: '/admin/inheritors', label: '传承人', key: 'inheritor', icon: '☰' },
  { href: '/admin/organizations', label: '传承基地', key: 'organization', icon: '⌂' },
];

const ADMIN_REVIEW_NAV = [
  { href: '/admin/reviews', label: '审核中心', key: 'reviews', icon: '✓', adminOnly: true },
];

const ADMIN_SYSTEM_NAV = [
  { href: '/admin/dict', label: '数据字典', key: 'dict', icon: '≡' },
  { href: '/admin/users', label: '用户管理', key: 'users', icon: '☺', adminOnly: true },
  { href: '/admin/logs', label: '操作日志', key: 'logs', icon: '⏱', adminOnly: true },
];

export function adminLayout({ title, user, active = '', body, crumbs = [], pendingTotal = 0, wide = false, scripts = [] }) {
  const isAdmin = user.role === 'admin';
  const navItem = (item) =>
    `<a class="side-link${active === item.key ? ' is-active' : ''}" href="${item.href}">
       <span class="side-icon" aria-hidden="true">${item.icon}</span><span>${h(item.label)}</span>
       ${item.key === 'reviews' && pendingTotal ? `<b class="side-badge">${pendingTotal}</b>` : ''}
     </a>`;
  // 录入员的侧边栏不出现审核中心、用户管理、操作日志入口
  const nav = ADMIN_NAV.map(navItem).join('');
  const reviewNav = ADMIN_REVIEW_NAV.filter((item) => !item.adminOnly || isAdmin).map(navItem).join('');
  const systemNav = ADMIN_SYSTEM_NAV.filter((item) => !item.adminOnly || isAdmin).map(navItem).join('');
  const crumbHtml = [`<a href="/admin/work">管理端</a>`, ...crumbs.map((c) => (c.href ? `<a href="${c.href}">${h(c.label)}</a>` : `<span>${h(c.label)}</span>`))].join('<i>/</i>');
  const normalize = (name) => String(name).replace(/^\/assets\//, '');
  const scriptTags = ['js/app.js', ...scripts]
    .map((name) => `<script src="${asset(normalize(name))}"></script>`)
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)} · ${h(BRAND.name)} 管理端</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#1f2937"/><text x="16" y="22" font-size="16" text-anchor="middle" fill="#fff" font-family="sans-serif">遗</text></svg>')}">
<link rel="stylesheet" href="${asset('css/app.css')}">
<link rel="stylesheet" href="${asset('css/admin.css')}">
</head>
<body class="admin">
<div class="admin-shell${wide ? ' is-wide' : ''}">
  <aside class="side-nav">
    <a class="side-brand" href="/"><span class="brand-seal">非</span><span><strong>${h(BRAND.shortName)}</strong><em>管理端</em></span></a>
    <div class="side-group">档案管理</div>
    <nav class="side-links">${nav}</nav>
    ${reviewNav ? `<div class="side-group">审核与发布</div><nav class="side-links">${reviewNav}</nav>` : ''}
    <div class="side-group">系统设置</div>
    <nav class="side-links">${systemNav}</nav>
    <div class="side-foot">
      <a href="/" target="_blank" rel="noopener">查看公众门户 ↗</a>
    </div>
  </aside>
  <div class="admin-main">
    <header class="admin-topbar">
      <div class="crumbs">${crumbHtml}</div>
      <div class="topbar-right">
        <span class="data-tip">示例数据</span>
        <span class="role-tip${isAdmin ? ' is-admin' : ''}">当前角色：${
          isAdmin ? '管理员 · 全部数据 / 审核发布 / 系统设置' : '录入员 · 仅能维护自己录入的档案'
        }</span>
        <div class="user-chip">
          <span class="user-avatar">${h(user.display_name.slice(0, 1))}</span>
          <span class="user-meta"><strong>${h(user.display_name)}</strong><em>${user.role === 'admin' ? '管理员' : '录入员'}</em></span>
          <button class="btn btn-ghost btn-sm" id="logout-btn" type="button">退出</button>
        </div>
      </div>
    </header>
    <main class="admin-body">${body}</main>
  </div>
</div>
<div class="toast-stack" id="toast-stack"></div>
<div class="modal-root" id="modal-root" hidden></div>
${scriptTags}
</body>
</html>`;
}

export function loginLayout({ body }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>登录 · ${h(BRAND.name)} 管理端</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#a8322d"/><text x="16" y="22" font-size="16" text-anchor="middle" fill="#fff" font-family="sans-serif">非</text></svg>')}">
<link rel="stylesheet" href="${asset('css/app.css')}">
<link rel="stylesheet" href="${asset('css/admin.css')}">
</head>
<body class="admin admin-login-page">
${body}
<script src="${asset('js/app.js')}"></script>
<script src="${asset('js/admin.js')}"></script>
</body>
</html>`;
}

export function screenLayout({ title, body }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)} · ${h(BRAND.name)}</title>
<link rel="stylesheet" href="${asset('css/app.css')}">
<link rel="stylesheet" href="${asset('css/dashboard.css')}">
</head>
<body class="screen-body">
${body}
<script src="${asset('js/app.js')}"></script>
<script src="${asset('js/dashboard.js')}"></script>
</body>
</html>`;
}
