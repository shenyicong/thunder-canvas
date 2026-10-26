/* ==========================================================
 * store.js —— 全局状态中心（框架无关，React 通过订阅消费）
 * ----------------------------------------------------------
 * 职责：
 *   1. 定义节点类型 NODE_TYPES
 *   2. 维护 nodes / edges / channels / agents / viewport
 *   3. 撤销重做（快照栈）
 *   4. localStorage 自动持久化
 *   5. 发布订阅：React 用 useSyncExternalStore 订阅 version 变化
 * ========================================================== */

const STORAGE_KEY = 'thunder-canvas:v1';
const HISTORY_LIMIT = 80;

/* ----------------------------------------------------------
 * 一、节点类型定义
 * runnable 表示该节点是否会被执行引擎调度
 * ---------------------------------------------------------- */
export const NODE_TYPES = {
  note: {
    name: '便签', icon: '📝', cls: 't-note',
    w: 240, h: 150, runnable: false,
    desc: '记录思路 / 说明',
    data: { text: '在这里写下想法…' }
  },
  prompt: {
    name: '提示词', icon: '✍️', cls: 't-prompt',
    w: 260, h: 170, runnable: false,
    desc: '创作流程的起点',
    data: { text: '一只在月球上喝咖啡的橘猫，赛博朋克风格' }
  },
  image: {
    name: '图片', icon: '🖼️', cls: 't-image',
    w: 260, h: 240, runnable: false,
    desc: '上传 / 展示参考图',
    data: { src: '', caption: '' }
  },
  chat: {
    name: 'AI 对话', icon: '💬', cls: 't-chat',
    w: 300, h: 260, runnable: true,
    desc: '调用大模型生成文本',
    data: { instruction: '', model: '', channelId: '', output: '' }
  },
  imagegen: {
    name: 'AI 生图', icon: '🎨', cls: 't-imagegen',
    w: 300, h: 300, runnable: true,
    desc: '文生图 / 图生图',
    data: { instruction: '', model: '', channelId: '', size: '1024x1024', n: 1, images: [] }
  },
  videogen: {
    name: 'AI 生视频', icon: '🎬', cls: 't-videogen',
    w: 300, h: 280, runnable: true,
    desc: '文字 / 图片生成视频',
    data: { instruction: '', model: '', channelId: '', videoUrl: '', jobId: '' }
  },
  agent: {
    name: 'Agent', icon: '🤖', cls: 't-agent',
    w: 330, h: 320, runnable: true,
    desc: '单 / 多 Agent 协同执行',
    data: { agentIds: [], instruction: '', summarizerId: '', outputs: [], summary: '' }
  }
};

/* ----------------------------------------------------------
 * 二、渠道预设
 * chatgpt2api / grok2api / flow2api / newapi 等中转站本质上
 * 都是 OpenAI 兼容协议，区别只在 Base URL、路径与模型名，
 * 因此统一抽象为「渠道」，用户填三个字段即可接入。
 * ---------------------------------------------------------- */
export const CHANNEL_PRESETS = [
  { key: 'openai', name: 'OpenAI 官方', baseUrl: 'https://api.openai.com/v1', note: 'gpt-4o / gpt-image-1' },
  { key: 'chatgpt2api', name: 'chatgpt2api', baseUrl: 'http://localhost:8000/v1', note: '本地转发 ChatGPT Web' },
  { key: 'grok2api', name: 'grok2api', baseUrl: 'http://localhost:8000/v1', note: '本地转发 Grok' },
  { key: 'flow2api', name: 'flow2api', baseUrl: 'http://localhost:8000/v1', note: '本地转发 Flow' },
  { key: 'newapi', name: 'newapi / 聚合站', baseUrl: 'https://your-domain.com/v1', note: '通用 OpenAI 聚合' },
  { key: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', note: 'deepseek-chat' },
  { key: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', note: 'moonshot-v1-8k' },
  { key: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', note: 'glm-4-flash' },
  { key: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', note: 'FLUX / Qwen' },
  { key: 'volc', name: '火山方舟', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', note: 'doubao 系列' },
  { key: 'custom', name: '自定义', baseUrl: '', note: '任意 OpenAI 兼容接口' }
];

/* ----------------------------------------------------------
 * 三、状态与订阅
 * ---------------------------------------------------------- */
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const emptyState = () => ({
  version: 1,
  nodes: [],
  edges: [],
  channels: [],
  agents: [],
  viewport: { x: 0, y: 0, scale: 1 }
});

export const state = emptyState();

let historyStack = [];
let hIndex = -1;
let version = 0;
const listeners = new Set();
const evtMap = {};
let saveTimer = null;

function notify() {
  version++;
  listeners.forEach((fn) => fn());
}

/** React 侧订阅入口（配合 useSyncExternalStore） */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getVersion() {
  return version;
}

/** 具体事件订阅（如 'log' / 'node:status' / 'run:end'） */
export function on(evt, fn) {
  (evtMap[evt] = evtMap[evt] || []).push(fn);
  return () => { evtMap[evt] = (evtMap[evt] || []).filter((f) => f !== fn); };
}
export function emit(evt, payload) {
  (evtMap[evt] || []).forEach((fn) => {
    try { fn(payload); } catch (e) { console.error('[TC] listener error', evt, e); }
  });
}

/* ---------- 持久化 ---------- */
export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    emit('saved');
  } catch (e) {
    console.warn('[TC] 保存失败', e);
    emit('save-error', e);
  }
}
export function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}
export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.nodes)) return false;
    Object.assign(state, emptyState(), obj);
    return true;
  } catch (e) {
    console.warn('[TC] 读取本地数据失败', e);
    return false;
  }
}

