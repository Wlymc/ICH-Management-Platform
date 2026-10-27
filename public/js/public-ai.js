/* 数字讲解员：站内问答、项目讲解词、浏览器语音朗读与语音输入。 */
(function () {
  'use strict';

  const synth = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window ? window.speechSynthesis : null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const NARRATION_HINTS = { brief: '约 1 分钟', detailed: '约 3 分钟', child: '适合亲子研学' };
  let activeUtterance = null;
  let activeSpeechButton = null;
  let activeSpeechScope = null;

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

  function setVoiceStatus(scope, message, state = '') {
    if (!scope) return;
    scope.querySelectorAll('[data-ai-voice-status]').forEach((node) => {
      node.textContent = message;
    });
    scope.classList.toggle('is-speaking', state === 'speaking');
    scope.classList.toggle('is-listening', state === 'listening');
  }

  function stopSpeech(scope = activeSpeechScope) {
    if (synth) synth.cancel();
    if (activeSpeechButton) {
      activeSpeechButton.textContent = '朗读';
      activeSpeechButton.classList.remove('is-active');
    }
    if (scope) setVoiceStatus(scope, '朗读已停止');
    activeUtterance = null;
    activeSpeechButton = null;
    activeSpeechScope = null;
  }

  function speak(scope, text, button) {
    const content = String(text || '').trim();
    if (!synth || !content) {
      setVoiceStatus(scope, '当前浏览器不支持语音朗读');
      return;
    }
    if (activeUtterance && activeSpeechButton === button) {
      stopSpeech(scope);
      return;
    }
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.94;
    utterance.pitch = 1;
    const voices = synth.getVoices?.() || [];
    const chinese = voices.find((voice) => /^zh/i.test(voice.lang)) || voices.find((voice) => /chinese|中文|普通话/i.test(`${voice.name} ${voice.lang}`));
    if (chinese) utterance.voice = chinese;
    activeUtterance = utterance;
    activeSpeechButton = button;
    activeSpeechScope = scope;
    if (button) {
      button.textContent = '停止';
      button.classList.add('is-active');
    }
    setVoiceStatus(scope, '正在讲解…', 'speaking');
    utterance.onend = () => {
      if (activeUtterance !== utterance) return;
      if (activeSpeechButton) {
        activeSpeechButton.textContent = '朗读';
        activeSpeechButton.classList.remove('is-active');
      }
      setVoiceStatus(scope, '讲解结束，可继续提问');
      activeUtterance = null;
      activeSpeechButton = null;
      activeSpeechScope = null;
    };
    utterance.onerror = () => {
      if (activeUtterance !== utterance) return;
      if (activeSpeechButton) {
        activeSpeechButton.textContent = '朗读';
        activeSpeechButton.classList.remove('is-active');
      }
      setVoiceStatus(scope, '朗读未完成，请重试');
      activeUtterance = null;
      activeSpeechButton = null;
      activeSpeechScope = null;
    };
    synth.speak(utterance);
  }

  function addSpeechToolbar(node, text) {
    if (!synth || !node || !text) return;
    node.dataset.speechText = String(text);
    const toolbar = document.createElement('div');
    toolbar.className = 'ai-speech-tools';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-speak';
    button.dataset.speak = '';
    button.textContent = '朗读';
    toolbar.appendChild(button);
    node.appendChild(toolbar);
  }

  function appendMessage(root, role, html, { speechText = '' } = {}) {
    const thread = root.querySelector('[data-ai-thread]');
    if (!thread) return null;
    const node = document.createElement('div');
    node.className = `ai-msg is-${role}`;
    node.innerHTML = html;
    thread.appendChild(node);
    if (role === 'bot') addSpeechToolbar(node, speechText);
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
        { speechText: data.reply || '' },
      );
    } catch (error) {
      if (pending) pending.remove();
      appendMessage(root, 'bot', `<span class="ai-error">网络异常：${escapeHtml(error.message)}</span>`);
    } finally {
      if (button) button.disabled = false;
      if (input) input.focus();
    }
  }

  function renderNarration(container, data) {
    const result = container.querySelector('[data-ai-narration-result]');
    if (!result) return;
    result.hidden = false;
    result.innerHTML = `
      <div class="ai-narration-result-head">
        <span>${escapeHtml(data.label || '讲解词')}</span>
        <strong>${escapeHtml(data.title || '')}</strong>
      </div>
      ${(data.sections || []).map((section) => `<section><h4>${escapeHtml(section.title)}</h4><p>${escapeHtml(section.text)}</p></section>`).join('')}
      <p class="ai-narration-source">依据：${escapeHtml(data.source || '站内已发布档案')}</p>`;
    addSpeechToolbar(result, data.script || '');
    setVoiceStatus(container, '讲解词已生成，可以朗读');
    const scrollParent = container.closest('.ai-fab-panel, .explore-drawer-body, .ai-card');
    if (scrollParent) {
      const top = result.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop;
      scrollParent.scrollTo({ top: Math.max(0, top - 14), behavior: 'smooth' });
    }
  }

  async function generateNarration(container) {
    const projectId = Number(container.dataset.projectId);
    const mode = container.dataset.mode || 'brief';
    const button = container.querySelector('[data-ai-narrate]');
    const result = container.querySelector('[data-ai-narration-result]');
    if (!Number.isInteger(projectId) || projectId <= 0) return;
    if (button) {
      button.disabled = true;
      button.textContent = '正在整理讲解词…';
    }
    if (result) {
      result.hidden = false;
      result.innerHTML = '<p class="ai-narration-loading">正在从已发布档案中整理讲解词…</p>';
    }
    try {
      const response = await fetch(`/api/public/ai/narrate?project_id=${projectId}&mode=${encodeURIComponent(mode)}`, {
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.error || `请求失败（HTTP ${response.status}）`);
      }
      renderNarration(container, payload.data);
    } catch (error) {
      if (result) result.innerHTML = `<p class="ai-error">${escapeHtml(error.message || '讲解词生成失败')}</p>`;
      setVoiceStatus(container, '讲解词生成失败，请重试');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '重新生成讲解词';
      }
    }
  }

  function setupSpeechInput(root) {
    const mic = root.querySelector('[data-ai-mic]');
    if (!mic) return;
    if (!Recognition) {
      mic.hidden = true;
      setVoiceStatus(root, synth ? '可朗读回答，当前浏览器不支持语音输入' : '当前浏览器不支持语音功能');
      return;
    }
    mic.addEventListener('click', () => {
      if (root.__recognition) {
        root.__recognition.stop();
        return;
      }
      const recognition = new Recognition();
      recognition.lang = 'zh-CN';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      root.__recognition = recognition;
      mic.classList.add('is-listening');
      setVoiceStatus(root, '正在听，请说出你的问题…', 'listening');
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() || '';
        const input = root.querySelector('[data-ai-input]');
        if (input) input.value = transcript;
        if (transcript) ask(root, transcript);
      };
      recognition.onerror = (event) => {
        const reason = event.error === 'not-allowed' ? '请允许使用麦克风' : '没有听清，请再试一次';
        setVoiceStatus(root, reason);
      };
      recognition.onend = () => {
        root.__recognition = null;
        mic.classList.remove('is-listening');
        if (!root.classList.contains('is-speaking')) {
          setVoiceStatus(root, synth ? '语音讲解已就绪' : '语音输入已完成');
        }
      };
      try {
        recognition.start();
      } catch {
        root.__recognition = null;
        mic.classList.remove('is-listening');
        setVoiceStatus(root, '语音输入暂时不可用');
      }
    });
  }

  function setupRoot(root) {
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
    setupSpeechInput(root);
  }

  document.querySelectorAll('[data-ai-root]').forEach(setupRoot);

  document.addEventListener('click', (event) => {
    const speakButton = event.target.closest?.('[data-speak]');
    if (speakButton) {
      const holder = speakButton.closest('.ai-msg, .ai-narration-result');
      const scope = speakButton.closest('[data-ai-root], [data-ai-narration]') || document.querySelector('[data-ai-root]') || document;
      speak(scope, holder?.dataset.speechText || '', speakButton);
      return;
    }

    const modeButton = event.target.closest?.('[data-ai-narration-mode]');
    if (modeButton) {
      const container = modeButton.closest('[data-ai-narration]');
      if (!container) return;
      container.dataset.mode = modeButton.dataset.aiNarrationMode || 'brief';
      container.querySelectorAll('[data-ai-narration-mode]').forEach((button) => {
        const active = button === modeButton;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const hint = container.querySelector('[data-ai-narration-hint]');
      if (hint) hint.textContent = NARRATION_HINTS[container.dataset.mode] || '';
      const result = container.querySelector('[data-ai-narration-result]');
      if (result) result.hidden = true;
      const generate = container.querySelector('[data-ai-narrate]');
      if (generate) generate.textContent = '生成讲解词';
      setVoiceStatus(container, '已切换讲解版本');
      return;
    }

    const narrateButton = event.target.closest?.('[data-ai-narrate]');
    if (narrateButton) {
      const container = narrateButton.closest('[data-ai-narration]');
      if (container) generateNarration(container);
    }
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
      if (activeUtterance) stopSpeech();
    });
  });
})();
