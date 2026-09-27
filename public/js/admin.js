/* 管理端页面交互 */
(function () {
  'use strict';

  const { api, toast, el, confirmDialog, promptDialog, openModal, readFileAsBase64, formatSize, escapeHtml } = window.ICH;

  const PLURAL = { project: 'projects', inheritor: 'inheritors', organization: 'organizations' };
  const pl = (key) => PLURAL[key] || key;

  /** 只允许跳回管理端内部路径，避免被 next 参数带去外部站点 */
  function safeNext(raw) {
    if (!raw) return '/admin/work';
    let value = String(raw).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* 保留原值 */
    }
    // 去掉误粘进来的中文标点等尾部字符
    value = value.replace(/[）。，、；：！？\s"'<>]+$/g, '');
    if (!value.startsWith('/admin')) return '/admin/work';
    if (value.startsWith('//') || value.includes('//')) return '/admin/work';
    if (value.startsWith('/admin/login')) return '/admin/work';
    return value;
  }

  /* ---------------- 登录 ---------------- */
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    const nextTarget = safeNext(new URLSearchParams(window.location.search).get('next'));
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('login-error');
      const button = loginForm.querySelector('button[type="submit"]');
      const data = Object.fromEntries(new FormData(loginForm).entries());
      if (!data.username || !data.password) {
        errorBox.textContent = '请输入用户名和密码';
        return;
      }
      errorBox.textContent = '';
      button.disabled = true;
      button.textContent = '登录中……';
      try {
        await api('/api/auth/login', { method: 'POST', body: data });
        window.location.href = nextTarget;
      } catch (error) {
        errorBox.textContent = error.message;
        button.disabled = false;
        button.textContent = '登录管理端';
      }
    });
  }

  /* ---------------- 下拉菜单 ---------------- */
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('.dropdown-toggle');
    if (toggle) {
      const parent = toggle.closest('.dropdown');
      const wasOpen = parent.classList.contains('is-open');
      document.querySelectorAll('.dropdown.is-open').forEach((node) => node.classList.remove('is-open'));
      if (!wasOpen) parent.classList.add('is-open');
      event.stopPropagation();
      return;
    }
    if (!event.target.closest('.dropdown-menu')) {
      document.querySelectorAll('.dropdown.is-open').forEach((node) => node.classList.remove('is-open'));
    }
  });

  /* ---------------- 资源表单 ---------------- */
  const resourceForm = document.getElementById('resource-form');
  if (resourceForm) {
    const resourceKey = resourceForm.dataset.resource;
    const base = resourceForm.dataset.base;
    const recordId = resourceForm.dataset.id;

    // 图片上传
    resourceForm.querySelectorAll('[data-image-field]').forEach((wrapper) => {
      const hidden = wrapper.querySelector('[data-image-input]');
      const preview = wrapper.querySelector('[data-preview]');
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'image/jpeg,image/png,image/webp,image/gif';
      picker.hidden = true;
      wrapper.appendChild(picker);

      wrapper.querySelector('[data-image-pick]')?.addEventListener('click', () => picker.click());
      wrapper.querySelector('[data-image-clear]')?.addEventListener('click', () => {
        hidden.value = '';
        preview.innerHTML = '<span>尚未上传</span>';
      });
      picker.addEventListener('change', async () => {
        const file = picker.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
          toast('图片不能超过 10MB', 'error');
          return;
        }
        try {
          toast('正在上传图片……', 'info');
          const base64 = await readFileAsBase64(file);
          const result = await api('/api/upload', {
            method: 'POST',
            body: { filename: file.name, mimeType: file.type, base64 },
          });
          hidden.value = result.path;
          preview.innerHTML = `<img src="/uploads/${result.path}" alt="">`;
          toast('图片上传成功');
        } catch (error) {
          toast(error.message, 'error');
        } finally {
          picker.value = '';
        }
      });
    });

    // 关联列表筛选
    resourceForm.querySelectorAll('[data-filter-target]').forEach((input) => {
      input.addEventListener('input', () => {
        const target = document.getElementById(input.dataset.filterTarget);
        if (!target) return;
        const keyword = input.value.trim();
        target.querySelectorAll('.relation-item').forEach((item) => {
          item.style.display = !keyword || (item.dataset.keyword || '').includes(keyword) ? '' : 'none';
        });
      });
    });

    const collect = () => {
      const payload = {};
      resourceForm.querySelectorAll('input[name], textarea[name], select[name]').forEach((input) => {
        if (input.name.startsWith('__')) return;
        if (input.type === 'checkbox') {
          payload[input.name] = input.checked ? 1 : 0;
          return;
        }
        payload[input.name] = input.value;
      });
      const inheritors = [...resourceForm.querySelectorAll('input[name="__inheritors"]:checked')].map((i) => Number(i.value));
      const projects = [...resourceForm.querySelectorAll('input[name="__projects"]:checked')].map((i) => Number(i.value));
      if (resourceKey === 'project') payload.__inheritors = inheritors;
      if (resourceKey === 'inheritor') payload.__projects = projects;
      return payload;
    };

    const save = async (thenSubmit) => {
      const payload = collect();
      const submitButtons = resourceForm.querySelectorAll('button[type="submit"], [data-form-action]');
      submitButtons.forEach((button) => {
        button.disabled = true;
      });
      try {
        let id = recordId ? Number(recordId) : null;
        if (id) {
          await api(`/api/${pl(resourceKey)}/${id}`, { method: 'PUT', body: payload });
        } else {
          const created = await api(`/api/${pl(resourceKey)}`, { method: 'POST', body: payload });
          id = created.id;
        }
        if (thenSubmit) {
          await api(`/api/${pl(resourceKey)}/${id}/submit`, { method: 'POST' });
          toast('已提交审核，等待管理员发布');
        } else {
          toast(recordId ? '修改已保存' : '已保存为草稿');
        }
        window.location.href = `${base}/${id}`;
      } catch (error) {
        toast(error.message, 'error');
        submitButtons.forEach((button) => {
          button.disabled = false;
        });
      }
    };

    resourceForm.addEventListener('submit', (event) => {
      event.preventDefault();
      save(false);
    });
    resourceForm.querySelector('[data-form-action="submit"]')?.addEventListener('click', () => {
      if (!resourceForm.reportValidity()) return;
      save(true);
    });
  }

  /* ---------------- 列表页 ---------------- */
  const dataTable = document.querySelector('.data-table[data-resource]');
  if (dataTable) {
    const resourceKey = dataTable.dataset.resource;
    const checkAll = document.getElementById('check-all');
    const counter = document.getElementById('selected-count');
    const selected = () => [...dataTable.querySelectorAll('.row-check:checked')].map((node) => Number(node.value));

    const refreshCount = () => {
      if (counter) counter.textContent = String(selected().length);
    };
    checkAll?.addEventListener('change', () => {
      dataTable.querySelectorAll('.row-check').forEach((node) => {
        node.checked = checkAll.checked;
      });
      refreshCount();
    });
    dataTable.addEventListener('change', (event) => {
      if (event.target.classList.contains('row-check')) refreshCount();
    });

    dataTable.addEventListener('click', async (event) => {
      const actionBtn = event.target.closest('[data-action]');
      if (!actionBtn) return;
      const id = Number(actionBtn.dataset.id);
      const name = actionBtn.closest('tr')?.dataset.name || `#${id}`;
      const action = actionBtn.dataset.action;
      try {
        if (action === 'delete') {
          const okDelete = await confirmDialog(
            `确定删除「${name}」吗？该记录的多媒体档案与关联关系会一并删除，且无法恢复。`,
            { confirmText: '删除' },
          );
          if (!okDelete) return;
          await api(`/api/${pl(resourceKey)}/${id}`, { method: 'DELETE' });
          toast('已删除');
          setTimeout(() => window.location.reload(), 400);
          return;
        }
        if (action === 'submit') {
          const okSubmit = await confirmDialog(`将「${name}」提交审核？提交后需管理员审核才能对外发布。`);
          if (!okSubmit) return;
          await api(`/api/${pl(resourceKey)}/${id}/submit`, { method: 'POST' });
          toast('已提交审核');
          setTimeout(() => window.location.reload(), 400);
          return;
        }
        if (action === 'history') {
          const rows = await api(`/api/history/${resourceKey}/${id}`);
          const html = rows.length
            ? `<table class="data-table compact"><tbody>${rows
                .map((row) => `<tr><td>${escapeHtml(row.created_at)}</td><td>${escapeHtml(row.user_name)}</td><td>${escapeHtml(row.action)}</td><td>${escapeHtml(row.detail || '')}</td></tr>`)
                .join('')}</tbody></table>`
            : '<p class="muted">暂无操作记录</p>';
          await openModal({ title: `${name} · 操作记录`, body: html, confirmText: '关闭', onConfirm: () => true });
        }
      } catch (error) {
        toast(error.message, 'error');
      }
    });

    document.querySelectorAll('[data-batch]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ids = selected();
        const action = button.dataset.batch;
        if (!ids.length) {
          toast('请先勾选要处理的记录', 'error');
          return;
        }
        const label = action === 'delete' ? '删除' : '提交审核';
        const okBatch = await confirmDialog(`确定批量${label}选中的 ${ids.length} 条记录？`, { confirmText: label });
        if (!okBatch) return;
        try {
          const result = await api(`/api/${pl(resourceKey)}/bulk`, { method: 'POST', body: { action, ids } });
          if (result.failed?.length) {
            toast(`成功 ${result.ok} 条，失败 ${result.failed.length} 条：${result.failed.slice(0, 3).join('；')}`, 'warn');
          } else {
            toast(`已${label} ${result.ok} 条`);
          }
          setTimeout(() => window.location.reload(), 900);
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    });
  }

  /* ---------------- 审核操作 ---------------- */
  async function runReview(resourceKey, id, action) {
    const plural = pl(resourceKey);
    if (action === 'approve') {
      const ok = await confirmDialog('通过审核后，该记录将在公众门户与数据大屏中展示。确定通过？', {
        confirmText: '通过并发布',
      });
      if (!ok) return;
      await api(`/api/${plural}/${id}/review`, { method: 'POST', body: { action: 'approve' } });
      toast('已通过并发布');
    } else {
      const note = await promptDialog({
        title: '退回修改',
        label: '审核意见（必填，将展示给录入人）',
        placeholder: '例如：缺少历史渊源与传承谱系描述，请补充影像资料后重新提交。',
        confirmText: '确认退回',
      });
      if (note === null) return;
      if (!note.trim()) {
        toast('退回时必须填写审核意见', 'error');
        return;
      }
      await api(`/api/${plural}/${id}/review`, { method: 'POST', body: { action: 'reject', note } });
      toast('已退回，等待录入人修改');
    }
    setTimeout(() => window.location.reload(), 500);
  }

  document.querySelectorAll('[data-review]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await runReview(button.dataset.resource, Number(button.dataset.id), button.dataset.review);
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });

  document.querySelectorAll('[data-detail-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const context = document.getElementById('detail-context');
      if (!context) return;
      try {
        await runReview(context.dataset.resource, Number(button.dataset.id), button.dataset.detailAction);
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });

  /* ---------------- 详情页附件 ---------------- */
  const detailContext = document.getElementById('detail-context');
  if (detailContext) {
    const ownerType = detailContext.dataset.resource;
    const ownerId = Number(detailContext.dataset.id);
    const fileInput = document.getElementById('attach-file');

    document.querySelector('[data-attach-pick]')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast('文件不能超过 10MB', 'error');
        fileInput.value = '';
        return;
      }
      try {
        toast('正在上传……', 'info');
        const base64 = await readFileAsBase64(file);
        await api('/api/attachments', {
          method: 'POST',
          body: {
            ownerType,
            ownerId,
            kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'document',
            title: file.name.replace(/\.[^.]+$/, ''),
            fileName: file.name,
            mimeType: file.type,
            base64,
          },
        });
        toast(`已上传 ${file.name}（${formatSize(file.size)}）`);
        setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        fileInput.value = '';
      }
    });

    document.querySelector('[data-attach-url]')?.addEventListener('click', async () => {
      const result = await openModal({
        title: '添加外部链接（视频 / 音频 / 文档）',
        body: `<div class="form-grid" style="padding:0">
          <label class="field span-full"><span class="field-label">链接地址<i>*</i></span>
            <input class="input" name="externalUrl" placeholder="https://www.bilibili.com/video/BV..."></label>
          <label class="field"><span class="field-label">类型</span>
            <select class="input" name="kind">
              <option value="video">视频</option><option value="audio">音频</option>
              <option value="document">文档</option><option value="image">图片</option>
            </select></label>
          <label class="field"><span class="field-label">标题</span><input class="input" name="title" placeholder="选填"></label>
        </div>`,
        confirmText: '添加',
      });
      if (!result) return;
      if (!result.externalUrl) {
        toast('请填写链接地址', 'error');
        return;
      }
      try {
        await api('/api/attachments', {
          method: 'POST',
          body: { ownerType, ownerId, kind: result.kind, title: result.title, externalUrl: result.externalUrl },
        });
        toast('已添加外部链接');
        setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        toast(error.message, 'error');
      }
    });

    document.querySelectorAll('[data-attach-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const okDelete = await confirmDialog('确定删除该档案文件？删除后无法恢复。', { confirmText: '删除' });
        if (!okDelete) return;
        try {
          await api(`/api/attachments/${button.dataset.attachDelete}`, { method: 'DELETE' });
          toast('已删除');
          setTimeout(() => window.location.reload(), 400);
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    });
  }

  /* ---------------- 导入 ---------------- */
  const importFile = document.getElementById('import-file');
  document.querySelectorAll('[data-import]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!importFile) return;
      importFile.dataset.resource = button.dataset.import;
      importFile.click();
    });
  });
  importFile?.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    const resourceKey = importFile.dataset.resource;
    if (!file || !resourceKey) return;
    if (file.size > 12 * 1024 * 1024) {
      toast('导入文件请控制在 12MB 以内', 'error');
      importFile.value = '';
      return;
    }
    try {
      toast('正在解析文件……', 'info');
      const base64 = await readFileAsBase64(file);
      const result = await api(`/api/import/${pl(resourceKey)}`, {
        method: 'POST',
        body: { filename: file.name, base64 },
      });
      const failedHtml = result.failed.length
        ? `<div class="table-wrap" style="max-height:300px;overflow:auto"><table class="data-table compact">
            <thead><tr><th>行号</th><th>失败原因</th></tr></thead>
            <tbody>${result.failed.map((item) => `<tr><td>第 ${Number(item.line)} 行</td><td>${escapeHtml(item.message)}</td></tr>`).join('')}</tbody>
          </table></div>`
        : '<p class="muted">全部记录导入成功。</p>';
      await openModal({
        title: '导入结果',
        body: `<div class="alert alert-info"><b>共解析 ${result.total} 行</b>
          <p>成功导入 <strong>${result.imported}</strong> 条，失败 ${result.failed.length} 条。导入的记录默认为草稿状态，需提交审核后发布。</p></div>${failedHtml}`,
        confirmText: '知道了',
        onConfirm: () => true,
      });
      if (result.imported > 0) setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      importFile.value = '';
    }
  });

  /* ---------------- 数据字典 ---------------- */
  const dictForm = document.getElementById('dict-form');
  if (dictForm) {
    const kind = dictForm.dataset.kind;
    let editingId = null;

    const reset = () => {
      dictForm.reset();
      editingId = null;
      const title = document.getElementById('dict-form-title');
      if (title) title.textContent = `新增${dictForm.dataset.label || '字典项'}`;
      const button = dictForm.querySelector('button[type="submit"]');
      if (button) button.textContent = '保存';
    };

    dictForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const isUpdate = editingId !== null;
      const payload = {};
      dictForm.querySelectorAll('[name]').forEach((input) => {
        payload[input.name] = input.value;
      });
      try {
        await api(isUpdate ? `/api/dict/${kind}/${editingId}` : `/api/dict/${kind}`, {
          method: isUpdate ? 'PUT' : 'POST',
          body: payload,
        });
        toast(isUpdate ? '已保存修改' : '已新增');
        setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        toast(error.message, 'error');
      }
    });
    dictForm.querySelector('button[type="reset"]')?.addEventListener('click', () => setTimeout(reset, 0));

    document.querySelectorAll('[data-dict-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = JSON.parse(button.dataset.dictEdit);
        editingId = item.id;
        dictForm.querySelectorAll('[name]').forEach((input) => {
          if (item[input.name] !== undefined && item[input.name] !== null) input.value = item[input.name];
        });
        const title = document.getElementById('dict-form-title');
        if (title) title.textContent = `编辑：${item.name || ''}`;
        dictForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    document.querySelectorAll('[data-dict-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const okDelete = await confirmDialog('确定删除该字典条目？已被档案使用的条目将无法删除。', { confirmText: '删除' });
        if (!okDelete) return;
        try {
          await api(`/api/dict/${kind}/${button.dataset.dictDelete}`, { method: 'DELETE' });
          toast('已删除');
          setTimeout(() => window.location.reload(), 400);
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    });
  }

  /* ---------------- 用户管理 ---------------- */
  const userForm = document.getElementById('user-form');
  if (userForm) {
    const fill = (user) => {
      userForm.querySelector('[name="id"]').value = user?.id || '';
      userForm.querySelector('[name="displayName"]').value = user?.display_name || '';
      const username = userForm.querySelector('[name="username"]');
      username.value = user?.username || '';
      username.readOnly = Boolean(user);
      userForm.querySelector('[name="password"]').value = '';
      userForm.querySelector('[name="password"]').required = !user;
      userForm.querySelector('[name="role"]').value = user?.role || 'editor';
      userForm.querySelector('[name="status"]').value = user?.status || 'active';
      const title = document.getElementById('user-form-title');
      if (title) title.textContent = user ? `编辑账号：${user.display_name}` : '新增账号';
    };

    userForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(userForm).entries());
      const id = data.id;
      const payload = {
        displayName: data.displayName,
        role: data.role,
        status: data.status,
      };
      if (data.password) payload.password = data.password;
      try {
        if (id) {
          await api(`/api/users/${id}`, { method: 'PUT', body: payload });
          toast('账号已更新');
        } else {
          await api('/api/users', {
            method: 'POST',
            body: { ...payload, username: data.username, password: data.password },
          });
          toast('账号已创建');
        }
        setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        toast(error.message, 'error');
      }
    });
    userForm.querySelector('button[type="reset"]')?.addEventListener('click', () => setTimeout(() => fill(null), 0));

    document.querySelectorAll('[data-user-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        fill(JSON.parse(button.dataset.userEdit));
        userForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    document.querySelectorAll('[data-user-reset]').forEach((button) => {
      button.addEventListener('click', async () => {
        const password = await promptDialog({
          title: '重置密码',
          label: '新密码（至少 6 位）',
          placeholder: '请输入新密码',
          confirmText: '重置',
        });
        if (password === null) return;
        if (password.length < 6) {
          toast('密码长度至少 6 位', 'error');
          return;
        }
        try {
          await api(`/api/users/${button.dataset.userReset}`, { method: 'PUT', body: { password } });
          toast('密码已重置');
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    });

    document.querySelectorAll('[data-user-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const okDelete = await confirmDialog('确定删除该账号？删除后无法恢复。', { confirmText: '删除' });
        if (!okDelete) return;
        try {
          await api(`/api/users/${button.dataset.userDelete}`, { method: 'DELETE' });
          toast('账号已删除');
          setTimeout(() => window.location.reload(), 400);
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    });
  }

  void el;
})();
