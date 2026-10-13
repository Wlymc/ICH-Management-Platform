#!/usr/bin/env node
/**
 * 国家级非遗名录导入（按两份真实 CSV 的列映射）
 *
 *   node scripts/import-national.js --dry-run          先演练，只出报告不写库
 *   node scripts/import-national.js                    正式导入（默认落为草稿）
 *   node scripts/import-national.js --status published 导入即发布
 *
 * 默认读取：
 *   data/source/国家级非遗_每类精选10项_100项.csv
 *   data/source/国家级非遗_100项_传承人增强表.csv
 *
 * 幂等：按官方编号判断，已存在的项目/传承人会跳过，可重复执行。
 */
import fs from 'node:fs';
import path from 'node:path';
import { get, insert, run, all, transaction } from '../src/db.js';
import { parseCsv, rowsToObjects } from '../src/report/csv.js';
import { decodeTextBuffer, nowIso, toInt } from '../src/util.js';
import { dicts, invalidateDicts } from '../src/dict.js';
import { parseProvince } from '../src/regions.js';
import { ensureProvinces } from '../src/seed.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');

const DEFAULTS = {
  projects: path.join(SOURCE_DIR, '国家级非遗_每类精选10项_100项.csv'),
  inheritors: path.join(SOURCE_DIR, '国家级非遗_100项_传承人增强表.csv'),
};

const BATCH_PREFIX = { '01': '第一批', '02': '第二批', '03': '第三批', '04': '第四批', '05': '第五批' };

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
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
  }
  return flags;
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`找不到文件：${filePath}`);
    process.exit(1);
  }
  const text = decodeTextBuffer(fs.readFileSync(filePath));
  const { records } = rowsToObjects(parseCsv(text));
  return records;
}

/** `2006(第一批)` → { year: 2006, batch: '第一批' } */
function parseBatchYear(value) {
  const raw = String(value || '').trim();
  const yearMatch = raw.match(/(\d{4})/);
  const batchMatch = raw.match(/第[一二三四五六七八九十]+批/);
  return {
    year: yearMatch ? Number(yearMatch[1]) : null,
    batch: batchMatch ? batchMatch[0] : '',
  };
}

/** 从长文本里提取最早出现的四位年份，作为“从业起始年”的近似 */
function extractEarliestYear(text) {
  const raw = String(text || '');
  const years = [...raw.matchAll(/(19\d{2}|20\d{2})/g)].map((m) => Number(m[1]));
  if (!years.length) return null;
  const valid = years.filter((y) => y >= 1900 && y <= 2025);
  return valid.length ? Math.min(...valid) : null;
}

function ensureDictsReady() {
  ensureProvinces();
  invalidateDicts();
}

