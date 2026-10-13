/* AI 小助手 / AI 配置 / 知识条目的前端交互 */
(function () {
  'use strict';

  const { api, toast, confirmDialog, escapeHtml } = window.ICH;
  let sessionId = null;

  /* ---------------- 对话 ---------------- */

  const chatList = document.getElementById('chat-list');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-message');

  function bubble(role, html, note) {
    const node = document.createElement('div');
    node.className = `chat-msg is-${role === 'user' ? 'user' : 'bot'}`;
    node.innerHTML = `
      <div class="chat-avatar">${role === 'user' ? '我' : '助'}</div>
      <div class="chat-body">${html}${note ? `<p class="chat-note">${note}</p>` : ''}</div>`;
    chatList.appendChild(node);
    node.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return node;
  }

  function renderLinks(links) {
    if (!links || !links.length) return '';
    const chips = links
      .map((link) =>
        link.detail
          ? `<a class="result-chip" href="${escapeHtml(link.href)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a>`
          : `<a class="result-chip is-primary" href="${escapeHtml(link.href)}" target="_blank" rel="noopener">${escapeHtml(link.label)} →</a>`,
      )
      .join('');
    return `<div class="result-links">${chips}</div>`;
  }

  function renderSources(sources) {
    if (!sources || !sources.length) return '';
    const items = sources
      .map((source) => {
        const label = source.type === 'project' ? '项目' : source.type === 'inheritor' ? '传承人' : '知识';
        const href = source.href || '';
        const title = escapeHtml(source.title);
        return `<li><span class="chip chip-plain">${label}</span>${
          href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${title}</a>` : title
        }<em>${escapeHtml((source.snippet || '').slice(0, 60))}</em></li>`;
      })
      .join('');
    return `<div class="source-box"><b>来源（可点击查看原文）</b><ul>${items}</ul></div>`;
  }

  async function send(message) {
    const question = String(message || '').trim();
    if (!question) return;
    bubble('user', `<p>${escapeHtml(question)}</p>`);
    chatInput.value = '';
    const sending = bubble('bot', '<p class="chat-typing">正在检索站内资料…</p>');
    const sendBtn = document.getElementById('chat-send');
    if (sendBtn) sendBtn.disabled = true;
    try {
      const data = await api('/api/ai/chat', { method: 'POST', body: { message: question, sessionId } });
      sessionId = data.sessionId || sessionId;
      const degradedNote = data.degraded
        ? `<p class="chat-note is-warn">当前为本地检索模式${data.reason ? `（${escapeHtml(data.reason)}）` : ''}：大模型不可用，指令与检索照常工作。</p>`
        : '';
      sending.remove();
      bubble(
        'bot',
        `<p>${escapeHtml(data.reply).replace(/\n/g, '<br>')}</p>${renderLinks(data.links)}${renderSources(data.sources)}`,
        degradedNote + (data.model ? `已调用模型：${escapeHtml(data.model)}` : ''),
      );
    } catch (error) {
      sending.remove();
      bubble('bot', `<p class="form-error">${escapeHtml(error.message)}</p>`);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  if (chatForm) {
    chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      send(chatInput.value);
    });
    chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        send(chatInput.value);
      }
    });
  }

  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => send(button.dataset.command));
  });

  /* ---------------- 重建索引 ---------------- */

  document.querySelectorAll('#reindex-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        button.disabled = true;
        const result = await api('/api/search/reindex', { method: 'POST' });
        toast(`检索索引已重建：${result.total} 条`);
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  /* ---------------- AI 配置 ---------------- */

  const configForm = document.getElementById('ai-config-form');
  if (configForm) {
    const presetsNode = document.getElementById('ai-presets');
    const presets = presetsNode ? JSON.parse(presetsNode.textContent) : {};
    const resultBox = document.getElementById('ai-test-result');

    document.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const preset = presets[button.dataset.preset];
        if (!preset) return;
        configForm.querySelector('[name="baseUrl"]').value = preset.baseUrl;
        configForm.querySelector('[name="model"]').value = preset.model;
        toast('已填入预设，别忘了保存');
      });
    });

    configForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        baseUrl: configForm.querySelector('[name="baseUrl"]').value.trim(),
        model: configForm.querySelector('[name="model"]').value.trim(),
        apiKey: configForm.querySelector('[name="apiKey"]').value.trim(),
        timeoutMs: configForm.querySelector('[name="timeoutMs"]').value,
        maxTokens: configForm.querySelector('[name="maxTokens"]').value,
        temperature: configForm.querySelector('[name="temperature"]').value,
        enabled: configForm.querySelector('[name="enabled"]').checked,
      };
      try {
        const saved = await api('/api/ai/config', { method: 'PUT', body: payload });
        toast('配置已保存');
        configForm.querySelector('[name="apiKey"]').value = '';
        const hint = configForm.querySelector('.panel-hint');
        if (hint) hint.textContent = saved.hasApiKey ? `当前密钥 ${saved.apiKeyMasked}` : '尚未配置密钥';
        resultBox.innerHTML = '';
      } catch (error) {
        toast(error.message, 'error');
      }
    });

    document.getElementById('test-btn')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      resultBox.innerHTML = '<p class="muted">正在测试连通性……</p>';
      try {
        const result = await api('/api/ai/config/test', { method: 'POST' });
        resultBox.innerHTML = result.ok
          ? `<div class="alert alert-info"><b>连接成功</b><p>模型：${escapeHtml(result.model)}｜耗时 ${result.costMs}ms｜回复：${escapeHtml(result.reply)}</p></div>`
          : `<div class="alert alert-danger"><b>连接失败</b><p>${escapeHtml(result.error)}</p><p class="muted">请检查服务地址、模型名与密钥；也可用命令行 <code>node scripts/ai-test.js --preset zhipu-free --api-key 密钥</code> 排查。</p></div>`;
      } catch (error) {
        resultBox.innerHTML = `<div class="alert alert-danger"><b>测试失败</b><p>${escapeHtml(error.message)}</p></div>`;
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById('clear-key-btn')?.addEventListener('click', async () => {
      const confirmed = await confirmDialog('清除已保存的密钥？清除后 AI 问答会自动降级为本地检索模式。', { confirmText: '清除' });
      if (!confirmed) return;
      try {
        await api('/api/ai/config', { method: 'PUT', body: { clearApiKey: true } });
        toast('密钥已清除');
        setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }

  /* ---------------- 知识条目 ---------------- */

  const knowledgeForm = document.getElementById('knowledge-form');
  if (knowledgeForm) {
    let editingId = null;
    const title = document.getElementById('knowledge-form-title');

    knowledgeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {};
      knowledgeForm.querySelectorAll('[name]').forEach((input) => {
        payload[input.name] = input.value;
      });
      try {
        if (editingId) {
          await api(`/api/knowledge/${editingId}`, { method: 'PUT', body: payload });
          toast('已保存修改');
        } else {
          await api('/api/knowledge', { method: 'POST', body: payload });
          toast('已新增知识条目');
        }
        setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        toast(error.message, 'error');
      }
    });

    knowledgeForm.querySelector('button[type="reset"]')?.addEventListener('click', () => {
      setTimeout(() => {
        editingId = null;
        if (title) title.textContent = '新增知识条目';
      }, 0);
    });

    document.querySelectorAll('[data-knowledge-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = JSON.parse(button.dataset.knowledgeEdit);
        editingId = item.id;
        knowledgeForm.querySelector('[name="kind"]').value = item.kind || '术语';
        knowledgeForm.querySelector('[name="title"]').value = item.title || '';
        knowledgeForm.querySelector('[name="content"]').value = item.content || '';
        knowledgeForm.querySelector('[name="source"]').value = item.source || '';
        knowledgeForm.querySelector('[name="sourceUrl"]').value = item.source_url || '';
        if (title) title.textContent = `编辑：${item.title}`;
        knowledgeForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    document.querySelectorAll('[data-knowledge-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const confirmed = await confirmDialog('确定删除该知识条目？删除后 AI 不再检索到它。', { confirmText: '删除' });
        if (!confirmed) return;
        try {
          await api(`/api/knowledge/${button.dataset.knowledgeDelete}`, { method: 'DELETE' });
          toast('已删除');
          setTimeout(() => window.location.reload(), 400);
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    });
  }
})();
