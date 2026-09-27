import { BRAND } from '../config.js';
import { DICT_KINDS } from '../dict.js';
import { labelFor } from '../dict.js';
import { GROUPS, STATUS, importFields } from '../resources.js';
import { h, relativeTime, truncate } from '../util.js';
import { adminLayout, uploadUrl } from './layout.js';
import { paginationBar, statusBadge, thumb } from './components.js';

export function loginView({ error = '' } = {}) {
  return `<div class="login-wrap">
    <div class="login-card">
      <div class="login-brand"><span class="brand-seal">非</span><div><strong>${h(BRAND.name)}</strong><em>管理端登录</em></div></div>
      <p class="login-sub">请输入账号密码，进入非遗档案管理后台。</p>
      <form id="login-form" autocomplete="on">
        <label class="field"><span class="field-label">用户名</span>
          <input class="input" type="text" name="username" required autocomplete="username" placeholder="请输入用户名">
        </label>
        <label class="field"><span class="field-label">密码</span>
          <input class="input" type="password" name="password" required autocomplete="current-password" placeholder="请输入密码">
        </label>
        <p class="form-error" id="login-error">${h(error)}</p>
        <button class="btn btn-primary btn-block" type="submit">登录管理端</button>
      </form>
      <div class="login-demo">
        <p class="login-demo-title">演示账号</p>
        <ul>
          <li><b>管理员</b><code>admin / Admin@123</code></li>
          <li><b>录入员</b><code>editor / Editor@123</code></li>
        </ul>
        <p class="login-demo-note">管理员与录入员共用这一个登录入口，系统按账号角色自动分配权限与菜单：管理员可管理全部档案并审核发布，录入员只能维护自己录入的档案、提交后由管理员审核。</p>
        <p class="login-demo-note">${h(BRAND.footerNote)}</p>
      </div>
      <a class="login-back" href="/">← 返回公众门户</a>
    </div>
  </div>`;
}

const ACTION_LABEL = {
  create: '新建', update: '修改', delete: '删除', submit: '提交审核', approve: '审核通过',
  reject: '审核退回', login: '登录', logout: '退出', upload: '上传档案', seed: '初始化',
  import: '导入', export: '导出', dict: '字典维护', user: '用户管理',
};

export function workbenchView({ user, data }) {
  const { cards, mine, stats, pending, myStatus } = data;
  const totalPending = pending.reduce((sum, item) => sum + item.total, 0);
  const isAdmin = user.role === 'admin';

  const mineRows = mine
    .map(
      (row) => `<tr>
        <td><span class="chip chip-plain">${h(row.kind === 'project' ? '项目' : '传承人')}</span></td>
        <td><a class="link" href="/admin/${row.kind === 'project' ? 'projects' : 'inheritors'}/${row.id}">${h(row.name)}</a></td>
        <td>${statusBadge(row.status)}</td>
        <td class="muted">${h(relativeTime(row.updated_at))}</td>
      </tr>`,
    )
    .join('');

  const categoryRows = cards
    .map(
      (card) => `<a class="wb-cat" href="/admin/projects?category_id=${card.index + 1}">
        <span class="wb-cat-code">${h(card.code)}</span>
        <span class="wb-cat-name">${h(card.name)}</span>
        <span class="wb-cat-total">${card.total}</span>
      </a>`,
    )
    .join('');

  const body = `
  <div class="page-head-row">
    <div>
      <h1 class="admin-title">工作台</h1>
      <p class="admin-sub">${h(user.display_name)}（${isAdmin ? '管理员' : '录入员'}），欢迎回来。${
        isAdmin
          ? '你可以管理全部档案、审核发布报送材料并维护系统设置。'
          : '你可以录入与维护自己录入的项目、传承人与传承基地，填写完成后提交管理员审核。'
      }</p>
    </div>
    <div class="head-actions">
      <a class="btn btn-primary" href="/admin/projects/new">＋ 新建项目</a>
      <a class="btn btn-ghost" href="/admin/inheritors/new">＋ 新建传承人</a>
      ${isAdmin ? '<a class="btn btn-ghost" href="/admin/dashboard" target="_blank" rel="noopener">全屏数据大屏 ↗</a>' : ''}
    </div>
  </div>

  <div class="stat-row">
    <div class="stat-card"><span class="stat-label">已发布项目</span><span class="stat-value">${stats.totals.published.projects}<em>项</em></span><span class="stat-hint">全部项目 ${stats.totals.projects} 项</span></div>
    <div class="stat-card"><span class="stat-label">已发布传承人</span><span class="stat-value">${stats.totals.published.inheritors}<em>位</em></span><span class="stat-hint">全部传承人 ${stats.totals.inheritors} 位</span></div>
    <div class="stat-card"><span class="stat-label">传承基地 / 单位</span><span class="stat-value">${stats.totals.published.organizations}<em>个</em></span><span class="stat-hint">对外开放 ${stats.totals.openOrganizations} 个</span></div>
    <div class="stat-card ${totalPending ? 'is-highlight' : ''}"><span class="stat-label">待审核</span><span class="stat-value">${totalPending}<em>条</em></span><span class="stat-hint">${totalPending ? '有待处理的报送材料' : '暂无待办'}</span></div>
  </div>

  <div class="wb-grid">
    <section class="panel">
      ${
        isAdmin
          ? `<header class="panel-head"><h2>待办事项</h2><a class="link" href="/admin/reviews">进入审核中心 →</a></header>
             <ul class="todo-list">
               ${pending.map((item) => `<li><span>${h(item.label)} 待审核</span><b class="${item.total ? 'is-warn' : ''}">${item.total}</b></li>`).join('')}
             </ul>`
          : `<header class="panel-head"><h2>我的待办</h2><a class="link" href="/admin/projects?status=mine">我录入的档案 →</a></header>
             <ul class="todo-list">
               <li><span>草稿（待填写完成）</span><b class="${myStatus.draft ? 'is-warn' : ''}">${myStatus.draft}</b></li>
               <li><span>待审核（已提交）</span><b>${myStatus.pending}</b></li>
               <li><span>已退回（需修改后重新提交）</span><b class="${myStatus.rejected ? 'is-warn' : ''}">${myStatus.rejected}</b></li>
               <li><span>已发布</span><b>${myStatus.published}</b></li>
             </ul>
             <p class="muted pad">录入员负责资料采集与建档，审核发布由管理员完成。你的档案只能由你本人编辑。</p>`
      }
      <header class="panel-head"><h2>我最近录入</h2></header>
      ${mine.length ? `<table class="data-table compact"><tbody>${mineRows}</tbody></table>` : '<p class="muted pad">暂无记录，点击右上角新建档案。</p>'}
    </section>

    <section class="panel">
      <header class="panel-head"><h2>十大类目项目数</h2><a class="link" href="/admin/projects">项目管理 →</a></header>
      <div class="wb-cats">${categoryRows}</div>
      ${
        isAdmin
          ? ''
          : '<header class="panel-head"><h2>权限说明</h2></header><p class="muted pad">你的账号角色为「录入员」：可新建与编辑自己录入的档案、上传多媒体资料、提交审核；不能审核发布、不能修改或删除他人录入的档案、数据字典为只读。如需调整权限请联系管理员。</p>'
      }
      <header class="panel-head"><h2>最近操作</h2>${
        isAdmin ? '<a class="link" href="/admin/logs">全部日志 →</a>' : '<span class="panel-hint">仅管理员可查看完整日志</span>'
      }</header>
      <ul class="log-list">
        ${stats.recentLogs
          .map(
            (log) => `<li><span class="log-dot"></span><div><b>${h(log.user_name)}</b> ${h(ACTION_LABEL[log.action] || log.action)} ${h(truncate(log.target_name, 18))}<em>${h(relativeTime(log.created_at))}</em></div></li>`,
          )
          .join('') || '<li class="muted">暂无操作记录</li>'}
      </ul>
    </section>
  </div>`;

  return adminLayout({
    title: '工作台',
    user,
    active: 'work',
    crumbs: [{ label: '工作台' }],
    pendingTotal: totalPending,
    body,
  });
}

