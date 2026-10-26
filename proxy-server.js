/**
 * proxy-server.js —— 本地 CORS 代理（零依赖，Node 原生 http）
 * ----------------------------------------------------------
 * 用途：部分 AI 中转站不允许浏览器跨域直连，导致画布调用报
 *       "Failed to fetch"。启动本代理后，把渠道 Base URL
 *       指向 http://localhost:8787，由它转发到真实服务并
 *       补上 CORS 响应头即可。
 *
 * 用法：
 *   1) 命令行指定目标（最简单）
 *      node proxy-server.js --target https://api.openai.com
 *      → 画布里 Base URL 填 http://localhost:8787/v1
 *
 *   2) 让画布自己带目标（推荐，可同时代理多个渠道）
 *      node proxy-server.js
 *      → 画布里 Base URL 填 http://localhost:8787/?target=https://api.openai.com/v1
 *
 *   3) 自定义端口
 *      node proxy-server.js --port 9000
 *
 * 安全提示：仅监听 127.0.0.1，不要暴露到公网。
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// 解析命令行参数
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
const PORT = parseInt(arg('port', '8787'), 10);
const DEFAULT_TARGET = arg('target', '');

const server = http.createServer((req, res) => {
  // ---- CORS 预检 ----
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  // ---- 解析目标地址 ----
  // 支持两种写法：
  //   a) URL 查询参数 ?target=https://xxx/v1
  //   b) 请求头 x-target: https://xxx/v1
  //   c) 启动参数 --target
  const u = new URL(req.url, 'http://localhost');
  const targetBase = u.searchParams.get('target')
    || req.headers['x-target']
    || DEFAULT_TARGET;

  if (!targetBase) {
    res.writeHead(400, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: '缺少目标地址。请在 URL 上加 ?target=https://your-api.com/v1 ，'
        + '或启动时使用 node proxy-server.js --target https://your-api.com/v1'
    }));
    return;
  }

  // 去掉 ?target 参数后拼接到目标
  u.searchParams.delete('target');
  const targetUrl = new URL(u.pathname + u.search, targetBase);

  // ---- 收集请求体 ----
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    const headers = {};
    Object.keys(req.headers).forEach((k) => {
      if (k === 'host' || k === 'origin' || k === 'referer') return;
      headers[k] = req.headers[k];
    });

    const options = {
      method: req.method,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      headers
    };

    const client = targetUrl.protocol === 'https:' ? https : http;
    const proxyReq = client.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, { ...proxyRes.headers, ...cors });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '代理请求失败: ' + err.message, target: targetUrl.href }));
    });

    if (body.length) proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ⚡ Thunder Canvas 本地代理已启动');
  console.log('  监听地址 : http://127.0.0.1:' + PORT);
  if (DEFAULT_TARGET) {
    console.log('  默认目标 : ' + DEFAULT_TARGET);
    console.log('  画布配置 : Base URL = http://localhost:' + PORT + '/v1');
  } else {
    console.log('  画布配置 : Base URL = http://localhost:' + PORT + '/?target=你的真实地址');
    console.log('  例       : http://localhost:' + PORT + '/?target=https://api.openai.com/v1');
  }
  console.log('');
});