function report(reportRows, issues, title) {
  const out = path.join(ROOT, 'exports', `${title}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [`\uFEFF${reportRows.map((row) => row.map(escape).join(',')).join('\r\n')}\r\n`];
  fs.writeFileSync(out, lines.join(''));
  console.log(`  报告：${out}`);
  if (issues.length) {
    console.log('  需要注意的问题：');
    for (const item of issues.slice(0, 20)) console.log(`    - ${item}`);
    if (issues.length > 20) console.log(`    …还有 ${issues.length - 20} 条`);
  }
}

/* ---------------- 项目导入 ---------------- */

function importProjects(rows, { status, dryRun }) {
  const d = dicts();
  const categoryByName = new Map(d.categories.map((c) => [c.name, c.id]));
  const nationalLevel = d.levels.find((l) => l.name === '国家级');
  if (!nationalLevel) throw new Error('缺少「国家级」级别字典');

  const reportRows = [['结果', '内部编号', '官方编号', '名称', '类别', '批次', '年份', '省份', '申报地区原文', '说明']];
  const issues = [];
  /** 本次运行涉及的项目索引：官方编号 → { id, name }，供传承人阶段（含演练）匹配 */
  const index = new Map();
  let imported = 0;
  let skipped = 0;
  let seq = 0;

  for (const row of rows) {
    const name = String(row.名称 || '').trim();
    const officialCode = String(row.编号 || '').trim();
    const categoryName = String(row.类别 || '').trim();
    const provinceShort = String(row.省级地区 || '').trim();
    const regionText = String(row.申报地区或单位 || '').trim();
    seq += 1;

    if (!name) {
      issues.push(`第 ${row.__line ?? seq} 行缺少项目名称，已跳过`);
      reportRows.push(['跳过', '', officialCode, '', categoryName, '', '', provinceShort, regionText, '缺少项目名称']);
      continue;
    }
    const existing = officialCode
      ? get('SELECT id FROM project WHERE source_code = ?', [officialCode])
      : get('SELECT id FROM project WHERE name = ?', [name]);
    if (existing) {
      skipped += 1;
      reportRows.push(['已存在跳过', '', officialCode, name, categoryName, '', '', provinceShort, regionText, `库中已有 #${existing.id}`]);
      continue;
    }
    const categoryId = categoryByName.get(categoryName);
    if (!categoryId) {
      issues.push(`「${name}」的类别「${categoryName}」不在十大类目里，已跳过`);
      reportRows.push(['跳过', '', officialCode, name, categoryName, '', '', provinceShort, regionText, '类别不匹配十大类目']);
      continue;
    }

    const { year, batch } = parseBatchYear(row.公布时间);
    const provinceName = parseProvince(provinceShort) || parseProvince(regionText);
    const province = provinceName
      ? d.regions.find((r) => r.name === provinceName && r.region_level === 'province')
      : null;
    if (!province) issues.push(`「${name}」的省级地区「${provinceShort || regionText}」未解析出省份`);

    const internalCode = `GJ-${String(seq).padStart(3, '0')}`;
    if (dryRun) {
      imported += 1;
      index.set(officialCode, { id: null, name });
      reportRows.push(['待导入', internalCode, officialCode, name, categoryName, batch, year, provinceName || provinceShort, regionText, '']);
      continue;
    }

    const timestamp = nowIso();
    const projectId = transaction(() => {
      const id = insert('project', {
        code: internalCode,
        name,
        source_code: officialCode,
        category_id: categoryId,
        level_id: nationalLevel.id,
        batch: batch || '',
        published_year: year,
        region_id: province ? province.id : null,
        region_text: regionText,
        organization_id: null,
        protection_unit: '',
        summary: '',
        history: '',
        feature: '',
        lineage: '',
        keywords: '',
        featured: 0,
        cover_path: '',
        video_url: '',
        status,
        content_source: '官方名录',
        source_url: '',
        created_by: null,
        created_at: timestamp,
        updated_at: timestamp,
      });
      if (province) {
        run('INSERT OR IGNORE INTO project_region (project_id, region_id, sort_order) VALUES (?, ?, 0)', [id, province.id]);
      }
      return id;
    });
    void projectId;
    index.set(officialCode, { id: projectId, name });
    imported += 1;
    reportRows.push(['已导入', internalCode, officialCode, name, categoryName, batch, year, provinceName || provinceShort, regionText, '']);
  }

  return { imported, skipped, issues, reportRows, index };
}

/* ---------------- 传承人导入 ---------------- */

