#!/usr/bin/env node
/**
 * AI 内容起草（AI 初稿 → 人工定稿 → 回填入库）
 *
 *   node scripts/ai-draft.js --dry-run            看看会给哪些项目起草
 *   node scripts/ai-draft.js --limit 5            先起草 5 条试试（正式跑不加 --limit）
 *   node scripts/ai-draft.js                      给全部缺长文的国家级项目起草
 *   node scripts/ai-draft.js --apply exports/ai起草_xxx.csv   把人工定稿后的表回填入库
 *
 * 产出：exports/ai起草_<时间>.csv（UTF-8 BOM，Excel 可直接打开）
 * 列：官方编号,名称,简介,历史渊源,技艺特征,关键词,内容来源,状态
 *   - 人工修改后把「内容来源」改成「人工定稿」，再执行 --apply 回填
 */
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, transaction } from '../src/db.js';
import { parseCsv, rowsToObjects } from '../src/report/csv.js';
import { decodeTextBuffer, nowIso, text } from '../src/util.js';
import { chat, isReady, publicConfig } from '../src/ai.js';
import { rebuildAndReport } from '../src/search.js';

const ROOT = path.resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    if (['dry-run', 'all'].includes(key)) {
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

function toCsv(rows) {
  const escape = (value) => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}\r\n`;
}

function outputPath(flags, name) {
  const dir = path.join(ROOT, 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13);
  return flags.out ? path.resolve(String(flags.out)) : path.join(dir, `${name}_${stamp}.csv`);
}

/** 组装提示词：只给字段摘要，不给长文全文 */
function buildMessages(project) {
  const facts = [
    `项目名称：${project.name}`,
    `类别：${project.category_name || '未分类'}`,
    `级别：国家级`,
    `批次：${project.batch || '未标注'}${project.published_year ? `（${project.published_year} 年公布）` : ''}`,
    `申报地区：${project.region_text || project.province || '未标注'}`,
  ];
  if (project.inheritor_names) facts.push(`代表性传承人：${project.inheritor_names}`);
  if (project.inheritor_experience) facts.push(`传承人从艺经历（节选）：${project.inheritor_experience.slice(0, 300)}`);

  return [
    {
      role: 'system',
      content: [
        '你是非物质文化遗产档案编辑，负责为国家级非遗项目起草档案内容。',
        '要求：只依据给定事实与公认的公开常识撰写，不要编造具体数字、人名、机构名与年代。',
        '不确定的内容用概括性表述，不要杜撰。语言平实、书面、客观，不要用营销口吻。',
        '严格输出 JSON，不要输出多余文字，格式：',
        '{"summary":"80-140字项目简介","history":"120-200字历史渊源","feature":"120-200字技艺特征或表现形态","keywords":"3-6个关键词，用顿号分隔"}',
      ].join('\n'),
    },
    { role: 'user', content: `请为以下项目起草档案内容：\n${facts.join('\n')}` },
  ];
}

function parseJsonReply(content) {
  const raw = String(content || '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]);
    return {
      summary: text(data.summary, 400),
      history: text(data.history, 800),
      feature: text(data.feature, 800),
      keywords: text(data.keywords, 200),
    };
  } catch {
    return null;
  }
}

function selectTargets(flags) {
  const clause = flags.all
    ? "WHERE p.code LIKE 'GJ-%'"
    : "WHERE p.code LIKE 'GJ-%' AND (p.summary = '' OR p.history = '' OR p.feature = '')";
  return all(
    `SELECT p.id, p.code, p.name, p.source_code, p.batch, p.published_year, p.region_text,
            c.name AS category_name, r.name AS province,
            (SELECT GROUP_CONCAT(i.name, '、') FROM project_inheritor pi
              JOIN inheritor i ON i.id = pi.inheritor_id WHERE pi.project_id = p.id) AS inheritor_names,
            (SELECT i.experience FROM project_inheritor pi
              JOIN inheritor i ON i.id = pi.inheritor_id WHERE pi.project_id = p.id LIMIT 1) AS inheritor_experience
     FROM project p
     LEFT JOIN heritage_category c ON c.id = p.category_id
     LEFT JOIN region r ON r.id = p.region_id
     ${clause}
     ORDER BY p.code`,
  );
}

async function generate(flags) {
  const targets = selectTargets(flags);
  const limit = flags.limit ? Number(flags.limit) : targets.length;
  const list = targets.slice(0, limit);
  console.log(`待起草项目：${targets.length} 条${limit < targets.length ? `（本次只跑前 ${limit} 条）` : ''}`);

  if (flags['dry-run']) {
    console.table(list.slice(0, 10).map((item) => ({ 编号: item.code, 官方编号: item.source_code, 名称: item.name, 类别: item.category_name, 省份: item.province })));
    console.log('演练结束，未调用模型。');
    return;
  }

  const config = publicConfig();
  if (!isReady()) {
    console.error('大模型未配置或未启用。请先在管理端「AI 配置」保存密钥，或用 scripts/ai-test.js 验证连通性。');
    console.error(`当前：${config.baseUrl} / ${config.model} / 密钥${config.hasApiKey ? '已配置' : '缺失'}`);
    process.exit(1);
  }

  const out = outputPath(flags, 'ai起草');
  const header = ['官方编号', '名称', '简介', '历史渊源', '技艺特征', '关键词', '内容来源', '状态'];
  const rows = [header];
  let ok = 0;
  let failed = 0;
  const failures = [];

  for (let index = 0; index < list.length; index += 1) {
    const project = list[index];
    process.stdout.write(`\r[${index + 1}/${list.length}] ${project.name}                    `);
    const result = await chat(buildMessages(project), { maxTokens: 900, temperature: 0.4 });
    if (!result.ok) {
      failed += 1;
      failures.push(`${project.name}：${result.error}`);
      rows.push([project.source_code, project.name, '', '', '', '', 'AI 起草', '失败']);
      if (result.code === 'unconfigured' || result.code === 'disabled') break;
      await new Promise((resolve) => setTimeout(resolve, 800));
      continue;
    }
    const parsed = parseJsonReply(result.content);
    if (!parsed) {
      failed += 1;
      failures.push(`${project.name}：模型返回不是合法 JSON`);
      rows.push([project.source_code, project.name, '', '', '', '', 'AI 起草', '解析失败']);
      continue;
    }
    ok += 1;
    rows.push([project.source_code, project.name, parsed.summary, parsed.history, parsed.feature, parsed.keywords, 'AI 起草', '待人工校对']);
    // 每 10 条落一次盘，避免中途失败丢进度
    if (index % 10 === 9) fs.writeFileSync(out, toCsv(rows), 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  fs.writeFileSync(out, toCsv(rows), 'utf8');
  console.log(`\n\n起草完成：成功 ${ok} 条，失败 ${failed} 条`);
  if (failures.length) {
    console.log('失败明细：');
    for (const item of failures.slice(0, 10)) console.log(`  - ${item}`);
  }
  console.log(`草稿文件：${out}`);
  console.log('下一步：打开该文件逐条修改，把「内容来源」改成「人工定稿」，再执行：');
  console.log(`  node scripts/ai-draft.js --apply "${path.basename(out)}"`);
}

function apply(flags) {
  const file = flags.apply;
  const filePath = resolveDraftFile(file);
  if (!fs.existsSync(filePath)) {
    console.error(`找不到定稿文件：${filePath}`);
    process.exit(1);
  }
  const { records } = rowsToObjects(parseCsv(decodeTextBuffer(fs.readFileSync(filePath))));
  let updated = 0;
  const issues = [];

  transaction(() => {
    for (const row of records) {
      const officialCode = String(row.官方编号 || '').trim();
      const name = String(row.名称 || '').trim();
      const project = officialCode
        ? get('SELECT id, name FROM project WHERE source_code = ?', [officialCode])
        : get('SELECT id, name FROM project WHERE name = ?', [name]);
      if (!project) {
        issues.push(`未匹配到项目：${officialCode || name}`);
        continue;
      }
      const summary = String(row.简介 || '').trim();
      const history = String(row.历史渊源 || '').trim();
      const feature = String(row.技艺特征 || '').trim();
      const keywords = String(row.关键词 || '').trim();
      if (!summary && !history && !feature && !keywords) {
        issues.push(`「${project.name}」四个内容字段都为空，已跳过`);
        continue;
      }
      const source = String(row.内容来源 || '').trim() || 'AI 起草后人工定稿';
      run(
        `UPDATE project SET
           summary = CASE WHEN ? <> '' THEN ? ELSE summary END,
           history = CASE WHEN ? <> '' THEN ? ELSE history END,
           feature = CASE WHEN ? <> '' THEN ? ELSE feature END,
           keywords = CASE WHEN ? <> '' THEN ? ELSE keywords END,
           content_source = ?, updated_at = ?
         WHERE id = ?`,
        [summary, summary, history, history, feature, feature, keywords, keywords, source, nowIso(), project.id],
      );
      updated += 1;
    }
  });

  const indexed = rebuildAndReport();
  run(
    `INSERT INTO audit_log (user_id, user_name, action, target_type, target_id, target_name, detail, ip, created_at)
     VALUES (NULL, '起草脚本', 'update', 'project', NULL, 'AI 内容定稿回填', ?, '127.0.0.1', ?)`,
    [`更新 ${updated} 条项目内容（索引 ${indexed.total} 条）`, nowIso()],
  );
  console.log(`已回填 ${updated} 条项目内容，检索索引重建为 ${indexed.total} 条`);
  if (issues.length) {
    console.log('需要注意：');
    for (const item of issues.slice(0, 10)) console.log(`  - ${item}`);
  }
}

/** 定稿文件可能用相对项目根、相对 exports/、或绝对路径给出，逐个尝试 */
function resolveDraftFile(file) {
  const raw = String(file);
  if (path.isAbsolute(raw)) return raw;
  const candidates = [
    path.resolve(process.cwd(), raw),
    path.join(ROOT, raw),
    path.join(ROOT, 'exports', raw),
  ];
  return candidates.find((item) => fs.existsSync(item)) || candidates[0];
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(`AI 内容起草

  node scripts/ai-draft.js --dry-run                查看会给哪些项目起草
  node scripts/ai-draft.js --limit 5                先跑 5 条试水
  node scripts/ai-draft.js                          起草全部缺长文的国家级项目
  node scripts/ai-draft.js --all                    连同已有内容一起重新起草
  node scripts/ai-draft.js --apply <定稿.csv>        把人工定稿后的表回填入库

可选：--out <路径> 指定输出文件`);
    return;
  }
  if (flags.apply) {
    apply(flags);
    return;
  }
  generate(flags).catch((error) => {
    console.error(`起草失败：${error.message}`);
    process.exit(1);
  });
}

main();