/* ---------- 撤销 / 重做 ---------- */
const snapshot = () => JSON.stringify({
  nodes: state.nodes, edges: state.edges,
  channels: state.channels, agents: state.agents
});

function restore(snap) {
  const obj = JSON.parse(snap);
  state.nodes = obj.nodes;
  state.edges = obj.edges;
  state.channels = obj.channels;
  state.agents = obj.agents;
}

/** 每次数据变更后调用，写入历史栈 + 触发重渲染 */
export function commit() {
  const snap = snapshot();
  if (hIndex >= 0 && historyStack[hIndex] === snap) { notify(); return; }
  historyStack = historyStack.slice(0, hIndex + 1);
  historyStack.push(snap);
  if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
  hIndex = historyStack.length - 1;
  saveSoon();
  notify();
}

export function undo() {
  if (hIndex <= 0) return false;
  hIndex--;
  restore(historyStack[hIndex]);
  saveSoon(); notify();
  emit('undo');
  return true;
}
export function redo() {
  if (hIndex >= historyStack.length - 1) return false;
  hIndex++;
  restore(historyStack[hIndex]);
  saveSoon(); notify();
  emit('redo');
  return true;
}
export const canUndo = () => hIndex > 0;
export const canRedo = () => hIndex < historyStack.length - 1;
export function resetHistory() {
  historyStack = [snapshot()];
  hIndex = 0;
}

/* ----------------------------------------------------------
 * 四、节点 CRUD
 * ---------------------------------------------------------- */
export function addNode(type, x = 0, y = 0, data = {}) {
  const def = NODE_TYPES[type];
  if (!def) throw new Error('未知节点类型: ' + type);
  const node = {
    id: uid('n'),
    type,
    x: Math.round(x),
    y: Math.round(y),
    w: def.w,
    h: def.h,
    title: def.name,
    status: 'idle',
    statusText: '',
    data: JSON.parse(JSON.stringify({ ...def.data, ...data }))
  };
  state.nodes.push(node);
  commit();
  return node;
}

export const getNode = (id) => state.nodes.find((n) => n.id === id) || null;

export function removeNodes(ids) {
  const set = new Set(ids);
  state.nodes = state.nodes.filter((n) => !set.has(n.id));
  state.edges = state.edges.filter((e) => !set.has(e.source) && !set.has(e.target));
  commit();
}

export function updateNode(id, patch, silent = false) {
  const n = getNode(id);
  if (!n) return;
  Object.assign(n, patch);
  if (!silent) commit();
}

export function updateNodeData(id, dataPatch, silent = false) {
  const n = getNode(id);
  if (!n) return;
  Object.assign(n.data, dataPatch);
  if (!silent) commit();
}

/** 建立连线：去重 + 禁止自环 + 禁止成环 */
export function addEdge(source, target) {
  if (source === target) return null;
  if (state.edges.some((e) => e.source === source && e.target === target)) return null;
  if (createsCycle(source, target)) return null;
  const edge = { id: uid('e'), source, target };
  state.edges.push(edge);
  commit();
  return edge;
}

export function removeEdges(ids) {
  const set = new Set(ids);
  state.edges = state.edges.filter((e) => !set.has(e.id));
  commit();
}

/** 若新增 source->target 会成环则返回 true */
export function createsCycle(source, target) {
  const adj = {};
  state.edges.forEach((e) => { (adj[e.source] = adj[e.source] || []).push(e.target); });
  const seen = {};
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === source) return true;
    if (seen[cur]) continue;
    seen[cur] = true;
    (adj[cur] || []).forEach((nx) => stack.push(nx));
  }
  return false;
}

export const getUpstream = (id) => state.edges
  .filter((e) => e.target === id).map((e) => getNode(e.source)).filter(Boolean);

export const getDownstream = (id) => state.edges
  .filter((e) => e.source === id).map((e) => getNode(e.target)).filter(Boolean);

/* ----------------------------------------------------------
 * 五、渠道 / Agent
 * ---------------------------------------------------------- */
export function addChannel(cfg = {}) {
  const ch = {
    id: uid('ch'),
    name: '新渠道',
    preset: 'custom',
    baseUrl: '',
    apiKey: '',
    models: [],
    endpoints: {
      chat: '/chat/completions',
      image: '/images/generations',
      video: '/videos/generations',
      models: '/models'
    },
    mode: 'auto', // auto | direct | proxy
    ...cfg
  };
  state.channels.push(ch);
  commit();
  return ch;
}
export const getChannel = (id) => state.channels.find((c) => c.id === id) || null;

