import crypto from 'node:crypto';
import { SESSION } from './config.js';
import { all, count, get, insert, run, update } from './db.js';
import { parseCookies, clientIp } from './http.js';
import { nowIso, text, token } from './util.js';
import { writeAudit } from './service.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, salt, digest] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const derived = crypto.scryptSync(password, Buffer.from(salt, 'base64url'), Buffer.from(digest, 'base64url').length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(derived, Buffer.from(digest, 'base64url'));
  } catch {
    return false;
  }
}

export function ensureUser({ username, password, displayName, role }) {
  const existing = get('SELECT * FROM app_user WHERE username = ?', [username]);
  if (existing) return existing.id;
  return insert('app_user', {
    username,
    display_name: displayName,
    password_hash: hashPassword(password),
    role,
    status: 'active',
    created_at: nowIso(),
  });
}

export function listUsers() {
  return all('SELECT id, username, display_name, role, status, created_at FROM app_user ORDER BY id');
}

export function createUser({ username, password, displayName, role }) {
  const name = text(username, 40);
  if (!name) throw badRequest('用户名不能为空');
  if (!/^[A-Za-z0-9_.-]{3,40}$/.test(name)) throw badRequest('用户名只能包含字母、数字、下划线、点和短横线，长度 3-40');
  if (!password || String(password).length < 6) throw badRequest('密码长度至少 6 位');
  if (get('SELECT id FROM app_user WHERE username = ?', [name])) throw badRequest('该用户名已存在');
  const roleValue = role === 'admin' ? 'admin' : 'editor';
  return insert('app_user', {
    username: name,
    display_name: text(displayName, 40) || name,
    password_hash: hashPassword(String(password)),
    role: roleValue,
    status: 'active',
    created_at: nowIso(),
  });
}

export function updateUser(id, payload) {
  const user = get('SELECT * FROM app_user WHERE id = ?', [id]);
  if (!user) throw notFound('用户不存在');
  const data = {};
  if (payload.displayName !== undefined) data.display_name = text(payload.displayName, 40);
  if (payload.role !== undefined) data.role = payload.role === 'admin' ? 'admin' : 'editor';
  if (payload.status !== undefined) data.status = payload.status === 'disabled' ? 'disabled' : 'active';
  if (payload.password) {
    if (String(payload.password).length < 6) throw badRequest('密码长度至少 6 位');
    data.password_hash = hashPassword(String(payload.password));
  }
  if (data.role && data.role !== 'admin' && user.role === 'admin') {
    const admins = count("SELECT COUNT(*) AS n FROM app_user WHERE role = 'admin' AND status = 'active'");
    if (admins <= 1) throw badRequest('系统必须保留至少一名启用状态的管理员');
  }
  if (data.status === 'disabled' && user.role === 'admin') {
    const admins = count("SELECT COUNT(*) AS n FROM app_user WHERE role = 'admin' AND status = 'active'");
    if (admins <= 1) throw badRequest('系统必须保留至少一名启用状态的管理员');
  }
  if (!Object.keys(data).length) return;
  update('app_user', id, data);
  if (data.status === 'disabled') run('DELETE FROM session WHERE user_id = ?', [id]);
}

export function deleteUser(id, currentUserId) {
  if (Number(id) === Number(currentUserId)) throw badRequest('不能删除当前登录账号');
  const user = get('SELECT * FROM app_user WHERE id = ?', [id]);
  if (!user) throw notFound('用户不存在');
  if (user.role === 'admin') {
    const admins = count("SELECT COUNT(*) AS n FROM app_user WHERE role = 'admin'");
    if (admins <= 1) throw badRequest('系统必须保留至少一名管理员');
  }
  const owned =
    count('SELECT COUNT(*) AS n FROM project WHERE created_by = ?', [id]) +
    count('SELECT COUNT(*) AS n FROM inheritor WHERE created_by = ?', [id]) +
    count('SELECT COUNT(*) AS n FROM organization WHERE created_by = ?', [id]);
  if (owned > 0) throw badRequest(`该用户已录入 ${owned} 条档案，请先转移或删除其数据，或改为「停用」`);
  run('DELETE FROM session WHERE user_id = ?', [id]);
  run('DELETE FROM app_user WHERE id = ?', [id]);
}

