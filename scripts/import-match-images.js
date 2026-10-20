#!/usr/bin/env node
/**
 * 导入「图片匹配结果.xlsx」中的候选图片。
 *
 *   node scripts/import-match-images.js \
 *     --workbook "G:/传智杯数据资料/10-13/图片匹配结果.xlsx" \
 *     --projects "G:/传智杯数据资料/10-13/项目" \
 *     --inheritors "G:/传智杯数据资料/10-13/传承人" \
 *     --source-kind "公开网络检索，仅用于教学演示"
 *
 * 可选：--dry-run、--only projects|inheritors
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, insert, run, transaction } from '../src/db.js';
import { imageInfo } from '../src/report/imageinfo.js';
import { readXlsxSheets } from '../src/report/xlsx-read.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const UPLOADS = path.join(ROOT, 'uploads');
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    if (key === 'dry-run') {
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
  }
  return flags;
}

function toObjects(sheet) {
  if (!sheet || !sheet.rows.length) return [];
  const headers = sheet.rows[0].map((value) => String(value || '').trim());
  return sheet.rows.slice(1)
    .filter((row) => row.some((value) => String(value || '').trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function splitList(value) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function pick(items, index) {
  return items[index] || '';
}

function uid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeReport(rows, stamp) {
  const dir = path.join(ROOT, 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `匹配图片导入报告_${stamp}.csv`);
  const content = `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')}\r\n`;
  fs.writeFileSync(target, content);
  return target;
}

function findTarget(kind, row, maps) {
  const code = String(row['内部编号'] || '').trim();
  const name = String(row[kind === 'project' ? '项目名称' : '姓名'] || '').trim();
  const map = kind === 'project' ? maps.projects : maps.inheritors;
  return map.get(code) || (name ? [...map.values()].find((item) => item.name === name) : null);
}

function existingAttachment(ownerType, ownerId, fileName) {
  return get(
    `SELECT id, file_path FROM attachment
     WHERE owner_type = ? AND owner_id = ? AND kind = 'image' AND file_name = ?
     ORDER BY id LIMIT 1`,
    [ownerType, ownerId, fileName],
  );
}

function importImage({ kind, target, row, root, sourceKind, dryRun, adminId, month, reportRows, stats }) {
  const ownerType = kind === 'project' ? 'project' : 'inheritor';
  const label = kind === 'project' ? '项目' : '传承人';
  const code = String(target.code || '').trim();
  const name = String(target.name || '').trim();
  const filenames = splitList(row['图片文件名']);
  const sourcePages = splitList(row['来源页']);
  const sourceUrls = splitList(row['原图链接']);
  const searchTitles = splitList(row['搜索标题']);
  const confidence = String(row['置信度'] || '').trim();
  const importedPaths = [];

  for (let index = 0; index < filenames.length; index += 1) {
    const fileName = filenames[index];
    const sourcePath = path.join(root, fileName);
    const ext = path.extname(fileName).toLowerCase();
    const prefix = `${label} ${code} ${name} / ${fileName}`;

    if (!fs.existsSync(sourcePath)) {
      stats.errors += 1;
      reportRows.push(['跳过', label, code, name, fileName, '', '', '源文件不存在']);
      continue;
    }
    const stat = fs.statSync(sourcePath);
    if (!IMAGE_EXT.has(ext)) {
      stats.errors += 1;
      reportRows.push(['跳过', label, code, name, fileName, '', Math.round(stat.size / 1024), `不支持的格式：${ext}`]);
      continue;
    }
    if (!stat.size || stat.size > MAX_BYTES) {
      stats.errors += 1;
      reportRows.push(['跳过', label, code, name, fileName, '', Math.round(stat.size / 1024), '空文件或超过 10MB']);
      continue;
    }

    const duplicate = existingAttachment(ownerType, Number(target.id), fileName);
    if (duplicate && fs.existsSync(path.join(UPLOADS, duplicate.file_path))) {
      stats.duplicates += 1;
      importedPaths.push(duplicate.file_path);
      reportRows.push(['已存在', label, code, name, fileName, duplicate.file_path, Math.round(stat.size / 1024), '跳过重复导入']);
      continue;
    }

    const info = imageInfo(sourcePath);
    if (!info.width || !info.height) {
      stats.errors += 1;
      reportRows.push(['跳过', label, code, name, fileName, '', Math.round(stat.size / 1024), '无法读取图片尺寸或文件已损坏']);
      continue;
    }

    const relativeFile = path.posix.join('media', month, `${uid()}${ext}`);
    if (!dryRun) {
      const targetPath = path.join(UPLOADS, ...relativeFile.split('/'));
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
      insert('attachment', {
        owner_type: ownerType,
        owner_id: Number(target.id),
        kind: 'image',
        title: String(pick(searchTitles, index) || path.basename(fileName, ext)).slice(0, 120),
        note: String(`匹配置信度：${confidence || '未标注'}；公开网络候选图，仅作匹配参考，使用前请复核人物/项目、版权与授权。`).slice(0, 500),
        file_name: fileName,
        file_path: relativeFile,
        file_size: stat.size,
        mime_type: info.format === 'png' ? 'image/png' : info.format === 'webp' ? 'image/webp' : 'image/jpeg',
        external_url: '',
        uploaded_by: adminId,
        created_at: nowSql(),
        source_kind: sourceKind,
        source_page: String(pick(sourcePages, index)).slice(0, 500),
        source_url: String(pick(sourceUrls, index)).slice(0, 500),
        search_page: '',
        photographer: '',
        license: '',
        authorized_at: '',
        width: info.width,
        height: info.height,
      });
    }

    importedPaths.push(relativeFile);
    stats.imported += 1;
    reportRows.push([
      dryRun ? '待导入' : '已导入',
      label,
      code,
      name,
      fileName,
      relativeFile,
      Math.round(stat.size / 1024),
      `${info.width}x${info.height}；${confidence || '未标注置信度'}`,
    ]);
    void prefix;
  }

  if (!importedPaths.length) return;

  const placeholders = all(
    `SELECT id FROM attachment
     WHERE owner_type = ? AND owner_id = ? AND kind = 'image'
       AND (file_path LIKE 'seed/%' OR mime_type LIKE '%svg%')`,
    [ownerType, Number(target.id)],
  );
  stats.placeholders += placeholders.length;
  if (!dryRun && placeholders.length) {
    run(
      `DELETE FROM attachment WHERE id IN (${placeholders.map(() => '?').join(',')})`,
      placeholders.map((item) => Number(item.id)),
    );
  }

  const firstPath = importedPaths[0];
  const column = kind === 'project' ? 'cover_path' : 'photo_path';
  const current = String(target[column] || '');
  if (!current || current.startsWith('seed/')) {
    if (!dryRun) {
      run(`UPDATE ${kind === 'project' ? 'project' : 'inheritor'} SET ${column} = ? WHERE id = ?`, [firstPath, Number(target.id)]);
      target[column] = firstPath;
    }
    stats[column === 'cover_path' ? 'covers' : 'photos'] += 1;
  }
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const workbookPath = flags.workbook ? path.resolve(String(flags.workbook)) : '';
  if (!workbookPath || !fs.existsSync(workbookPath)) {
    console.error('找不到工作簿，请用 --workbook <图片匹配结果.xlsx> 指定');
    process.exit(1);
  }

  const only = String(flags.only || '').trim();
  const projectRoot = flags.projects ? path.resolve(String(flags.projects)) : '';
  const inheritorRoot = flags.inheritors ? path.resolve(String(flags.inheritors)) : '';
  if (!only || only === 'projects') {
    if (!projectRoot || !fs.existsSync(projectRoot)) {
      console.error('找不到项目图片目录，请用 --projects <目录> 指定');
      process.exit(1);
    }
  }
  if (!only || only === 'inheritors') {
    if (!inheritorRoot || !fs.existsSync(inheritorRoot)) {
      console.error('找不到传承人图片目录，请用 --inheritors <目录> 指定');
      process.exit(1);
    }
  }

  const dryRun = Boolean(flags['dry-run']);
  const sourceKind = String(flags['source-kind'] || '公开网络检索，仅用于教学演示');
  const sheets = readXlsxSheets(fs.readFileSync(workbookPath));
  const projectRows = toObjects(sheets.find((sheet) => sheet.name === '项目图片匹配'));
  const inheritorRows = toObjects(sheets.find((sheet) => sheet.name === '传承人图片匹配'));
  const maps = {
    projects: new Map(all('SELECT id, code, name, cover_path FROM project').map((row) => [String(row.code), row])),
    inheritors: new Map(all('SELECT id, code, name, photo_path FROM inheritor').map((row) => [String(row.code), row])),
  };
  const admin = get("SELECT id FROM app_user WHERE role = 'admin' ORDER BY id LIMIT 1");
  const month = new Date().toISOString().slice(0, 7);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const reportRows = [['结果', '类型', '内部编号', '名称', '图片文件', '归档路径', '大小KB', '说明']];
  const stats = { projects: 0, inheritors: 0, imported: 0, duplicates: 0, errors: 0, placeholders: 0, covers: 0, photos: 0 };

  const work = () => {
    if (!only || only === 'projects') {
      for (const row of projectRows) {
        const target = findTarget('project', row, maps);
        if (!target) {
          stats.errors += 1;
          reportRows.push(['跳过', '项目', row['内部编号'] || '', row['项目名称'] || '', row['图片文件名'] || '', '', '', '数据库中未找到对应项目']);
          continue;
        }
        stats.projects += 1;
        importImage({
          kind: 'project', target, row, root: projectRoot, sourceKind, dryRun,
          adminId: admin ? Number(admin.id) : null, month, reportRows, stats,
        });
      }
    }
    if (!only || only === 'inheritors') {
      for (const row of inheritorRows) {
        const target = findTarget('inheritor', row, maps);
        if (!target) {
          stats.errors += 1;
          reportRows.push(['跳过', '传承人', row['内部编号'] || '', row['姓名'] || '', row['图片文件名'] || '', '', '', '数据库中未找到对应传承人']);
          continue;
        }
        stats.inheritors += 1;
        importImage({
          kind: 'inheritor', target, row, root: inheritorRoot, sourceKind, dryRun,
          adminId: admin ? Number(admin.id) : null, month, reportRows, stats,
        });
      }
    }
    if (!dryRun && stats.imported) {
      insert('audit_log', {
        user_id: admin ? Number(admin.id) : null,
        user_name: admin ? '系统管理员' : '导入脚本',
        action: 'import',
        target_type: 'attachment',
        target_id: null,
        target_name: '图片匹配结果批量导入',
        detail: `项目 ${stats.projects} 条、传承人 ${stats.inheritors} 位；导入 ${stats.imported} 张；设为封面 ${stats.covers} 张、肖像 ${stats.photos} 张`,
        ip: '127.0.0.1',
        created_at: nowSql(),
      });
    }
  };

  if (dryRun) work();
  else transaction(work);

  const reportPath = writeReport(reportRows, stamp);
  console.log(`\n${dryRun ? '[演练模式] ' : ''}匹配图片导入完成`);
  console.log(`  项目记录：${stats.projects} 条`);
  console.log(`  传承人记录：${stats.inheritors} 位`);
  console.log(`  新导入图片：${stats.imported} 张；已存在跳过：${stats.duplicates} 张；异常：${stats.errors} 条`);
  console.log(`  ${dryRun ? '将移除' : '已移除'}系统占位图：${stats.placeholders} 张`);
  console.log(`  ${dryRun ? '将设置' : '已设置'}项目封面：${stats.covers} 个；传承人肖像：${stats.photos} 位`);
  console.log(`  明细报告：${reportPath}`);
  if (stats.errors) process.exitCode = 2;
}

main();
