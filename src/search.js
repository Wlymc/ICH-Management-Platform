import { all, db, run } from './db.js';

/**
 * 站内全文检索。
 *
 * 关键限制（已实测）：FTS5 的 trigram 分词器要求查询串至少 3 个字符，
 * 「刺绣」「青瓷」这类 1-2 字查询会返回 0 条，因此短词必须走 LIKE 兜底。
 */

const SHORT_QUERY_LIMIT = 3;

function escapeFts(query) {
  // 用双引号包裹并转义内部引号，避免 MATCH 语法报错
  return `"${String(query).replace(/"/g, '""')}"`;
}

function likeTerm(query) {
  return `%${String(query).replace(/[%_]/g, '')}%`;
}

/** 重建全文索引：项目长文 + 传承人经历 + 知识条目 */
export function rebuildSearchIndex() {
  db.exec('DELETE FROM search_index');
  const insert = db.prepare('INSERT INTO search_index (ref_type, ref_id, title, body) VALUES (?, ?, ?, ?)');
  let count = 0;

  for (const row of all(
    `SELECT id, name, summary, history, feature, lineage, keywords, region_text
     FROM project WHERE status = 'published'`,
  )) {
    const body = [row.keywords, row.region_text, row.summary, row.history, row.feature, row.lineage]
      .filter(Boolean)
      .join(' ');
    insert.run('project', Number(row.id), row.name, body);
    count += 1;
  }
  for (const row of all(
    `SELECT id, name, experience, skill, honors, data_note FROM inheritor WHERE status = 'published'`,
  )) {
    const body = [row.experience, row.skill, row.honors, row.data_note].filter(Boolean).join(' ');
    insert.run('inheritor', Number(row.id), row.name, body);
    count += 1;
  }
  for (const row of all("SELECT id, title, content, summary, tags FROM knowledge_entry WHERE status = 'published'")) {
    const body = [row.tags, row.summary, row.content].filter(Boolean).join(' ');
    insert.run('knowledge', Number(row.id), row.title, body);
    count += 1;
  }
  return count;
}

export function searchIndexStats() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM search_index').get();
  return { total: Number(row.n) };
}

/** 截取包含关键词的片段，作为模型上下文与界面摘要 */
export function snippet(text, keyword, length = 160) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const index = keyword ? raw.indexOf(keyword) : -1;
  if (index < 0) return raw.slice(0, length);
  const start = Math.max(0, index - Math.floor(length / 3));
  return `${start > 0 ? '…' : ''}${raw.slice(start, start + length)}`;
}

/**
 * 检索：长查询走 FTS5 + bm25 排序，短查询或 FTS 无命中走 LIKE 兜底。
 */
export function searchAll(query, { limit = 8, types = ['project', 'inheritor', 'knowledge'] } = {}) {
  const keyword = String(query || '').trim();
  if (!keyword) return [];
  const results = [];
  const seen = new Set();
  const push = (item) => {
    const key = `${item.type}#${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  if (keyword.length >= SHORT_QUERY_LIMIT) {
    try {
      const rows = all(
        `SELECT ref_type, ref_id, title, body, bm25(search_index) AS score
         FROM search_index WHERE search_index MATCH ? ORDER BY score LIMIT ?`,
        [escapeFts(keyword), limit * 3],
      );
      for (const row of rows) {
        if (!types.includes(row.ref_type)) continue;
        push({
          type: row.ref_type,
          id: Number(row.ref_id),
          title: row.title,
          snippet: snippet(row.body, keyword),
          score: Number(row.score),
          matchedBy: 'fts',
        });
      }
    } catch {
      /* MATCH 语法异常时退回 LIKE */
    }
  }

  if (results.length < limit) {
    const term = likeTerm(keyword);
    if (types.includes('project')) {
      for (const row of all(
        `SELECT id, name, summary, history, feature, lineage
         FROM project
         WHERE status = 'published'
           AND (name LIKE ? OR keywords LIKE ? OR summary LIKE ? OR history LIKE ? OR feature LIKE ? OR lineage LIKE ?)
         LIMIT ?`,
        [term, term, term, term, term, term, limit],
      )) {
        push({
          type: 'project',
          id: Number(row.id),
          title: row.name,
          snippet: snippet(row.summary || row.history || row.feature, keyword),
          score: 0,
          matchedBy: 'like',
        });
      }
    }
    if (types.includes('inheritor')) {
      for (const row of all(
        `SELECT id, name, experience, skill, honors
         FROM inheritor
         WHERE status = 'published'
           AND (name LIKE ? OR experience LIKE ? OR skill LIKE ? OR honors LIKE ?) LIMIT ?`,
        [term, term, term, term, limit],
      )) {
        push({
          type: 'inheritor',
          id: Number(row.id),
          title: row.name,
          snippet: snippet(row.skill || row.experience, keyword),
          score: 0,
          matchedBy: 'like',
        });
      }
    }
    if (types.includes('knowledge')) {
      for (const row of all(
        `SELECT id, title, content, summary FROM knowledge_entry
         WHERE status = 'published' AND (title LIKE ? OR content LIKE ? OR tags LIKE ?) LIMIT ?`,
        [term, term, term, limit],
      )) {
        push({
          type: 'knowledge',
          id: Number(row.id),
          title: row.title,
          snippet: snippet(row.summary || row.content, keyword),
          score: 0,
          matchedBy: 'like',
        });
      }
    }
  }

  return results.slice(0, limit);
}

export function hrefFor(type, id) {
  if (type === 'project') return `/projects/${id}`;
  if (type === 'inheritor') return `/inheritors/${id}`;
  return '';
}

export function rebuildAndReport() {
  const total = rebuildSearchIndex();
  run('PRAGMA wal_checkpoint(PASSIVE)');
  return { total };
}
