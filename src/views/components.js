import { STATUS } from '../resources.js';
import { h } from '../util.js';
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
  const buildUrl = (page) => {
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && key !== 'page') {
        params.set(key, String(value));
      }
    });
    params.set('page', String(page));
    return `${basePath}?${params}`;
  };
  return `<div class="pagination">
    <span class="pager-info">共 ${pageInfo.total} 条 · 第 ${pageInfo.page}/${pageInfo.totalPages} 页</span>
    <div class="pager-links">
      ${
        pageInfo.page > 1
          ? `<a class="pager-link" href="${h(buildUrl(pageInfo.page - 1))}">上一页</a>`
          : '<span class="pager-link is-disabled">上一页</span>'
      }
      ${
        pageInfo.page < pageInfo.totalPages
          ? `<a class="pager-link" href="${h(buildUrl(pageInfo.page + 1))}">下一页</a>`
          : '<span class="pager-link is-disabled">下一页</span>'
      }
    </div>
  </div>`;
}
