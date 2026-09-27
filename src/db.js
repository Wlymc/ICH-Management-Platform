import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PATHS } from './config.js';

fs.mkdirSync(PATHS.data, { recursive: true });
fs.mkdirSync(PATHS.uploads, { recursive: true });

export const db = new DatabaseSync(PATHS.db);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial-schema',
    sql: `
      CREATE TABLE IF NOT EXISTS app_user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_attempt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        ip TEXT NOT NULL,
        ok INTEGER NOT NULL DEFAULT 0,
        at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_login_attempt ON login_attempt(username, ip, at);

      CREATE TABLE IF NOT EXISTS heritage_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        code TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS heritage_level (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        weight INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS region (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER REFERENCES region(id) ON DELETE SET NULL,
        region_level TEXT NOT NULL DEFAULT 'county',
        code TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_region_parent ON region(parent_id, name);

      CREATE TABLE IF NOT EXISTS dict_item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE (kind, name)
      );

      CREATE TABLE IF NOT EXISTS organization (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        org_type TEXT NOT NULL DEFAULT '',
        region_id INTEGER REFERENCES region(id) ON DELETE SET NULL,
        address TEXT NOT NULL DEFAULT '',
        manager TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        founded_year INTEGER,
        is_open INTEGER NOT NULL DEFAULT 0,
        open_hours TEXT NOT NULL DEFAULT '',
        traffic TEXT NOT NULL DEFAULT '',
        experience TEXT NOT NULL DEFAULT '',
        intro TEXT NOT NULL DEFAULT '',
        cover_path TEXT NOT NULL DEFAULT '',
        featured INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'rejected', 'archived')),
        created_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
        reviewed_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
        review_note TEXT NOT NULL DEFAULT '',
        review_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category_id INTEGER REFERENCES heritage_category(id) ON DELETE SET NULL,
        level_id INTEGER REFERENCES heritage_level(id) ON DELETE SET NULL,
        batch TEXT NOT NULL DEFAULT '',
        published_year INTEGER,
        region_id INTEGER REFERENCES region(id) ON DELETE SET NULL,
        organization_id INTEGER REFERENCES organization(id) ON DELETE SET NULL,
        protection_unit TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        history TEXT NOT NULL DEFAULT '',
        feature TEXT NOT NULL DEFAULT '',
        lineage TEXT NOT NULL DEFAULT '',
        keywords TEXT NOT NULL DEFAULT '',
        featured INTEGER NOT NULL DEFAULT 0,
        cover_path TEXT NOT NULL DEFAULT '',
        video_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'rejected', 'archived')),
        created_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
        reviewed_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
        review_note TEXT NOT NULL DEFAULT '',
        review_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_status ON project(status);
      CREATE INDEX IF NOT EXISTS idx_project_category ON project(category_id);
      CREATE INDEX IF NOT EXISTS idx_project_region ON project(region_id);

      CREATE TABLE IF NOT EXISTS inheritor (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        gender TEXT NOT NULL DEFAULT '',
        ethnic TEXT NOT NULL DEFAULT '',
        birth_month TEXT NOT NULL DEFAULT '',
        level_id INTEGER REFERENCES heritage_level(id) ON DELETE SET NULL,
        region_id INTEGER REFERENCES region(id) ON DELETE SET NULL,
        batch TEXT NOT NULL DEFAULT '',
        certified_year INTEGER,
        address TEXT NOT NULL DEFAULT '',
        experience TEXT NOT NULL DEFAULT '',
        story_title TEXT NOT NULL DEFAULT '',
        skill TEXT NOT NULL DEFAULT '',
        honors TEXT NOT NULL DEFAULT '',
        photo_path TEXT NOT NULL DEFAULT '',
        video_url TEXT NOT NULL DEFAULT '',
        featured INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'rejected', 'archived')),
        created_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
        reviewed_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
        review_note TEXT NOT NULL DEFAULT '',
        review_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inheritor_status ON inheritor(status);

      CREATE TABLE IF NOT EXISTS project_inheritor (
        project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        inheritor_id INTEGER NOT NULL REFERENCES inheritor(id) ON DELETE CASCADE,
        is_representative INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (project_id, inheritor_id)
      );

      CREATE TABLE IF NOT EXISTS attachment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_type TEXT NOT NULL CHECK (owner_type IN ('project', 'inheritor', 'organization')),
        owner_id INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'video', 'document')),
        title TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        file_name TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL DEFAULT '',
        file_size INTEGER NOT NULL DEFAULT 0,
        mime_type TEXT NOT NULL DEFAULT '',
        external_url TEXT NOT NULL DEFAULT '',
        uploaded_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_attachment_owner ON attachment(owner_type, owner_id);

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        target_type TEXT NOT NULL DEFAULT '',
        target_id INTEGER,
        target_name TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        ip TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    `,
  },
];

function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_version').all().map((r) => Number(r.version)),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

migrate();

/** 查询辅助：返回普通对象数组 */
export function all(sql, params = []) {
  return db.prepare(sql).all(...params).map((row) => ({ ...row }));
}

export function get(sql, params = []) {
  const row = db.prepare(sql).get(...params);
  return row ? { ...row } : null;
}

export function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

export function count(sql, params = []) {
  const row = get(sql, params);
  return row ? Number(Object.values(row)[0]) : 0;
}

export function insert(table, data) {
  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(', ');
  const result = run(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
    keys.map((k) => data[k]),
  );
  return Number(result.lastInsertRowid);
}

export function update(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  run(
    `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => data[k]), id],
  );
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function tableExists(name) {
  return !!get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]);
}