function importInheritors(rows, { status, dryRun, projectIndex = new Map() }) {
  const d = dicts();
  const nationalLevel = d.levels.find((l) => l.name === '国家级');
  const reportRows = [['结果', '内部编号', '官方编号', '姓名', '民族', '关联项目', '申报地区', '从业起始年', '说明']];
  const issues = [];
  let imported = 0;
  let skipped = 0;
  let seq = 0;

  for (const row of rows) {
    const personName = String(row.传承人姓名 || '').trim();
    const officialSeq = String(row.传承人序号 || '').trim();
    const projectCode = String(row.传承人项目编号 || row.编号 || '').trim();
    const projectName = String(row.传承人项目名称 || row.名称 || '').trim();
    const regionText = String(row.传承人申报地区或单位 || row.申报地区或单位 || '').trim();
    const provinceShort = String(row.省级地区 || '').trim();
    seq += 1;

    if (!personName) {
      skipped += 1;
      reportRows.push(['无传承人跳过', '', officialSeq, '', '', projectName, regionText, '', '表中该项目未匹配到官方传承人记录']);
      continue;
    }
    if (officialSeq && get('SELECT id FROM inheritor WHERE source_code = ?', [officialSeq])) {
      skipped += 1;
      reportRows.push(['已存在跳过', '', officialSeq, personName, '', projectName, regionText, '', '库中已有该官方编号']);
      continue;
    }

    const project = projectCode
      ? get('SELECT id, name FROM project WHERE source_code = ?', [projectCode])
      : get('SELECT id, name FROM project WHERE name = ?', [projectName]);
    // 演练模式或项目刚插入时，退回到本次运行的索引
    const planned = !project && projectCode ? projectIndex.get(projectCode) : null;
    const resolvedProject = project || (planned ? { id: planned.id, name: planned.name, planned: true } : null);
    if (!resolvedProject) issues.push(`传承人「${personName}」未匹配到项目（编号 ${projectCode || '空'} / 名称 ${projectName}）`);

    const provinceName = parseProvince(regionText) || parseProvince(provinceShort);
    const province = provinceName
      ? d.regions.find((r) => r.name === provinceName && r.region_level === 'province')
      : null;

    const experience = String(row.从艺经历 || '').trim();
    const biography = String(row.官方传记 || '').trim();
    const careerStart = extractEarliestYear(experience) || extractEarliestYear(biography);
    const batchPrefix = officialSeq.slice(0, 2);
    const batch = BATCH_PREFIX[batchPrefix] || '';
    const noteParts = [String(row.匹配说明 || '').trim(), String(row.数据核验说明 || '').trim()].filter(Boolean);

    const internalCode = `GJCR-${String(seq).padStart(3, '0')}`;
    if (dryRun) {
      imported += 1;
      reportRows.push(['待导入', internalCode, officialSeq, personName, row.传承人民族 || '', resolvedProject ? resolvedProject.name : projectName, regionText, careerStart ?? '', resolvedProject ? '' : '未匹配到项目']);
      continue;
    }

    const timestamp = nowIso();
    const inheritorId = transaction(() => {
      const id = insert('inheritor', {
        code: internalCode,
        name: personName,
        source_code: officialSeq,
        gender: '',
        ethnic: String(row.传承人民族 || '').trim(),
        birth_month: '',
        career_start_year: careerStart,
        level_id: nationalLevel ? nationalLevel.id : null,
        region_id: province ? province.id : null,
        batch,
        certified_year: null,
        address: regionText,
        story_title: '',
        experience,
        skill: String(row.技艺特点 || '').trim(),
        honors: String(row.荣誉 || '').trim(),
        data_note: noteParts.join('　'),
        featured: 0,
        video_url: String(row.视频链接 || '').trim(),
        source_url: String(row.传承人详情页 || '').trim(),
        photo_path: '',
        status,
        created_by: null,
        created_at: timestamp,
        updated_at: timestamp,
      });
      if (resolvedProject && resolvedProject.id) {
        run('INSERT OR IGNORE INTO project_inheritor (project_id, inheritor_id, is_representative) VALUES (?, ?, 1)', [resolvedProject.id, id]);
      }
      return id;
    });
    void inheritorId;
    imported += 1;
    reportRows.push(['已导入', internalCode, officialSeq, personName, row.传承人民族 || '', resolvedProject ? resolvedProject.name : projectName, regionText, careerStart ?? '', resolvedProject ? '' : '未匹配到项目']);
  }

  return { imported, skipped, issues, reportRows };
}

