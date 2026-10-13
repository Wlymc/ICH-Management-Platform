#!/usr/bin/env node
/**
 * 归档示例基地数据。
 *
 * 早期生成的 12 条江苏示例基地带的是虚构地址与电话，不能对游客展示。
 * 本脚本把它们标为「已归档」并清除核实标记，数据保留在后台可查。
 *
 *   node scripts/archive-sample-orgs.js --dry-run
 *   node scripts/archive-sample-orgs.js
 */
import { all, run } from '../src/db.js';
import { nowIso } from '../src/util.js';

const dryRun = process.argv.includes('--dry-run');

const rows = all(
  `SELECT id, code, name, status, phone, address FROM organization
   WHERE status <> 'archived' AND (code LIKE 'JD-%' OR source_url = '')`,
);

console.log(`${dryRun ? '[演练] ' : ''}将被归档的示例基地：${rows.length} 条`);
for (const row of rows.slice(0, 5)) {
  console.log(`  ${row.code} ${row.name}（${row.address || '无地址'} / ${row.phone || '无电话'}）`);
}
if (rows.length > 5) console.log(`  …还有 ${rows.length - 5} 条`);

if (dryRun) {
  console.log('确认后去掉 --dry-run 正式执行。');
} else {
  run(
    `UPDATE organization SET status = 'archived', verified = 0, updated_at = ?
     WHERE status <> 'archived' AND (code LIKE 'JD-%' OR source_url = '')`,
    [nowIso()],
  );
  run(
    `INSERT INTO audit_log (user_id, user_name, action, target_type, target_id, target_name, detail, ip, created_at)
     VALUES (NULL, '维护脚本', 'update', 'organization', NULL, '归档示例基地', ?, '127.0.0.1', ?)`,
    [`归档 ${rows.length} 条虚构示例基地（清除对外展示）`, nowIso()],
  );
  console.log(`已归档 ${rows.length} 条，门户将不再展示其地址与电话。`);
}
