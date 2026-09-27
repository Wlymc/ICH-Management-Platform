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
    env: { ...process.env, PORT: String(PORT) },
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

    const publicBefore = await request(`/projects/${projectId}`);
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

    const publicAfter = await request(`/projects/${projectId}`);
    const detailHtml = await publicAfter.text();
    check('发布后门户可访问详情页', publicAfter.status === 200 && detailHtml.includes(`冒烟测试项目-${stamp}`));

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
    const portalDetail = await (await request(`/projects/${projectId}`)).text();
    check('门户详情页渲染新发布项目', portalDetail.includes(`冒烟测试项目-${stamp}`) && portalDetail.includes('meta-grid'));

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

    const sampleList = await json('/api/projects?pageSize=10');
    const sample = sampleList.payload?.data?.items?.find((item) => item.cover_path);
    if (sample) {
      const sampleHtml = await (await request(`/projects/${sample.id}`)).text();
      check(
        '示例项目详情页含叙事内容与影像墙',
        sampleHtml.includes('历史渊源') && sampleHtml.includes('gallery-grid') && sampleHtml.includes('/uploads/seed/'),
      );
    } else {
      check('示例项目详情页含叙事内容与影像墙', false, '未找到带封面的示例项目');
    }

    console.log('\n[8] 清理测试数据');
    await cleanupCreated();
    const afterCleanup = await request(`/projects/${projectId}`);
    check('测试数据已清理（门户不可见）', afterCleanup.status === 404);

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
