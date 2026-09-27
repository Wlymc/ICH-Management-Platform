/* 数据大屏：零依赖 SVG 图表渲染 */
(function () {
  'use strict';

  const { api } = window.ICH || {};
  const PALETTE = ['#4ea8e0', '#f0705f', '#f3c14b', '#5fd39b', '#a98cf0', '#4ecfc9', '#e08fc0', '#8fd14f', '#f0994e', '#7f9ab4'];

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  function donut(data, options) {
    const opts = options || {};
    const size = opts.size || 200;
    const radius = opts.radius || 68;
    const thickness = opts.thickness || 26;
    const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
    const cx = radius + 14;
    const cy = size / 2;
    let angle = -Math.PI / 2;
    const arcs = data
      .filter((item) => item.value > 0)
      .map((item, index) => {
        const sweep = (item.value / total) * Math.PI * 2;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        const large = sweep > Math.PI ? 1 : 0;
        const x1 = cx + radius * Math.cos(start);
        const y1 = cy + radius * Math.sin(start);
        const x2 = cx + radius * Math.cos(end);
        const y2 = cy + radius * Math.sin(end);
        const inner = radius - thickness;
        const x3 = cx + inner * Math.cos(end);
        const y3 = cy + inner * Math.sin(end);
        const x4 = cx + inner * Math.cos(start);
        const y4 = cy + inner * Math.sin(start);
        const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
        return `<path d="${path}" fill="${PALETTE[index % PALETTE.length]}" opacity=".92"/>`;
      })
      .join('');
    const legend = data
      .map(
        (item, index) =>
          `<g transform="translate(0,${index * 19})">
            <rect width="9" height="9" rx="2" fill="${PALETTE[index % PALETTE.length]}"/>
            <text x="15" y="9" font-size="12.5" fill="#a9c6e2">${esc(item.name)}</text>
            <text x="150" y="9" font-size="12.5" fill="#eaf3ff" text-anchor="end">${item.value}</text>
          </g>`,
      )
      .join('');
    const legendHeight = data.length * 19;
    return `<svg viewBox="0 0 ${size + 190} ${Math.max(size, legendHeight + 10)}" preserveAspectRatio="xMidYMid meet">
      ${arcs}
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="26" font-weight="700" fill="#eaf3ff">${total}</text>
      <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="12" fill="#7f9ab4">合计</text>
      <g transform="translate(${size + 16},${Math.max(10, (size - legendHeight) / 2)})">${legend}</g>
    </svg>`;
  }

  function verticalBars(data, options) {
    const opts = options || {};
    const width = opts.width || 460;
    const height = opts.height || 210;
    const padBottom = 30;
    const padTop = 22;
    const max = Math.max(...data.map((item) => item.value), 1);
    const slot = width / Math.max(data.length, 1);
    const barWidth = Math.min(slot * 0.5, 46);
    const bars = data
      .map((item, index) => {
        const barHeight = ((height - padBottom - padTop) * item.value) / max;
        const x = slot * index + (slot - barWidth) / 2;
        const y = height - padBottom - barHeight;
        const gradientId = `bg-${opts.id || 'v'}-${index}`;
        return `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${PALETTE[index % PALETTE.length]}"/>
            <stop offset="100%" stop-color="${PALETTE[index % PALETTE.length]}" stop-opacity=".35"/>
          </linearGradient></defs>
          <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, 2)}" rx="3" fill="url(#${gradientId})"/>
          <text x="${x + barWidth / 2}" y="${y - 7}" text-anchor="middle" font-size="13" fill="#dbe6f2">${item.value}</text>
          <text x="${x + barWidth / 2}" y="${height - padBottom + 18}" text-anchor="middle" font-size="12.5" fill="#8ba4bd">${esc(item.name)}</text>`;
      })
      .join('');
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
  }

  function line(data, options) {
    const opts = options || {};
    const width = opts.width || 520;
    const height = opts.height || 210;
    const padLeft = 34;
    const padBottom = 30;
    const padTop = 20;
    if (!data.length) {
      return `<svg viewBox="0 0 ${width} ${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="14" fill="#64809a">暂无数据</text></svg>`;
    }
    const max = Math.max(...data.map((item) => item.value), 1);
    const stepX = (width - padLeft - 16) / Math.max(data.length - 1, 1);
    const points = data.map((item, index) => ({
      x: padLeft + stepX * index,
      y: height - padBottom - ((height - padBottom - padTop) * item.value) / max,
      ...item,
    }));
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    const area = `${path} L ${points[points.length - 1].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z`;
    const dots = points
      .map(
        (point) =>
          `<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="#4ea8e0"/>
           <text x="${point.x}" y="${point.y - 10}" text-anchor="middle" font-size="12" fill="#dbe6f2">${point.value}</text>`,
      )
      .join('');
    const labels = points
      .filter((_, index) => index % Math.ceil(points.length / 8) === 0)
      .map((point) => `<text x="${point.x}" y="${height - padBottom + 17}" text-anchor="middle" font-size="12" fill="#8ba4bd">${esc(point.name)}</text>`)
      .join('');
    const gridLines = [0, 0.5, 1]
      .map((ratio) => {
        const y = padTop + (height - padBottom - padTop) * ratio;
        return `<line x1="${padLeft - 8}" y1="${y}" x2="${width - 8}" y2="${y}" stroke="rgba(94,158,214,.14)" stroke-dasharray="4 4"/>`;
      })
      .join('');
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="line-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4ea8e0" stop-opacity=".38"/><stop offset="100%" stop-color="#4ea8e0" stop-opacity="0"/>
      </linearGradient></defs>
      ${gridLines}<path d="${area}" fill="url(#line-area)"/>
      <path d="${path}" fill="none" stroke="#4ea8e0" stroke-width="2.2" stroke-linejoin="round"/>
      ${dots}${labels}</svg>`;
  }

  function horizontalBars(data, options) {
    const opts = options || {};
    const width = opts.width || 460;
    const rowHeight = 22;
    const height = Math.max(data.length * rowHeight + 16, 120);
    const max = Math.max(...data.map((item) => item.value), 1);
    const labelWidth = opts.labelWidth || 190;
    const rows = data
      .map((item, index) => {
        const y = index * rowHeight + 8;
        const barWidth = ((width - labelWidth - 42) * item.value) / max;
        return `<g transform="translate(0,${y})">
          <text x="0" y="12" font-size="12.5" fill="#8ba4bd">${esc(item.name.length > 14 ? `${item.name.slice(0, 14)}…` : item.name)}</text>
          <rect x="${labelWidth}" y="2" width="${width - labelWidth - 42}" height="11" rx="5" fill="rgba(94,158,214,.14)"/>
          <rect x="${labelWidth}" y="2" width="${Math.max(barWidth, 3)}" height="11" rx="5" fill="${PALETTE[index % PALETTE.length]}"/>
          <text x="${width - 6}" y="12" text-anchor="end" font-size="12.5" fill="#dbe6f2">${item.value}</text>
        </g>`;
      })
      .join('');
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${rows}</svg>`;
  }

  function metrics(data) {
    const published = data.totals.published;
    const items = [
      { label: '非遗项目', value: data.totals.projects, foot: `已发布 ${published.projects} 项`, cls: '' },
      { label: '代表性传承人', value: data.totals.inheritors, foot: `已发布 ${published.inheritors} 位`, cls: 'metric-red' },
      { label: '传承基地 / 单位', value: data.totals.organizations, foot: `对外开放 ${data.totals.openOrganizations} 个`, cls: 'metric-green' },
      { label: '多媒体档案', value: data.totals.attachments, foot: '图片 / 音频 / 视频 / 文档', cls: 'metric-gold' },
      { label: '非遗类别', value: data.totals.categories, foot: '十大类目全覆盖', cls: '' },
      { label: '行政区划节点', value: data.totals.regions, foot: '省 / 市 / 区县三级', cls: '' },
    ];
    return items
      .map(
        (item) => `<div class="metric ${item.cls}">
          <div class="metric-label">${esc(item.label)}</div>
          <div class="metric-value">${item.value}<em>${esc('')}</em></div>
          <div class="metric-foot">${esc(item.foot)}</div>
        </div>`,
      )
      .join('');
  }

  function renderRecent(projects, logs) {
    const recentBox = document.getElementById('screen-recent');
    if (recentBox) {
      recentBox.innerHTML = projects.length
        ? projects
            .map(
              (item) => `<div class="recent-item"><span>${esc(item.name)}</span><em>${esc(item.updated_at.slice(5, 16))}</em></div>`,
            )
            .join('')
        : '<p class="screen-tag">暂无记录</p>';
    }
    const logBox = document.getElementById('screen-logs');
    if (logBox) {
      const labels = {
        create: '新建', update: '修改', delete: '删除', submit: '提交审核', approve: '审核通过',
        reject: '审核退回', login: '登录', upload: '上传档案', seed: '初始化', import: '导入', export: '导出',
        dict: '字典维护', user: '用户管理', logout: '退出',
      };
      logBox.innerHTML = logs.length
        ? logs
            .map(
              (item) => `<div class="recent-item"><span>${esc(item.user_name)} ${esc(labels[item.action] || item.action)} ${esc(item.target_name || '')}</span><em>${esc(item.created_at.slice(5, 16))}</em></div>`,
            )
            .join('')
        : '<p class="screen-tag">暂无动态</p>';
    }
  }

  function renderPending(items) {
    const box = document.getElementById('screen-pending');
    if (!box) return;
    const total = items.reduce((sum, item) => sum + item.total, 0);
    const head = `<div class="recent-item"><span>待审核合计</span><em>${total} 条</em></div>`;
    const rows = items
      .map((item) => `<div class="recent-item"><span>${esc(item.label)}</span><em>${item.total}</em></div>`)
      .join('');
    box.innerHTML = head + rows;
  }

  function statusDistribution(rows) {
    const labels = { draft: '草稿', pending: '待审核', published: '已发布', rejected: '已退回', archived: '已归档' };
    return Object.keys(labels)
      .map((key) => ({
        name: labels[key],
        value: rows.filter((row) => row.status === key).reduce((sum, row) => sum + row.total, 0),
      }))
      .filter((item) => item.value > 0);
  }

  function fitScreen() {
    const screen = document.getElementById('screen');
    if (!screen) return;
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    screen.style.transform = `scale(${scale})`;
    screen.style.marginLeft = `${(window.innerWidth - 1920 * scale) / 2}px`;
  }

  function updateClock() {
    const node = document.getElementById('screen-date');
    if (!node) return;
    const now = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    node.textContent = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 星期${week} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  }

  function hideFallback() {
    const fallback = document.getElementById('screen-fallback');
    if (fallback) fallback.remove();
  }

  async function load() {
    try {
      const data = await api('/api/stats/dashboard');
      document.getElementById('screen-metrics').innerHTML = metrics(data);
      document.getElementById('chart-category').innerHTML = donut(data.byCategory);
      document.getElementById('chart-level').innerHTML = verticalBars(data.byLevel, { id: 'level' });
      document.getElementById('chart-year').innerHTML = line(data.byYear);
      document.getElementById('chart-region').innerHTML = horizontalBars(data.byRegion);
      document.getElementById('chart-attachment').innerHTML = donut(data.byAttachmentKind, { size: 170, radius: 58, thickness: 22 });
      document.getElementById('chart-inheritor').innerHTML = verticalBars(data.byInheritorLevel, { id: 'inheritor' });
      const statusData = statusDistribution(data.statusRows || []);
      document.getElementById('chart-status').innerHTML = statusData.length
        ? horizontalBars(statusData, { width: 460, labelWidth: 120 })
        : '<p class="screen-tag">暂无数据</p>';
      renderRecent(data.recentProjects, data.recentLogs);
      renderPending(data.pendingByResource || []);
      document.getElementById('screen-updated').textContent = `数据更新时间：${data.generatedAt}`;
      hideFallback();
    } catch (error) {
      const fallback = document.getElementById('screen-fallback');
      if (fallback) fallback.innerHTML = `<p>数据加载失败：${esc(error.message)}</p>`;
    }
  }

  document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });

  window.addEventListener('resize', fitScreen);
  fitScreen();
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(load, 60000);
  load();
})();
