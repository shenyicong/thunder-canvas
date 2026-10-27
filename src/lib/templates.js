/* ==========================================================
 * templates.js —— 工作流模板库（对标 RunningHub 的「模板市场」）
 * ----------------------------------------------------------
 * 每个模板是一个完整的可运行工作流：
 *   - channels：推荐渠道（按 alias 复用 / 新建，默认留空 Key 由用户填）
 *   - agents  ：协同 Agent（按 alias 复用 / 新建）
 *   - nodes   ：节点（data 里的 channelId / agentIds / summarizerId
 *               用上面的 alias 引用）
 *   - edges   ：连线（用 nodes 的下标 [源, 目标]）
 * 内置 5 个模板；用户可「把当前画布存为模板」存在 localStorage。
 * ========================================================== */

export const BUILTIN_TEMPLATES = [
  /* ---------------- 1. 文生图 ---------------- */
  {
    key: 'txt2img',
    name: '文生图',
    icon: '🎨',
    desc: '从一段文字描述直接生成一张图，最快上手。',
    tags: ['生图', '入门'],
    channels: [
      { alias: 'sf', providerKey: 'siliconflow', name: '硅基流动（填 Key）',
        supports: ['chat', 'image'], models: ['Kwai-Kolors/Kolors', 'Qwen/Qwen-Image', 'Qwen/Qwen2.5-72B-Instruct'] }
    ],
    agents: [],
    nodes: [
      { type: 'prompt', x: 40, y: 80, data: { text: '一只在雨后上海街角喝咖啡的橘猫，霓虹灯牌，电影感，8K' } },
      { type: 'imagegen', x: 420, y: 40, data: { channelId: 'sf', model: 'Kwai-Kolors/Kolors', size: '1024x1024', n: 1, instruction: '' } }
    ],
    edges: [[0, 1]]
  },

  /* ---------------- 2. 提示词工程流水线（多 Agent） ---------------- */
  {
    key: 'prompt-pipe',
    name: '提示词工程流水线',
    icon: '🧠',
    desc: '需求 → 创意 → 提示词 → 生图，多 Agent 协同改写与审校。',
    tags: ['多Agent', '生图'],
    channels: [
      { alias: 'sf', providerKey: 'siliconflow', name: '硅基流动（填 Key）',
        supports: ['chat', 'image'], models: ['Qwen/Qwen2.5-72B-Instruct', 'Kwai-Kolors/Kolors', 'Qwen/Qwen-Image'] }
    ],
    agents: [
      { alias: 'a1', name: '创意总监', role: '发散创意方向', channelId: 'sf', model: 'Qwen/Qwen2.5-72B-Instruct',
        color: '#7c5cff', systemPrompt: '你是资深创意总监，擅长把模糊需求拆解成 3 个具体、有画面感的视觉创意方向。输出使用中文，分点列出。' },
      { alias: 'a2', name: '提示词工程师', role: '创意转生图提示词', channelId: 'sf', model: 'Qwen/Qwen2.5-72B-Instruct',
        color: '#4c8dff', systemPrompt: '你是提示词工程师，把创意描述改写成高质量英文生图提示词，包含主体、风格、光线、构图、画质词。只输出提示词本身。' },
      { alias: 'a3', name: '艺术指导', role: '审美把关与风格校正', channelId: 'sf', model: 'Qwen/Qwen2.5-72B-Instruct',
        color: '#ff7b4c', systemPrompt: '你是艺术指导，从构图、色彩、商业传播角度评估视觉方案，指出问题并给出改进建议。' }
    ],
    nodes: [
      { type: 'prompt', x: 40, y: 120, data: { text: '为一款国产能量饮料设计主视觉海报，面向年轻运动人群，要有力量感和未来感。' } },
      { type: 'agent', x: 420, y: 40, data: { agentIds: ['a1'], instruction: '基于需求给出 3 个创意方向。' } },
      { type: 'agent', x: 840, y: 40, data: { agentIds: ['a2', 'a3'], summarizerId: 'a2', instruction: '把上游最好的创意改写为英文生图提示词，并由艺术指导给出审校意见后汇总。' } },
      { type: 'imagegen', x: 1260, y: 40, data: { channelId: 'sf', model: 'Kwai-Kolors/Kolors', size: '1024x1024', n: 1, instruction: '使用上游提示词生成主视觉海报' } },
      { type: 'output', x: 1260, y: 440, data: {} }
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]]
  },

  /* ---------------- 3. 图生视频一条龙 ---------------- */
  {
    key: 'img2video',
    name: '图生视频一条龙',
    icon: '🎬',
    desc: '文字 → 生图 → 生视频，一条龙出片（火山方舟）。',
    tags: ['生图', '视频'],
    channels: [
      { alias: 'volc', providerKey: 'volc', name: '火山方舟（填 Key）', protocol: 'custom',
        supports: ['chat', 'image', 'video'],
        models: ['doubao-seedream-3-0-t2i-250415', 'doubao-seedance-1-0-pro-250528', 'doubao-pro-32k'] }
    ],
    agents: [],
    nodes: [
      { type: 'prompt', x: 40, y: 80, data: { text: '一只赛博朋克风格的城市飞行器，霓虹光轨，电影感镜头' } },
      { type: 'imagegen', x: 420, y: 40, data: { channelId: 'volc', model: 'doubao-seedream-3-0-t2i-250415', size: '1024x1024', n: 1, instruction: '' } },
      { type: 'videogen', x: 820, y: 40, data: { channelId: 'volc', model: 'doubao-seedance-1-0-pro-250528', instruction: '' } },
      { type: 'output', x: 820, y: 440, data: {} }
    ],
    edges: [[0, 1], [1, 2], [2, 3]]
  },

  /* ---------------- 4. 多模态写真 ---------------- */
  {
    key: 'portrait',
    name: '多模态写真',
    icon: '📸',
    desc: '上传参考图 → 参考生图 → 参考生视频，做数字写真。',
    tags: ['图生图', '视频', '写真'],
    channels: [
      { alias: 'volc', providerKey: 'volc', name: '火山方舟（填 Key）', protocol: 'custom',
        supports: ['chat', 'image', 'video'],
        models: ['doubao-seedream-3-0-t2i-250415', 'doubao-seedance-1-0-lite-i2v-250428', 'doubao-pro-32k'] }
    ],
    agents: [],
    nodes: [
      { type: 'image', x: 40, y: 80, data: { src: '', caption: '参考人物 / 风格图（点击上传）' } },
      { type: 'imagegen', x: 420, y: 40, data: { channelId: 'volc', model: 'doubao-seedream-3-0-t2i-250415', size: '1024x1024', n: 1, instruction: '基于参考图生成同风格的高质感写真，保持人物特征' } },
      { type: 'videogen', x: 820, y: 40, data: { channelId: 'volc', model: 'doubao-seedance-1-0-lite-i2v-250428', instruction: '让画面中的人物轻微转头、发丝飘动，自然运镜' } },
      { type: 'output', x: 820, y: 440, data: {} }
    ],
    edges: [[0, 1], [1, 2], [2, 3]]
  },

  /* ---------------- 5. 短视频流水线（含超分） ---------------- */
  {
    key: 'short-video',
    name: '短视频流水线',
    icon: '🚀',
    desc: '文字 → 生图 → 超清放大 → 生视频 → 汇总，适合做短视频素材。',
    tags: ['生图', '视频', '超分'],
    channels: [
      { alias: 'volc', providerKey: 'volc', name: '火山方舟（填 Key）', protocol: 'custom',
        supports: ['chat', 'image', 'video'],
        models: ['doubao-seedream-3-0-t2i-250415', 'doubao-seedance-1-0-pro-250528', 'doubao-pro-32k'] }
    ],
    agents: [],
    nodes: [
      { type: 'prompt', x: 40, y: 100, data: { text: '国风仙侠少年，御剑飞行于云海之上，朝阳金光，水墨意境' } },
      { type: 'imagegen', x: 420, y: 40, data: { channelId: 'volc', model: 'doubao-seedream-3-0-t2i-250415', size: '1024x1024', n: 1, instruction: '' } },
      { type: 'upscale', x: 820, y: 40, data: { channelId: 'volc', scale: '4x', instruction: '' } },
      { type: 'videogen', x: 1220, y: 40, data: { channelId: 'volc', model: 'doubao-seedance-1-0-pro-250528', instruction: '镜头缓慢推进，云海流动，仙气缭绕' } },
      { type: 'output', x: 1220, y: 440, data: {} }
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]]
  }
];

/* ----------------------------------------------------------
 * 用户模板：存本地 localStorage
 * ---------------------------------------------------------- */
const USER_KEY = 'thunder-canvas:user-templates';

export function getUserTemplates() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

export function saveUserTemplate(tpl) {
  const list = getUserTemplates();
  const next = list.filter((t) => t.key !== tpl.key).concat(tpl);
  try { localStorage.setItem(USER_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  return next;
}

export function deleteUserTemplate(key) {
  const next = getUserTemplates().filter((t) => t.key !== key);
  try { localStorage.setItem(USER_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
  return next;
}

/** 按 key 解析模板：内置优先，其次用户模板 */
export function resolveTemplate(key) {
  return BUILTIN_TEMPLATES.find((t) => t.key === key)
    || getUserTemplates().find((t) => t.key === key)
    || null;
}
