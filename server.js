import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { BRAND, PATHS, SERVER } from './src/config.js';
import './src/db.js';
import { seedAll } from './src/seed.js';
import { currentUser, pruneSessions } from './src/auth.js';
import { handleApi } from './src/routes/api.js';
import { handleAdmin } from './src/routes/admin.js';
import { handlePortal } from './src/routes/portal.js';
import { clientIp, mimeFor, sendError, sendHtml, sendNotFound } from './src/http.js';

seedAll();
pruneSessions();
setInterval(pruneSessions, 30 * 60 * 1000).unref();

function serveFrom(res, baseDir, relativePath, { download = false } = {}) {
  const safeRelative = relativePath
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => decodeURIComponent(part))
    .join(path.sep);
  const target = path.resolve(baseDir, safeRelative);
  if (!target.startsWith(path.resolve(baseDir))) {
    sendHtml(res, '<h1>403 非法路径</h1>', 403);
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    sendNotFound(res);
    return;
  }
  const stat = fs.statSync(target);
  const mime = mimeFor(target);
  const headers = {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  };
  if (download) {
    headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(target))}`;
  }
  if (mime === 'image/svg+xml') {
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
  }
  res.writeHead(200, headers);
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    sendHtml(res, '<h1>400 请求地址不合法</h1>', 400);
    return;
  }
  const pathname = decodeURI(url.pathname);

  try {
    if (pathname.startsWith('/assets/')) {
      serveFrom(res, PATHS.publicDir, pathname.slice('/assets/'.length));
      return;
    }
    if (pathname.startsWith('/uploads/')) {
      serveFrom(res, PATHS.uploads, pathname.slice('/uploads/'.length));
      return;
    }
    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    const user = currentUser(req);
    req.__authUser = user;

    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url, user);
      if (!handled && !res.writableEnded) sendJsonNotFound(res);
      return;
    }
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const handled = handleAdmin(req, res, url, user);
      if (!handled && !res.writableEnded) sendNotFound(res);
      return;
    }

    const handled = handlePortal(req, res, url);
    if (!handled && !res.writableEnded) sendNotFound(res);
  } catch (error) {
    if (!res.writableEnded) {
      if (pathname.startsWith('/api/')) {
        const status = error?.statusCode || 500;
        if (status >= 500) console.error('[api]', pathname, error);
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, data: null, error: error?.message || '服务器内部错误' }));
      } else {
        sendError(res, error);
      }
    }
  } finally {
    const cost = Date.now() - started;
    // 访问日志：只记录管理端与接口请求，便于排查登录/权限问题
    if (pathname.startsWith('/admin') || pathname.startsWith('/api')) {
      const who = req.__authUser ? `${req.__authUser.username}(${req.__authUser.role})` : '未登录';
      console.log(
        `${new Date().toLocaleTimeString('zh-CN', { hour12: false })} ${req.method} ${pathname} -> ${res.statusCode} [${who}] ${cost}ms`,
      );
    }
    if (cost > 1500 && !pathname.startsWith('/uploads/')) {
      console.log(`[slow] ${req.method} ${pathname} ${cost}ms`);
    }
    void clientIp;
  }
});

function sendJsonNotFound(res) {
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, data: null, error: '接口不存在' }));
}

server.listen(SERVER.port, SERVER.host, () => {
  const url = `http://localhost:${SERVER.port}`;
  console.log('');
  console.log(`  ${BRAND.name} 已启动`);
  console.log(`  ---------------------------------------------`);
  console.log(`  公众门户      ${url}/`);
  console.log(`  管理端        ${url}/admin`);
  console.log(`  数据大屏      ${url}/admin/dashboard`);
  console.log(`  数据库        ${PATHS.db}`);
  console.log(`  附件目录      ${PATHS.uploads}`);
  console.log('');
  console.log(`  演示账号：admin / Admin@123   （管理员）`);
  console.log(`            editor / Editor@123 （录入员）`);
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${SERVER.port} 已被占用。请先关闭占用该端口的程序，或用 set PORT=3001 && node server.js 更换端口。`);
    process.exit(1);
  }
  throw error;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n正在关闭服务……');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
