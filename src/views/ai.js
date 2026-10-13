import { h } from '../util.js';
import { adminLayout } from './layout.js';
import { statusBadge } from './components.js';

const SAMPLE_COMMANDS = [
  '内蒙古的民俗项目',
  '传统技艺类项目',
  '列出第五批国家级项目',
  '找出60岁以上国家级传承人',
  '从业超过30年的传承人',
  '近三年未更新的项目',
];

export function copilotView({ user, pendingTotal, config, stats }) {
  const commandCards = SAMPLE_COMMANDS.map(
    (cmd) => `<button class="cmd-chip" type="button" data-command="${h(cmd)}">${h(cmd)}</button>`,
  ).join('');

  const statusLine = config.hasApiKey
    ? `<span class="ai-dot is-on"></span>已连接大模型：<b>${h(config.model || '未填模型名')}</b>（密钥 ${h(config.apiKeyMasked)}）`
    : `<span class="ai-dot is-off"></span>未配置大模型密钥，当前为<b>本地检索模式</b>（指令型查询照常可用）`;

  const body = `
  <div class="page-head-row">
    <div>
      <h1 class="admin-title">AI 小助手</h1>
      <p class="admin-sub">可以问“苏绣用什么材料”这类问题，也可以直接下指令：“找出60岁以上国家级传承人”。回答只依据站内档案，并列出可点击的来源。</p>
    </div>
    <div class="head-actions">
      <a class="btn btn-ghost" href="/admin/ai">AI 配置</a>
      <button class="btn btn-ghost" type="button" id="reindex-btn">重建检索索引</button>
    </div>
  </div>

  <div class="copilot-grid">
    <section class="panel copilot-main">
      <header class="panel-head">
        <h2>对话</h2>
        <span class="panel-hint">${stats.total} 条档案已进索引</span>
      </header>
      <div class="copilot-status" id="ai-status">${statusLine}</div>
      <div class="chat-list" id="chat-list">
        <div class="chat-msg is-bot">
          <div class="chat-avatar">助</div>
          <div class="chat-body">
            <p>你好，我是非遗平台的小助手。可以试试右侧的常用指令，或者直接问某个项目、某种技艺。</p>
            <p class="chat-note">说明：我只做查询与介绍，不会修改任何档案。</p>
          </div>
        </div>
      </div>
      <form class="chat-input" id="chat-form">
        <textarea class="input" id="chat-message" rows="2" placeholder="例如：苏绣用什么材料 / 内蒙古的民俗项目 / 找出第五批国家级项目"></textarea>
        <button class="btn btn-primary" type="submit" id="chat-send">发送</button>
      </form>
    </section>

    <aside class="panel copilot-side">
      <header class="panel-head"><h2>常用指令</h2></header>
      <div class="cmd-list">${commandCards}</div>
      <header class="panel-head"><h2>能力边界</h2></header>
      <ul class="side-points">
        <li>只读：不会新增、修改、删除或发布任何档案</li>
        <li>只依据站内资料回答，资料没有就明说，不编造</li>
        <li>指令型查询由本地规则解析，<b>不消耗模型额度</b></li>
        <li>大模型不可用时自动降级为本地检索，功能不中断</li>
        <li>发送给模型的仅是字段摘要，不含图片、账号与日志</li>
      </ul>
      <header class="panel-head"><h2>口径说明</h2></header>
      <ul class="side-points">
        <li>传承人暂无出生年月，“年龄”按<b>从业年限</b>近似，界面会标注</li>
        <li>“未更新”按档案更新时间判断</li>
      </ul>
    </aside>
  </div>`;

  return adminLayout({
    title: 'AI 小助手',
    user,
    active: 'copilot',
    crumbs: [{ label: 'AI 小助手' }],
    pendingTotal,
    wide: true,
    scripts: ['/assets/js/copilot.js'],
    body,
  });
}

const PRESET_FILL = {
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
};

