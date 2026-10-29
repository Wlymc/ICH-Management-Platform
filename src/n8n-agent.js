import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { get } from './db.js';
import { PATHS } from './config.js';
import { toInt } from './util.js';

const DEFAULT_WEBHOOK_URL = 'http://127.0.0.1:5678/webhook/ich-agent';
const DEFAULT_TIMEOUT_MS = 30_000;

function setting(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function fileConfig() {
  try {
    const file = path.join(PATHS.data, 'n8n-agent.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    console.warn('[n8n] data/n8n-agent.json 格式无效，使用环境变量或默认配置');
  }
  return {};
}

export function n8nAgentConfig() {
  const file = fileConfig();
  const enabledValue = setting(
    'N8N_AGENT_ENABLED',
    file.enabled === false ? 'false' : 'true',
  ).toLowerCase();
  const timeoutValue = toInt(
    process.env.N8N_AGENT_TIMEOUT_MS || file.timeoutMs,
    DEFAULT_TIMEOUT_MS,
  );
  return {
    enabled: !['0', 'false', 'off', 'no'].includes(enabledValue),
    webhookUrl: setting('N8N_WEBHOOK_URL', file.webhookUrl || DEFAULT_WEBHOOK_URL),
    token: setting('N8N_WEBHOOK_TOKEN', file.token || ''),
    timeoutMs: Math.min(Math.max(timeoutValue, 3_000), 60_000),
  };
}

export function isN8nAgentEnabled() {
  const config = n8nAgentConfig();
  return Boolean(config.enabled && config.webhookUrl);
}

function parseJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function unwrapResponse(raw) {
  const parsed = parseJson(raw);
  if (!parsed) return null;
  if (Array.isArray(parsed)) {
    const first = parsed[0]?.json || parsed[0];
    return parseJson(first) || first;
  }
  if (parsed.json) return parseJson(parsed.json) || parsed.json;
  if (parsed.data) return parseJson(parsed.data) || parsed.data;
  if (parsed.output && typeof parsed.output === 'string' && parsed.reply === undefined) {
    return parseJson(parsed.output);
  }
  return parsed;
}

function recommendationTarget(type, id) {
  const numericId = toInt(id, 0);
  if (!numericId) return null;

  if (type === 'project') {
    const row = get(
      'SELECT id, name, content_source FROM project WHERE id = ? AND status = ?',
      [numericId, 'published'],
    );
    if (!row) return null;
    return {
      type: 'project',
      id: numericId,
      defaultLabel: `查看${row.name}完整档案`,
      source: {
        type: 'project',
        id: numericId,
        title: row.name,
        href: `/projects/${numericId}`,
        snippet: '',
        verification: ['官方名录', '人工定稿', 'official'].includes(row.content_source)
          ? 'verified'
          : 'example',
        sourceLabel: ['官方名录', '人工定稿', 'official'].includes(row.content_source)
          ? `已核实 · ${row.content_source}`
          : '平台示例，待核实',
      },
    };
  }

  if (type === 'inheritor') {
    const row = get(
      'SELECT id, name, source_url FROM inheritor WHERE id = ? AND status = ?',
      [numericId, 'published'],
    );
    if (!row) return null;
    return {
      type: 'inheritor',
      id: numericId,
      defaultLabel: `了解传承人${row.name}`,
      source: {
        type: 'inheritor',
        id: numericId,
        title: row.name,
        href: `/inheritors/${numericId}`,
        snippet: '',
        verification: row.source_url ? 'verified' : 'unverified',
        sourceLabel: row.source_url ? '已核实 · 传承人资料来源' : '站内资料，待核实',
      },
    };
  }

  if (type === 'organization') {
    const row = get(
      'SELECT id, name FROM organization WHERE id = ? AND status = ?',
      [numericId, 'published'],
    );
    if (!row) return null;
    return {
      type: 'organization',
      id: numericId,
      defaultLabel: `查看${row.name}`,
      source: {
        type: 'organization',
        id: numericId,
        title: row.name,
        href: `/organizations/${numericId}`,
        snippet: '',
        verification: 'unverified',
        sourceLabel: '站内资料，待核实',
      },
    };
  }

  return null;
}

function normalizeRecommendations(items) {
  if (!Array.isArray(items)) return { links: [], sources: [] };
  const links = [];
  const sources = [];
  const seen = new Set();

  for (const item of items.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type || '').toLowerCase();
    const target = recommendationTarget(type, item.id);
    if (!target || seen.has(target.source.href)) continue;
    seen.add(target.source.href);
    links.push({
      href: target.source.href,
      label: String(item.label || target.defaultLabel).slice(0, 80),
    });
    sources.push(target.source);
    if (links.length >= 3) break;
  }

  return { links, sources };
}

function extractReplyLinks(reply, existingLinks) {
  const links = [...existingLinks];
  const seen = new Set(links.map((item) => item.href));
  const pattern =
    /\[([^\]]+)\]\((\/(?:projects(?:\/\d+)?(?:\?[^)]+)?|inheritors\/\d+|organizations(?:\/\d+)?))\)/g;
  const cleanReply = reply
    .replace(pattern, (_, label, href) => {
      if (!seen.has(href) && links.length < 3) {
        seen.add(href);
        links.push({ href, label: String(label).slice(0, 80) });
      }
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { reply: cleanReply, links };
}

export async function runN8nAgent({
  message,
  sessionId,
  history = [],
  context = null,
} = {}) {
  const config = n8nAgentConfig();
  if (!config.enabled || !config.webhookUrl) return null;

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (config.token) headers['X-ICH-Agent-Token'] = config.token;

  const payload = JSON.stringify({
    message,
    sessionId: sessionId || crypto.randomUUID(),
    history: Array.isArray(history) ? history.slice(-6) : [],
    context,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      const raw = await response.text();
      if (!response.ok) {
        console.warn(`[n8n] HTTP ${response.status}: ${raw.slice(0, 180)}`);
        if (response.status >= 500 && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        return null;
      }

      const data = unwrapResponse(raw);
      if (!data || data.message === 'Error in workflow') {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        return null;
      }
      const rawReply = String(data.reply || data.output || '')
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 2_000);
      if (!rawReply) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        return null;
      }

      const normalized = normalizeRecommendations(data.recommendations);
      const extracted = extractReplyLinks(rawReply, normalized.links);
      return {
        kind: 'answer',
        reply: extracted.reply,
        links: extracted.links,
        sources: normalized.sources,
        degraded: false,
        provider: 'n8n',
      };
    } catch (error) {
      const reason =
        error?.name === 'TimeoutError' || error?.name === 'AbortError'
          ? '请求超时'
          : error?.cause?.code || error?.message || '未知错误';
      console.warn(`[n8n] ${reason}`);
      return null;
    }
  }
  return null;
}
