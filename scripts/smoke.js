/**
 * 零依赖冒烟测试：
 *   node --disable-warning=ExperimentalWarning scripts/smoke.js
 * 会自动以测试端口启动一个服务实例，跑完全流程后清理测试数据并关闭。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildXlsx } from '../src/report/xlsx.js';
import { decodeTextBuffer } from '../src/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = Number(process.env.SMOKE_PORT || 3111);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const jar = {};
function cookies() {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

async function request(pathname, options = {}) {
  const init = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (Object.keys(jar).length) init.headers.Cookie = cookies();
  if (options.origin) init.headers.Origin = options.origin;
  if (options.headers) Object.assign(init.headers, options.headers);
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  const response = await fetch(`${BASE}${pathname}`, { ...init, redirect: 'manual' });
  const setCookie = response.headers.getSetCookie?.() || [];
  for (const cookie of setCookie) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === '') delete jar[key];
    else jar[key] = value;
  }
  return response;
}

async function json(pathname, options) {
  const response = await request(pathname, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

function parseCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ',') {
      out.push(field);
      field = '';
    } else field += char;
  }
  out.push(field);
  return out;
}

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) return true;
    } catch {
      /* 继续等待 */
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function main() {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      N8N_AGENT_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (chunk) => {
    serverLog += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    serverLog += chunk.toString();
  });

  const stamp = Date.now().toString().slice(-6);
  const createdIds = [];
  let adminCookie = null;

  async function cleanupCreated() {
    while (createdIds.length) {
      const id = createdIds.pop();
      try {
        let removed = await json(`/api/projects/${id}`, { method: 'DELETE' });
        if (removed.status === 401) {
          // 脚本中途失败时可能已退出登录，重新登录取回管理权限再清理
          await json('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@123' } });
          removed = await json(`/api/projects/${id}`, { method: 'DELETE' });
        }
        if (removed.status !== 200) {
          console.log(`    ! 清理 #${id} 失败：${removed.payload?.error || removed.status}`);
        }
      } catch (error) {
        console.log(`    ! 清理 #${id} 异常：${error.message}`);
      }
    }
  }

  try {
    const ready = await waitForServer();
    if (!ready) {
      console.error('服务未能启动，输出如下：\n', serverLog);
      process.exitCode = 1;
      return;
    }

    console.log('\n[1] 门户与静态资源');
    const home = await request('/');
    const homeHtml = await home.text();
    check('门户首页可访问', home.status === 200);
    check('首页包含平台名称', homeHtml.includes('非遗数字管理平台'));
    const css = await request('/assets/css/app.css');
    check('样式文件可访问', css.status === 200);
    const projectsPage = await request('/projects');
    check('项目列表页可访问', projectsPage.status === 200);
    const reactRoot = await request('/');
    const reactRootHtml = await reactRoot.text();
    check(
      'React/Vite 已接管公众端根路径',
      reactRoot.status === 200 &&
        reactRootHtml.includes('<div id="root"></div>') &&
        reactRootHtml.includes('/app/assets/'),
    );
    check(
      '公众首页首屏包含平台标题与 SEO 描述',
      reactRootHtml.includes('<title>非遗数字展馆 · 非遗数字管理平台</title>') &&
        reactRootHtml.includes('<meta name="description" content="') &&
        reactRootHtml.includes('<link rel="canonical" href="http://127.0.0.1:'),
    );
    const publicRoutes = [
      '/projects',
      '/projects/169',
      '/inheritors',
      '/inheritors/41',
      '/explore',
      '/organizations',
    ];
    const publicRouteFailures = [];
    for (const route of publicRoutes) {
      const response = await request(route);
      const html = await response.text();
      if (
        response.status !== 200 ||
        !html.includes('<div id="root"></div>') ||
        !html.includes('/app/assets/')
      ) {
        publicRouteFailures.push(`${route} → ${response.status}`);
      }
    }
    check(
      '全部公众主入口由 React 接管',
      publicRouteFailures.length === 0,
      publicRouteFailures.join('；'),
    );
    const reactDeepLink = await request('/projects/169');
    const reactDeepLinkHtml = await reactDeepLink.text();
    check(
      'React 公众端支持直达路由刷新',
      reactDeepLink.status === 200 &&
        reactDeepLinkHtml.includes('<div id="root"></div>') &&
        (await request('/app/projects/169')).status === 302,
    );
    check(
      '项目详情直达页注入项目级标题与描述',
      reactDeepLinkHtml.includes('<title>景德镇手工制瓷技艺 · 非遗档案 · 非遗数字管理平台</title>') &&
        reactDeepLinkHtml.includes('<meta property="og:type" content="article" />'),
    );
    const publicHomeApi = await json('/api/public/home');
    check(
      '公众首页 JSON API 可用',
      publicHomeApi.status === 200 &&
        Number(publicHomeApi.payload?.data?.stats?.projects) > 0 &&
        (publicHomeApi.payload?.data?.categories || []).length === 10,
    );
    const publicProjectApi = await json('/api/public/projects/169');
    check(
      '公众项目详情 JSON API 包含模型与关联数据',
      publicProjectApi.status === 200 &&
        (publicProjectApi.payload?.data?.project?.models || []).length === 3 &&
        Array.isArray(publicProjectApi.payload?.data?.inheritors),
    );

    console.log('\n[2] 登录与鉴权');
    const noAuth = await request('/admin/work');
    check('未登录访问管理端跳转登录页', noAuth.status === 302 && String(noAuth.headers.get('location')).includes('/admin/login'));
    check(
      '未登录跳转的 next 参数只含管理端路径',
      String(noAuth.headers.get('location')) === '/admin/login?next=%2Fadmin%2Fwork',
      String(noAuth.headers.get('location')),
    );
    const loginPage = await request('/admin/login');
    const loginHtml = await loginPage.text();
    check(
      '登录页加载了处理登录表单的脚本',
      loginPage.status === 200 && loginHtml.includes('/assets/js/app.js') && loginHtml.includes('/assets/js/admin.js'),
    );
    check('登录页含用户名与密码输入框', loginHtml.includes('name="username"') && loginHtml.includes('name="password"'));
    const bogusAdminPath = await request('/admin/dashboard%EF%BC%89%E3%80%82');
    check('未知管理端路径返回 404 而不是重定向登录页', bogusAdminPath.status === 404, `实际 ${bogusAdminPath.status}`);
    const noAuthApi = await json('/api/projects');
    check('未登录调用接口返回 401', noAuthApi.status === 401);
    const badLogin = await json('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong-password' } });
    check('错误密码被拒绝', badLogin.status === 401);
    const editorLogin = await json('/api/auth/login', {
      method: 'POST',
      origin: BASE,
      body: { username: 'editor', password: 'Editor@123' },
    });
    check('录入员登录成功', editorLogin.status === 200 && editorLogin.payload?.data?.role === 'editor');
    const editorCookie = cookies();
    const workAfterLogin = await request('/admin/work');
    const workAfterLoginHtml = await workAfterLogin.text();
    check(
      '登录后可直接打开管理端后续页面',
      workAfterLogin.status === 200 && workAfterLoginHtml.includes('工作台'),
      `实际 ${workAfterLogin.status}`,
    );
    const dashboardAfterLogin = await request('/admin/dashboard');
    check('登录后可打开数据大屏', dashboardAfterLogin.status === 200);

    console.log('\n[3] 录入 → 提交审核 → 审核发布');
    const dict = await json('/api/dict');
    const category = dict.payload?.data?.category?.[0];
    const level = dict.payload?.data?.level?.find((item) => item.name === '省级') || dict.payload?.data?.level?.[0];
    const county = dict.payload?.data?.region?.find((item) => item.region_level === 'county');
    check('字典接口返回类别/级别/区域', Boolean(category && level && county));

    const code = `SMOKE-${stamp}`;
    const created = await json('/api/projects', {
      method: 'POST',
      body: {
        code,
        name: `冒烟测试项目-${stamp}`,
        category_id: category?.id,
        level_id: level?.id,
        region_id: county?.id,
        summary: '这条记录由冒烟测试脚本自动创建，用于验证录入与审核流程，测试结束后会被删除。',
        keywords: '冒烟测试、自动化',
      },
    });
    check('录入员新建项目成功', created.status === 200 && created.payload?.data?.id > 0, created.payload?.error || '');
    const projectId = created.payload?.data?.id;
    if (projectId) createdIds.push(projectId);

    const publicBefore = await json(`/api/public/projects/${projectId}`);
    check('草稿状态不出现在门户', publicBefore.status === 404);

    const submit = await json(`/api/projects/${projectId}/submit`, { method: 'POST' });
    check('录入员提交审核成功', submit.status === 200);

    const editorReview = await json(`/api/projects/${projectId}/review`, {
      method: 'POST',
      body: { action: 'approve' },
    });
    check('录入员无权执行审核（403）', editorReview.status === 403);

    const submissions = await json('/admin/reviews', {});
    void submissions;

    await json('/api/auth/logout', { method: 'POST' });
    const adminLogin = await json('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@123' } });
    check('管理员登录成功', adminLogin.status === 200 && adminLogin.payload?.data?.role === 'admin');
    adminCookie = cookies();

    const rejectMissingNote = await json(`/api/projects/${projectId}/review`, {
      method: 'POST',
      body: { action: 'reject' },
    });
    check('退回未填审核意见被拒绝', rejectMissingNote.status === 400);

    const approve = await json(`/api/projects/${projectId}/review`, { method: 'POST', body: { action: 'approve' } });
    check('管理员审核通过成功', approve.status === 200);

    const publicAfter = await json(`/api/public/projects/${projectId}`);
    check(
      '发布后门户 API 可访问详情',
      publicAfter.status === 200 &&
        publicAfter.payload?.data?.project?.name === `冒烟测试项目-${stamp}`,
    );

    const reviewsPage = await request('/admin/reviews');
    check('审核中心页面可访问', reviewsPage.status === 200);
    const workPage = await request('/admin/work');
    const workHtml = await workPage.text();
    check('工作台页面可访问', workPage.status === 200 && workHtml.includes('工作台'));
    const screenPage = await request('/admin/dashboard');
    check('数据大屏页面可访问', screenPage.status === 200);

    console.log('\n[4] 统计接口');
    const stats = await json('/api/stats/dashboard');
    const statsData = stats.payload?.data;
    check('统计接口返回数据', stats.status === 200 && statsData?.totals?.projects > 0);
    check(
      '十大类目均有已发布项目',
      Array.isArray(statsData?.byCategory) && statsData.byCategory.length === 10 && statsData.byCategory.every((item) => item.value > 0),
      statsData?.byCategory?.map((item) => `${item.name}:${item.value}`).join(' ') || '',
    );
    check(
      '示例数据规模符合预期',
      statsData?.totals?.projects >= 55 && statsData?.totals?.inheritors >= 35 && statsData?.totals?.organizations >= 10,
      JSON.stringify(statsData?.totals),
    );
    check(
      '统计口径仅含已发布项目',
      statsData?.totals?.published?.projects <= statsData?.totals?.projects,
    );

    console.log('\n[5] Excel 导出与导入');
    const xlsx = await request('/api/export/project.xlsx');
    const xlsxBuffer = Buffer.from(await xlsx.arrayBuffer());
    check('导出 .xlsx 成功', xlsx.status === 200 && xlsxBuffer.length > 1000);
    check('导出文件是合法 zip(xlsx)', xlsxBuffer[0] === 0x50 && xlsxBuffer[1] === 0x4b);

    const csvExport = await request('/api/export/project.csv');
    const csvBuffer = Buffer.from(await csvExport.arrayBuffer());
    check('导出 CSV 带 UTF-8 BOM', csvBuffer[0] === 0xef && csvBuffer[1] === 0xbb && csvBuffer[2] === 0xbf);
    const csvText = csvBuffer.toString('utf8');

    const template = await request('/api/template/project.csv');
    const templateText = (await template.text()).replace(/^\uFEFF/, '');
    const headers = parseCsvLine(templateText.split(/\r?\n/)[0]);
    const importCode = `SMOKE-IMP-${stamp}`;
    const values = {
      项目编号: importCode,
      项目名称: `导入测试项目-${stamp}`,
      类别: category?.name,
      级别: '省级',
      申报地区: county?.name,
      简介: '通过 CSV 导入创建的测试记录。',
      关键词: '导入测试',
      状态: '草稿',
    };
    const importCsv = [headers.join(','), headers.map((header) => csvEscape(values[header] || '')).join(',')].join('\r\n');
    const imported = await json('/api/import/projects', {
      method: 'POST',
      body: { filename: 'smoke-import.csv', content: importCsv },
    });
    check(
      'CSV 导入成功 1 条',
      imported.status === 200 && imported.payload?.data?.imported === 1,
      JSON.stringify(imported.payload?.data?.failed || imported.payload?.error || ''),
    );

    const found = await json(`/api/projects?q=${encodeURIComponent(importCode)}`);
    const importedRow = found.payload?.data?.items?.[0];
    check('导入记录可在后台检索到', Boolean(importedRow));
    if (importedRow) createdIds.push(importedRow.id);

    const invalidImport = await json('/api/import/projects', {
      method: 'POST',
      body: { filename: 'bad.csv', content: '项目编号,项目名称\r\n,缺名称\r\nBAD-2,级别错误,CITY' },
    });
    check('非法导入行被逐行拒绝', invalidImport.status === 200 && invalidImport.payload?.data?.imported === 0 && invalidImport.payload?.data?.failed?.length >= 1);

    console.log('\n[6] xlsx 往返与中文编码');
    const xlsxCode = `SMOKE-XLSX-${stamp}`;
    const xlsxValues = { ...values, 项目编号: xlsxCode, 项目名称: `Excel导入项目-${stamp}` };
    const xlsxBufferIn = buildXlsx({
      sheetName: '非遗项目',
      headers,
      rows: [headers.map((header) => xlsxValues[header] || '')],
    });
    const xlsxImport = await json('/api/import/projects', {
      method: 'POST',
      body: { filename: 'roundtrip.xlsx', base64: xlsxBufferIn.toString('base64') },
    });
    check(
      '手写 .xlsx 可被服务端解析并导入',
      xlsxImport.status === 200 && xlsxImport.payload?.data?.imported === 1,
      JSON.stringify(xlsxImport.payload?.data?.failed || xlsxImport.payload?.error || ''),
    );
    const xlsxFound = await json(`/api/projects?q=${encodeURIComponent(xlsxCode)}`);
    const xlsxRow = xlsxFound.payload?.data?.items?.[0];
    check('Excel 导入记录可检索到', Boolean(xlsxRow));
    if (xlsxRow) createdIds.push(xlsxRow.id);

    check('GBK 编码文本可正确解码', decodeTextBuffer(Buffer.from([0xd6, 0xd0, 0xce, 0xc4])) === '中文');
    const utf16Code = `SMOKE-U16-${stamp}`;
    const utf16Csv = `\uFEFF${[headers.join(','), headers.map((header) => csvEscape(header === '项目编号' ? utf16Code : header === '项目名称' ? `UTF16导入-${stamp}` : values[header] || '')).join(',')].join('\r\n')}`;
    const utf16Import = await json('/api/import/projects', {
      method: 'POST',
      body: { filename: 'utf16.csv', base64: Buffer.from(utf16Csv, 'utf16le').toString('base64') },
    });
    check(
      'UTF-16 编码 CSV 可导入',
      utf16Import.status === 200 && utf16Import.payload?.data?.imported === 1,
      JSON.stringify(utf16Import.payload?.data?.failed || ''),
    );
    const utf16Found = await json(`/api/projects?q=${encodeURIComponent(utf16Code)}`);
    if (utf16Found.payload?.data?.items?.[0]) createdIds.push(utf16Found.payload.data.items[0].id);

    console.log('\n[7] 全站页面巡检');
    const pages = [
      '/',
      '/projects',
      '/projects?category_id=1&level_id=1&sort=name',
      `/projects/${projectId}`,
      '/inheritors',
      '/explore',
      '/explore?mode=graph',
      '/organizations',
      '/admin/work',
      '/admin/dashboard',
      '/admin/projects',
      '/admin/projects/new',
      `/admin/projects/${projectId}`,
      `/admin/projects/${projectId}/edit`,
      '/admin/inheritors',
      '/admin/inheritors/new',
      '/admin/organizations',
      '/admin/organizations/new',
      '/admin/reviews',
      '/admin/dict',
      '/admin/dict?kind=region',
      '/admin/dict?kind=batch',
      '/admin/dict?kind=org_type',
      '/admin/users',
      '/admin/logs',
      '/admin/logs?action=approve',
      '/uploads/seed/project-1-1.svg',
    ];
    const brokenPages = [];
    for (const page of pages) {
      const response = await request(page);
      if (response.status !== 200) brokenPages.push(`${page} → ${response.status}`);
    }
    check(`全部 ${pages.length} 个页面返回 200`, brokenPages.length === 0, brokenPages.join('；'));

    const listHtml = await (await request('/admin/projects')).text();
    check('管理端项目列表渲染数据表格', listHtml.includes('data-resource="project"'));
    const formHtml = await (await request('/admin/projects/new')).text();
    check('新建项目表单渲染完整', formHtml.includes('id="resource-form"') && formHtml.includes('image-field'));
    const portalDetail = await json(`/api/public/projects/${projectId}`);
    check(
      '公众项目 API 返回新发布项目',
      portalDetail.status === 200 && portalDetail.payload?.data?.project?.name.includes(`冒烟测试项目-${stamp}`),
    );

    const exploreHtml = await (await request('/explore')).text();
    check(
      '非遗探索页面由 React 应用接管',
      exploreHtml.includes('<div id="root"></div>') && exploreHtml.includes('/app/assets/'),
    );
    const exploreMap = await json('/api/explore');
    const starData = exploreMap.payload?.data?.star;
    const graphData = exploreMap.payload?.data?.graph;
    check(
      '非遗探索接口返回星图与谱系数据',
      exploreMap.status === 200 && Array.isArray(starData?.nodes) && starData.nodes.length > 0 && Array.isArray(graphData?.nodes) && graphData.nodes.length > 0 && Array.isArray(graphData?.edges) && graphData.edges.length > 0,
      exploreMap.status === 200 ? '' : `HTTP ${exploreMap.status}`,
    );
    check(
      '探索数据包含门类、地区、传承人与关系',
      starData?.categories?.length === 10 && starData?.provinces?.length > 0 && graphData?.meta?.projectTotal > 0 && graphData?.meta?.inheritorTotal > 0 && graphData?.meta?.edgeTotal > 0,
    );
    check(
      '项目星点包含批次与档案完整度',
      starData?.nodes?.every((node) => Object.hasOwn(node, 'batch') && Number.isFinite(Number(node.completeness))),
    );
    check(
      '项目详情 API 提供关系探索所需分类数据',
      portalDetail.payload?.data?.project?.categoryId > 0 &&
        Array.isArray(portalDetail.payload?.data?.relatedProjects),
    );
    const legacyGraph = await request('/graph?project=1');
    const legacyLocation = String(legacyGraph.headers.get('location') || '');
    check('旧知识图谱地址兼容跳转到非遗探索', legacyGraph.status === 302 && legacyLocation.startsWith('/explore?') && legacyLocation.includes('lens=project') && legacyLocation.includes('project=1'), legacyLocation);

    const cssText = await (await request('/assets/css/app.css')).text();
    check(
      '全局 [hidden] 规则存在（防止带 hidden 的遮罩层全屏拦截点击）',
      /\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/.test(cssText),
    );
    const workHtmlForAssets = await (await request('/admin/work')).text();
    const listHtmlForAssets = await (await request('/admin/projects')).text();
    check(
      '静态资源带版本号，避免浏览器沿用缓存的旧样式',
      workHtmlForAssets.includes('/assets/css/app.css?v=') &&
        workHtmlForAssets.includes('/assets/js/app.js?v=') &&
        listHtmlForAssets.includes('/assets/js/admin.js?v='),
      `work:${workHtmlForAssets.includes('/assets/js/app.js?v=')} list:${listHtmlForAssets.includes('/assets/js/admin.js?v=')}`,
    );
    check(
      '遮罩层容器在初始 HTML 中带 hidden 属性',
      workHtmlForAssets.includes('id="modal-root" hidden'),
    );
    const overlaySelectors = [...cssText.matchAll(/\.modal-root[^{]*\{([^}]*)\}/g)].map((m) => m[1]).join(' ');
    check(
      '遮罩层默认不可见（依赖全局 hidden 规则生效）',
      /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(cssText) && overlaySelectors.includes('display: grid'),
      overlaySelectors.slice(0, 60),
    );

    const sampleList = await json('/api/projects?pageSize=200');
    // 需要同时有封面与长文，才能验证「叙事内容 + 影像墙」；国家级项目长文待 AI 起草，先取已有内容的项目
    const sample = sampleList.payload?.data?.items?.find((item) => item.cover_path && item.history);
    if (sample) {
      const sampleDetail = await json(`/api/public/projects/${sample.id}`);
      check(
        '示例项目详情 API 含叙事内容与影像墙',
        String(sampleDetail.payload?.data?.project?.history || '').length > 0 &&
          Array.isArray(sampleDetail.payload?.data?.attachments),
        `${sample.name}`,
      );
    } else {
      check('示例项目详情页含叙事内容与影像墙', false, '未找到同时有封面与长文的项目');
    }

    const modelProjectApi = await json('/api/public/projects/169');
    check(
      '景德镇项目 API 接入三维器物模块',
      modelProjectApi.status === 200 &&
        (modelProjectApi.payload?.data?.project?.models || []).length === 3,
    );
    const modelAssetResponse = await request('/models3d/chinese_pagoda_lantern_no_texture.glb', {
      method: 'HEAD',
    });
    check(
      '本地 GLB 模型按 model/gltf-binary 提供',
      modelAssetResponse.status === 200 &&
        modelAssetResponse.headers.get('content-type') === 'model/gltf-binary',
    );
    const noModelProject = await json('/api/public/projects/1');
    check('未匹配模型的项目模型列表为空', (noModelProject.payload?.data?.project?.models || []).length === 0);
    const hezhenPage = await json('/api/public/projects/176');
    check(
      '新增鱼皮制作技艺模型已接入对应项目',
      hezhenPage.status === 200 &&
        (hezhenPage.payload?.data?.project?.models || []).length === 2,
    );
    const shoushanPage = await json('/api/public/projects/162');
    check(
      '新增寿山石雕模型已接入对应项目',
      shoushanPage.status === 200 &&
        (shoushanPage.payload?.data?.project?.models || []).length === 1,
    );
    const filteredProjects = await json('/api/public/projects?category_id=8');
    check(
      '公众项目筛选参数生效',
      filteredProjects.status === 200 &&
        filteredProjects.payload?.data?.total === 16,
    );
    const invalidProjectSort = await json('/api/public/projects?sort=certified_year');
    check(
      '项目列表对不存在的认定年份排序安全回退',
      invalidProjectSort.status === 200,
    );
    const invalidInheritorSort = await json('/api/public/inheritors?sort=published_year');
    check(
      '传承人列表对不存在的公布年份排序安全回退',
      invalidInheritorSort.status === 200,
    );

    console.log('\n[8] 清理测试数据');
    await cleanupCreated();
    const afterCleanup = await json(`/api/public/projects/${projectId}`);
    check('测试数据已清理（公众 API 不可见）', afterCleanup.status === 404);

    console.log('\n[9] 角色边界（录入员 vs 管理员）');
    await json('/api/auth/login', { method: 'POST', body: { username: 'editor', password: 'Editor@123' } });
    const editorWork = await request('/admin/work');
    const editorWorkHtml = await editorWork.text();
    check(
      '录入员侧边栏不出现审核中心与用户管理入口',
      editorWorkHtml.includes('当前角色：录入员') &&
        !editorWorkHtml.includes('href="/admin/reviews"') &&
        !editorWorkHtml.includes('href="/admin/users"') &&
        !editorWorkHtml.includes('href="/admin/logs"'),
      '侧边栏仍有管理员专属入口',
    );
    check(
      '录入员工作台显示自己的草稿/待审核/已退回统计',
      editorWorkHtml.includes('我的待办') && editorWorkHtml.includes('已退回（需修改后重新提交）'),
    );
    const editorLogPage = await request('/admin/logs');
    const editorLogHtml = await editorLogPage.text();
    check(
      '录入员访问操作日志被拒绝',
      editorLogPage.status === 200 && editorLogHtml.includes('仅管理员可查看'),
    );
    const editorDictPage = await request('/admin/dict');
    const editorDictHtml = await editorDictPage.text();
    check(
      '录入员看到的数据字典为只读',
      editorDictPage.status === 200 && editorDictHtml.includes('只读') && !editorDictHtml.includes('id="dict-form"'),
    );
    const editorDictWrite = await json('/api/dict/batch', { method: 'POST', body: { name: `未授权尝试-${stamp}` } });
    check('录入员无法新增字典条目（403）', editorDictWrite.status === 403, `实际 ${editorDictWrite.status}`);
    const editorDictDelete = await json('/api/dict/batch/1', { method: 'DELETE' });
    check('录入员无法删除字典条目（403）', editorDictDelete.status === 403, `实际 ${editorDictDelete.status}`);
    const editorUsers = await json('/api/users');
    check('录入员无法访问用户管理接口（403）', editorUsers.status === 403, `实际 ${editorUsers.status}`);
    const editorUsersPage = await request('/admin/users');
    const editorUsersHtml = await editorUsersPage.text();
    check('录入员看到用户管理页提示无权限', editorUsersPage.status === 200 && editorUsersHtml.includes('仅管理员可访问用户管理'));

    // 找一个管理员录入的项目，验证录入员改不动
    const adminOwned = await json('/api/projects?status=published&pageSize=1');
    const foreignProject = adminOwned.payload?.data?.items?.[0];
    if (foreignProject) {
      const foreignHistory = await json(`/api/history/project/${foreignProject.id}`);
      check('录入员无法查看他人档案的操作记录（403）', foreignHistory.status === 403, `实际 ${foreignHistory.status}`);
      const editForeign = await json(`/api/projects/${foreignProject.id}`, {
        method: 'PUT',
        body: { summary: '录入员越权修改尝试' },
      });
      check('录入员无法修改他人已发布记录（403）', editForeign.status === 403, `实际 ${editForeign.status}`);
      const deleteForeign = await json(`/api/projects/${foreignProject.id}`, { method: 'DELETE' });
      check('录入员无法删除他人记录（403）', deleteForeign.status === 403, `实际 ${deleteForeign.status}`);
    } else {
      check('录入员无法查看他人档案的操作记录（403）', false, '未找到管理员录入的项目');
      check('录入员无法修改他人已发布记录（403）', false, '未找到管理员录入的项目');
      check('录入员无法删除他人记录（403）', false, '未找到管理员录入的项目');
    }

    await json('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@123' } });
    const adminWorkHtml = await (await request('/admin/work')).text();
    check(
      '管理员侧边栏包含审核中心、用户管理与操作日志',
      adminWorkHtml.includes('当前角色：管理员') &&
        adminWorkHtml.includes('href="/admin/reviews"') &&
        adminWorkHtml.includes('href="/admin/users"') &&
        adminWorkHtml.includes('href="/admin/logs"'),
    );
    const adminDictPage = await request('/admin/dict');
    const adminDictHtml = await adminDictPage.text();
    check('管理员看到的数据字典可编辑', adminDictPage.status === 200 && adminDictHtml.includes('id="dict-form"'));

    console.log('\n[10] 国家级数据与素材');
    const nationalList = await json('/api/projects?status=published&pageSize=200');
    const nationalItems = (nationalList.payload?.data?.items || []).filter((item) => String(item.code || '').startsWith('GJ-'));
    check('国家级项目已导入（100 项）', nationalItems.length >= 100, `实际 ${nationalItems.length} 项`);
    const categorySpread = new Map();
    for (const item of nationalItems) {
      categorySpread.set(item.category_id, (categorySpread.get(item.category_id) || 0) + 1);
    }
    check(
      '十大类目各 10 项',
      categorySpread.size === 10 && [...categorySpread.values()].every((n) => n === 10),
      [...categorySpread.entries()].map(([k, v]) => `${k}:${v}`).join(' '),
    );

    const sampleProject = nationalItems.find((item) => item.source_code === 'Ⅰ-1');
    check('抽查「苗族古歌」字段完整', Boolean(sampleProject));
    if (sampleProject) {
      check('官方编号入库', sampleProject.source_code === 'Ⅰ-1', sampleProject.source_code);
      check('批次与年份已拆分', sampleProject.batch === '第一批' && Number(sampleProject.published_year) === 2006, `${sampleProject.batch}/${sampleProject.published_year}`);
      check('申报地区原文保留', String(sampleProject.region_text || '').includes('台江'), sampleProject.region_text);
      const detail = await json(`/api/public/projects/${sampleProject.id}`);
      check('项目 API 返回官方编号', detail.status === 200 && detail.payload?.data?.project?.sourceCode === 'Ⅰ-1');
      check(
        '项目 API 返回 4 张配图',
        (detail.payload?.data?.attachments || []).filter((item) => item.kind === 'image').length === 4,
      );
      check(
        '项目 API 保留图片版权来源字段',
        (detail.payload?.data?.attachments || []).some((item) => item.sourceKind),
      );
      check(
        '项目 API 保留内容来源字段',
        Boolean(detail.payload?.data?.project?.contentSource),
      );
    }

    const inheritorList = await json('/api/inheritors?status=published&pageSize=200');
    const nationalPeople = (inheritorList.payload?.data?.items || []).filter((item) => String(item.code || '').startsWith('GJCR-'));
    check('国家级传承人已导入（90 位）', nationalPeople.length >= 90, `实际 ${nationalPeople.length} 位`);
    const person = nationalPeople.find((item) => item.name === '王安江') || nationalPeople[0];
    const personDetail = await json(`/api/public/inheritors/${person.id}`);
    check(
      '传承人详情 API 展示关联项目',
      personDetail.status === 200 && (personDetail.payload?.data?.projects || []).length > 0,
      `${person.name} 页面 ${personDetail.status}`,
    );
    check('传承人记录了从业起始年', Number(person.career_start_year) > 1900, String(person.career_start_year));
    const imageStats = await json('/api/stats/dashboard');
    const totalImages = (imageStats.payload?.data?.byAttachmentKind || []).find((item) => item.name === '图片');
    check('图片档案已入库（含 400 张新图）', Number(totalImages?.value || 0) >= 400, `图片 ${totalImages?.value}`);

    const provinces = await json('/api/dict');
    check(
      '省级行政区已内置 34 个',
      (provinces.payload?.data?.region || []).filter((item) => item.region_level === 'province').length === 34,
    );
    const guizhou = await json(
      '/api/public/projects?region_id=' +
        (provinces.payload.data.region.find((r) => r.name === '贵州省') || {}).id,
    );
    check('公众项目 API 可按省份筛选', guizhou.status === 200 && guizhou.payload?.data?.total > 0);
    const publicOrganizations = await json('/api/public/organizations');
    check(
      '未核实保护单位不会返回联系方式',
      publicOrganizations.status === 200 &&
        (publicOrganizations.payload?.data?.items || []).every(
          (item) => item.verified || (!item.address && !item.phone && !item.email),
        ),
    );
    const visitGuide = await json('/api/public/visit');
    check(
      '探访线索按省级地区聚合官方名录事实',
      visitGuide.status === 200 &&
        visitGuide.payload?.data?.provinces?.length > 0 &&
        visitGuide.payload.data.provinces.some(
          (item) => item.projectCount > 0 || item.inheritorCount > 0,
        ) &&
        visitGuide.payload.data.verifiedOrganizations.every(
          (item) => item.verified && (item.address || item.phone || item.email),
        ),
    );

    console.log('\n[11] AI 小助手');
    const aiConfig = await json('/api/ai/config');
    check('AI 配置可读取且不回显完整密钥', aiConfig.status === 200 && !JSON.stringify(aiConfig.payload).match(/sk-[A-Za-z0-9]{10,}/));
    await json('/api/auth/login', { method: 'POST', body: { username: 'editor', password: 'Editor@123' } });
    const aiConfigAsEditor = await json('/api/ai/config');
    check('录入员读取 AI 配置被拒绝（403）', aiConfigAsEditor.status === 403, `实际 ${aiConfigAsEditor.status}`);
    const aiPageAsEditor = await request('/admin/ai');
    const aiPageEditorHtml = await aiPageAsEditor.text();
    check('录入员访问 AI 配置页看到权限提示', aiPageAsEditor.status === 200 && aiPageEditorHtml.includes('仅管理员可访问'));
    await json('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@123' } });

    const beforeCount = (await json('/api/projects?pageSize=1')).payload?.data?.total;
    const queryResult = await json('/api/ai/query', { method: 'POST', body: { message: '内蒙古的民俗项目' } });
    check(
      'AI 指令识别为查询并给出直达链接',
      queryResult.status === 200 &&
        queryResult.payload?.data?.kind === 'query' &&
        (queryResult.payload?.data?.links || []).some((link) => link.href.includes('/admin/projects?')),
      queryResult.payload?.data?.reply?.slice(0, 60),
    );
    check('指令型查询命中数正确', Number(queryResult.payload?.data?.total) >= 1, `命中 ${queryResult.payload?.data?.total}`);

    const chatAnswer = await json('/api/ai/chat', { method: 'POST', body: { message: '苏绣用什么材料' } });
    check(
      'AI 问答返回站内来源列表',
      chatAnswer.status === 200 &&
        chatAnswer.payload?.data?.kind === 'answer' &&
        (chatAnswer.payload?.data?.sources || []).length > 0,
      `来源 ${(chatAnswer.payload?.data?.sources || []).length} 条`,
    );
    check(
      '未配置密钥时自动降级且提示原因',
      aiConfig.payload?.data?.hasApiKey
        ? typeof chatAnswer.payload?.data?.degraded === 'boolean' &&
          (!chatAnswer.payload?.data?.degraded || Boolean(chatAnswer.payload?.data?.reason))
        : chatAnswer.payload?.data?.degraded === true && Boolean(chatAnswer.payload?.data?.reason),
      String(chatAnswer.payload?.data?.reason),
    );
    check(
      '来源可点击回档案',
      (chatAnswer.payload?.data?.sources || []).every((source) => String(source.href || '').startsWith('/')),
    );
    check(
      'AI 回答附带可点击非遗推荐',
      (chatAnswer.payload?.data?.links || []).length > 0 &&
        (chatAnswer.payload?.data?.links || []).every((link) => String(link.href || '').startsWith('/')),
    );

    const chatQuery = await json('/api/ai/chat', { method: 'POST', body: { message: '列出第五批国家级项目' } });
    check('无筛选动词但含条件时也识别为指令', chatQuery.payload?.data?.kind === 'query', chatQuery.payload?.data?.kind);
    const afterCount = (await json('/api/projects?pageSize=1')).payload?.data?.total;
    check('AI 全程只读，未改动任何数据', beforeCount === afterCount, `${beforeCount} → ${afterCount}`);

    const reindex = await json('/api/search/reindex', { method: 'POST' });
    check('检索索引可重建', reindex.status === 200 && Number(reindex.payload?.data?.total) > 100, `索引 ${reindex.payload?.data?.total}`);
    const copilotPage = await request('/admin/copilot');
    const copilotHtml = await copilotPage.text();
    check('AI 小助手页面可访问', copilotPage.status === 200 && copilotHtml.includes('能力边界'));
    const knowledgePage = await request('/admin/knowledge');
    check('知识条目页面可访问', knowledgePage.status === 200);

    console.log('\n[12] 游客 AI 与探访信息');
    // 用独立 IP 测试，避免与真实流量共用限流桶，也让重复跑自检结果稳定
    const guestIp = `10.99.0.${Math.floor(Math.random() * 250) + 2}`;
    const guestHeaders = { 'X-Forwarded-For': guestIp };

    const guestHome = await request('/');
    const guestHomeHtml = await guestHome.text();
    check(
      '首页由 React 应用渲染',
      guestHomeHtml.includes('<div id="root"></div>') && guestHomeHtml.includes('/app/assets/'),
    );
    const mainBundlePath = [...guestHomeHtml.matchAll(/src="([^"]*index-[^"]+\.js)"/g)]
      .map((match) => match[1])
      .at(-1);
    const mainBundle = mainBundlePath ? await (await request(mainBundlePath)).text() : '';
    check(
      'React 主包包含小遗、语音与讲解入口',
      mainBundle.includes('问小遗') &&
        mainBundle.includes('SpeechSynthesisUtterance') &&
        mainBundle.includes('/ai/narrate'),
    );
    check(
      'React 公共包不包含虚构联系电话',
      !mainBundle.includes('81000000'),
    );

    const visitPage = await request('/organizations');
    const visitHtml = await visitPage.text();
    check('探访线索页可访问', visitPage.status === 200);
    check(
      '探访页由 React 应用接管',
      visitHtml.includes('<div id="root"></div>') && visitHtml.includes('/app/assets/'),
    );
    const visitApi = await json('/api/public/organizations');
    check('探访 API 可用', visitApi.status === 200 && Array.isArray(visitApi.payload?.data?.items));

    const detailForAi = await request(`/projects/${sampleProject ? sampleProject.id : 1}`);
    const detailForAiHtml = await detailForAi.text();
    check(
      '项目详情页由 React 应用接管',
      detailForAiHtml.includes('<div id="root"></div>') && detailForAiHtml.includes('/app/assets/'),
    );
    const projectChunkName = mainBundle.match(/ProjectDetailPage-[A-Za-z0-9_-]+\.js/)?.[0];
    const projectChunk = projectChunkName
      ? await (await request(`/app/assets/${projectChunkName}`)).text()
      : '';
    check(
      'React 构建包含三种讲解词模式',
      ['brief', 'detailed', 'child'].every((mode) => projectChunk.includes(mode)),
    );

    const narrationBrief = await json(`/api/public/ai/narrate?project_id=${sampleProject ? sampleProject.id : 1}&mode=brief`);
    const narrationDetailed = await json(`/api/public/ai/narrate?project_id=${sampleProject ? sampleProject.id : 1}&mode=detailed`);
    const narrationChild = await json(`/api/public/ai/narrate?project_id=${sampleProject ? sampleProject.id : 1}&mode=child`);
    check(
      '项目讲解词接口返回三种本地版本',
      narrationBrief.status === 200 && narrationBrief.payload?.data?.mode === 'brief' &&
        narrationDetailed.payload?.data?.mode === 'detailed' && narrationDetailed.payload?.data?.sections?.length >= 4 &&
        narrationChild.payload?.data?.mode === 'child' && narrationChild.payload?.data?.sections?.length >= 3,
    );
    check(
      '讲解词可直接用于语音朗读',
      String(narrationBrief.payload?.data?.script || '').length > 40 && !narrationBrief.payload?.data?.script?.includes('/'),
    );
    const narrationMissing = await json('/api/public/ai/narrate?project_id=999999&mode=brief');
    check('未发布或不存在的项目不能生成讲解词（404）', narrationMissing.status === 404);
    check(
      '数字讲解员能力已进入 React 构建',
      mainBundle.includes('SpeechSynthesisUtterance') &&
        mainBundle.includes('webkitSpeechRecognition') &&
        mainBundle.includes('/ai/narrate'),
    );

    const guestAnswer = await json('/api/public/ai/chat', {
      method: 'POST',
      headers: guestHeaders,
      body: { message: '苗族古歌讲的是什么' },
    });
    check(
      '游客未登录即可提问并拿到回答',
      guestAnswer.status === 200 && String(guestAnswer.payload?.data?.reply || '').length > 10,
      `HTTP ${guestAnswer.status}`,
    );
    check(
      '游客回答带可点击来源',
      (guestAnswer.payload?.data?.sources || []).length > 0,
      `${(guestAnswer.payload?.data?.sources || []).length} 条`,
    );
    check(
      '游客回答带可直接跳转的非遗推荐',
      (guestAnswer.payload?.data?.links || []).length > 0 &&
        (guestAnswer.payload?.data?.links || []).every((link) => String(link.href || '').startsWith('/')),
    );
    const guestPayload = JSON.stringify(guestAnswer.payload || {});
    check('游客结果不含任何管理端链接', !guestPayload.includes('/admin'));

    const guestEmpty = await json('/api/public/ai/chat', {
      method: 'POST',
      headers: guestHeaders,
      body: { message: '   ' },
    });
    check('游客空提问被拒（400）', guestEmpty.status === 400, `HTTP ${guestEmpty.status}`);

    const guestQuery = await json('/api/public/ai/query', {
      method: 'POST',
      headers: guestHeaders,
      body: { message: '传统技艺类项目' },
    });
    check(
      '游客指令型查询可用且指向门户',
      guestQuery.status === 200 &&
        Number(guestQuery.payload?.data?.total) >= 10 &&
        (guestQuery.payload?.data?.links || []).every((link) => !link.href.includes('/admin')),
      `命中 ${guestQuery.payload?.data?.total}`,
    );

    // 问答型限流：同一新 IP 连续提问，第 4 次应被拦
    const limitIp = `10.99.1.${Math.floor(Math.random() * 250) + 2}`;
    let limitedAt = 0;
    for (let i = 1; i <= 5; i += 1) {
      const res = await json('/api/public/ai/chat', {
        method: 'POST',
        headers: { 'X-Forwarded-For': limitIp },
        body: { message: `介绍一个不存在的词条 xyz${i}` },
      });
      if (res.status === 429) {
        limitedAt = i;
        break;
      }
    }
    check('问答型限流生效（每分钟 3 次）', limitedAt === 4, `第 ${limitedAt || '未'} 次被拦`);
    const stillLimited = await json('/api/public/ai/chat', {
      method: 'POST',
      headers: { 'X-Forwarded-For': limitIp },
      body: { message: '再问一次' },
    });
    check('超限返回 429 且带重试提示', stillLimited.status === 429 && Boolean(stillLimited.payload?.error));

    // 清掉登录态，模拟真正的游客再打管理端接口
    for (const key of Object.keys(jar)) delete jar[key];
    const guestCannotUseAdminAi = await json('/api/ai/chat', { method: 'POST', body: { message: '苏绣' } });
    check('未登录无法调用管理端 AI 接口（401）', guestCannotUseAdminAi.status === 401, `HTTP ${guestCannotUseAdminAi.status}`);
    const guestCannotSeeAdmin = await request('/admin/copilot');
    check('未登录访问 AI 管理页被跳转登录', guestCannotSeeAdmin.status === 302, `HTTP ${guestCannotSeeAdmin.status}`);

    await json('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'Admin@123' } });
    const archivedOrgs = await json('/api/organizations?status=archived&pageSize=50');
    check(
      '虚构示例基地已归档（后台仍可查）',
      Number(archivedOrgs.payload?.data?.total) >= 12,
      `归档 ${archivedOrgs.payload?.data?.total} 条`,
    );
    check(
      '归档基地不出现在门户探访页',
      !visitHtml.includes('秦淮非遗展示馆') && !visitHtml.includes('姑苏绣艺非遗工坊'),
    );

    void editorCookie;
    void adminCookie;
  } catch (error) {
    failures.push(`脚本异常：${error.message}`);
    console.error(error);
  } finally {
    // 即使脚本中途失败或被中断，也要清掉测试数据
    await cleanupCreated();
    child.kill();
  }

  console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
  if (failures.length) {
    console.log('失败明细：');
    for (const item of failures) console.log(`  - ${item}`);
    process.exitCode = 1;
  } else {
    console.log('全部冒烟测试通过。');
  }
}

main();