/* ---------------- 入口 ---------------- */

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(`国家级非遗名录导入

  node scripts/import-national.js [选项]

选项：
  --projects <路径>    项目 CSV（默认 data/source/国家级非遗_每类精选10项_100项.csv）
  --inheritors <路径>  传承人 CSV（默认 data/source/国家级非遗_100项_传承人增强表.csv）
  --status <状态>      导入后的状态：draft（默认，草稿）或 published（直接发布）
  --only <projects|inheritors>  只导入其中一类
  --publish            把已导入的国家级项目与传承人改为「已发布」（核对完成后用）
  --dry-run            只演练并出报告，不写库
  --help               显示帮助`);
    return;
  }

  if (flags.publish) {
    ensureDictsReady();
    // 用内部编号前缀判断，避免个别记录缺官方编号被漏掉
    const projectCount = get("SELECT COUNT(*) AS n FROM project WHERE code LIKE 'GJ-%' AND status <> 'published'").n;
    const inheritorCount = get("SELECT COUNT(*) AS n FROM inheritor WHERE code LIKE 'GJCR-%' AND status <> 'published'").n;
    if (flags['dry-run']) {
      console.log(`[演练] 将发布国家级项目 ${projectCount} 条、传承人 ${inheritorCount} 位`);
      return;
    }
    transaction(() => {
      run("UPDATE project SET status='published', updated_at=? WHERE code LIKE 'GJ-%' AND status <> 'published'", [nowIso()]);
      run("UPDATE inheritor SET status='published', updated_at=? WHERE code LIKE 'GJCR-%' AND status <> 'published'", [nowIso()]);
    });
    run(
      `INSERT INTO audit_log (user_id, user_name, action, target_type, target_id, target_name, detail, ip, created_at)
       VALUES (NULL, '导入脚本', 'approve', 'project', NULL, '国家级名录发布', ?, '127.0.0.1', ?)`,
      [`发布项目 ${projectCount} 条、传承人 ${inheritorCount} 位`, nowIso()],
    );
    console.log(`已发布：项目 ${projectCount} 条、传承人 ${inheritorCount} 位`);
    console.log(JSON.stringify({
      门户可见项目: get("SELECT COUNT(*) AS n FROM project WHERE status='published'").n,
      门户可见传承人: get("SELECT COUNT(*) AS n FROM inheritor WHERE status='published'").n,
    }));
    return;
  }
  const projectsPath = flags.projects ? path.resolve(String(flags.projects)) : DEFAULTS.projects;
  const inheritorsPath = flags.inheritors ? path.resolve(String(flags.inheritors)) : DEFAULTS.inheritors;
  const status = flags.status === 'published' ? 'published' : 'draft';
  const dryRun = Boolean(flags['dry-run']);
  const only = flags.only ? String(flags.only) : '';

  ensureDictsReady();

  console.log(`${dryRun ? '[演练模式] 不会写入数据库\n' : ''}导入状态：${status === 'draft' ? '草稿' : '已发布'}\n`);

  let projectResult = null;
  let inheritorResult = null;

  if (only !== 'inheritors') {
    const rows = readCsv(projectsPath);
    console.log(`项目 CSV：${rows.length} 行`);
    projectResult = importProjects(rows, { status, dryRun });
    console.log(`  导入 ${projectResult.imported} 条，跳过 ${projectResult.skipped} 条，问题 ${projectResult.issues.length} 条`);
    report(projectResult.reportRows, projectResult.issues, dryRun ? '国家级项目导入演练' : '国家级项目导入');
  }

  if (only !== 'projects') {
    const rows = readCsv(inheritorsPath);
    console.log(`\n传承人 CSV：${rows.length} 行`);
    inheritorResult = importInheritors(rows, {
      status,
      dryRun,
      projectIndex: projectResult ? projectResult.index : new Map(),
    });
    console.log(`  导入 ${inheritorResult.imported} 位，跳过 ${inheritorResult.skipped} 位，问题 ${inheritorResult.issues.length} 条`);
    report(inheritorResult.reportRows, inheritorResult.issues, dryRun ? '传承人导入演练' : '传承人导入');
  }

  if (!dryRun) {
    invalidateDicts();
    const summary = {
      项目总数: get('SELECT COUNT(*) AS n FROM project').n,
      国家级项目: get("SELECT COUNT(*) AS n FROM project p JOIN heritage_level l ON l.id = p.level_id WHERE l.name = '国家级'").n,
      传承人总数: get('SELECT COUNT(*) AS n FROM inheritor').n,
      项目传承人关联: get('SELECT COUNT(*) AS n FROM project_inheritor').n,
    };
    console.log('\n导入后统计：', JSON.stringify(summary));
    if (dryRun === false) {
      run(
        `INSERT INTO audit_log (user_id, user_name, action, target_type, target_id, target_name, detail, ip, created_at)
         VALUES (NULL, '导入脚本', 'import', 'project', NULL, '国家级名录导入', ?, '127.0.0.1', ?)`,
        [`项目 ${projectResult?.imported ?? 0} 条、传承人 ${inheritorResult?.imported ?? 0} 位`, nowIso()],
      );
    }
  } else {
    console.log('\n演练结束。确认无误后去掉 --dry-run 正式执行。');
  }
}

main();
