/* 游客 AI 小助手：首页区块与详情页悬浮入口共用同一套交互 */
(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderLinks(links) {
    if (!links || !links.length) return '';
    const chips = links
      .map((link) =>
        link.detail
          ? `<a class="ai-link" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
          : `<a class="ai-link is-primary" href="${escapeHtml(link.href)}">${escapeHtml(link.label)} →</a>`,
      )
      .join('');
    return `<div class="ai-links">${chips}</div>`;
  }

  function renderSources(sources) {
    if (!sources || !sources.length) return '';
    const items = sources
      .slice(0, 4)
      .map((source) => {
        const label = source.type === 'project' ? '项目' : source.type === 'inheritor' ? '传承人' : '知识';
        const title = escapeHtml(source.title);
        const href = source.href ? escapeHtml(source.href) : '';
        return `<li><span class="ai-source-tag">${label}</span>${href ? `<a href="${href}">${title}</a>` : title}</li>`;
      })
      .join('');
    return `<div class="ai-source"><b>来源</b><ul>${items}</ul></div>`;
  }

  function appendMessage(root, role, html) {
    const thread = root.querySelector('[data-ai-thread]');
    if (!thread) return null;
    const node = document.createElement('div');
    node.className = `ai-msg is-${role}`;
    node.innerHTML = html;
    thread.appendChild(node);
    thread.scrollTop = thread.scrollHeight;
    return node;
  }

  async function ask(root, question) {
    const text = String(question || '').trim();
    if (!text) return;
    appendMessage(root, 'user', escapeHtml(text));
    const input = root.querySelector('[data-ai-input]');
    const button = root.querySelector('[data-ai-send]');
    if (input) input.value = '';
    if (button) button.disabled = true;
    const pending = appendMessage(root, 'bot', '<span class="ai-typing">正在检索站内资料…</span>');

    try {
      const response = await fetch('/api/public/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const payload = await response.json().catch(() => null);
      if (pending) pending.remove();

      if (!response.ok || !payload || payload.ok === false) {
        const message = payload?.error || `请求失败（HTTP ${response.status}）`;
        appendMessage(root, 'bot', `<span class="ai-error">${escapeHtml(message)}</span>`);
        return;
      }
      const data = payload.data || {};
      const note = data.degraded
        ? '<div class="ai-footnote-inline">当前为站内检索模式，回答由站内资料拼装而成。</div>'
        : '';
      appendMessage(
        root,
        'bot',
        `<div>${escapeHtml(data.reply || '').replace(/\n/g, '<br>')}</div>${renderLinks(data.links)}${renderSources(data.sources)}${note}`,
      );
    } catch (error) {
      if (pending) pending.remove();
      appendMessage(root, 'bot', `<span class="ai-error">网络异常：${escapeHtml(error.message)}</span>`);
    } finally {
      if (button) button.disabled = false;
      if (input) input.focus();
    }
  }

  document.querySelectorAll('[data-ai-root]').forEach((root) => {
    const form = root.querySelector('[data-ai-form]');
    const input = root.querySelector('[data-ai-input]');
    if (form && input) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        ask(root, input.value);
      });
    }
    root.querySelectorAll('[data-ask]').forEach((button) => {
      button.addEventListener('click', () => ask(root, button.dataset.ask));
    });
  });

  /* 详情页悬浮入口 */
  document.querySelectorAll('[data-ai-fab]').forEach((fab) => {
    const toggle = fab.querySelector('[data-ai-toggle]');
    const panel = fab.querySelector('[data-ai-panel]');
    const close = fab.querySelector('[data-ai-close]');
    toggle?.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) fab.querySelector('[data-ai-input]')?.focus();
    });
    close?.addEventListener('click', () => {
      panel.hidden = true;
    });
  });
})();
