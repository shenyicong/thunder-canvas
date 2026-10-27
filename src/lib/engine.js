/* ==========================================================
 * engine.js —— 可视化创作流程执行引擎
 * ----------------------------------------------------------
 * 核心能力：
 *   1. 画布「节点 + 连线」= 有向无环图（DAG），拓扑分层
 *   2. 同层节点并行执行，逐层推进
 *   3. 上游输出自动拼成下游上下文（文本 / 图片 / 视频）
 *   4. Agent 节点可挂多个 Agent：并行产出 → 可选汇总 Agent 收敛
 *   5. 全程可中断（AbortController），状态回写节点供 UI 高亮
 * ========================================================== */

import * as S from './store.js';
import * as Api from './api.js';

let running = false;
let aborted = false;
let controller = null;
let logs = [];

/* ----------------------------------------------------------
 * 日志
 * ---------------------------------------------------------- */
export function log(level, msg) {
  const item = { t: new Date(), level, msg: String(msg) };
  logs.push(item);
  if (logs.length > 500) logs.shift();
  S.emit('log', item);
  return item;
}
export const getLogs = () => logs;
export function clearLogs() { logs = []; S.emit('log:clear'); }

/* ----------------------------------------------------------
 * 一、拓扑分层：返回二维数组，同层可并行
 * ---------------------------------------------------------- */
export function topoLayers(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const indeg = {};
  const adj = {};
  ids.forEach((id) => { indeg[id] = 0; adj[id] = []; });

  edges.forEach((e) => {
    if (!idSet.has(e.source) || !idSet.has(e.target)) return;
    adj[e.source].push(e.target);
    indeg[e.target]++;
  });

  const layers = [];
  const remaining = new Set(ids);
  while (remaining.size) {
    const layer = [];
    remaining.forEach((id) => { if (indeg[id] === 0) layer.push(id); });
    if (!layer.length) {
      // 存在环：剩余节点强行入最后一层，避免死循环
      remaining.forEach((id) => layer.push(id));
      remaining.clear();
      layers.push(layer);
      break;
    }
    layer.forEach((id) => {
      remaining.delete(id);
      adj[id].forEach((nx) => { indeg[nx]--; });
    });
    layers.push(layer);
  }
  return layers;
}

/* ----------------------------------------------------------
 * 二、上下文收集：把上游节点输出拼成文本 + 图片 + 视频
 * ---------------------------------------------------------- */
export function collectUpstream(nodeId) {
  const texts = [];
  const images = [];
  const videos = [];

  S.getUpstream(nodeId).forEach((up) => {
    const d = up.data || {};
    switch (up.type) {
      case 'note':
      case 'prompt':
        if (d.text) texts.push(`[${up.title}]\n${d.text}`);
        break;
      case 'chat':
        if (d.output) texts.push(`[${up.title} 输出]\n${d.output}`);
        break;
      case 'imagegen':
        (d.images || []).forEach((u) => images.push(u));
        break;
      case 'upscale':
        (d.images || []).forEach((u) => images.push(u));
        break;
      case 'image':
        if (d.src) images.push(d.src);
        if (d.caption) texts.push('[图片说明] ' + d.caption);
        break;
      case 'videogen':
        if (d.videoUrl) videos.push(d.videoUrl);
        break;
      case 'agent':
        if (d.summary) texts.push(`[多 Agent 汇总]\n${d.summary}`);
        else if (Array.isArray(d.outputs)) {
          d.outputs.forEach((o) => texts.push(`[${o.agentName || 'Agent'}]\n${o.text || ''}`));
        }
        break;
      default:
        break;
    }
  });

  return { text: texts.join('\n\n'), images, videos };
}

/** 上下文 + 本节点指令 → 最终提示词 */
function buildPrompt(node, ctx) {
  const parts = [];
  if (node.data.instruction) parts.push(node.data.instruction);
  if (ctx.text) parts.push('--- 上游内容 ---\n' + ctx.text);
  return parts.join('\n\n').trim();
}

/* ----------------------------------------------------------
 * 三、状态回写
 * ---------------------------------------------------------- */
export function setStatus(node, status, text = '') {
  const n = S.getNode(node.id);
  if (!n) return;
  n.status = status;
  n.statusText = text || '';
  S.emit('node:status', n);
}

/* ----------------------------------------------------------
 * 四、节点执行器
 * ---------------------------------------------------------- */
