#!/usr/bin/env node
/**
 * 素材批量工具（零依赖，直接读写本地数据库）
 *
 *   node scripts/media.js gaps                             导出「待补素材清单」CSV
 *   node scripts/media.js import <素材目录> [选项]           按文件名/目录名批量导入图片
 *   node scripts/media.js rename-check <素材目录>           只检查命名能否匹配，不写库
 *
 * 通用选项：
 *   --db <路径>        指定数据库（默认 data/ich.db），可指向副本做演练
 *   --uploads <路径>   指定附件目录（默认 uploads）
 *   --out <路径>       报告/清单输出路径
 *   --source <文字>    图片来源说明，写入附件备注（默认“待补充来源”）
 *   --dry-run          只输出计划，不写库、不复制文件
 *   --limit <数量>     最多处理多少张（调试用）
 *
 * 命名约定（二选一，也可混用）：
 *   1) 扁平命名：<项目编号>_1.jpg、<项目编号>.jpg、<传承人姓名>_1.jpg
 *   2) 目录命名：素材/项目/<项目编号>/任意名.jpg、素材/传承人/<姓名>/任意名.jpg
 *      目录里也可以直接写项目名称或传承人姓名
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseCsv, rowsToObjects } from '../src/report/csv.js';
import { decodeTextBuffer } from '../src/util.js';
import { imageInfo } from '../src/report/imageinfo.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const IMAGE_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const MAX_BYTES = 10 * 1024 * 1024;

/** 项目 / 传承人 建议配图张数 */
const EXPECTED = { project: 3, inheritor: 1 };

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item.startsWith('--')) {
      const key = item.slice(2);
      if (['dry-run'].includes(key)) {
        flags[key] = true;
        continue;
      }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        flags[key] = true;
        continue;
      }
      flags[key] = value;
      i += 1;
    } else {
      rest.push(item);
    }
  }
  return { flags, rest };
}

