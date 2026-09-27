import { STATUS } from '../resources.js';
import { h, truncate } from '../util.js';
import { uploadUrl } from './layout.js';

export function statusBadge(status) {
  const spec = STATUS[status] || { label: status, tone: 'muted' };
  return `<span class="badge badge-${spec.tone}">${h(spec.label)}</span>`;
}

export function thumb(filePath, alt, { ratio = '16x10' } = {}) {
  const url = uploadUrl(filePath);
  if (!url) {
    return `<div class="thumb thumb-empty ratio-${ratio}" aria-hidden="true"><span>暂无图片</span></div>`;
  }
  return `<div class="thumb ratio-${ratio}"><img src="${h(url)}" alt="${h(alt)}" loading="lazy"></div>`;
}

export function paginationBar(basePath, query, pageInfo) {
  if (pageInfo.totalPages <= 1) {
    return `<div class="pagination"><span class="pager-info">共 ${pageInfo.total} 条</span></div>`;
  }
  const build = (page) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null || value === '' || key === 'page') continue;
      params.set(key, value);
    }
    params.set('page', page);
    return `${basePath}?${params.toString()}`;
  };
  const windowSize = 2;
  const pages = [];
  for (let p = 1; p <= pageInfo.totalPages; p += 1) {
    if (p === 1 || p === pageInfo.totalPages || Math.abs(p - pageInfo.page) <= windowSize) pages.push(p);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }
  const links = pages
    .map((p) =>
      p === '...'
        ? `<span class="pager-gap">…</span>`
        : `<a class="pager-link${p === pageInfo.page ? ' is-active' : ''}" href="${h(build(p))}">${p}</a>`,
    )
    .join('');
  return `<div class="pagination">
    <span class="pager-info">共 ${pageInfo.total} 条 · 第 ${pageInfo.page}/${pageInfo.totalPages} 页</span>
    <div class="pager-links">
      ${pageInfo.page > 1 ? `<a class="pager-link" href="${h(build(pageInfo.page - 1))}">上一页</a>` : `<span class="pager-link is-disabled">上一页</span>`}
      ${links}
      ${pageInfo.page < pageInfo.totalPages ? `<a class="pager-link" href="${h(build(pageInfo.page + 1))}">下一页</a>` : `<span class="pager-link is-disabled">下一页</span>`}
    </div>
  </div>`;
}

export function emptyState(title, hint = '') {
  return `<div class="empty-state"><div class="empty-mark">◌</div><p class="empty-title">${h(title)}</p>${hint ? `<p class="empty-hint">${h(hint)}</p>` : ''}</div>`;
}

export function levelChip(name) {
  if (!name) return '';
  const tone = { 国家级: 'gold', 省级: 'red', 市级: 'blue', 县级: 'green' }[name] || 'blue';
  return `<span class="chip chip-${tone}">${h(name)}</span>`;
}

export function statCard({ label, value, unit = '', hint = '', href = '' }) {
  const inner = `<span class="stat-label">${h(label)}</span>
    <span class="stat-value">${h(value)}<em>${h(unit)}</em></span>
    ${hint ? `<span class="stat-hint">${h(hint)}</span>` : ''}`;
  return href ? `<a class="stat-card" href="${h(href)}">${inner}</a>` : `<div class="stat-card">${inner}</div>`;
}

export function kv(label, value, { wide = false } = {}) {
  const content = value === null || value === undefined || value === '' ? '<span class="kv-empty">—</span>' : value;
  return `<div class="kv${wide ? ' is-wide' : ''}"><dt>${h(label)}</dt><dd>${content}</dd></div>`;
}

export function prose(label, value) {
  if (!value) return '';
  return `<section class="prose-block"><h3>${h(label)}</h3><p>${h(value).replace(/\n/g, '</p><p>')}</p></section>`;
}

export function excerpt(value, length = 120) {
  return h(truncate(value, length));
}

export function videoEmbed(url) {
  if (!url) return '';
  const safe = h(url);
  let embed = null;
  const bv = String(url).match(/bilibili\.com\/video\/(BV[0-9A-Za-z]+)/);
  if (bv) embed = `https://player.bilibili.com/player.html?bvid=${bv[1]}&autoplay=0`;
  const yt = String(url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([0-9A-Za-z_-]{6,})/);
  if (yt) embed = `https://www.youtube.com/embed/${yt[1]}`;
  if (embed) {
    return `<div class="video-frame"><iframe src="${h(embed)}" title="影像资料" loading="lazy" allowfullscreen referrerpolicy="no-referrer"></iframe></div>`;
  }
  return `<div class="video-frame video-fallback"><p>该影像来自外部平台，点击下方链接观看。</p><a class="btn btn-primary" href="${safe}" target="_blank" rel="noopener noreferrer">打开视频页面 ↗</a></div>`;
}

export function gallery(attachments, { title = '影像与档案' } = {}) {
  const images = attachments.filter((a) => a.kind === 'image' && a.file_path);
  const others = attachments.filter((a) => a.kind !== 'image');
  if (!images.length && !others.length) return '';
  const imgHtml = images
    .map(
      (a) => `<figure class="gallery-item">
        <img src="${h(uploadUrl(a.file_path))}" alt="${h(a.title || a.file_name)}" loading="lazy">
        <figcaption>${h(a.title || a.file_name)}</figcaption>
      </figure>`,
    )
    .join('');
  const otherHtml = others
    .map((a) => {
      const url = a.external_url || uploadUrl(a.file_path);
      const kindLabel = { audio: '音频', video: '视频', document: '文档', image: '图片' }[a.kind] || a.kind;
      return `<li class="file-row">
        <span class="file-kind">${h(kindLabel)}</span>
        <a href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(a.title || a.file_name)}</a>
        ${a.note ? `<span class="file-note">${h(a.note)}</span>` : ''}
      </li>`;
    })
    .join('');
  return `<section class="gallery-block">
    <h2 class="section-title">${h(title)}</h2>
    ${imgHtml ? `<div class="gallery-grid">${imgHtml}</div>` : ''}
    ${otherHtml ? `<ul class="file-list">${otherHtml}</ul>` : ''}
  </section>`;
}