const Runners = {

  /* ---- AI 对话 ---- */
  async chat(node, ctx, ctrl) {
    const ch = S.getChannel(node.data.channelId);
    if (!ch) throw new Error('未选择渠道');
    const prompt = buildPrompt(node, ctx);
    if (!prompt) throw new Error('没有可发送的内容（请填写指令或连接上游节点）');

    let messages = [{ role: 'user', content: prompt }];
    // 上游带图片时转成多模态消息
    if (ctx.images && ctx.images.length) {
      const content = [{ type: 'text', text: prompt }];
      ctx.images.slice(0, 4).forEach((u) => content.push({ type: 'image_url', image_url: { url: u } }));
      messages = [{ role: 'user', content }];
    }

    const res = await Api.chat(ch, {
      model: node.data.model || (ch.models && ch.models[0]) || 'gpt-4o-mini',
      messages,
      temperature: 0.7
    }, ctrl);
    return { output: res.text };
  },

  /* ---- AI 生图 ---- */
  async imagegen(node, ctx, ctrl) {
    const ch = S.getChannel(node.data.channelId);
    if (!ch) throw new Error('未选择渠道');
    const prompt = buildPrompt(node, ctx);
    if (!prompt) throw new Error('没有提示词（请填写指令或连接上游节点）');

    const model = node.data.model || (ch.models && ch.models[0]) || 'gpt-image-1';

    // 自有协议：走自定义模板
    if (ch.protocol === 'custom' && ch.templates && ch.templates.image) {
      const r = await Api.customGenerate(ch, ch.templates.image, {
        model, prompt,
        size: node.data.size || '1024x1024',
        n: node.data.n || 1,
        image: (ctx.images && ctx.images[0]) || ''
      }, ctrl, (msg) => setStatus(node, 'running', msg));
      if (!r.images || !r.images.length) throw new Error('接口未返回图片');
      return { images: (node.data.images || []).concat(r.images) };
    }

    const urls = await Api.image(ch, {
      model,
      prompt,
      size: node.data.size || '1024x1024',
      n: parseInt(node.data.n || 1, 10),
      image: (ctx.images && ctx.images[0]) || null
    }, ctrl);

    if (!urls.length) throw new Error('接口未返回图片');
    return { images: (node.data.images || []).concat(urls) };
  },

  /* ---- AI 超清放大：把上游图片放大 / 高清化 ---- */
  async upscale(node, ctx, ctrl) {
    const ch = S.getChannel(node.data.channelId);
    if (!ch) throw new Error('未选择渠道');
    const src = (ctx.images && ctx.images[0]) || '';
    if (!src) throw new Error('没有可放大的图片（请连接上游生图 / 图片节点）');

    const prompt = node.data.instruction
      || `Ultra-high-resolution upscale, ${node.data.scale || '4x'}, ultra-detailed, sharp, clean edges, 8k masterpiecel. Keep the original composition and subject.`;
    const model = node.data.model || (ch.models && ch.models[0]) || 'gpt-image-1';

    if (ch.protocol === 'custom' && ch.templates && ch.templates.image) {
      const r = await Api.customGenerate(ch, ch.templates.image, {
        model, prompt, size: node.data.size || '1024x1024', n: 1, image: src
      }, ctrl, (msg) => setStatus(node, 'running', msg));
      if (!r.images || !r.images.length) throw new Error('接口未返回放大后的图片');
      return { images: (node.data.images || []).concat(r.images) };
    }

    const urls = await Api.image(ch, {
      model, prompt, size: node.data.size || '1024x1024', n: 1, image: src
    }, ctrl);
    if (!urls.length) throw new Error('接口未返回放大后的图片');
    return { images: (node.data.images || []).concat(urls) };
  },

  /* ---- AI 生视频 ---- */
  async videogen(node, ctx, ctrl) {
    const ch = S.getChannel(node.data.channelId);
    if (!ch) throw new Error('未选择渠道');
    const prompt = buildPrompt(node, ctx);
    if (!prompt) throw new Error('没有提示词');

    const model = node.data.model || '';

    // 自有协议：走自定义模板（可灵 / 海螺 / Runway / Luma / 火山 Seedance）
    if (ch.protocol === 'custom' && ch.templates && ch.templates.video) {
      setStatus(node, 'running', '提交中…');
      const r = await Api.customGenerate(ch, ch.templates.video, {
        model, prompt,
        image: (ctx.images && ctx.images[0]) || '',
        duration: node.data.duration || 5
      }, ctrl, (msg) => setStatus(node, 'running', msg));
      if (!r.videoUrl) throw new Error('模板未返回视频地址');
      return { videoUrl: r.videoUrl };
    }

    setStatus(node, 'running', '提交中…');
    const res = await Api.video(ch, {
      model,
      prompt,
      image: (ctx.images && ctx.images[0]) || null
    }, ctrl, (msg) => setStatus(node, 'running', msg));

    return { videoUrl: res.videoUrl, jobId: (res.raw && res.raw.id) || '' };
  },

  /* ---- Agent：单 / 多 Agent 协同 ---- */
  async agent(node, ctx, ctrl) {
    const ids = (node.data.agentIds || []).filter(Boolean);
    if (!ids.length) throw new Error('未选择任何 Agent');

    let prompt = buildPrompt(node, ctx);
    if (!prompt) prompt = '（无输入，请自行发挥）';

    // 第一步：所有 Agent 并行分头产出
    setStatus(node, 'running', `并行调用 ${ids.length} 个 Agent…`);
    const tasks = ids.map(async (aid) => {
      const ag = S.getAgent(aid);
      if (!ag) return { agentId: aid, agentName: '(已删除)', text: '', error: 'Agent 不存在' };
      const ch = S.getChannel(ag.channelId);
      if (!ch) return { agentId: aid, agentName: ag.name, text: '', error: 'Agent 未绑定渠道' };

      try {
        const r = await Api.chat(ch, {
          model: ag.model || (ch.models && ch.models[0]) || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: ag.systemPrompt || '' },
            { role: 'user', content: prompt }
          ],
          temperature: parseFloat(ag.temperature || 0.7)
        }, ctrl);
        return { agentId: aid, agentName: ag.name, color: ag.color, text: r.text, error: '' };
      } catch (e) {
        return { agentId: aid, agentName: ag.name, color: ag.color, text: '', error: String(e.message || e) };
      }
    });

    const outputs = await Promise.all(tasks);

    // 第二步：可选汇总 Agent 收敛多方结果
    let summary = '';
    if (node.data.summarizerId) {
      const sag = S.getAgent(node.data.summarizerId);
      const sch = sag && S.getChannel(sag.channelId);
      if (sag && sch) {
        setStatus(node, 'running', `汇总中（${sag.name}）…`);
        const merged = outputs
          .map((o) => `### ${o.agentName}\n${o.error ? '[失败] ' + o.error : o.text}`)
          .join('\n\n');
        try {
          const r = await Api.chat(sch, {
            model: sag.model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: sag.systemPrompt || '你是主持人，负责综合多位专家意见，输出唯一结论。' },
              { role: 'user', content: '以下是多位 Agent 的输出，请综合给出最终方案：\n\n' + merged }
            ],
            temperature: parseFloat(sag.temperature || 0.7)
          }, ctrl);
          summary = r.text;
        } catch (e) {
          summary = '[汇总失败] ' + String(e.message || e);
        }
      }
    }

    return { outputs, summary };
  }
};

