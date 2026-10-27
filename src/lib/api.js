/* ==========================================================
 * api.js —— OpenAI 兼容接口调用层
 * ----------------------------------------------------------
 * 设计目标：只要一个服务实现了 OpenAI 风格的 HTTP 接口，
 *   （chatgpt2api / grok2api / flow2api / newapi / DeepSeek /
 *    Moonshot / 智谱 / 硅基流动 / 火山方舟 / 各类中转站）
 *   就能通过「Base URL + API Key + 模型名」接入。
 *
 * 兼容策略：
 *   1. 路径自动探测：Base URL 带不带 /v1 都能工作（失败自动换候选）
 *   2. 端点可覆盖：每个渠道可单独指定 chat/image/video/models 路径
 *   3. 响应归一化：不同中转站返回结构不同，统一成 {text}/{images}/{videoUrl}
 *   4. CORS 兜底：mode=auto 时直连失败自动经公共代理重试
 * ========================================================== */

/* 公共 CORS 代理（兜底用，生产环境建议自建本地代理） */
const CORS_PROXIES = [
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://corsproxy.io/?' + encodeURIComponent(u)
];

/** 规范化 Base URL：去尾斜杠 */
export function normalizeBaseUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/+$/, '');
}

/**
 * 生成候选请求地址
 * 'https://x.com' + '/chat/completions'
 *   -> ['https://x.com/chat/completions', 'https://x.com/v1/chat/completions']
 * 'https://x.com/v1' + '/chat/completions'
 *   -> ['https://x.com/v1/chat/completions', 'https://x.com/chat/completions']
 */
export function candidateUrls(base, path) {
  const b = normalizeBaseUrl(base);
  const p = path.startsWith('/') ? path : '/' + path;
  const list = [b + p];
  if (/\/v\d+$/.test(b)) list.push(b.replace(/\/v\d+$/, '') + p);
  else list.push(b + '/v1' + p);
  return list.filter((u, i) => list.indexOf(u) === i);
}

/** 判断是否网络层错误（CORS / DNS / 连接失败），这类错误才值得换地址重试 */
export function isNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message || err);
  return /Failed to fetch|NetworkError|Network request failed|Load failed|CORS|blocked/i.test(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------
 * 核心请求
 * ---------------------------------------------------------- */
export async function request(channel, path, options = {}, ctrl = null) {
  const urls = candidateUrls(channel.baseUrl, path);
  let lastErr = null;

  const modes = channel.mode === 'proxy' ? ['proxy', 'direct']
    : channel.mode === 'direct' ? ['direct']
      : ['direct', 'proxy']; // auto

  for (const mode of modes) {
    for (const target of urls) {
      const attempts = mode === 'proxy' ? CORS_PROXIES.map((f) => f(target)) : [target];
      for (const url of attempts) {
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (channel.apiKey) headers['Authorization'] = 'Bearer ' + channel.apiKey;

          const init = {
            method: options.method || 'POST',
            headers,
            signal: ctrl ? ctrl.signal : undefined
          };
          if (options.body != null) init.body = JSON.stringify(options.body);

          const res = await fetch(url, init);

          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            const err = new Error(`HTTP ${res.status} ${(txt || res.statusText).slice(0, 300)}`);
            err.status = res.status;
            err.raw = txt;
            // 4xx（除 404/405）说明找到了服务但请求不对，换路径通常无意义
            if (res.status >= 400 && res.status < 500 && res.status !== 404 && res.status !== 405) throw err;
            lastErr = err;
            continue;
          }

          const ct = res.headers.get('content-type') || '';
          return ct.includes('application/json') ? await res.json() : await res.text();
        } catch (e) {
          lastErr = e;
          if (e && e.name === 'AbortError') throw e; // 用户取消，立刻上抛
        }
      }
    }
  }

  let msg = lastErr ? (lastErr.message || String(lastErr)) : '未知错误';
  if (isNetworkError(lastErr)) {
    msg += '\n\n【跨域/网络失败】浏览器被目标服务拒绝了跨域请求。可选方案：\n'
      + '1. 渠道「请求模式」改为 proxy（公共 CORS 代理）；\n'
      + '2. 本地运行 node proxy-server.js 自建代理；\n'
      + '3. 确认 Base URL 可公网访问。';
  }
  const finalErr = new Error(msg);
  finalErr.cause = lastErr;
  throw finalErr;
}

