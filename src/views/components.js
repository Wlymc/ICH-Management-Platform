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

export function gallery(attachments, { title = '影像与档案', columns = 2, showSource = true } = {}) {
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
  // 版权留痕：把来源类型汇总成一行标注，答辩时可直接说明图片来路
  const sourceKinds = [...new Set(attachments.map((item) => item.source_kind).filter(Boolean))];
  const sourceNote =
    showSource && sourceKinds.length
      ? `<p class="gallery-source">图片来源：${h(sourceKinds.join('、'))}；仅用于教学演示，如涉版权请联系删除。</p>`
      : '';
  return `<section class="gallery-block">
    <h2 class="section-title">${h(title)}</h2>
    ${imgHtml ? `<div class="gallery-grid${columns === 2 ? ' is-2col' : ''}">${imgHtml}</div>` : ''}
    ${otherHtml ? `<ul class="file-list">${otherHtml}</ul>` : ''}
    ${sourceNote}
  </section>`;
}

const GUEST_AI_SAMPLES = [
  '苏绣用什么材料',
  '苗族古歌讲的是什么',
  '内蒙古有哪些国家级非遗',
  '传统技艺类项目有哪些',
];

/**
 * 游客 AI 小助手面板（首页区块与详情页悬浮入口共用）。
 * 通过 data-ai-root 标记，由 public/js/public-ai.js 统一接管交互。
 */
export function guestAiPanel({ uid, variant = 'inline', intro = '', placeholder = '输入你想了解的非遗…', projectId = null, projectName = '' }) {
  const samples = GUEST_AI_SAMPLES.map(
    (text) => `<button type="button" class="ai-sample" data-ask="${h(text)}">${h(text)}</button>`,
  ).join('');
  const narration = projectId
    ? `<section class="ai-narration" data-ai-narration data-project-id="${h(projectId)}" data-project-name="${h(projectName)}" data-mode="brief">
        <div class="ai-narration-head">
          <div>
            <span class="ai-narration-kicker">PROJECT NARRATION</span>
            <strong>听小遗讲《${h(projectName)}》</strong>
          </div>
          <span class="ai-narration-hint" data-ai-narration-hint>约 1 分钟</span>
        </div>
        <div class="ai-narration-modes" role="group" aria-label="讲解版本">
          <button type="button" class="is-active" data-ai-narration-mode="brief" aria-pressed="true">简短版</button>
          <button type="button" data-ai-narration-mode="detailed" aria-pressed="false">详细版</button>
          <button type="button" data-ai-narration-mode="child" aria-pressed="false">儿童版</button>
        </div>
        <div class="ai-narration-actions">
          <button type="button" class="ai-narration-generate" data-ai-narrate>生成讲解词</button>
          <span data-ai-voice-status>语音讲解已就绪</span>
        </div>
        <div class="ai-narration-result" data-ai-narration-result hidden></div>
      </section>`
    : '';
  return `<div class="ai-root is-${variant}" data-ai-root data-uid="${h(uid)}">
    <div class="ai-narrator">
      <div class="ai-narrator-avatar" aria-hidden="true">
        <span class="ai-avatar-ring"></span>
        <span class="ai-avatar-core">遗</span>
        <span class="ai-avatar-wave"><i></i><i></i><i></i></span>
      </div>
      <div class="ai-narrator-copy">
        <strong>小遗 · 数字讲解员</strong>
        <span data-ai-voice-status>可朗读回答，也可以直接说给我听</span>
      </div>
    </div>
    ${narration}
    <div class="ai-thread" data-ai-thread>
      <div class="ai-msg is-bot">${h(intro || '你好，我是数字讲解员小遗。可以问我某个项目的来历与技艺，也可以让我用简短版、详细版或儿童版为你讲解。')}</div>
    </div>
    <form class="ai-form" data-ai-form>
      <button class="ai-mic" type="button" data-ai-mic aria-label="语音输入" title="语音输入"><span aria-hidden="true"></span></button>
      <input class="ai-input" data-ai-input maxlength="200" autocomplete="off" placeholder="${h(placeholder)}">
      <button class="btn btn-primary" type="submit" data-ai-send>发送</button>
    </form>
    <div class="ai-samples"><span class="ai-samples-label">试试：</span>${samples}</div>
  </div>`;
}
