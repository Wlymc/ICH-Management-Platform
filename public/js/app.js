/* 管理端公共交互：提示、接口请求、弹窗 */
(function () {
  'use strict';

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      if (key === 'class') node.className = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    });
    (children || []).forEach((child) => node.appendChild(child));
    return node;
  }

  function toast(message, type) {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = el('div', { class: 'toast-stack', id: 'toast-stack' });
      document.body.appendChild(stack);
    }
    const node = el('div', { class: `toast${type ? ` is-${type}` : ''}`, text: message });
    stack.appendChild(node);
    setTimeout(() => {
      node.style.transition = 'opacity .3s, transform .3s';
      node.style.opacity = '0';
      node.style.transform = 'translateX(16px)';
      setTimeout(() => node.remove(), 320);
    }, type === 'error' ? 5200 : 3200);
  }

  async function api(path, options) {
    const opts = options || {};
    const init = {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    const response = await fetch(path, init);
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.location.href = '/admin/login';
      throw new Error('登录状态已失效，正在跳转登录页');
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`服务器返回异常（HTTP ${response.status}）`);
    }
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `请求失败（HTTP ${response.status}）`);
    }
    return payload.data;
  }

  function getModalRoot() {
    let root = document.getElementById('modal-root');
    if (!root) {
      root = el('div', { class: 'modal-root', id: 'modal-root' });
      document.body.appendChild(root);
    }
    return root;
  }

  function closeModal() {
    const root = getModalRoot();
    root.hidden = true;
    root.innerHTML = '';
  }

  function openModal(options) {
    const root = getModalRoot();
    return new Promise((resolve) => {
      const bodyNode = el('div', { class: 'modal-body' });
      if (typeof options.body === 'string') bodyNode.innerHTML = options.body;
      else if (options.body) bodyNode.appendChild(options.body);

      const actions = el('div', { class: 'modal-foot' });
      const cancelBtn = el('button', {
        class: 'btn btn-ghost',
        type: 'button',
        text: options.cancelText || '取消',
        onclick: () => {
          closeModal();
          resolve(null);
        },
      });
      const confirmBtn = el('button', {
        class: `btn ${options.danger ? 'btn-primary' : 'btn-primary'}`,
        type: 'button',
        text: options.confirmText || '确定',
      });
      confirmBtn.addEventListener('click', async () => {
        if (options.onConfirm) {
          try {
            const value = await options.onConfirm(bodyNode);
            if (value === false) return;
            closeModal();
            resolve(value === undefined ? true : value);
          } catch (error) {
            toast(error.message, 'error');
          }
          return;
        }
        const inputs = {};
        bodyNode.querySelectorAll('[name]').forEach((input) => {
          inputs[input.name] = input.type === 'checkbox' ? input.checked : input.value;
        });
        closeModal();
        resolve(inputs);
      });
      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);

      const modal = el('div', { class: 'modal' }, [
        el('div', { class: 'modal-head' }, [
          el('h3', { text: options.title || '提示' }),
          el('button', {
            class: 'modal-close',
            type: 'button',
            html: '&times;',
            onclick: () => {
              closeModal();
              resolve(null);
            },
          }),
        ]),
        bodyNode,
        actions,
      ]);

      root.innerHTML = '';
      root.appendChild(modal);
      root.hidden = false;
      const firstInput = bodyNode.querySelector('input, textarea, select');
      if (firstInput) firstInput.focus();
      root.onclick = (event) => {
        if (event.target === root) {
          closeModal();
          resolve(null);
        }
      };
      root.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          closeModal();
          resolve(null);
        }
      });
    });
  }

  function confirmDialog(message, options) {
    const opts = options || {};
    return openModal({
      title: opts.title || '请确认',
      body: `<p style="margin:0;font-size:14.5px;line-height:1.7">${message}</p>`,
      confirmText: opts.confirmText || '确定',
      danger: true,
    }).then((result) => result !== null);
  }

  function promptDialog(options) {
    const opts = options || {};
    const body = `<label class="field"><span class="field-label">${opts.label || '请输入'}</span>
      <textarea class="input" name="value" rows="${opts.rows || 3}" placeholder="${opts.placeholder || ''}">${opts.value || ''}</textarea>
      ${opts.help ? `<span class="field-help">${opts.help}</span>` : ''}</label>`;
    return openModal({
      title: opts.title || '请输入',
      body,
      confirmText: opts.confirmText || '提交',
    }).then((result) => (result === null ? null : result.value));
  }

  async function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
  }

  function formatSize(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.ICH = { el, toast, api, openModal, closeModal, confirmDialog, promptDialog, readFileAsBase64, formatSize, escapeHtml };

  // 退出登录
  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('#logout-btn');
    if (!btn) return;
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* 忽略 */
    }
    window.location.href = '/admin/login';
  });
})();