/* ----------------------------------------------------------
 * 五、主流程
 * @param {string[]} onlyIds 为空表示运行整张画布
 * ---------------------------------------------------------- */
export async function run(onlyIds = []) {
  if (running) { log('warn', '已有任务在运行'); return; }

  let runIds;
  if (onlyIds && onlyIds.length) {
    // 选中节点 + 其全部下游，保证下游拿到最新输入
    runIds = new Set(onlyIds);
    const queue = onlyIds.slice();
    while (queue.length) {
      const cur = queue.shift();
      S.getDownstream(cur).forEach((d) => {
        if (!runIds.has(d.id)) { runIds.add(d.id); queue.push(d.id); }
      });
    }
  } else {
    runIds = new Set(S.state.nodes.map((n) => n.id));
  }

  const nodes = S.state.nodes.filter((n) => runIds.has(n.id));
  const edges = S.state.edges.filter((e) => runIds.has(e.source) && runIds.has(e.target));
  const layers = topoLayers(nodes, edges);
  const runnableCount = nodes.filter((n) => S.NODE_TYPES[n.type].runnable).length;

  if (!runnableCount) {
    log('warn', '没有可运行节点（可运行类型：AI 对话 / 生图 / 生视频 / Agent）');
    return { blocked: true, issues: [{ msg: '没有可运行节点' }] };
  }

  /* ---- 前置配置检查：把"跑了没反应"变成明确的待办 ---- */
  const issues = [];
  const isLocal = (u) => /localhost|127\.0\.0\.1/.test(u || '');

  const checkChannel = (ch, owner) => {
    if (!ch) { issues.push({ nodeId: owner.id, title: owner.title, msg: `${owner.title}：未选择渠道` }); return; }
    if (!ch.baseUrl) { issues.push({ nodeId: owner.id, title: owner.title, msg: `${owner.title}：渠道「${ch.name}」未填 Base URL` }); return; }
    if (!ch.apiKey && !isLocal(ch.baseUrl)) {
      issues.push({ nodeId: owner.id, title: owner.title, msg: `${owner.title}：渠道「${ch.name}」未填 API Key` });
    }
  };

  nodes.forEach((n) => {
    if (!S.NODE_TYPES[n.type].runnable) return;
    if (n.type === 'agent') {
      const ids = (n.data.agentIds || []).filter(Boolean);
      if (!ids.length) issues.push({ nodeId: n.id, title: n.title, msg: `${n.title}：未选择任何 Agent` });
      ids.forEach((id) => {
        const ag = S.getAgent(id);
        if (!ag) return;
        const ch = S.getChannel(ag.channelId);
        if (!ch) issues.push({ nodeId: n.id, title: n.title, msg: `${n.title}：Agent「${ag.name}」未绑定渠道` });
        else checkChannel(ch, { id: n.id, title: `${n.title}（${ag.name}）` });
      });
    } else {
      checkChannel(S.getChannel(n.data.channelId), n);
    }
  });

  if (issues.length) {
    // 去重
    const uniq = [];
    const seen = new Set();
    issues.forEach((i) => { if (!seen.has(i.msg)) { seen.add(i.msg); uniq.push(i); } });
    uniq.forEach((i) => log('error', '⚠ 配置未完成 —— ' + i.msg));
    log('warn', '已阻止执行：请先在右侧「渠道」填写 Base URL 和 API Key（或绑定到 Agent 上）');
    S.emit('needs-config', uniq);
    return { blocked: true, issues: uniq };
  }

  running = true;
  aborted = false;
  controller = new AbortController();
  log('info', `开始执行：${runnableCount} 个可运行节点，分 ${layers.length} 层`);
  S.emit('run:start');

  const t0 = Date.now();
  let okCount = 0;
  let errCount = 0;

  try {
    for (let li = 0; li < layers.length; li++) {
      if (aborted) break;
      const layerNodes = layers[li]
        .map((id) => S.getNode(id))
        .filter((n) => n && S.NODE_TYPES[n.type].runnable);
      if (!layerNodes.length) continue;

      log('info', `第 ${li + 1} 层：${layerNodes.map((n) => n.title).join(' | ')}`);
      // 同层并行
      await Promise.all(layerNodes.map((node) =>
        runOne(node).then(() => { okCount++; }).catch(() => { errCount++; })
      ));
    }
  } finally {
    running = false;
    controller = null;
    S.emit('run:end', { ok: okCount, err: errCount });
  }

  const cost = ((Date.now() - t0) / 1000).toFixed(1);
  if (aborted) log('warn', `已停止（成功 ${okCount} / 失败 ${errCount}）`);
  else log(errCount ? 'warn' : 'ok', `执行结束，耗时 ${cost}s，成功 ${okCount} 个，失败 ${errCount} 个`);
  S.commit();
  return { blocked: false, ok: okCount, err: errCount };
}