function openDb(flags) {
  const dbPath = flags.db ? path.resolve(String(flags.db)) : path.join(ROOT, 'data', 'ich.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`找不到数据库：${dbPath}`);
    process.exit(1);
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return { db, dbPath, uploadsRoot: flags.uploads ? path.resolve(String(flags.uploads)) : path.join(ROOT, 'uploads') };
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function toCsv(rows) {
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}\r\n`;
}

function writeFileSafe(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function outPath(flags, name) {
  return flags.out ? path.resolve(String(flags.out)) : path.join(ROOT, 'exports', `${name}_${timestamp()}.csv`);
}

function uid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[（(].*?[)）]/g, '')
    .toLowerCase();
}

/** 去掉文件名末尾的序号：苏绣_2 / 苏绣-2 / 苏绣(2) → 苏绣 */
function stripIndex(baseName) {
  return baseName.replace(/[\s_-]*[（(]?\d+[)）]?$/, '').trim();
}

function walkImages(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkImages(full, out);
    else if (IMAGE_EXT[path.extname(entry.name).toLowerCase()]) out.push(full);
  }
  return out;
}

/* ---------------- gaps：待补素材清单 ---------------- */

function commandGaps(flags) {
  const { db } = openDb(flags);
  const projectRows = db
    .prepare(
      `SELECT p.code, p.name, c.name AS category, l.name AS level, r.name AS region,
              p.status,
              (SELECT COUNT(*) FROM attachment a
                WHERE a.owner_type = 'project' AND a.owner_id = p.id AND a.kind = 'image') AS images
       FROM project p
       LEFT JOIN heritage_category c ON c.id = p.category_id
       LEFT JOIN heritage_level l ON l.id = p.level_id
       LEFT JOIN region r ON r.id = p.region_id
       ORDER BY images ASC, c.sort_order, p.name`,
    )
    .all()
    .map((row) => ({ ...row }));
  const inheritorRows = db
    .prepare(
      `SELECT i.code, i.name, l.name AS level, r.name AS region, i.status,
              (SELECT COUNT(*) FROM attachment a
                WHERE a.owner_type = 'inheritor' AND a.owner_id = i.id AND a.kind = 'image') AS images
       FROM inheritor i
       LEFT JOIN heritage_level l ON l.id = i.level_id
       LEFT JOIN region r ON r.id = i.region_id
       ORDER BY images ASC, l.sort_order, i.name`,
    )
    .all()
    .map((row) => ({ ...row }));

  const rows = [['类型', '编号', '名称', '类别', '级别', '地区', '状态', '现有图片数', '建议张数', '缺口']];
  for (const row of projectRows) {
    rows.push([
      '项目',
      row.code,
      row.name,
      row.category || '',
      row.level || '',
      row.region || '',
      row.status,
      row.images,
      EXPECTED.project,
      Math.max(EXPECTED.project - row.images, 0),
    ]);
  }
  for (const row of inheritorRows) {
    rows.push([
      '传承人',
      row.code,
      row.name,
      '',
      row.level || '',
      row.region || '',
      row.status,
      row.images,
      EXPECTED.inheritor,
      Math.max(EXPECTED.inheritor - row.images, 0),
    ]);
  }

  const target = writeFileSafe(outPath(flags, '待补素材清单'), toCsv(rows));
  const projectGap = projectRows.filter((r) => r.images < EXPECTED.project).length;
  const inheritorGap = inheritorRows.filter((r) => r.images < EXPECTED.inheritor).length;
  const totalGap = rows.slice(1).reduce((sum, row) => sum + row[9], 0);

  console.log(`已导出待补素材清单：${target}`);
  console.log(`  项目 ${projectRows.length} 个，其中 ${projectGap} 个图片不足 ${EXPECTED.project} 张`);
  console.log(`  传承人 ${inheritorRows.length} 位，其中 ${inheritorGap} 位没有照片`);
  console.log(`  合计需要补 ${totalGap} 张图（清单按缺口从多到少排序，可直接按类别/地区分工认领）`);
}

/* ---------------- import：批量导入 ---------------- */

function buildIndex(db) {
  const byCode = new Map();
  const projectByName = new Map();
  const inheritorByName = new Map();
  const projectById = new Map();
  const inheritorById = new Map();

  for (const row of db.prepare('SELECT id, code, name, cover_path, status FROM project').all()) {
    const item = { ...row };
    projectById.set(Number(item.id), item);
    byCode.set(normalizeKey(item.code), item);
    const key = normalizeKey(item.name);
    if (!projectByName.has(key)) projectByName.set(key, []);
    projectByName.get(key).push(item);
  }
  for (const row of db.prepare('SELECT id, code, name, photo_path, status FROM inheritor').all()) {
    const item = { ...row };
    inheritorById.set(Number(item.id), item);
    const key = normalizeKey(item.name);
    if (!inheritorByName.has(key)) inheritorByName.set(key, []);
    inheritorByName.get(key).push(item);
  }
  return { byCode, projectByName, inheritorByName, projectById, inheritorById };
}

function resolveOne(index, candidates, kind, label) {
  if (!candidates || !candidates.length) return null;
  const seen = new Set();
  const unique = [];
  for (const item of candidates) {
    const id = Number(item.id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(item);
  }
  if (unique.length === 1) return { kind, item: unique[0] };
  return { kind: 'ambiguous', label, candidates: unique };
}

function resolveTarget(index, filePath, materialsRoot) {
  const relative = path.relative(materialsRoot, filePath);
  const segments = relative.split(path.sep).slice(0, -1);
  const baseName = stripIndex(path.basename(filePath, path.extname(filePath)));

  // 1) 目录名匹配（支持 素材/项目/<编号>/任意名.jpg）
  for (const segment of [...segments].reverse()) {
    const key = normalizeKey(segment);
    if (!key) continue;
    if (index.byCode.has(key)) return { kind: 'project', item: index.byCode.get(key) };
    if (index.projectByName.has(key)) {
      const resolved = resolveOne(index, index.projectByName.get(key), 'project', segment);
      if (resolved) return resolved;
    }
    if (index.inheritorByName.has(key)) {
      const resolved = resolveOne(index, index.inheritorByName.get(key), 'inheritor', segment);
      if (resolved) return resolved;
    }
  }

  // 2) 文件名匹配
  const baseKey = normalizeKey(baseName);
  if (index.byCode.has(baseKey)) return { kind: 'project', item: index.byCode.get(baseKey) };
  if (index.projectByName.has(baseKey)) {
    const resolved = resolveOne(index, index.projectByName.get(baseKey), 'project', baseName);
    if (resolved) return resolved;
  }
  if (index.inheritorByName.has(baseKey)) {
    const resolved = resolveOne(index, index.inheritorByName.get(baseKey), 'inheritor', baseName);
    if (resolved) return resolved;
  }
  return null;
}

function commandImport(flags, rest) {
  const materialsRoot = rest[0];
  if (!materialsRoot || !fs.existsSync(materialsRoot)) {
    console.error('用法：node scripts/media.js import <素材目录> [--source 来源说明] [--dry-run]');
    process.exit(1);
  }
  const { db, uploadsRoot } = openDb(flags);
  const dryRun = Boolean(flags['dry-run']);
  const sourceNote = flags.source ? String(flags.source) : '待补充来源';
  const limit = flags.limit ? Number(flags.limit) : Infinity;
  const index = buildIndex(db);
  const admin = db.prepare("SELECT id FROM app_user WHERE role = 'admin' ORDER BY id LIMIT 1").get();

  const files = walkImages(path.resolve(materialsRoot)).slice(0, limit);
  const plan = [];
  const problems = [];

  for (const file of files) {
    const size = fs.statSync(file).size;
    const ext = path.extname(file).toLowerCase();
    const relative = path.relative(path.resolve(materialsRoot), file);
    if (!IMAGE_EXT[ext]) {
      problems.push(['不支持的格式', relative, ext]);
      continue;
    }
    if (size > MAX_BYTES) {
      problems.push(['文件超过 10MB', relative, `${Math.round(size / 1024 / 1024)}MB`]);
      continue;
    }
    if (size === 0) {
      problems.push(['空文件', relative, '0KB']);
      continue;
    }
    const target = resolveTarget(index, file, path.resolve(materialsRoot));
    if (!target) {
      problems.push(['未能匹配到项目或传承人', relative, '请用编号或姓名命名'], );
      continue;
    }
    if (target.kind === 'ambiguous') {
      problems.push(['重名，需人工确认', relative, target.candidates.map((c) => `${c.name}(${c.code})`).join(' / ')]);
      continue;
    }
    const meta = imageInfo(file);
    plan.push({ file, relative, size, ext, kind: target.kind, item: target.item, width: meta.width, height: meta.height });
  }

  if (dryRun) {
    console.log('[演练模式] 不会写入数据库、不会复制文件\n');
  }

  let imported = 0;
  const month = new Date().toISOString().slice(0, 7);
  const insertedIds = [];
  for (const item of plan) {
    const relativeFile = path.join('media', month, `${uid()}${item.ext}`);
    if (!dryRun) {
      const targetPath = path.join(uploadsRoot, relativeFile);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(item.file, targetPath);
      const info = db
        .prepare(
          `INSERT INTO attachment (owner_type, owner_id, kind, title, note, file_name, file_path,
                                   file_size, mime_type, external_url, uploaded_by, created_at, width, height)
           VALUES (?, ?, 'image', ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)`,
        )
        .run(
          item.kind,
          Number(item.item.id),
          path.basename(item.file, item.ext),
          `来源：${sourceNote}；批量导入自 ${item.relative}`,
          path.basename(item.file),
          relativeFile.split(path.sep).join('/'),
          item.size,
          IMAGE_EXT[item.ext],
          admin ? Number(admin.id) : null,
          new Date().toISOString().replace('T', ' ').slice(0, 19),
          item.width || null,
          item.height || null,
        );
      insertedIds.push(Number(info.lastInsertRowid));
      // 首图自动设为封面
      if (item.kind === 'project' && !item.item.cover_path) {
        db.prepare('UPDATE project SET cover_path = ? WHERE id = ?').run(relativeFile.split(path.sep).join('/'), Number(item.item.id));
        item.item.cover_path = relativeFile;
      }
      if (item.kind === 'inheritor' && !item.item.photo_path) {
        db.prepare('UPDATE inheritor SET photo_path = ? WHERE id = ?').run(relativeFile.split(path.sep).join('/'), Number(item.item.id));
        item.item.photo_path = relativeFile;
      }
    }
    imported += 1;
  }

  if (!dryRun && imported) {
    db.prepare(
      `INSERT INTO audit_log (user_id, user_name, action, target_type, target_id, target_name, detail, ip, created_at)
       VALUES (?, ?, 'import', 'attachment', NULL, ?, ?, '127.0.0.1', ?)`,
    ).run(
      admin ? Number(admin.id) : null,
      admin ? '系统管理员' : '脚本',
      '批量素材导入',
      `导入 ${imported} 张图片（来源：${sourceNote}）`,
      new Date().toISOString().replace('T', ' ').slice(0, 19),
    );
  }

  const reportRows = [['结果', '类型', '归属编号', '归属名称', '文件', '大小KB', '说明']];
  for (const item of plan) {
    reportRows.push([
      dryRun ? '待导入' : '已导入',
      item.kind === 'project' ? '项目' : '传承人',
      item.item.code,
      item.item.name,
      item.relative,
      Math.round(item.size / 1024),
      '',
    ]);
  }
  for (const [reason, file, extra] of problems) {
    reportRows.push(['跳过', '', '', '', file, '', `${reason}；${extra || ''}`]);
  }
  const reportPath = writeFileSafe(outPath(flags, dryRun ? '素材导入演练报告' : '素材导入报告'), toCsv(reportRows));

  console.log(`扫描到 ${files.length} 个图片文件`);
  console.log(`  可导入 ${plan.length} 张${dryRun ? '（演练，未写入）' : `，已导入 ${imported} 张`}`);
  console.log(`  跳过 ${problems.length} 张`);
  if (problems.length) {
    console.log('  跳过原因统计：');
    const byReason = new Map();
    for (const [reason] of problems) byReason.set(reason, (byReason.get(reason) || 0) + 1);
    for (const [reason, total] of byReason) console.log(`    ${reason}：${total} 张`);
  }
  console.log(`  明细报告：${reportPath}`);
  if (dryRun) console.log('  确认无误后去掉 --dry-run 再执行一次即正式导入。');
}

/* ---------------- 入口 ---------------- */

/* ---------------- import-index：按索引表批量导入（含版权留痕与规格体检） ---------------- */

function commandImportIndex(flags, rest) {
  const indexFile = rest[0];
  if (!indexFile || !fs.existsSync(indexFile)) {
    console.error('用法：node scripts/media.js import-index <图片索引.csv> --root <图片根目录> [--source "公开网络检索"]');
    process.exit(1);
  }
  const imageRoot = flags.root ? path.resolve(String(flags.root)) : path.dirname(path.resolve(indexFile));
  const { db, uploadsRoot } = openDb(flags);
  const dryRun = Boolean(flags['dry-run']);
  const sourceKind = flags.source ? String(flags.source) : '公开网络检索';
  const limit = flags.limit ? Number(flags.limit) : Infinity;
  const maxKb = flags['max-kb'] ? Number(flags['max-kb']) : 500;
  const minLongEdge = flags['min-long-edge'] ? Number(flags['min-long-edge']) : 1600;
  const admin = db.prepare("SELECT id FROM app_user WHERE role = 'admin' ORDER BY id LIMIT 1").get();

  const records = rowsToObjects(parseCsv(decodeTextBuffer(fs.readFileSync(indexFile)))).records;
  const reportRows = [['结果', '官方编号', '项目名称', '图片序号', '源文件', '尺寸', '长边', 'KB', '规格', '说明']];
  const issues = [];
  const sizeWarnings = { lowRes: 0, tooBig: 0 };
  let imported = 0;
  let skipped = 0;
  const month = new Date().toISOString().slice(0, 7);
  const coverSet = new Map();

  for (const row of records.slice(0, limit)) {
    const officialCode = String(row.编号 || '').trim();
    const projectName = String(row.名称 || '').trim();
    const relative = String(row.图片文件 || '').trim().replace(/\\/g, '/');
    const sourceFile = path.join(imageRoot, relative);

    if (!relative) {
      skipped += 1;
      reportRows.push(['跳过', officialCode, projectName, row.图片序号 || '', '', '', '', '', '', '索引表缺少图片文件列']);
      continue;
    }
    if (!fs.existsSync(sourceFile)) {
      skipped += 1;
      issues.push(`文件不存在：${relative}`);
      reportRows.push(['跳过', officialCode, projectName, row.图片序号 || '', relative, '', '', '', '', '源文件不存在']);
      continue;
    }
    const project = officialCode
      ? db.prepare('SELECT id, name, cover_path FROM project WHERE source_code = ?').get(officialCode)
      : db.prepare('SELECT id, name, cover_path FROM project WHERE name = ?').get(projectName);
    if (!project) {
      skipped += 1;
      issues.push(`未匹配到项目：${officialCode} / ${projectName}`);
      reportRows.push(['跳过', officialCode, projectName, row.图片序号 || '', relative, '', '', '', '', '未匹配到项目']);
      continue;
    }

    const info = imageInfo(sourceFile);
    const kb = Math.round(info.bytes / 1024);
    const specIssues = [];
    if (info.longEdge && info.longEdge < minLongEdge) {
      specIssues.push(`长边 ${info.longEdge} < ${minLongEdge}`);
      sizeWarnings.lowRes += 1;
    }
    if (info.bytes > maxKb * 1024) {
      specIssues.push(`体积 ${kb}KB > ${maxKb}KB`);
      sizeWarnings.tooBig += 1;
    }
    const ext = path.extname(sourceFile).toLowerCase();
    const targetRelative = path.join('media', month, `${uid()}${ext}`);
    const isCover = String(row.图片序号 || '').trim() === '1';

    if (!dryRun) {
      const targetPath = path.join(uploadsRoot, targetRelative);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourceFile, targetPath);
      const info2 = db
        .prepare(
          `INSERT INTO attachment
             (owner_type, owner_id, kind, title, note, file_name, file_path, file_size, mime_type,
              external_url, uploaded_by, created_at,
             source_kind, source_page, source_url, search_page, photographer, license, authorized_at)
          VALUES ('project', ?, 'image', ?, ?, ?, ?, ?, ?, '', ?, ?,
                   ?, ?, ?, ?, '', '', '', ?, ?)`,
        )
        .run(
          Number(project.id),
          String(row.图片标题 || path.basename(sourceFile)).slice(0, 120),
          String(row.图片标题 || '').slice(0, 500),
          path.basename(sourceFile),
          targetRelative.split(path.sep).join('/'),
          info.bytes,
          ext === '.png' ? 'image/png' : 'image/jpeg',
          admin ? Number(admin.id) : null,
          new Date().toISOString().replace('T', ' ').slice(0, 19),
          sourceKind,
          String(row.图片来源页 || '').slice(0, 500),
          String(row.原始图片链接 || '').slice(0, 500),
          String(row.图片搜索页 || '').slice(0, 500),
          info.width || null,
          info.height || null,
        );
      if (isCover && !project.cover_path && !coverSet.has(Number(project.id))) {
        db.prepare('UPDATE project SET cover_path = ? WHERE id = ?').run(targetRelative.split(path.sep).join('/'), Number(project.id));
        coverSet.set(Number(project.id), targetRelative);
      }
      void info2;
    }
    imported += 1;
    reportRows.push([
      dryRun ? '待导入' : '已导入',
      officialCode,
      project.name,
      row.图片序号 || '',
      relative,
      info.width ? `${info.width}x${info.height}` : '未知',
      info.longEdge ?? '',
      kb,
      specIssues.length ? specIssues.join('；') : '达标',
      isCover ? '作为封面' : '',
    ]);
  }

  if (!dryRun && imported) {
    db.prepare(
      `INSERT INTO audit_log (user_id, user_name, action, target_type, target_id, target_name, detail, ip, created_at)
       VALUES (?, ?, 'upload', 'attachment', NULL, ?, ?, '127.0.0.1', ?)`,
    ).run(
      admin ? Number(admin.id) : null,
      admin ? '系统管理员' : '脚本',
      '批量图片导入',
      `导入 ${imported} 张（来源：${sourceKind}，低清 ${sizeWarnings.lowRes} 张、超体积 ${sizeWarnings.tooBig} 张）`,
      new Date().toISOString().replace('T', ' ').slice(0, 19),
    );
  }

  const reportPath = writeFileSafe(outPath(flags, dryRun ? '图片导入演练报告' : '图片导入报告'), toCsv(reportRows));
  console.log(`${dryRun ? '[演练模式] ' : ''}索引表共 ${records.length} 行`);
  console.log(`  导入 ${imported} 张${dryRun ? '（演练，未写入）' : ''}，跳过 ${skipped} 张`);
  console.log(`  规格体检：长边不足 ${minLongEdge}px 的 ${sizeWarnings.lowRes} 张；超过 ${maxKb}KB 的 ${sizeWarnings.tooBig} 张（不阻断导入）`);
  console.log(`  明细报告：${reportPath}`);
  if (issues.length) {
    console.log('  需要注意：');
    for (const item of issues.slice(0, 10)) console.log(`    - ${item}`);
    if (issues.length > 10) console.log(`    …还有 ${issues.length - 10} 条`);
  }
  if (dryRun) console.log('  确认无误后去掉 --dry-run 正式执行。');
}

function main() {
  const { flags, rest } = parseArgs(process.argv.slice(2));
  const command = rest[0];
  const args = rest.slice(1);
  switch (command) {
    case 'gaps':
      commandGaps(flags);
      break;
    case 'import':
      commandImport(flags, args);
      break;
    case 'rename-check':
      commandImport({ ...flags, 'dry-run': true }, args);
      break;
    case 'import-index':
      commandImportIndex(flags, args);
      break;
    default:
      console.log(`非遗平台素材工具

  node scripts/media.js gaps                          导出「待补素材清单」CSV
  node scripts/media.js import <素材目录> [选项]        批量导入图片并按编号/姓名自动匹配
  node scripts/media.js rename-check <素材目录>        只检查命名能否匹配，不写库
  node scripts/media.js import-index <图片索引.csv> --root <图片根目录>
                                                       按索引表批量导入并做规格体检

通用选项：
  --db <路径>      指定数据库（可用于演练，默认 data/ich.db）
  --uploads <路径> 指定附件目录（默认 uploads）
  --out <路径>     指定报告输出路径（默认 exports/）
  --source <文字>  图片来源说明，写入附件备注（默认“待补充来源”）
  --dry-run        只输出计划，不写库、不复制文件
  --limit <数量>   最多处理多少张（调试用）

命名约定：
  <项目编号>_1.jpg         <项目编号>.jpg          <传承人姓名>_1.jpg
  素材/项目/<项目编号>/*.jpg   素材/传承人/<姓名>/*.jpg`);
  }
}

main();