export function removeChannel(id) {
  state.channels = state.channels.filter((c) => c.id !== id);
  state.agents.forEach((a) => { if (a.channelId === id) a.channelId = ''; });
  state.nodes.forEach((n) => { if (n.data.channelId === id) n.data.channelId = ''; });
  commit();
}

export function addAgent(cfg = {}) {
  const ag = {
    id: uid('ag'),
    name: '新 Agent',
    role: '',
    channelId: '',
    model: '',
    systemPrompt: '你是一个专业的 AI 助手，请根据输入完成任务，回答简洁、结构化。',
    temperature: 0.7,
    color: '#7c5cff',
    ...cfg
  };
  state.agents.push(ag);
  commit();
  return ag;
}
export const getAgent = (id) => state.agents.find((a) => a.id === id) || null;

export function removeAgent(id) {
  state.agents = state.agents.filter((a) => a.id !== id);
  state.nodes.forEach((n) => {
    if (Array.isArray(n.data.agentIds)) n.data.agentIds = n.data.agentIds.filter((x) => x !== id);
    if (n.data.summarizerId === id) n.data.summarizerId = '';
  });
  commit();
}

/* ----------------------------------------------------------
 * 六、整体替换 / 导入导出 / 示例
 * ---------------------------------------------------------- */
export function replaceState(next) {
  Object.assign(state, emptyState(), next);
  resetHistory();
  save();
  notify();
}

export function reset() {
  Object.assign(state, emptyState());
  resetHistory();
  save();
  notify();
}

export function exportJSON() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    nodes: state.nodes,
    edges: state.edges,
    channels: state.channels,
    agents: state.agents
  }, null, 2);
}

export function importJSON(text) {
  const obj = JSON.parse(text);
  if (!obj || !Array.isArray(obj.nodes)) throw new Error('文件格式不正确：缺少 nodes');
  replaceState({
    nodes: obj.nodes || [],
    edges: obj.edges || [],
    channels: obj.channels || [],
    agents: obj.agents || [],
    viewport: state.viewport
  });
}

/** 首次使用时加载的示例流程 */
export function loadDemo() {
  const ch = addChannel({
    name: '示例渠道（待配置）',
    preset: 'custom',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: ['gpt-4o-mini', 'gpt-image-1']
  });
  const ag1 = addAgent({
    name: '创意总监',
    role: '发散创意方向',
    channelId: ch.id,
    model: 'gpt-4o-mini',
    systemPrompt: '你是资深创意总监，擅长把模糊需求拆解成 3 个具体、有画面感的视觉创意方向。输出使用中文，分点列出。',
    color: '#7c5cff'
  });
  const ag2 = addAgent({
    name: '提示词工程师',
    role: '创意转生图提示词',
    channelId: ch.id,
    model: 'gpt-4o-mini',
    systemPrompt: '你是提示词工程师，把创意描述改写成高质量英文生图提示词，包含主体、风格、光线、构图、画质词。只输出提示词本身。',
    color: '#4c8dff'
  });
  const ag3 = addAgent({
    name: '艺术指导',
    role: '审美把关与风格校正',
    channelId: ch.id,
    model: 'gpt-4o-mini',
    systemPrompt: '你是艺术指导，从构图、色彩、商业传播角度评估视觉方案，指出问题并给出改进建议。',
    color: '#ff7b4c'
  });

  const p = addNode('prompt', 40, 140, {
    text: '为一款国产能量饮料设计主视觉海报，面向年轻运动人群，要有力量感和未来感。'
  });
  const a1 = addNode('agent', 380, 60, {
    agentIds: [ag1.id],
    instruction: '基于需求给出 3 个创意方向。'
  });
  const a2 = addNode('agent', 780, 60, {
    agentIds: [ag2.id, ag3.id],
    summarizerId: ag2.id,
    instruction: '把上游最好的创意改写为英文生图提示词，并由艺术指导给出审校意见后进行汇总。'
  });
  const g = addNode('imagegen', 1180, 60, {
    instruction: '使用上游提示词生成主视觉海报',
    channelId: ch.id, model: 'gpt-image-1', size: '1024x1024', n: 1
  });
  addNode('note', 380, 470, {
    text:
      '👋 欢迎使用 Thunder Canvas\n\n' +
      '1. 右侧「渠道」填入 Base URL 与 API Key\n' +
      '2. 点「运行全部」看整条创作链路跑起来\n' +
      '3. 拖节点右侧圆点连线，自由编排流程\n' +
      '4. Agent 节点可挂多个 Agent：并行产出 + 汇总收敛\n' +
      '5. 顶栏「3D 画廊」用 Three.js 立体浏览创作成果'
  });

  addEdge(p.id, a1.id);
  addEdge(a1.id, a2.id);
  addEdge(a2.id, g.id);
  resetHistory();
  notify();
  save();
}
