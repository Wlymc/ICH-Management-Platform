#!/usr/bin/env node
/**
 * 回填历史图片的尺寸（width/height）。
 * 迁移 v3 之后新增字段，早先导入的图片需要跑一次本脚本补齐，缺图清单才能统计最小长边。
 *
 *   node scripts/backfill-image-size.js            补齐所有缺失尺寸的本地图片
 *   node scripts/backfill-image-size.js --dry-run  只看有多少张需要补
 */
import fs from 'node:fs';
import path from 'node:path';
import { all, run } from '../src/db.js';
import { PATHS } from '../src/config.js';
import { imageInfo } from '../src/report/imageinfo.js';
import { nowIso } from '../src/util.js';

const dryRun = process.argv.includes('--dry-run');

const rows = all(
  `SELECT id, file_path, file_size, width, height FROM attachment
   WHERE kind = 'image' AND file_path <> '' AND (width IS NULL OR height IS NULL)`,
);

console.log(`${dryRun ? '[演练] ' : ''}需要回填尺寸的图片：${rows.length} 张`);

let filled = 0;
let missing = 0;
let skipped = 0;

for (const row of rows) {
  const target = path.join(PATHS.uploads, row.file_path);
  if (!fs.existsSync(target)) {
    missing += 1;
    continue;
  }
  const info = imageInfo(target);
  if (!info.width || !info.height) {
    skipped += 1;
    continue;
  }
  if (!dryRun) {
    run('UPDATE attachment SET width = ?, height = ?, file_size = ? WHERE id = ?', [
      info.width,
      info.height,
      info.bytes || row.file_size || 0,
      row.id,
    ]);
  }
  filled += 1;
}

console.log(`  ${dryRun ? '将回填' : '已回填'} ${filled} 张`);
if (missing) console.log(`  文件不存在跳过 ${missing} 张`);
if (skipped) console.log(`  无法识别格式跳过 ${skipped} 张`);

if (!dryRun && filled) {
  run(
    `INSERT INTO audit_log (user_id, user_name, action, target_type, target_id, target_name, detail, ip, created_at)
     VALUES (NULL, '维护脚本', 'update', 'attachment', NULL, '图片尺寸回填', ?, '127.0.0.1', ?)`,
    [`回填 ${filled} 张图片尺寸`, nowIso()],
  );
}
if (dryRun) console.log('确认后去掉 --dry-run 正式执行。');