/** 执行单个节点 */
export async function runOne(node) {
  if (aborted) return;
  const runner = Runners[node.type];
  if (!runner) return;

  setStatus(node, 'running', '执行中…');
  log('info', `▶ ${node.title} 开始`);

  const ctx = collectUpstream(node.id);
  try {
    const patch = await runner(node, ctx, controller);
    if (aborted) { setStatus(node, 'idle', '已取消'); return; }
    S.updateNodeData(node.id, patch);
    setStatus(node, 'done', '完成');
    log('ok', `✓ ${node.title} 完成`);
  } catch (e) {
    if (e && e.name === 'AbortError') { setStatus(node, 'idle', '已取消'); return; }
    setStatus(node, 'error', '失败');
    log('error', `✗ ${node.title} 失败：${String(e.message || e)}`);
    throw e;
  }
}

export function stop() {
  if (!running) return;
  aborted = true;
  if (controller) controller.abort();
  log('warn', '正在停止…');
}

export const isRunning = () => running;

/* ----------------------------------------------------------
 * 六、轻量 Markdown 渲染（输出区展示用）
 * ---------------------------------------------------------- */
export function renderMarkdown(text) {
  if (!text) return '';
  let esc = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  esc = esc.replace(/```([\s\S]*?)```/g, (_m, code) => `<span class="md-code">${code.replace(/^\n/, '')}</span>`);
  esc = esc.replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>');
  esc = esc.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  return esc;
}