/* ----------------------------------------------------------
 * 一、文本对话  POST /chat/completions
 * ---------------------------------------------------------- */
export async function chat(channel, payload, ctrl = null) {
  const path = (channel.endpoints && channel.endpoints.chat) || '/chat/completions';
  const body = {
    model: payload.model,
    messages: payload.messages,
    temperature: payload.temperature != null ? payload.temperature : 0.7,
    stream: false
  };
  if (payload.max_tokens) body.max_tokens = payload.max_tokens;

  const data = await request(channel, path, { method: 'POST', body }, ctrl);
  if (typeof data === 'string') return { text: data, raw: data };

  let text = '';
  if (data.choices && data.choices[0]) {
    const c = data.choices[0];
    text = (c.message && c.message.content) || c.text || c.delta || '';
    if (Array.isArray(text)) {
      text = text.map((p) => (typeof p === 'string' ? p : (p.text || p.content || ''))).join('');
    }
  } else if (data.data && data.data.choices) {
    text = data.data.choices[0].message.content;
  } else {
    text = data.response || data.content || data.text || data.output_text || '';
  }
  return { text: String(text || '').trim(), raw: data };
}

/* ----------------------------------------------------------
 * 二、生成图片  POST /images/generations
 * ---------------------------------------------------------- */
export async function image(channel, payload, ctrl = null) {
  const path = (channel.endpoints && channel.endpoints.image) || '/images/generations';
  const body = {
    model: payload.model,
    prompt: payload.prompt,
    n: payload.n || 1,
    size: payload.size || '1024x1024'
  };
  // 图生图：不同服务字段不同，全部带上提高命中率
  if (payload.image) {
    body.image = payload.image;
    body.images = [payload.image];
    body.image_url = payload.image;
  }
  const data = await request(channel, path, { method: 'POST', body }, ctrl);
  return normalizeImages(data);
}

