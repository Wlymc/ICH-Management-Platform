import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, '..');

/** 平台品牌配置：改名只需修改此处 */
export const BRAND = {
  name: '非遗数字管理平台',
  shortName: '非遗数字管理',
  subtitle: '非物质文化遗产资源普查、建档、审核与展示一体化平台',
  organization: '非物质文化遗产保护中心',
  footerNote: '本平台为演示系统，内置数据均为示例数据，不代表真实非遗名录。',
};

export const SERVER = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
};

export const PATHS = {
  root: ROOT,
  data: path.join(ROOT, 'data'),
  db: path.join(ROOT, 'data', 'ich.db'),
  uploads: path.join(ROOT, 'uploads'),
  publicDir: path.join(ROOT, 'public'),
};

export const SESSION = {
  cookieName: 'sid',
  ttlMs: 24 * 60 * 60 * 1000,
  loginWindowMs: 5 * 60 * 1000,
  loginMaxFail: 5,
};

export const UPLOAD = {
  maxBytes: 10 * 1024 * 1024,
  allowed: {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/ogg': '.ogg',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/plain': '.txt',
  },
};

export const PAGE_SIZE = 12;
export const ADMIN_PAGE_SIZE = 15;

/**
 * 静态资源版本号：取 public/ 下最新修改时间。
 * 页面里以 /assets/xxx.css?v=... 引用，避免浏览器沿用缓存的旧样式。
 */
export const ASSET_VERSION = (() => {
  try {
    let stamp = 0;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else stamp = Math.max(stamp, Math.floor(fs.statSync(full).mtimeMs));
      }
    };
    walk(path.join(ROOT, 'public'));
    return stamp ? String(stamp) : '1';
  } catch {
    return '1';
  }
})();