export function aiConfigView({ user, pendingTotal, config }) {
  const body = `
  <div class="page-head-row">
    <div>
      <h1 class="admin-title">AI 配置</h1>
      <p class="admin-sub">按 OpenAI 兼容接口对接，换厂商只需改服务地址与模型名。密钥保存在 data/ai-config.json，不进版本库。</p>
    </div>
    <div class="head-actions">
      <a class="btn btn-ghost" href="/admin/copilot">返回小助手</a>
    </div>
  </div>

  <div class="ai-config-grid">
    <section class="panel">
      <header class="panel-head"><h2>模型参数</h2><span class="panel-hint">${config.hasApiKey ? `当前密钥 ${h(config.apiKeyMasked)}` : '尚未配置密钥'}</span></header>
      <form class="form-grid" id="ai-config-form">
        <div class="field span-full">
          <span class="field-label">快速填充（厂商预设）</span>
          <div class="chip-row">
            <button class="btn btn-ghost btn-sm" type="button" data-preset="zhipu">智谱 GLM（免费档）</button>
            <button class="btn btn-ghost btn-sm" type="button" data-preset="deepseek">DeepSeek</button>
            <button class="btn btn-ghost btn-sm" type="button" data-preset="qwen">阿里通义</button>
          </div>
        </div>
        <label class="field span-full"><span class="field-label">服务地址 base_url</span>
          <input class="input" type="text" name="baseUrl" value="${h(config.baseUrl)}" placeholder="https://open.bigmodel.cn/api/paas/v4">
          <span class="field-help">留空则关闭大模型；智谱免费档用 <code>https://open.bigmodel.cn/api/paas/v4</code></span>
        </label>
        <label class="field"><span class="field-label">模型名</span>
          <input class="input" type="text" name="model" value="${h(config.model)}" placeholder="glm-4-flash">
        </label>
        <label class="field"><span class="field-label">API 密钥</span>
          <input class="input" type="text" name="apiKey" placeholder="${config.hasApiKey ? '留空表示不修改已保存的密钥' : '粘贴密钥'}">
          <span class="field-help">只做保存与测试，界面永不回显完整密钥</span>
        </label>
        <label class="field"><span class="field-label">超时（毫秒）</span>
          <input class="input" type="number" name="timeoutMs" value="${config.timeoutMs}" min="3000" max="120000">
        </label>
        <label class="field"><span class="field-label">最大输出长度 max_tokens</span>
          <input class="input" type="number" name="maxTokens" value="${config.maxTokens}" min="64" max="4000">
        </label>
        <label class="field"><span class="field-label">温度 temperature</span>
          <input class="input" type="number" name="temperature" value="${config.temperature}" min="0" max="1" step="0.1">
        </label>
        <label class="field field-switch"><span class="field-label">启用 AI 问答</span>
          <span class="switch-row"><input type="checkbox" name="enabled" value="1" id="ai-enabled"${config.enabled ? ' checked' : ''}><label for="ai-enabled" class="switch"></label></span>
          <span class="field-help">关闭后仅保留本地指令与检索，仍然可用</span>
        </label>
        <div class="form-actions span-full">
          <button class="btn btn-primary" type="submit">保存配置</button>
          <button class="btn btn-ghost" type="button" id="test-btn">测试连通性</button>
          <button class="btn btn-ghost danger" type="button" id="clear-key-btn">清除密钥</button>
        </div>
      </form>
      <div class="pad" id="ai-test-result"></div>
    </section>

    <aside class="panel">
      <header class="panel-head"><h2>怎么拿到密钥</h2></header>
      <ul class="side-points">
        <li>智谱：open.bigmodel.cn → API Keys，免费档模型名如 <code>glm-4-flash</code></li>
        <li>DeepSeek：platform.deepseek.com → API Keys，模型名 <code>deepseek-chat</code></li>
        <li>阿里百炼：控制台 → API-KEY，模型名如 <code>qwen-plus</code></li>
        <li>也可以先用命令行验证：<code>node scripts/ai-test.js --preset zhipu-free --api-key 密钥</code></li>
      </ul>
      <header class="panel-head"><h2>安全提示</h2></header>
      <ul class="side-points">
        <li>密钥不要提交到 Git、不要截图外发</li>
        <li>若已泄露，去控制台吊销并重新生成</li>
        <li>发送给模型的只有字段摘要，详见小助手页说明</li>
      </ul>
      <header class="panel-head"><h2>检索索引</h2></header>
      <div class="pad">
        <p class="muted" style="margin-top:0">导入新档案或知识条目后，索引会自动重建。也可以手动重建。</p>
        <button class="btn btn-ghost btn-sm" type="button" id="reindex-btn">立即重建索引</button>
      </div>
    </aside>
  </div>`;

  return adminLayout({
    title: 'AI 配置',
    user,
    active: 'ai',
    crumbs: [{ label: 'AI 配置' }],
    pendingTotal,
    wide: true,
    scripts: ['/assets/js/copilot.js'],
    body: body + `<script type="application/json" id="ai-presets">${JSON.stringify(PRESET_FILL)}</script>`,
  });
}

