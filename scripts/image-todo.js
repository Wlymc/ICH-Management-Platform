#!/usr/bin/env node
/**
 * 补图清单：把「需要换真实图的项目」「确实缺图的项目」「缺人像的传承人」整理成
 * 一个多工作表 Excel + 一份 Markdown 摘要，便于按行分工作业。
 *
 *   node scripts/image-todo.js
 *   node scripts/image-todo.js --out exports/补图清单.xlsx
 *
 * 补完图之后：把文件名填进「新图文件名」列，或按 <官方编号>_NN.jpg 命名后执行
 *   node scripts/media.js import-index <索引.csv> --root <图片目录>
 */
import fs from 'node:fs';
import path from 'node:path';
import { all, db, get } from '../src/db.js';
import { buildWorkbook } from '../src/report/xlsx.js';

const ROOT = path.resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
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

const MIN_LONG_EDGE = 1600;
const MAX_KB = 500;

/** 判定图片来源：实物图 / 网络检索图 / 仅系统占位图 / 完全没有图 */
const REAL_SOURCE_KINDS = "('自采','传承人提供','官方授权','公共版权','自采拍摄')";

function imageStatusSelect(ownerType) {
  return `
    (SELECT COUNT(*) FROM attachment a WHERE a.owner_type='${ownerType}' AND a.owner_id=o.id AND a.kind='image') AS total_images,
    (SELECT COUNT(*) FROM attachment a WHERE a.owner_type='${ownerType}' AND a.owner_id=o.id AND a.kind='image'
       AND a.mime_type LIKE '%svg%') AS placeholder_images,
    (SELECT COUNT(*) FROM attachment a WHERE a.owner_type='${ownerType}' AND a.owner_id=o.id AND a.kind='image'
       AND a.source_kind <> '') AS scraped_images,
    (SELECT COUNT(*) FROM attachment a WHERE a.owner_type='${ownerType}' AND a.owner_id=o.id AND a.kind='image'
       AND a.source_kind IN ${REAL_SOURCE_KINDS}) AS real_images`;
}

function imageNature(row) {
  if (row.real_images > 0) return '已有实物图';
  if (Number(row.total_images) === 0) return '完全没有图';
  if (Number(row.scraped_images) > 0) return '网络检索图';
  return '仅系统占位图';
}

/** 需要补实物图的项目：图片是系统占位图或完全没有，且尚未有实物图 */
function projectGapSheet() {
  const rows = all(
    `SELECT o.id, o.code, o.name, o.source_code, c.name AS category, l.name AS level, r.name AS province,
            ${imageStatusSelect('project')}
     FROM project o
     LEFT JOIN heritage_category c ON c.id = o.category_id
     LEFT JOIN heritage_level l ON l.id = o.level_id
     LEFT JOIN region r ON r.id = o.region_id
     ORDER BY o.code`,
  )
    .map((row) => ({ ...row, nature: imageNature(row) }))
    .filter((row) => row.nature === '完全没有图' || row.nature === '仅系统占位图');

  return {
    name: '项目·缺实物图',
    headers: ['内部编号', '官方编号', '项目名称', '类别', '级别', '省份', '图片性质', '现有占位图数', '需要补张数', '新图文件名'],
    rows: rows.map((row) => [
      row.code,
      row.source_code || '',
      row.name,
      row.category || '',
      row.level || '',
      row.province || '',
      row.nature,
      Number(row.total_images),
      3,
      '',
    ]),
    columnWidths: [12, 10, 26, 14, 10, 14, 14, 12, 11, 18],
    stats: {
      total: rows.length,
      none: rows.filter((row) => row.nature === '完全没有图').length,
      placeholder: rows.filter((row) => row.nature === '仅系统占位图').length,
    },
  };
}

