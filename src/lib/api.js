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