/** 各种返回体 → 图片 URL / dataURL 数组 */
export function normalizeImages(data) {
  let items = [];
  if (typeof data === 'string') {
    if (/^https?:\/\//.test(data.trim())) items = [{ url: data.trim() }];
    else return [];
  } else if (Array.isArray(data && data.data)) items = data.data;
  else if (Array.isArray(data && data.images)) items = data.images;
  else if (data && data.url) items = [data];
  else if (data && data.image) items = [{ url: data.image }];

  const out = [];
  items.forEach((it) => {
    if (!it) return;
    let u = null;
    if (it.url) u = it.url;
    else if (it.b64_json) u = 'data:image/png;base64,' + it.b64_json;
    else if (it.image) u = it.image;
    else if (typeof it === 'string') u = /^https?:/.test(it) ? it : 'data:image/png;base64,' + it;
    if (u) out.push(u);
  });
  return out;
}

/* ----------------------------------------------------------
 * 三、生成视频  POST /videos/generations（异步任务）
 * ---------------------------------------------------------- */
export async function video(channel, payload, ctrl = null, onProgress = null) {
  const path = (channel.endpoints && channel.endpoints.video) || '/videos/generations';
  const body = { model: payload.model, prompt: payload.prompt };
  if (payload.image) { body.image = payload.image; body.image_url = payload.image; }
  if (payload.duration) body.duration = payload.duration;

  const data = await request(channel, path, { method: 'POST', body }, ctrl);

  const direct = extractVideoUrl(data);
  if (direct) return { videoUrl: direct, raw: data };

  const jobId = (data && (data.id || data.job_id || data.task_id
    || (data.data && (data.data.id || data.data.job_id)))) || null;
  if (!jobId) throw new Error('视频接口未返回视频地址或任务 ID：' + JSON.stringify(data).slice(0, 300));

  if (onProgress) onProgress('任务已提交，ID=' + jobId + '，开始轮询…');

  const maxWait = 5 * 60 * 1000;
  const interval = 5000;
  let waited = 0;
  while (waited < maxWait) {
    await sleep(interval);
    waited += interval;
    if (ctrl && ctrl.signal && ctrl.signal.aborted) throw new Error('已取消');

    let st;
    try {
      st = await request(channel, path + '/' + jobId, { method: 'GET' }, ctrl);
    } catch (e) {
      st = await request(channel, '/videos/' + jobId, { method: 'GET' }, ctrl);
    }
    const url = extractVideoUrl(st);
    if (url) return { videoUrl: url, raw: st };
    const status = (st && (st.status || (st.data && st.data.status))) || '';
    if (/fail|error|cancel/i.test(status)) throw new Error('视频生成失败：' + JSON.stringify(st).slice(0, 300));
    if (onProgress) onProgress(`生成中…（${Math.round(waited / 1000)}s，状态：${status || 'processing'}）`);
  }
  throw new Error('视频生成超时（5 分钟），任务 ID=' + jobId);
}

function extractVideoUrl(data) {
  if (!data) return null;
  if (typeof data === 'string' && /^https?:\/\//.test(data.trim())) return data.trim();
  const cand = [
    data.url, data.video_url, data.videoUrl, data.output,
    data.data && (data.data.url || data.data.video_url || data.data.videoUrl || data.data.output),
    data.data && data.data[0] && (data.data[0].url || data.data[0].video_url),
    data.result && data.result.url
  ];
  for (const c of cand) {
    if (typeof c === 'string' && /^https?:\/\//.test(c)) return c;
    if (Array.isArray(c) && c.length && c[0].url) return c[0].url;
  }
  return null;
}

/* ----------------------------------------------------------
 * 四、模型列表  GET /models
 * ---------------------------------------------------------- */
export async function models(channel, ctrl = null) {
  const path = (channel.endpoints && channel.endpoints.models) || '/models';
  const data = await request(channel, path, { method: 'GET' }, ctrl);
  let list = [];
  if (Array.isArray(data && data.data)) list = data.data;
  else if (Array.isArray(data)) list = data;
  return list.map((m) => m.id || m.name || m.model || String(m)).filter(Boolean);
}

/* ----------------------------------------------------------
 * 五、连通性测试
 * ---------------------------------------------------------- */
export async function test(channel) {
  if (!channel.baseUrl) throw new Error('请先填写 Base URL');
  let list = [];
  try {
    list = await models(channel);
  } catch (e) {
    if (isNetworkError(e)) throw e; // 网络错误视为不通
  }
  return { ok: true, models: list, count: list.length };
}

/* ==========================================================
 * 六、自定义请求模板（接入非 OpenAI 协议的服务）
 * ----------------------------------------------------------
 * 可灵 / 海螺 / Runway / Luma / 火山 Seedance 等都有自己的
 * 请求格式和异步轮询流程。用模板描述一次调用即可接入：
 *
 * {
 *   submitUrl:    'https://api.xxx.com/v1/generate',
 *   submitHeaders:'{"X-Version":"2024-11-06"}',     // 可选，JSON
 *   submitBody:   '{"model":"{{model}}","prompt":"{{prompt}}"}',
 *   taskIdPath:   'data.task_id',                    // 异步任务 ID 位置
 *   pollUrl:      'https://api.xxx.com/v1/tasks/{{taskId}}',
 *   resultPath:   'data.videos.0.url',               // 结果地址位置
 *   statusPath:   'data.status',
 *   doneValues:   ['succeed'],
 *   failValues:   ['failed']
 * }
 *
 * 占位符：{{key}} {{model}} {{prompt}} {{size}} {{n}}
 *        {{image}} {{taskId}} {{groupId}} {{duration}}
 * ========================================================== */

/** 渲染模板里的 {{占位符}} */
function renderTpl(str, vars) {
  if (!str) return '';
  return String(str).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (vars[k] != null ? vars[k] : ''));
}

/** 把值做 JSON 字符串转义（避免 prompt 里的引号破坏 JSON） */
function jsonEsc(s) {
  return JSON.stringify(String(s == null ? '' : s)).slice(1, -1);
}

/** 简易 JSON Path 取值：'data.0.url' */
function pickPath(obj, path) {
  if (!path || obj == null) return null;
  return String(path).split('.').reduce((o, k) => {
    if (o == null) return null;
    return o[k];
  }, obj);
}

/**
 * 执行一次自定义模板调用
 * @returns {Promise<{images?: string[], videoUrl?: string, raw?: any}>}
 */
export async function customGenerate(channel, template, vars, ctrl = null, onProgress = null) {
  if (!template || !template.submitUrl) {
    throw new Error('该渠道没有配置「请求模板」，请在渠道设置的高级选项里填写提交地址');
  }

  const fullVars = { ...vars, key: channel.apiKey || '' };

  // ---- 1. 提交任务 ----
  const submitUrl = renderTpl(template.submitUrl, fullVars);
  const headers = { 'Content-Type': 'application/json' };
  if (channel.apiKey) headers['Authorization'] = 'Bearer ' + channel.apiKey;
  if (template.submitHeaders) {
    try {
      Object.assign(headers, JSON.parse(renderTpl(template.submitHeaders, fullVars)));
    } catch (e) { /* 头模板写错就忽略，不阻塞主流程 */ }
  }

  let bodyObj = null;
  if (template.submitBody) {
    const rendered = renderTpl(template.submitBody, {
      ...fullVars,
      prompt: jsonEsc(vars.prompt),   // prompt 先转义再塞进 JSON
      image: jsonEsc(vars.image || ''),
    });
    try {
      bodyObj = JSON.parse(rendered);
    } catch (e) {
      throw new Error('请求模板的 body 不是合法 JSON：' + e.message);
    }
  }

  const res = await fetch(submitUrl, {
    method: 'POST',
    headers,
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    signal: ctrl ? ctrl.signal : undefined
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = text; }

  if (!res.ok) {
    throw new Error(`提交失败 HTTP ${res.status}：${String(text).slice(0, 300)}`);
  }

  // ---- 2. 同步返回？ ----
  const syncResult = pickPath(data, template.resultPath);
  if (syncResult && !template.pollUrl) {
    return normalizeByResult(template.resultPath, syncResult);
  }

  // ---- 3. 异步：取任务 ID 并轮询 ----
  const taskId = pickPath(data, template.taskIdPath);
  if (!taskId) {
    // 有些服务同步返回数组
    if (syncResult) return normalizeByResult(template.resultPath, syncResult);
    throw new Error('模板未取到任务 ID，返回体：' + JSON.stringify(data).slice(0, 300));
  }

  if (onProgress) onProgress('任务已提交（' + taskId + '），等待生成…');

  const pollUrlTpl = template.pollUrl || template.submitUrl + '/{{taskId}}';
  const maxWait = 6 * 60 * 1000;
  const interval = 5000;
  let waited = 0;

  while (waited < maxWait) {
    await sleep(interval);
    waited += interval;
    if (ctrl && ctrl.signal && ctrl.signal.aborted) throw new Error('已取消');

    const purl = renderTpl(pollUrlTpl, { ...fullVars, taskId });
    const pres = await fetch(purl, {
      method: 'GET',
      headers: channel.apiKey ? { Authorization: 'Bearer ' + channel.apiKey } : {},
      signal: ctrl ? ctrl.signal : undefined
    });
    const ptext = await pres.text();
    let pdata;
    try { pdata = JSON.parse(ptext); } catch (e) { pdata = ptext; }

    const status = String(pickPath(pdata, template.statusPath) || '').toLowerCase();
    const failVals = (template.failValues || []).map((v) => String(v).toLowerCase());
    if (failVals.includes(status)) {
      throw new Error('生成失败：' + JSON.stringify(pdata).slice(0, 300));
    }

    const out = pickPath(pdata, template.resultPath);
    if (out && typeof out === 'string' && out.length > 0) {
      return normalizeByResult(template.resultPath, out);
    }

    if (onProgress) onProgress('生成中… ' + Math.round(waited / 1000) + 's（' + (status || 'processing') + '）');
  }
  throw new Error('生成超时（6 分钟），任务 ID=' + taskId);
}

/** 依据结果路径判断是图片还是视频 */
function normalizeByResult(path, value) {
  const p = String(path || '').toLowerCase();
  const v = String(value);
  if (/video|mp4|\.webm|\.mov/.test(p) || /\.(mp4|webm|mov)(\?|$)/.test(v)) {
    return { videoUrl: v };
  }
  if (Array.isArray(value)) {
    return { images: value.filter((x) => typeof x === 'string') };
  }
  if (/^(https?:\/\/|data:image)/.test(v)) {
    return { images: [v] };
  }
  return { images: [v] };
}