/** 传承人：没有实物照片的（完全没有照片，或只有系统占位剪影） */
function inheritorSheet() {
  const rows = all(
    `SELECT o.id, o.code, o.source_code, o.name, o.ethnic,
            l.name AS level, r.name AS province,
            (SELECT GROUP_CONCAT(p.name, '、') FROM project_inheritor pi
              JOIN project p ON p.id = pi.project_id WHERE pi.inheritor_id = o.id) AS projects,
            ${imageStatusSelect('inheritor')}
     FROM inheritor o
     LEFT JOIN heritage_level l ON l.id = o.level_id
     LEFT JOIN region r ON r.id = o.region_id
     WHERE o.status = 'published'
     ORDER BY o.code`,
  )
    .map((row) => ({ ...row, nature: imageNature(row) }))
    .filter((row) => row.nature === '完全没有图' || row.nature === '仅系统占位图');

  return {
    name: '传承人·缺实物照片',
    headers: ['内部编号', '官方编号', '姓名', '民族', '级别', '省份', '所属项目', '图片性质', '照片文件名'],
    rows: rows.map((row) => [
      row.code,
      row.source_code || '',
      row.name,
      row.ethnic || '',
      row.level || '',
      row.province || '',
      row.projects || '',
      row.nature,
      '',
    ]),
    columnWidths: [12, 10, 12, 10, 10, 14, 32, 14, 18],
    stats: {
      total: rows.length,
      none: rows.filter((row) => row.nature === '完全没有图').length,
      placeholder: rows.filter((row) => row.nature === '仅系统占位图').length,
    },
  };
}