/* ---------------- 通用列表页 ---------------- */

function listCell(resource, field, row, dicts) {
  const value = row[field.name];
  if (field.type === 'image') {
    return `<a class="cell-thumb" href="/admin/${resource.key === 'project' ? 'projects' : resource.key === 'inheritor' ? 'inheritors' : 'organizations'}/${row.id}">
      ${value ? `<img src="${h(uploadUrl(value))}" alt="" loading="lazy">` : '<span class="cell-thumb-empty">无</span>'}
    </a>`;
  }
  if (field.type === 'bool') {
    return value ? '<span class="chip chip-gold">是</span>' : '<span class="muted">否</span>';
  }
  if (field.type === 'ref' && field.ref === 'level') {
    return labelFor(resource, field, row) ? `<span class="chip chip-plain">${h(labelFor(resource, field, row))}</span>` : '<span class="muted">—</span>';
  }
  const label = labelFor(resource, field, row);
  if (!label) return '<span class="muted">—</span>';
  if (field.name === resource.titleField) {
    return `<a class="link strong" href="/admin/${resource.key === 'project' ? 'projects' : resource.key === 'inheritor' ? 'inheritors' : 'organizations'}/${row.id}">${h(label)}</a>`;
  }
  return h(truncate(label, field.width > 160 ? 30 : 16));
}

function adminBase(resource) {
  return resource.key === 'project' ? '/admin/projects' : resource.key === 'inheritor' ? '/admin/inheritors' : '/admin/organizations';
}

