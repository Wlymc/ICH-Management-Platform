import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

export function readBody(req, limit = 24 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求体过大'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req) {
  const buffer = await readBody(req);
  if (!buffer.length) return {};
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw Object.assign(new Error('请求体不是合法的 JSON'), { statusCode: 400 });
  }
}

export function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function ok(res, data, extra = {}) {
  sendJson(res, 200, { ok: true, data, error: null, ...extra });
}

export function fail(res, status, message, extra = {}) {
  sendJson(res, status, { ok: false, data: null, error: message, ...extra });
}

export function sendHtml(res, html, status = 200, headers = {}) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

export function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...headers });
  res.end();
}

export function sendBuffer(res, buffer, { mime, downloadName, extraHeaders = {} } = {}) {
  const headers = {
    'Content-Type': mime || 'application/octet-stream',
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  };
  if (downloadName) {
    headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  }
  res.writeHead(200, headers);
  res.end(buffer);
}

export function sendStaticFile(res, filePath, { downloadName } = {}) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendHtml(res, '<h1>404 文件不存在</h1>', 404);
    return;
  }
  sendBuffer(res, fs.readFileSync(filePath), { mime: mimeFor(filePath), downloadName });
}

export function sendNotFound(res) {
  sendHtml(
    res,
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>404</title>
     <style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f7f4ef;color:#2b2b2b}
     .box{text-align:center}h1{font-size:64px;margin:0;color:#a8322d}p{color:#6b6b6b}
     a{display:inline-block;margin-top:12px;padding:10px 20px;background:#a8322d;color:#fff;border-radius:8px;text-decoration:none}</style></head>
     <body><div class="box"><h1>404</h1><p>页面不存在或已被移除</p><a href="/">返回门户首页</a></div></body></html>`,
    404,
  );
}

export function sendError(res, error) {
  const status = error?.statusCode || 500;
  if (status >= 500) console.error('[error]', error);
  sendHtml(
    res,
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>出错了</title>
     <style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;padding:48px;background:#f7f4ef;color:#2b2b2b}
     pre{background:#fff;padding:16px;border-radius:8px;overflow:auto;border:1px solid #e6ded1}</style></head>
     <body><h1>${status} 出错了</h1><p>${escapeSimple(error?.message || '服务器内部错误')}</p>
     <pre>${escapeSimple(error?.stack || '')}</pre><p><a href="/admin">返回管理端</a> · <a href="/">返回门户</a></p></body></html>`,
    status,
  );
}

function escapeSimple(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 阻止跨站表单提交到写接口 */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  // 沙箱 iframe / 隐私模式下浏览器会发送 "null"，本地应用不应因此拦截
  if (origin === 'null') return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return true;
  }
}

export function parseQuery(url) {
  const out = {};
  for (const [key, value] of url.searchParams.entries()) {
    out[key] = value;
  }
  return out;
}