/** 参考表：国家级 100 项的现有网络图状况（按用户口径「已经有图的先不管」，单独放参考表） */
function nationalSheet() {
  const rows = all(
    `SELECT p.source_code, p.name, c.name AS category, r.name AS province,
            (SELECT COUNT(*) FROM attachment a
              WHERE a.owner_type = 'project' AND a.owner_id = p.id AND a.kind = 'image') AS images,
            (SELECT MIN(MAX(COALESCE(a.width, 0), COALESCE(a.height, 0))) FROM attachment a
              WHERE a.owner_type = 'project' AND a.owner_id = p.id AND a.kind = 'image' AND a.width IS NOT NULL) AS min_edge,
            (SELECT MAX(a.file_size) FROM attachment a
              WHERE a.owner_type = 'project' AND a.owner_id = p.id AND a.kind = 'image') AS max_bytes,
            (SELECT COALESCE(MAX(a.source_kind), '') FROM attachment a
              WHERE a.owner_type = 'project' AND a.owner_id = p.id AND a.kind = 'image') AS source_kind,
            (SELECT a.source_page FROM attachment a
              WHERE a.owner_type = 'project' AND a.owner_id = p.id AND a.kind = 'image' AND a.source_page <> '' LIMIT 1) AS sample_source
     FROM project p
     LEFT JOIN heritage_category c ON c.id = p.category_id
     LEFT JOIN region r ON r.id = p.region_id
     WHERE p.code LIKE 'GJ-%'
     ORDER BY min_edge IS NULL, min_edge, p.code`,
  );

  const headers = ['官方编号', '项目名称', '类别', '省份', '现有张数', '最小长边', '最大体积KB', '现有图来源', '来源页示例', '建议', '新图文件名'];
  const body = rows.map((row) => {
    const minEdge = row.min_edge === null || row.min_edge === undefined ? '' : Number(row.min_edge);
    const kb = row.max_bytes ? Math.round(Number(row.max_bytes) / 1024) : '';
    const advice = !row.images
      ? '缺图，需补拍'
      : minEdge && minEdge >= MIN_LONG_EDGE && Number(kb) <= MAX_KB
        ? '规格达标，可保留'
        : `建议替换为实拍/授权图（长边建议 ${MIN_LONG_EDGE}px 以上、单张 ≤${MAX_KB}KB）`;
    return [row.source_code, row.name, row.category || '', row.province || '', row.images, minEdge, kb, row.source_kind || '', row.sample_source || '', advice, ''];
  });

  return {
    name: '参考-国家级现状',
    headers,
    rows: body,
    columnWidths: [10, 26, 14, 12, 9, 10, 12, 22, 30, 42, 18],
    stats: {
      total: rows.length,
      needReplace: rows.filter((row) => !row.images || !row.min_edge || Number(row.min_edge) < MIN_LONG_EDGE).length,
    },
  };
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.join(ROOT, 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const xlsxPath = flags.out ? path.resolve(String(flags.out)) : path.join(outDir, `缺实物图清单_${stamp}.xlsx`);
  const mdPath = xlsxPath.replace(/\.xlsx$/i, '.md');

  const sheets = [projectGapSheet(), inheritorSheet(), nationalSheet()];
  const buffer = buildWorkbook({ sheets: sheets.map(({ name, headers, rows, columnWidths }) => ({ name, headers, rows, columnWidths })) });
  fs.writeFileSync(xlsxPath, buffer);

  const [projectGap, inheritorGap, national] = sheets;
  const md = [
    '# 缺实物图清单',
    '',
    `- 生成时间：${new Date().toLocaleString('zh-CN')}`,
    '- 判定口径：**没有实物图**（图片是系统生成的占位图，或者完全没有图）；已经有实物图的会自动从清单消失',
    '',
    '## 总览',
    '',
    '| 工作表 | 条数 | 说明 |',
    '| --- | --- | --- |',
    `| 项目·缺实物图 | ${projectGap.stats.total} | 其中 ${projectGap.stats.none} 项完全没有图、${projectGap.stats.placeholder} 项只有系统占位图 |`,
    `| 传承人·缺实物照片 | ${inheritorGap.stats.total} | 其中 ${inheritorGap.stats.none} 位完全没有照片、${inheritorGap.stats.placeholder} 位只有占位剪影 |`,
    `| 参考·国家级现状 | ${national.stats.total} | 这 100 项已有网络检索图（非实物图），按"已经有图的先不管"单列参考；若要换成实拍图，直接列进补拍计划即可 |`,
    '',
    '## 怎么用',
    '',
    '1. 按工作表分给两个人认领，在「新图文件名」列填上文件名；',
    '2. 项目图按 `<项目名称>_01.jpg`、`_02.jpg` 命名并把每个项目放进一个同名文件夹；',
    '3. 传承人照片按 `传承人/<姓名>/01.jpg` 组织；',
    '4. 导入（**必须带来源标记**，否则清单不会自动收敛）：',
    '   - 项目图：`node scripts/media.js import <素材目录> --source "自采"`',
    '   - 照片：`node scripts/media.js import <素材目录> --source "传承人提供"`',
    '5. 导入后重跑本脚本，已有实物图的条目会自动从清单消失。',
    '',
    '## 版权红线',
    '',
    '- 只用三类图：自己拍的、传承人或保护单位书面同意的、明确可商用的公共版权素材；',
    '- 国家级那 100 项的网络检索图仅作临时占位并在页面标注，答辩前建议替换重点条目；',
    '- 传承人肖像不得用 AI 生成人脸。',
    '',
  ].join('\n');
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log('缺实物图清单已生成：');
  console.log(`  Excel：${xlsxPath}`);
  console.log(`  摘要：${mdPath}`);
  console.log('');
  for (const sheet of sheets) {
    console.log(`  【${sheet.name}】${sheet.rows.length} 条`);
  }
  console.log('');
  console.log('前 3 条缺实物图的项目：');
  for (const row of projectGap.rows.slice(0, 3)) {
    console.log(`  ${row[0]} ${row[2]}  ${row[6]}（现有占位图 ${row[7]} 张）`);
  }
  const archived = get("SELECT COUNT(*) AS n FROM organization WHERE status = 'archived'").n;
  void db;
  void archived;
}

main();