export function listPageView({ resource, pageInfo, query, user, dicts, pendingTotal, canCreate = true }) {
  const base = adminBase(resource);
  const columns = resource.fields.filter((field) => field.list && field.name !== 'code');
  const filterable = resource.fields.filter((field) => field.filter);

  const filterHtml = filterable
    .map((field) => {
      let options = [];
      let selected = query[field.name] || '';
      if (field.type === 'ref') {
        options = dicts.refOptions(field.ref).map((item) => ({ value: item.id, label: item.label }));
      } else if (field.type === 'dict') {
        options = dicts.dictOptions(field.dict).map((item) => ({ value: item.name, label: item.name }));
      } else if (field.type === 'select') {
        options = (field.options || []).map((item) => ({ value: item, label: item }));
      }
      return `<select name="${field.name}">
        <option value="">全部${h(field.label)}</option>
        ${options.map((o) => `<option value="${h(o.value)}"${String(selected) === String(o.value) ? ' selected' : ''}>${h(o.label)}</option>`).join('')}
      </select>`;
    })
    .join('');

  const statusOptions = Object.entries(STATUS)
    .map(([key, spec]) => `<option value="${key}"${query.status === key ? ' selected' : ''}>${h(spec.label)}</option>`)
    .join('');

  const headerCells = columns
    .map((field) => `<th${field.width ? ` style="min-width:${field.width}px"` : ''}>${h(field.label)}</th>`)
    .join('');

  const rows = pageInfo.items
    .map((row) => {
      const cells = columns.map((field) => `<td>${listCell(resource, field, row, dicts)}</td>`).join('');
      return `<tr data-id="${row.id}" data-name="${h(row[resource.titleField])}">
        <td class="col-check"><input type="checkbox" class="row-check" value="${row.id}"></td>
        <td><code class="code">${h(row.code)}</code></td>
        ${cells}
        <td>${statusBadge(row.status)}</td>
        <td class="muted">${h(relativeTime(row.updated_at))}</td>
        <td class="col-actions">
          <a class="btn btn-xs btn-ghost" href="${base}/${row.id}/edit">编辑</a>
          <div class="dropdown">
            <button class="btn btn-xs btn-ghost dropdown-toggle" type="button" aria-haspopup="true">更多 ▾</button>
            <div class="dropdown-menu">
              <a href="${base}/${row.id}">查看详情</a>
              <button type="button" data-action="submit" data-id="${row.id}">提交审核</button>
              <button type="button" data-action="history" data-id="${row.id}">操作记录</button>
              <button type="button" class="danger" data-action="delete" data-id="${row.id}">删除</button>
            </div>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  const body = `
  <div class="page-head-row">
    <div>
      <h1 class="admin-title">${h(resource.label)}管理</h1>
      <p class="admin-sub">共 ${pageInfo.total} 条记录${query.status === 'mine' ? '（仅显示我录入的）' : ''}。支持按类别、级别、地区与关键词筛选。</p>
    </div>
    <div class="head-actions">
      ${canCreate ? `<a class="btn btn-primary" href="${base}/new">＋ 新建${h(resource.one)}</a>` : ''}
      <button class="btn btn-ghost" type="button" data-import="${resource.key}">导入 Excel/CSV</button>
      <a class="btn btn-ghost" href="/api/export/${resource.key}.xlsx${queryString(query)}">导出 Excel</a>
      <a class="btn btn-ghost" href="/api/export/${resource.key}.csv${queryString(query)}">导出 CSV</a>
      <a class="btn btn-ghost" href="/api/template/${resource.key}.csv">下载导入模板</a>
    </div>
  </div>

  <form class="toolbar" method="get" action="${base}">
    <input class="toolbar-search" type="search" name="q" value="${h(query.q || '')}" placeholder="搜索${h(resource.one)}名称、关键词">
    ${filterHtml}
    <select name="status">
      <option value="">全部状态</option>
      ${statusOptions}
      <option value="mine"${query.status === 'mine' ? ' selected' : ''}>我录入的</option>
      <option value="todo"${query.status === 'todo' ? ' selected' : ''}>待我提交/退回</option>
    </select>
    <button class="btn btn-primary" type="submit">查询</button>
    <a class="btn btn-ghost" href="${base}">重置</a>
  </form>

  <div class="table-tools">
    <label class="check-all"><input type="checkbox" id="check-all"> 全选本页</label>
    <div class="batch-actions">
      <button class="btn btn-xs btn-ghost" type="button" data-batch="submit">批量提交审核</button>
      <button class="btn btn-xs btn-ghost danger" type="button" data-batch="delete">批量删除</button>
    </div>
    <span class="table-tip">已选 <b id="selected-count">0</b> 条</span>
  </div>

  <div class="table-wrap">
    <table class="data-table" data-resource="${resource.key}">
      <thead><tr>
        <th class="col-check"><input type="checkbox" disabled></th>
        <th style="min-width:120px">编号</th>
        ${headerCells}
        <th style="min-width:88px">状态</th>
        <th style="min-width:96px">更新时间</th>
        <th style="min-width:170px">操作</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="${columns.length + 6}"><div class="empty-state"><div class="empty-mark">◌</div><p class="empty-title">没有符合条件的记录</p><p class="empty-hint">调整筛选条件，或点击右上角新建。</p></div></td></tr>`}</tbody>
    </table>
  </div>
  ${paginationBar(base, query, pageInfo)}
  <input type="file" id="import-file" accept=".csv,.xlsx,.xls,text/csv" hidden>
  `;

  return adminLayout({
    title: `${resource.label}管理`,
    user,
    active: resource.key,
    crumbs: [{ label: `${resource.label}管理` }],
    pendingTotal,
    wide: true,
    scripts: ['/assets/js/admin.js'],
    body,
  });
}

function queryString(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '' || key === 'page') continue;
    params.set(key, value);
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/* ---------------- 通用表单页 ---------------- */

function fieldControl(resource, field, value, dicts) {
  const name = field.name;
  const required = field.required ? ' required' : '';
  const help = field.help ? `<span class="field-help">${h(field.help)}</span>` : '';
  switch (field.type) {
    case 'textarea':
      return `<label class="field span-full"><span class="field-label">${h(field.label)}${field.required ? '<i>*</i>' : ''}</span>
        <textarea class="input" name="${name}" rows="${field.rows || 4}"${required}>${h(value || '')}</textarea>${help}</label>`;
    case 'number':
    case 'year':
      return `<label class="field"><span class="field-label">${h(field.label)}${field.required ? '<i>*</i>' : ''}</span>
        <input class="input" type="number" name="${name}" value="${h(value ?? '')}"${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''}${required}>${help}</label>`;
    case 'select': {
      const options = (field.options || []).map((o) => `<option value="${h(o)}"${String(value) === String(o) ? ' selected' : ''}>${h(o)}</option>`).join('');
      return `<label class="field"><span class="field-label">${h(field.label)}${field.required ? '<i>*</i>' : ''}</span>
        <select class="input" name="${name}"${required}><option value="">请选择</option>${options}</select>${help}</label>`;
    }
    case 'dict': {
      const options = dicts.dictOptions(field.dict).map((o) => `<option value="${h(o.name)}"${String(value) === String(o.name) ? ' selected' : ''}>${h(o.name)}</option>`).join('');
      return `<label class="field"><span class="field-label">${h(field.label)}${field.required ? '<i>*</i>' : ''}</span>
        <select class="input" name="${name}"${required}><option value="">请选择</option>${options}</select>${help}</label>`;
    }
    case 'ref': {
      const options = dicts
        .refOptions(field.ref)
        .map((o) => `<option value="${o.id}"${String(value) === String(o.id) ? ' selected' : ''}>${h(o.label)}</option>`)
        .join('');
      return `<label class="field"><span class="field-label">${h(field.label)}${field.required ? '<i>*</i>' : ''}</span>
        <select class="input" name="${name}"${required}><option value="">请选择</option>${options}</select>${help}</label>`;
    }
    case 'bool':
      return `<label class="field field-switch"><span class="field-label">${h(field.label)}</span>
        <span class="switch-row"><input type="checkbox" name="${name}" value="1"${Number(value) ? ' checked' : ''} id="f-${name}"><label for="f-${name}" class="switch"></label></span>${help}</label>`;
    case 'image':
      return `<div class="field span-full image-field" data-image-field data-name="${name}">
        <span class="field-label">${h(field.label)}</span>
        <div class="image-box">
          <div class="image-preview" data-preview>${value ? `<img src="${h(uploadUrl(value))}" alt="">` : '<span>尚未上传</span>'}</div>
          <div class="image-actions">
            <input type="hidden" name="${name}" value="${h(value || '')}" data-image-input>
            <button class="btn btn-ghost btn-sm" type="button" data-image-pick>选择图片上传</button>
            <button class="btn btn-ghost btn-sm danger" type="button" data-image-clear>移除</button>
            <span class="field-help">支持 JPG / PNG / WEBP / GIF，单张不超过 10MB。</span>
          </div>
        </div>${help}</div>`;
    case 'url':
      return `<label class="field span-full"><span class="field-label">${h(field.label)}</span>
        <input class="input" type="url" name="${name}" value="${h(value || '')}" placeholder="https://">${help}</label>`;
    case 'month':
      return `<label class="field"><span class="field-label">${h(field.label)}${field.required ? '<i>*</i>' : ''}</span>
        <input class="input" type="text" name="${name}" value="${h(value || '')}" placeholder="${h(field.placeholder || '1958-06')}" pattern="\\d{4}(-\\d{1,2})?"${required}>${help}</label>`;
    default:
      return `<label class="field"><span class="field-label">${h(field.label)}${field.required ? '<i>*</i>' : ''}</span>
        <input class="input" type="text" name="${name}" value="${h(value || '')}" placeholder="${h(field.placeholder || '')}"${required}>${help}</label>`;
  }
}

export function formPageView({ resource, row, user, dicts, mode, relations = {}, pendingTotal }) {
  const editing = mode === 'edit';
  const base = adminBase(resource);
  const groups = new Map();
  for (const field of resource.fields) {
    const key = field.group || 'basic';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(field);
  }

  const groupHtml = [...groups.entries()]
    .map(
      ([key, fields]) => `<section class="panel form-panel">
        <header class="panel-head"><h2>${h(GROUPS[key] || key)}</h2></header>
        <div class="form-grid">${fields.map((field) => fieldControl(resource, field, row[field.name], dicts)).join('')}</div>
      </section>`,
    )
    .join('');

  const relationHtml =
    resource.key === 'project'
      ? `<section class="panel form-panel">
          <header class="panel-head"><h2>代表性传承人</h2><span class="panel-hint">可多选，第一位作为代表性传承人展示</span></header>
          <div class="relation-box">
            <input class="toolbar-search" type="search" placeholder="输入姓名筛选" data-filter-target="inheritor-list">
            <div class="relation-list" id="inheritor-list">
              ${dicts.inheritorOptions
                .map(
                  (person) => `<label class="relation-item" data-keyword="${h(person.name)}">
                    <input type="checkbox" name="__inheritors" value="${person.id}"${relations.inheritorIds?.includes(person.id) ? ' checked' : ''}>
                    <span>${h(person.name)}</span><em>${h(person.level_name || '')}</em>
                  </label>`,
                )
                .join('') || '<p class="muted pad">暂无传承人数据，请先录入传承人。</p>'}
            </div>
          </div>
        </section>`
      : resource.key === 'inheritor'
        ? `<section class="panel form-panel">
            <header class="panel-head"><h2>代表性项目</h2><span class="panel-hint">可多选，勾选其传承的项目</span></header>
            <div class="relation-box">
              <input class="toolbar-search" type="search" placeholder="输入项目名称筛选" data-filter-target="project-list">
              <div class="relation-list" id="project-list">
                ${dicts.projectOptions
                  .map(
                    (project) => `<label class="relation-item" data-keyword="${h(project.name)}">
                      <input type="checkbox" name="__projects" value="${project.id}"${relations.projectIds?.includes(project.id) ? ' checked' : ''}>
                      <span>${h(project.name)}</span><em>${h(project.category_name || '')}</em>
                    </label>`,
                  )
                  .join('') || '<p class="muted pad">暂无项目数据，请先录入项目。</p>'}
              </div>
            </div>
          </section>`
        : '';

  const reviewBox =
    editing && row.review_note
      ? `<div class="alert alert-${row.status === 'rejected' ? 'danger' : 'info'}"><b>审核意见</b><p>${h(row.review_note)}</p></div>`
      : '';

  const body = `
  <div class="page-head-row">
    <div>
      <h1 class="admin-title">${editing ? `编辑${h(resource.one)}` : `新建${h(resource.one)}`}</h1>
      <p class="admin-sub">${editing ? `编号 ${h(row.code)} · 当前状态：${h(STATUS[row.status]?.label || row.status)}` : `填写完整信息后保存为草稿，再提交管理员审核发布。`}</p>
    </div>
    <div class="head-actions">
      <a class="btn btn-ghost" href="${base}">返回列表</a>
      ${editing ? `<a class="btn btn-ghost" href="${base}/${row.id}">查看详情</a>` : ''}
    </div>
  </div>
  ${reviewBox}
  <form id="resource-form" data-base="${base}" data-id="${editing ? row.id : ''}" data-resource="${resource.key}">
    ${groupHtml}
    ${relationHtml}
    <div class="form-actions">
      <button class="btn btn-primary" type="submit">${editing ? '保存修改' : '保存为草稿'}</button>
      ${editing ? '<button class="btn btn-ghost" type="button" data-form-action="submit">保存并提交审核</button>' : ''}
      <a class="btn btn-ghost" href="${base}">取消</a>
    </div>
  </form>
  `;

  return adminLayout({
    title: `${editing ? '编辑' : '新建'}${resource.one}`,
    user,
    active: resource.key,
    crumbs: [{ label: `${resource.label}管理`, href: base }, { label: editing ? '编辑' : '新建' }],
    pendingTotal,
    scripts: ['/assets/js/admin.js'],
    body,
  });
}

/* ---------------- 详情页 ---------------- */

export function detailPageView({ resource, row, user, dicts, relations, attachments, pendingTotal, audit }) {
  const base = adminBase(resource);
  const infoFields = resource.fields.filter((field) => !['image', 'textarea', 'url', 'bool'].includes(field.type));
  const proseFields = resource.fields.filter((field) => field.type === 'textarea');
  const flagFields = resource.fields.filter((field) => field.type === 'bool');
  const imageField = resource.fields.find((field) => field.type === 'image');

  const infoHtml = infoFields
    .map((field) => {
      const label = labelFor(resource, field, row);
      return `<div class="meta-item"><dt>${h(field.label)}</dt><dd>${label ? h(label) : '<span class="muted">—</span>'}</dd></div>`;
    })
    .join('');

  const relatedHtml =
    resource.key === 'project'
      ? `<section class="panel"><header class="panel-head"><h2>代表性传承人</h2></header>
          ${relations.inheritors.length
            ? `<ul class="people-list">${relations.inheritors
                .map((p) => `<li><a href="/admin/inheritors/${p.id}">${p.photo_path ? `<img src="${h(uploadUrl(p.photo_path))}" alt="">` : '<span class="avatar-fallback">传</span>'}<div><b>${h(p.name)}</b><em>${h(p.level_name || '')} · ${h(p.region_label || '')}</em></div></a></li>`)
                .join('')}</ul>`
            : '<p class="muted pad">尚未关联传承人，点击编辑进行关联。</p>'}
        </section>`
      : resource.key === 'inheritor'
        ? `<section class="panel"><header class="panel-head"><h2>代表性项目</h2></header>
            ${relations.projects.length
              ? `<ul class="people-list">${relations.projects.map((p) => `<li><a href="/admin/projects/${p.id}"><div><b>${h(p.name)}</b><em>${h(p.category_name || '')} · ${h(p.level_name || '')}</em></div></a></li>`).join('')}</ul>`
              : '<p class="muted pad">尚未关联项目。</p>'}
          </section>`
        : `<section class="panel"><header class="panel-head"><h2>在此保护传承的项目</h2></header>
            ${relations.projects.length
              ? `<ul class="people-list">${relations.projects.map((p) => `<li><a href="/admin/projects/${p.id}"><div><b>${h(p.name)}</b><em>${h(p.level_name || '')}</em></div></a></li>`).join('')}</ul>`
              : '<p class="muted pad">暂无关联项目。</p>'}
          </section>`;

  const attachmentHtml = `
    <section class="panel">
      <header class="panel-head"><h2>多媒体档案</h2><span class="panel-hint">图片、音频、PDF 直接上传；视频可填外链</span></header>
      <div class="upload-row">
        <input type="file" id="attach-file" accept="image/*,audio/*,application/pdf,.doc,.docx,.txt" hidden>
        <button class="btn btn-primary btn-sm" type="button" data-attach-pick>＋ 上传本地文件</button>
        <button class="btn btn-ghost btn-sm" type="button" data-attach-url>＋ 添加外部链接</button>
      </div>
      <div class="attach-grid" id="attach-grid">
        ${attachments.length
          ? attachments
              .map(
                (a) => `<figure class="attach-item">
                  ${a.kind === 'image' ? `<img src="${h(uploadUrl(a.file_path || a.external_url))}" alt="" loading="lazy">` : `<span class="attach-icon">${{ audio: '♪', video: '▶', document: '▤' }[a.kind] || '▤'}</span>`}
                  <figcaption>
                    <b>${h(a.title || a.file_name || '未命名')}</b>
                    <em>${h({ image: '图片', audio: '音频', video: '视频', document: '文档' }[a.kind] || a.kind)}</em>
                    <span class="attach-actions">
                      <a class="btn btn-xs btn-ghost" href="${h(a.external_url || uploadUrl(a.file_path))}" target="_blank" rel="noopener">查看</a>
                      <button class="btn btn-xs btn-ghost danger" type="button" data-attach-delete="${a.id}">删除</button>
                    </span>
                  </figcaption>
                </figure>`,
              )
              .join('')
          : '<p class="muted pad">暂无档案文件。</p>'}
      </div>
    </section>`;

  const auditHtml = audit.length
    ? `<section class="panel"><header class="panel-head"><h2>操作记录</h2></header>
        <ul class="log-list">${audit
          .map((log) => `<li><span class="log-dot"></span><div><b>${h(log.user_name)}</b> ${h(ACTION_LABEL[log.action] || log.action)}<em>${h(log.created_at)}</em></div></li>`)
          .join('')}</ul></section>`
    : '';

  const body = `
  <div id="detail-context" data-resource="${h(resource.key)}" data-id="${row.id}" hidden></div>
  <div class="page-head-row">
    <div>
      <div class="title-row">
        <h1 class="admin-title">${h(row[resource.titleField])}</h1>
        ${statusBadge(row.status)}
      </div>
      <p class="admin-sub">编号 ${h(row.code)} · 录入人 ${h(dicts.userName(row.created_by))} · 更新于 ${h(row.updated_at)}</p>
    </div>
    <div class="head-actions">
      <a class="btn btn-ghost" href="${base}">返回列表</a>
      <a class="btn btn-ghost" href="${resource.publicPath}/${row.id}" target="_blank" rel="noopener">门户预览 ↗</a>
      ${row.status === 'draft' || row.status === 'rejected' ? `<button class="btn btn-primary" type="button" data-detail-action="submit" data-id="${row.id}">提交审核</button>` : ''}
      ${user.role === 'admin' && row.status === 'pending' ? `<button class="btn btn-primary" type="button" data-detail-action="approve" data-id="${row.id}">审核通过</button><button class="btn btn-ghost" type="button" data-detail-action="reject" data-id="${row.id}">退回</button>` : ''}
      <a class="btn btn-primary" href="${base}/${row.id}/edit">编辑</a>
    </div>
  </div>

  ${row.review_note ? `<div class="alert alert-${row.status === 'rejected' ? 'danger' : 'info'}"><b>审核意见</b><p>${h(row.review_note)}</p></div>` : ''}

  <div class="detail-admin-grid">
    <section class="panel">
      <header class="panel-head"><h2>基本信息</h2></header>
      <dl class="meta-grid">${infoHtml}</dl>
      ${flagFields.length ? `<div class="chip-row pad">${flagFields.map((field) => `<span class="chip ${Number(row[field.name]) ? 'chip-gold' : 'chip-plain'}">${h(field.label)}：${Number(row[field.name]) ? '是' : '否'}</span>`).join('')}</div>` : ''}
    </section>
    <section class="panel">
      <header class="panel-head"><h2>${h(imageField?.label || '影像')}</h2></header>
      ${thumb(row[imageField?.name] || '', row[resource.titleField], { ratio: '16x10' })}
      ${row.video_url ? `<p class="pad"><a class="link" href="${h(row.video_url)}" target="_blank" rel="noopener">影像视频外链 ↗</a></p>` : ''}
    </section>
  </div>

  ${proseFields
    .filter((field) => row[field.name])
    .map((field) => `<section class="panel"><header class="panel-head"><h2>${h(field.label)}</h2></header><div class="prose">${h(row[field.name])}</div></section>`)
    .join('')}

  ${relatedHtml}
  ${attachmentHtml}
  ${auditHtml}
  `;

  return adminLayout({
    title: row[resource.titleField],
    user,
    active: resource.key,
    crumbs: [{ label: `${resource.label}管理`, href: base }, { label: '详情' }],
    pendingTotal,
    scripts: ['/assets/js/admin.js'],
    body,
  });
}

/* ---------------- 审核中心 ---------------- */

export function reviewsView({ groups, user, pendingTotal, query }) {
  const sections = groups
    .map(
      (group) => `<section class="panel">
        <header class="panel-head"><h2>${h(group.label)}</h2><span class="panel-hint">共 ${group.items.length} 条待审核</span></header>
        ${group.items.length
          ? `<div class="table-wrap"><table class="data-table">
              <thead><tr><th style="min-width:120px">编号</th><th style="min-width:200px">名称</th><th>录入人</th><th>提交时间</th><th style="min-width:200px">操作</th></tr></thead>
              <tbody>${group.items
                .map(
                  (item) => `<tr>
                    <td><code class="code">${h(item.code)}</code></td>
                    <td><a class="link strong" href="/admin/${group.path}/${item.id}">${h(item.name)}</a></td>
                    <td>${h(item.created_by_name || '—')}</td>
                    <td class="muted">${h(item.updated_at)}</td>
                    <td>
                      <button class="btn btn-xs btn-primary" type="button" data-review="approve" data-resource="${group.key}" data-id="${item.id}">通过并发布</button>
                      <button class="btn btn-xs btn-ghost" type="button" data-review="reject" data-resource="${group.key}" data-id="${item.id}">退回修改</button>
                      <a class="btn btn-xs btn-ghost" href="/admin/${group.path}/${item.id}">查看材料</a>
                    </td>
                  </tr>`,
                )
                .join('')}</tbody>
            </table></div>`
          : '<p class="muted pad">当前没有待审核记录。</p>'}
      </section>`,
    )
    .join('');

  const body = `
  <div class="page-head-row">
    <div>
      <h1 class="admin-title">审核中心</h1>
      <p class="admin-sub">录入员提交的材料在此审核。通过后将在公众门户与数据大屏中展示。</p>
    </div>
  </div>
  ${sections}`;

  return adminLayout({
    title: '审核中心',
    user,
    active: 'reviews',
    crumbs: [{ label: '审核中心' }],
    pendingTotal,
    wide: true,
    scripts: ['/assets/js/admin.js'],
    body,
  });
}

/* ---------------- 数据字典 ---------------- */

export function dictView({ kind, items, dicts, user, pendingTotal, readOnly = false }) {
  const spec = DICT_KINDS[kind];
  const tabs = Object.entries(DICT_KINDS)
    .map(([key, value]) => `<a class="tab${key === kind ? ' is-active' : ''}" href="/admin/dict?kind=${key}">${h(value.label)}</a>`)
    .join('');

  const headerCells = spec.columns.map((column) => `<th>${h(column.label)}</th>`).join('');
  const rows = items
    .map((item) => {
      const cells = spec.columns
        .map((column) => {
          const value = item[column.name];
          if (column.type === 'ref' && column.ref === 'region') {
            return `<td>${value ? h(dicts.regionLabel(value)) : '<span class="muted">—</span>'}</td>`;
          }
          if (column.type === 'textarea') return `<td>${h(truncate(value, 40)) || '<span class="muted">—</span>'}</td>`;
          return `<td>${value === null || value === undefined || value === '' ? '<span class="muted">—</span>' : h(value)}</td>`;
        })
        .join('');
      return `<tr data-id="${item.id}">
        <td>${cells}</td>
        <td class="col-actions">${
          readOnly
            ? '<span class="muted">只读</span>'
            : `<button class="btn btn-xs btn-ghost" type="button" data-dict-edit='${h(JSON.stringify({ ...item, __kind: kind }))}'>编辑</button>
               <button class="btn btn-xs btn-ghost danger" type="button" data-dict-delete="${item.id}">删除</button>`
        }</td>
      </tr>`;
    })
    .join('');

  const formControls = spec.columns
    .map((column) => {
      if (column.type === 'ref' && column.ref === 'region') {
        return `<label class="field"><span class="field-label">${h(column.label)}</span>
          <select class="input" name="${column.name}"><option value="">无（顶级区域）</option>
            ${dicts.regions.map((r) => `<option value="${r.id}">${h(dicts.regionLabel(r.id))}</option>`).join('')}
          </select></label>`;
      }
      if (column.type === 'select') {
        return `<label class="field"><span class="field-label">${h(column.label)}</span>
          <select class="input" name="${column.name}">${(column.options || []).map((o) => `<option value="${h(o)}">${h(o)}</option>`).join('')}</select></label>`;
      }
      if (column.type === 'textarea') {
        return `<label class="field span-full"><span class="field-label">${h(column.label)}</span><textarea class="input" name="${column.name}" rows="3"></textarea></label>`;
      }
      if (column.type === 'number') {
        return `<label class="field"><span class="field-label">${h(column.label)}</span><input class="input" type="number" name="${column.name}" value="0"></label>`;
      }
      return `<label class="field"><span class="field-label">${h(column.label)}${column.required ? '<i>*</i>' : ''}</span><input class="input" type="text" name="${column.name}"></label>`;
    })
    .join('');

  const body = `
  <div class="page-head-row">
    <div>
      <h1 class="admin-title">数据字典</h1>
      <p class="admin-sub">${
        readOnly
          ? '当前账号为录入员，数据字典为只读。如需新增或修改字典条目，请联系管理员。'
          : '维护类别、级别、行政区域、公布批次与基地类型。已被档案引用的条目不能删除。'
      }</p>
    </div>
  </div>
  <div class="tabs">${tabs}</div>
  <div class="dict-grid">
    <section class="panel">
      <header class="panel-head"><h2>${h(spec.label)}列表</h2><span class="panel-hint">共 ${items.length} 条</span></header>
      <div class="table-wrap"><table class="data-table">
        <thead><tr>${headerCells}<th style="min-width:130px">操作</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${spec.columns.length + 1}"><p class="muted pad">暂无数据</p></td></tr>`}</tbody>
      </table></div>
    </section>
    ${
      readOnly
        ? `<section class="panel"><header class="panel-head"><h2>权限说明</h2></header>
             <p class="pad muted">录入员可查看字典用于填写档案，但不能新增、修改或删除字典条目。字典变更会影响全平台数据口径，因此仅管理员可操作。</p>
           </section>`
        : `<section class="panel">
      <header class="panel-head"><h2 id="dict-form-title">新增${h(spec.label)}</h2></header>
      <form id="dict-form" class="form-grid" data-kind="${kind}" data-label="${h(spec.label)}">
        ${formControls}
        <div class="form-actions span-full">
          <button class="btn btn-primary" type="submit">保存</button>
          <button class="btn btn-ghost" type="reset">清空</button>
        </div>
      </form>
    </section>`
    }
  </div>`;

  return adminLayout({
    title: '数据字典',
    user,
    active: 'dict',
    crumbs: [{ label: '数据字典' }],
    pendingTotal,
    wide: true,
    scripts: ['/assets/js/admin.js'],
    body,
  });
}

/* ---------------- 用户管理 ---------------- */

export function usersView({ users, user, pendingTotal }) {
  const rows = users
    .map(
      (item) => `<tr data-id="${item.id}">
        <td><b>${h(item.display_name)}</b></td>
        <td><code class="code">${h(item.username)}</code></td>
        <td>${item.role === 'admin' ? '<span class="chip chip-red">管理员</span>' : '<span class="chip chip-plain">录入员</span>'}</td>
        <td>${item.status === 'active' ? '<span class="badge badge-ok">启用</span>' : '<span class="badge badge-muted">停用</span>'}</td>
        <td class="muted">${h(item.created_at)}</td>
        <td class="col-actions">
          <button class="btn btn-xs btn-ghost" type="button" data-user-edit='${h(JSON.stringify(item))}'>编辑</button>
          <button class="btn btn-xs btn-ghost" type="button" data-user-reset="${item.id}">重置密码</button>
          ${item.id === user.id ? '' : `<button class="btn btn-xs btn-ghost danger" type="button" data-user-delete="${item.id}">删除</button>`}
        </td>
      </tr>`,
    )
    .join('');

  const body = `
  <div class="page-head-row">
    <div>
      <h1 class="admin-title">用户管理</h1>
      <p class="admin-sub">管理员拥有全部数据与审核权限；录入员只能维护自己录入的档案并提交审核。</p>
    </div>
  </div>
  <div class="dict-grid">
    <section class="panel">
      <header class="panel-head"><h2>账号列表</h2><span class="panel-hint">共 ${users.length} 个账号</span></header>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>显示名称</th><th>用户名</th><th>角色</th><th>状态</th><th>创建时间</th><th style="min-width:210px">操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>
    <section class="panel">
      <header class="panel-head"><h2 id="user-form-title">新增账号</h2></header>
      <form id="user-form" class="form-grid">
        <input type="hidden" name="id" value="">
        <label class="field"><span class="field-label">显示名称<i>*</i></span><input class="input" type="text" name="displayName" required></label>
        <label class="field"><span class="field-label">用户名<i>*</i></span><input class="input" type="text" name="username" required placeholder="字母数字，3-40 位"></label>
        <label class="field"><span class="field-label">密码<i>*</i></span><input class="input" type="text" name="password" required placeholder="至少 6 位"></label>
        <label class="field"><span class="field-label">角色</span>
          <select class="input" name="role"><option value="editor">录入员</option><option value="admin">管理员</option></select>
        </label>
        <label class="field"><span class="field-label">状态</span>
          <select class="input" name="status"><option value="active">启用</option><option value="disabled">停用</option></select>
        </label>
        <div class="form-actions span-full">
          <button class="btn btn-primary" type="submit">保存账号</button>
          <button class="btn btn-ghost" type="reset">清空</button>
        </div>
      </form>
    </section>
  </div>`;

  return adminLayout({
    title: '用户管理',
    user,
    active: 'users',
    crumbs: [{ label: '用户管理' }],
    pendingTotal,
    wide: true,
    scripts: ['/assets/js/admin.js'],
    body,
  });
}

/* ---------------- 操作日志 ---------------- */

export function logsView({ pageInfo, query, user, pendingTotal }) {
  const actionOptions = Object.entries(ACTION_LABEL)
    .map(([key, label]) => `<option value="${key}"${query.action === key ? ' selected' : ''}>${h(label)}</option>`)
    .join('');
  const rows = pageInfo.items
    .map(
      (log) => `<tr>
        <td class="muted">${h(log.created_at)}</td>
        <td><b>${h(log.user_name)}</b></td>
        <td><span class="chip chip-plain">${h(ACTION_LABEL[log.action] || log.action)}</span></td>
        <td>${h(log.target_name || '—')}</td>
        <td>${h(truncate(log.detail, 40))}</td>
        <td class="muted">${h(log.ip)}</td>
      </tr>`,
    )
    .join('');

  const body = `
  <div class="page-head-row">
    <div>
      <h1 class="admin-title">操作日志</h1>
      <p class="admin-sub">记录登录、档案变更、审核与导入导出等关键操作，共 ${pageInfo.total} 条。</p>
    </div>
  </div>
  <form class="toolbar" method="get" action="/admin/logs">
    <input class="toolbar-search" type="search" name="q" value="${h(query.q || '')}" placeholder="搜索操作人、对象或说明">
    <select name="action"><option value="">全部操作</option>${actionOptions}</select>
    <button class="btn btn-primary" type="submit">查询</button>
    <a class="btn btn-ghost" href="/admin/logs">重置</a>
  </form>
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr><th style="min-width:150px">时间</th><th>操作人</th><th>操作</th><th style="min-width:180px">对象</th><th style="min-width:200px">说明</th><th>IP</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6"><p class="muted pad">暂无日志</p></td></tr>'}</tbody>
    </table>
  </div>
  ${paginationBar('/admin/logs', query, pageInfo)}`;

  return adminLayout({
    title: '操作日志',
    user,
    active: 'logs',
    crumbs: [{ label: '操作日志' }],
    pendingTotal,
    wide: true,
    body,
  });
}

/* ---------------- 数据大屏 ---------------- */

export function screenBody() {
  return `<div class="screen" id="screen">
    <header class="screen-head">
      <div class="screen-brand"><span class="brand-seal">非</span><div><h1>${h(BRAND.name)} · 数据总览</h1><p>非物质文化遗产资源建档与传承态势</p></div></div>
      <div class="screen-clock"><span id="screen-date"></span><a class="screen-exit" href="/admin/work">返回管理端</a><button class="screen-full" type="button" id="fullscreen-btn">全屏</button></div>
    </header>
    <section class="screen-metrics" id="screen-metrics"></section>
    <section class="screen-grid">
      <div class="chart-card"><h2>十大门类分布</h2><div id="chart-category" class="chart-box"></div></div>
      <div class="chart-card"><h2>名录级别构成</h2><div id="chart-level" class="chart-box"></div></div>
      <div class="chart-card"><h2>批次公布趋势</h2><div id="chart-year" class="chart-box"></div></div>
      <div class="chart-card"><h2>地区分布 TOP10</h2><div id="chart-region" class="chart-box"></div></div>
      <div class="chart-card"><h2>多媒体档案构成</h2><div id="chart-attachment" class="chart-box"></div></div>
      <div class="chart-card"><h2>传承人级别构成</h2><div id="chart-inheritor" class="chart-box"></div></div>
      <div class="chart-card span-2"><h2>最近更新项目</h2><div id="screen-recent" class="recent-box"></div></div>
      <div class="chart-card span-2"><h2>平台动态</h2><div id="screen-logs" class="recent-box"></div></div>
      <div class="chart-card span-2"><h2>档案状态分布</h2><div id="chart-status" class="chart-box"></div></div>
      <div class="chart-card span-2"><h2>审核待办</h2><div id="screen-pending" class="recent-box"></div></div>
    </section>
    <footer class="screen-foot"><span id="screen-updated"></span><span>${h(BRAND.footerNote)}</span></footer>
  </div>
  <div class="screen-fallback" id="screen-fallback"><p>数据加载中……</p></div>`;
}

export { adminBase };
