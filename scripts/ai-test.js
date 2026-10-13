#!/usr/bin/env node
/**
 * 大模型连通性测试（零依赖）
 *
 * 用法一：命令行直接给参数
 *   node scripts/ai-test.js --base-url https://api.deepseek.com --model deepseek-chat --api-key sk-xxxx
 *
 * 用法二：读管理端保存的配置（data/ai-config.json）
 *   node scripts/ai-test.js --config
 *
 * 附加参数：
 *   --list-models    先调用 /models 列出可用模型，帮助确认模型名
 *   --prompt "..."   自定义测试问题（默认一句简单提问）
 *   --timeout 20000  超时毫秒
 *
 * 这个脚本只做一次最小请求，用来确认「服务地址 + 模型名 + Key」三件事是否配对正确。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'data', 'ai-config.json');

/**
 * 常用平台预设。模型名与免费策略会随平台调整，
 * 用 --list-models 以账号实际可用为准。
 */
const PRESETS = {
  'zhipu-free': {
    label: '智谱 GLM · 免费档（推荐先用这个）',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  },
  'zhipu-air': {
    label: '智谱 GLM · 轻量付费档',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-air',
  },
  deepseek: {
    label: 'DeepSeek 对话模型',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  qwen: {
    label: '阿里百炼 通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  moonshot: {
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
  ollama: {
    label: '本地 Ollama（完全免费，需本机显卡）',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
  },
};

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    if (['config', 'list-models', 'presets'].includes(key)) {
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

function loadConfig(flags) {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (error) {
      console.error(`配置文件解析失败：${CONFIG_PATH}`);
      console.error(`  ${error.message}`);
      process.exit(1);
    }
  } else if (flags.config) {
    console.error(`找不到配置文件：${CONFIG_PATH}`);
    console.error('请先在管理端「系统设置 → AI 配置」保存一次，或直接用命令行参数运行。');
    process.exit(1);
  }
  const preset = flags.preset ? PRESETS[String(flags.preset)] : null;
  if (flags.preset && !preset) {
    console.error(`未知预设：${flags.preset}`);
    console.error(`可用预设：${Object.keys(PRESETS).join('、')}`);
    process.exit(1);
  }
  return {
    baseUrl: flags['base-url'] || fileConfig.baseUrl || preset?.baseUrl || '',
    model: flags.model || fileConfig.model || preset?.model || '',
    apiKey: flags['api-key'] || fileConfig.apiKey || '',
    timeout: Number(flags.timeout || fileConfig.timeout || 20000),
    maxTokens: Number(flags['max-tokens'] || fileConfig.maxTokens || 64),
    presetLabel: preset?.label || '',
  };
}

/** 拼接请求地址，兼容带与不带 /v1 的写法 */
function joinUrl(baseUrl, suffix) {
  return `${String(baseUrl).replace(/\/+$/, '')}${suffix}`;
}

function explain(error, status, body) {
  const text = String(body || '');
  if (status === 401 || status === 403) {
    return 'Key 无效或没有该模型权限：确认 Key 复制完整、没有多余空格，且账号已实名、已开通该模型。';
  }
  if (status === 404) {
    return '服务地址或模型名不对：常见原因是地址漏了 /v1，或模型名拼错。加 --list-models 看可用模型名。';
  }
  if (status === 400) {
    return `请求参数被拒：${text.slice(0, 200) || '通常是模型名不存在或参数不合法'}。`;
  }
  if (status === 429) {
    return '限流或余额不足：检查账户余额，或稍后重试。';
  }
  if (status >= 500) {
    return '对方服务端异常，稍后重试；若持续出现，换一个模型名试试。';
  }
  if (error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return '请求超时：网络慢或地址不通，可加大 --timeout。';
  }
  if (error && (error.cause?.code === 'ENOTFOUND' || error.cause?.code === 'EAI_AGAIN')) {
    return '域名解析失败：检查服务地址拼写与本机网络。';
  }
  if (error && (error.cause?.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNRESET')) {
    return '连接被拒绝或中断：可能是代理、防火墙，或地址端口不对。';
  }
  if (error) {
    const code = error.cause?.code ? `（${error.cause.code}）` : '';
    return `无法连接：${error.message}${code}。检查本机网络、代理设置与地址是否正确。`;
  }
  return '未知错误。';
}

async function listModels(config) {
  const url = joinUrl(config.baseUrl, '/models');
  console.log(`\n[1/2] 列出模型：GET ${url}`);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(config.timeout),
    });
    const text = await response.text();
    if (!response.ok) {
      console.log(`  HTTP ${response.status} — ${explain(null, response.status, text)}`);
      return;
    }
    try {
      const data = JSON.parse(text);
      const names = (data.data || data.models || []).map((item) => item.id || item.name).filter(Boolean);
      console.log(`  可用模型（共 ${names.length} 个）：`);
      for (const name of names.slice(0, 40)) console.log(`    ${name}`);
      if (names.length > 40) console.log(`    …还有 ${names.length - 40} 个`);
    } catch {
      console.log(`  返回内容不是标准模型列表，前 200 字：${text.slice(0, 200)}`);
    }
  } catch (error) {
    console.log(`  ${explain(error)}`);
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.presets) {
    console.log('可用预设（--preset <名称>）：\n');
    for (const [key, preset] of Object.entries(PRESETS)) {
      console.log(`  ${key.padEnd(12)} ${preset.label}`);
      console.log(`  ${''.padEnd(12)} 地址：${preset.baseUrl}`);
      console.log(`  ${''.padEnd(12)} 模型：${preset.model}\n`);
    }
    console.log('提示：模型名与免费策略会随平台调整，实际可用模型请用 --list-models 查看。');
    return;
  }

  const config = loadConfig(flags);

  if (!config.baseUrl || !config.apiKey) {
    console.log(`大模型连通性测试

  node scripts/ai-test.js --base-url <服务地址> --model <模型名> --api-key <密钥>
  node scripts/ai-test.js --config                     读 data/ai-config.json
  node scripts/ai-test.js --preset zhipu-free --api-key <密钥>   用预设一键测试
  node scripts/ai-test.js --presets                    列出全部预设

附加参数：
  --list-models           先列出该端点可用模型
  --prompt "问题"          自定义测试问题
  --timeout 20000         超时毫秒
  --max-tokens 64         最大输出长度

常见服务地址（以各平台控制台文档为准，模型名可能更新）：
  智谱 GLM     https://open.bigmodel.cn/api/paas/v4                免费档 glm-4-flash
  DeepSeek     https://api.deepseek.com                           模型如 deepseek-chat
  阿里百炼      https://dashscope.aliyuncs.com/compatible-mode/v1   模型如 qwen-plus
  月之暗面      https://api.moonshot.cn/v1                          模型如 moonshot-v1-8k
  智谱 GLM     https://open.bigmodel.cn/api/paas/v4                模型如 glm-4-plus
  本地 Ollama  http://localhost:11434/v1                           模型如 qwen2.5:7b`);
    process.exit(1);
  }

  console.log('配置检查：');
  if (config.presetLabel) console.log(`  预设　　：${config.presetLabel}`);
  console.log(`  服务地址：${config.baseUrl}`);
  console.log(`  模型名　：${config.model || '（未填写）'}`);
  console.log(`  Key　　：${config.apiKey.slice(0, 6)}…${config.apiKey.slice(-4)}（长度 ${config.apiKey.length}）`);
  console.log(`  超时　　：${config.timeout}ms`);

  if (flags['list-models']) await listModels(config);

  const url = joinUrl(config.baseUrl, '/chat/completions');
  const prompt = flags.prompt || '请用一句话回答：中国的非物质文化遗产分为哪几个大类？';
  console.log(`\n[${flags['list-models'] ? '2/2' : '1/1'}] 测试对话：POST ${url}`);
  console.log(`  问题：${prompt}`);

  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || undefined,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: config.maxTokens,
        temperature: 0.3,
        stream: false,
      }),
      signal: AbortSignal.timeout(config.timeout),
    });
    const cost = Date.now() - started;
    const text = await response.text();

    if (!response.ok) {
      console.log(`  ✗ HTTP ${response.status}（${cost}ms）`);
      console.log(`    ${explain(null, response.status, text)}`);
      console.log(`    原始返回：${text.slice(0, 300)}`);
      process.exit(1);
    }

    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      console.log(`  ✗ 返回不是合法 JSON（${cost}ms）：${text.slice(0, 200)}`);
      process.exit(1);
    }
    const answer = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
    console.log(`  ✓ 连接成功（${cost}ms）`);
    console.log(`  模型回包名：${data.model || config.model || '（未返回）'}`);
    console.log(`  回答：${String(answer).trim().slice(0, 300)}`);
    if (data.usage) {
      console.log(`  用量：输入 ${data.usage.prompt_tokens ?? '?'} tokens，输出 ${data.usage.completion_tokens ?? '?'} tokens`);
    }
    console.log('\n三项配置都正确，可以把这套参数填进管理端的「系统设置 → AI 配置」。');
  } catch (error) {
    console.log(`  ✗ 请求失败（${Date.now() - started}ms）`);
    console.log(`    ${explain(error)}`);
    process.exit(1);
  }
}

main();
