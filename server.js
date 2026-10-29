import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { BRAND, PATHS, SERVER } from './src/config.js';
import './src/db.js';
import { seedAll } from './src/seed.js';
import { currentUser, pruneSessions } from './src/auth.js';
import { handleApi } from './src/routes/api.js';
import { handleAdmin } from './src/routes/admin.js';
import { clientIp, mimeFor, sendError, sendHtml, sendNotFound } from './src/http.js';
import { renderReactSeo } from './src/react-seo.js';

seedAll();
pruneSessions();
setInterval(pruneSessions, 30 * 60 * 1000).unref();

function staticEtag(stat) {
  return `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
    return { invalid: true };
  }
  end = Math.min(end, size - 1);
  return { start, end, length: end - start + 1 };
}

function requestIsFresh(req, etag, lastModified) {
  const ifNoneMatch = String(req.headers['if-none-match'] || '').trim();
  if (ifNoneMatch) {
    return ifNoneMatch === '*' || ifNoneMatch.split(',').some((value) => value.trim() === etag);
  }
  const ifModifiedSince = Date.parse(String(req.headers['if-modified-since'] || ''));
  if (!Number.isFinite(ifModifiedSince)) return false;
  return Math.floor(lastModified.getTime() / 1000) <= Math.floor(ifModifiedSince / 1000);
}

function serveFrom(
  req,
  res,
  baseDir,
  relativePath,
  { download = false, cacheControl = 'no-cache' } = {},
) {
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
  const etag = staticEtag(stat);
  const lastModified = new Date(stat.mtimeMs);
  const headers = {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
    ETag: etag,
    'Last-Modified': lastModified.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  };
  if (download) {
    headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(target))}`;
  }
  if (mime === 'image/svg+xml') {
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
  }
  if (requestIsFresh(req, etag, lastModified)) {
    delete headers['Content-Length'];
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const range = req.headers.range ? parseByteRange(req.headers.range, stat.size) : null;
  if (range?.invalid) {
    delete headers['Content-Length'];
    headers['Content-Range'] = `bytes */${stat.size}`;
    res.writeHead(416, headers);
    res.end();
    return;
  }
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
    headers['Content-Length'] = range.length;
    res.writeHead(206, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(target, { start: range.start, end: range.end }).pipe(res);
    return;
  }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(target).pipe(res);
}

function redirectTo(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function serveReactPage(req, res, pathname) {
  const appRoot = path.join(PATHS.publicDir, 'app');
  const indexPath = path.join(appRoot, 'index.html');
  if (!fs.existsSync(indexPath)) {
    sendNotFound(res);
    return;
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
  const origin = `${protocol}://${req.headers.host || `localhost:${SERVER.port}`}`;
  const template = fs.readFileSync(indexPath, 'utf8');
  sendHtml(res, renderReactSeo(template, { pathname, origin }));
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
    if (pathname === '/app') {
      redirectTo(res, `/${url.search}`);
      return;
    }
    if (pathname.startsWith('/app/assets/') || pathname.startsWith('/app/vendor/')) {
      const appRoot = path.join(PATHS.publicDir, 'app');
      const relative = pathname.slice('/app/'.length);
      const requested = path.resolve(appRoot, relative || 'index.html');
      if (
        requested.startsWith(path.resolve(appRoot)) &&
        fs.existsSync(requested) &&
        fs.statSync(requested).isFile()
      ) {
        const immutableAsset =
          pathname.startsWith('/app/assets/') &&
          /[-.][A-Za-z0-9_-]{8,}\.(?:js|css|map|woff2?|png|jpe?g|webp|svg)$/.test(pathname);
        serveFrom(req, res, appRoot, relative || 'index.html', {
          cacheControl: immutableAsset
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        });
        return;
      }
      if (!path.extname(relative)) {
        serveFrom(req, res, appRoot, 'index.html', { cacheControl: 'no-cache' });
        return;
      }
      sendNotFound(res);
      return;
    }
    if (pathname.startsWith('/app/')) {
      redirectTo(res, `/${pathname.slice('/app/'.length)}${url.search}`);
      return;
    }
    if (pathname === '/xingtu' || pathname === '/graph') {
      redirectTo(
        res,
        `/explore?lens=${pathname === '/graph' ? 'project' : 'region'}${url.search ? `&${url.search.slice(1)}` : ''}`,
      );
      return;
    }
    if (pathname.startsWith('/assets/')) {
      serveFrom(req, res, PATHS.publicDir, pathname.slice('/assets/'.length), {
        cacheControl: 'no-cache',
      });
      return;
    }
    if (pathname.startsWith('/uploads/')) {
      serveFrom(req, res, PATHS.uploads, pathname.slice('/uploads/'.length), {
        cacheControl: 'public, max-age=86400',
      });
      return;
    }
    if (pathname.startsWith('/models3d/')) {
      serveFrom(req, res, PATHS.models3d, pathname.slice('/models3d/'.length), {
        cacheControl: 'public, max-age=86400',
      });
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

    const isReactRoute =
      pathname === '/' ||
      pathname === '/explore' ||
      pathname === '/models' ||
      pathname === '/projects' ||
      pathname.startsWith('/projects/') ||
      pathname === '/inheritors' ||
      pathname.startsWith('/inheritors/') ||
      pathname === '/organizations' ||
      pathname.startsWith('/organizations/');
    if (isReactRoute) {
      serveReactPage(req, res, pathname);
      return;
    }
    sendNotFound(res);
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