export function knowledgeView({ user, pendingTotal, items, kinds }) {
  const rows = items
    .map(
      (item) => `<tr>
        <td><span class="chip chip-plain">${h(item.kind)}</span></td>
        <td><b>${h(item.title)}</b></td>
        <td>${h((item.summary || item.content || '').slice(0, 40))}</td>
        <td>${h(item.project_name || '—')}</td>
        <td>${statusBadge(item.status === 'published' ? 'published' : 'draft')}</td>
        <td class="col-actions">
          <button class="btn btn-xs btn-ghost" type="button" data-knowledge-edit='${h(JSON.stringify(item))}'>编辑</button>
          <button class="btn btn-xs btn-ghost danger" type="button" data-knowledge-delete="${item.id}">删除</button>
        </td>
      </tr>`,
    )
    .join('');

  const body = `
  <div class="page-head-row">
    <div>
      <h1 class="admin-title">知识条目</h1>
      <p class="admin-sub">这些条目是 AI 回答的检索来源（也是后期 DNA 图谱的节点种子）。写得越具体，回答越靠谱。</p>
    </div>
    <div class="head-actions"><a class="btn btn-ghost" href="/admin/copilot">返回小助手</a></div>
  </div>
  <div class="dict-grid">
    <section class="panel">
      <header class="panel-head"><h2>已有条目</h2><span class="panel-hint">共 ${items.length} 条</span></header>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>类型</th><th style="min-width:160px">标题</th><th style="min-width:200px">摘要</th><th>关联项目</th><th>状态</th><th style="min-width:120px">操作</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6"><p class="muted pad">还没有知识条目。</p></td></tr>`}</tbody>
      </table></div>
    </section>
    <section class="panel">
      <header class="panel-head"><h2 id="knowledge-form-title">新增知识条目</h2></header>
      <form class="form-grid" id="knowledge-form">
        <label class="field"><span class="field-label">类型</span>
          <select class="input" name="kind">${kinds.map((k) => `<option value="${h(k)}">${h(k)}</option>`).join('')}</select>
        </label>
        <label class="field"><span class="field-label">标题<i>*</i></span><input class="input" type="text" name="title" required placeholder="如：双面绣"></label>
        <label class="field span-full"><span class="field-label">内容</span><textarea class="input" name="content" rows="6" placeholder="解释、工艺要点、材料、历史背景等"></textarea></label>
        <label class="field span-full"><span class="field-label">来源</span><input class="input" type="text" name="source" placeholder="如：中国非物质文化遗产网"></label>
        <label class="field span-full"><span class="field-label">来源链接</span><input class="input" type="url" name="sourceUrl" placeholder="https://"></label>
        <div class="form-actions span-full">
          <button class="btn btn-primary" type="submit">保存</button>
          <button class="btn btn-ghost" type="reset">清空</button>
        </div>
      </form>
    </section>
  </div>`;

  return adminLayout({
    title: '知识条目',
    user,
    active: 'knowledge',
    crumbs: [{ label: '知识条目' }],
    pendingTotal,
    wide: true,
    scripts: ['/assets/js/copilot.js'],
    body,
  });
}