/* ---------------- 会话 ---------------- */

function tooManyFailures(username, ip) {
  const since = Date.now() - SESSION.loginWindowMs;
  const row = get(
    'SELECT COUNT(*) AS n FROM login_attempt WHERE username = ? AND ip = ? AND ok = 0 AND at > ?',
    [username, ip, since],
  );
  return Number(row?.n || 0) >= SESSION.loginMaxFail;
}

function recordAttempt(username, ip, ok) {
  insert('login_attempt', { username, ip, ok: ok ? 1 : 0, at: Date.now() });
  if (ok) run('DELETE FROM login_attempt WHERE username = ? AND ip = ? AND ok = 0', [username, ip]);
  run('DELETE FROM login_attempt WHERE at < ?', [Date.now() - 24 * 60 * 60 * 1000]);
}

export function login(username, password, ip) {
  const name = text(username, 40);
  if (!name || !password) throw badRequest('请输入用户名和密码');
  if (tooManyFailures(name, ip)) {
    throw Object.assign(new Error('登录失败次数过多，请 5 分钟后再试'), { statusCode: 429 });
  }
  const user = get('SELECT * FROM app_user WHERE username = ?', [name]);
  if (!user || !verifyPassword(String(password), user.password_hash)) {
    recordAttempt(name, ip, false);
    throw Object.assign(new Error('用户名或密码不正确'), { statusCode: 401 });
  }
  if (user.status !== 'active') {
    throw Object.assign(new Error('该账号已停用'), { statusCode: 403 });
  }
  recordAttempt(name, ip, true);
  const sessionToken = token(32);
  insert('session', {
    token: sessionToken,
    user_id: user.id,
    created_at: nowIso(),
    expires_at: Date.now() + SESSION.ttlMs,
  });
  writeAudit(user, 'login', 'user', user.id, user.display_name, '登录成功', ip);
  return { token: sessionToken, user: publicUser(user) };
}

export function publicUser(user) {
  return { id: user.id, username: user.username, displayName: user.display_name, role: user.role };
}

export function logout(req, user, ip) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionToken = cookies[SESSION.cookieName];
  if (sessionToken) run('DELETE FROM session WHERE token = ?', [sessionToken]);
  if (user) writeAudit(user, 'logout', 'user', user.id, user.display_name, '退出登录', ip);
}

export function currentUser(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionToken = cookies[SESSION.cookieName];
  if (!sessionToken) return null;
  const row = get(
    `SELECT s.token, s.expires_at, u.* FROM session s
     JOIN app_user u ON u.id = s.user_id
     WHERE s.token = ?`,
    [sessionToken],
  );
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    run('DELETE FROM session WHERE token = ?', [sessionToken]);
    return null;
  }
  if (row.status !== 'active') return null;
  // 滑动续期：剩余不足一半有效期时延长
  if (Number(row.expires_at) - Date.now() < SESSION.ttlMs / 2) {
    run('UPDATE session SET expires_at = ? WHERE token = ?', [Date.now() + SESSION.ttlMs, sessionToken]);
  }
  return row;
}

export function sessionCookie(sessionToken, maxAgeSeconds = SESSION.ttlMs / 1000) {
  return `${SESSION.cookieName}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeSeconds)}`;
}

export function clearCookie() {
  return `${SESSION.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function pruneSessions() {
  run('DELETE FROM session WHERE expires_at < ?', [Date.now()]);
}

export function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function notFound(message) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export function requireRole(user, role, message = '权限不足') {
  if (!user || user.role !== role) {
    throw Object.assign(new Error(message), { statusCode: 403 });
  }
}
