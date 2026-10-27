# ⚡ 雷霆画布（Thunder Canvas）

面向 AI 创作的**无限画布工作台**：把「创作流程可视化编排 + 多 Agent 协同 + OpenAI 兼容接口生态」放在同一张画布上。

> 技术栈：**Vite + React 18 + Canvas2D + Three.js**

---

## 一、核心能力

### 1. 无限画布与可视化创作流程编排
- 无限平移 / 缩放（滚轮以鼠标为锚点，15% ~ 400%）
- 7 种节点：便签、提示词、图片、AI 对话、AI 生图、AI 生视频、Agent
- 拖拽节点右侧圆点即可连线，自动阻止自环与环路
- 框选多选、拖动移动、右下角拉伸、复制 / 删除
- 撤销重做（Ctrl+Z / Ctrl+Shift+Z）、JSON 导入导出、localStorage 自动保存
- 小地图快速定位、一键适应视图

### 2. 执行引擎：把画布当 DAG 跑起来
- **拓扑分层 + 同层并行**：无依赖的分支同时执行，逐层推进
- **上下文自动传递**：上游节点的文本 / 图片 / 视频输出自动拼成下游输入
- 节点状态实时高亮（执行中 / 完成 / 失败），连线有流光动画指示数据流向
- 可随时中断（AbortController）
- 支持「运行全部」与「运行选中（含其下游）」

### 3. 多 Agent 协同
Agent 节点可挂载**多个 Agent**，执行时：

```
             ┌─→ Agent A（创意总监）──┐
输入 ────────┼─→ Agent B（提示词工程师）┼──→ 汇总 Agent ──→ 唯一结论
             └─→ Agent C（艺术指导）──┘
```

- 第一步：所有 Agent **并行**调用，各自带着自己的角色与系统提示词分头产出
- 第二步：可选指定「汇总 Agent」，把多方结果收敛为唯一结论
- 每个 Agent 可绑定**不同渠道、不同模型**（例如创意用 Claude、改图用 GPT、审校用国产模型）

### 4. 兼容 OpenAI 接口生态 ✅
只要一个服务实现了 OpenAI 风格的 HTTP 接口，就能接入。已内置模板：

| 渠道 | 说明 |
|---|---|
| OpenAI 官方 | `https://api.openai.com/v1` |
| **chatgpt2api** | 本地转发 ChatGPT Web |
| **grok2api** | 本地转发 Grok |
| **flow2api** | 本地转发 Flow |
| **newapi** / 聚合站 | 通用 OpenAI 聚合 |
| DeepSeek / Moonshot / 智谱 GLM / 硅基流动 / 火山方舟 | 国内主流 |
| 自定义 | 任意 OpenAI 兼容接口 |

**兼容策略（关键）**：
1. **路径自动探测** —— Base URL 带不带 `/v1` 都能工作，失败自动尝试另一种写法
2. **端点可覆盖** —— 每个渠道可单独指定 chat / image / video / models 路径，适配路径不规范的中转站
3. **响应归一化** —— 不同中转站返回结构不同，统一解析成文本 / 图片 / 视频
4. **CORS 兜底** —— `auto` 模式下直连失败自动经公共代理重试

### 5. Three.js 3D 画廊
顶栏「🌀 3D 画廊」把画布上生成的图片/视频放进 3D 空间立体浏览，
支持环形与画廊墙两种布局、拖拽旋转、点击展板回跳 2D 画布并定位节点。

### 6. Canvas2D 渲染层
- **网格背景**：Canvas2D 绘制，缩放时自动切换层级密度（类似 Figma）
- **连线层**：Canvas2D 贝塞尔曲线 + 执行流光动画 + 曲线命中检测
- **小地图**：Canvas2D 实时绘制节点分布与视口框

> 为什么节点用 DOM 而不是 Canvas：节点内需要 textarea 编辑、图片预览、
> 滚动、复制等原生交互，DOM 更合适——这也是 Figma / tldraw 的通用取舍。

---

## 二、快速开始

```bash
# 安装依赖（npm 异常时可用 yarn / pnpm / bun）
npm install

# 开发
npm run dev          # http://localhost:5173

# 构建
npm run build
npm run preview
```

首次打开会自动载入示例流程。**开始使用前**：右侧「渠道」页 → 双击示例渠道
（或新建）→ 填入你的 `Base URL` 与 `API Key` → 点「拉模型」→ 回画布点「运行全部」。

---

## 三、接入各类中转站

### 一般情况（服务允许跨域）
直接填 Base URL + Key，请求模式选 `auto` 即可。

### 报跨域错误（Failed to fetch）
浏览器直连被目标服务的 CORS 策略拦截，三种解法：

**方案 1**：渠道「请求模式」改为 `proxy`（走公共 CORS 代理）

**方案 2（推荐）**：跑项目自带的本地代理

```bash
node proxy-server.js --target https://your-api.com
# 画布 Base URL 填：http://localhost:8787/v1
```

或让一个代理同时服务多个渠道：

```bash
node proxy-server.js
# 画布 Base URL 填：http://localhost:8787/?target=https://your-api.com/v1
```

**方案 3**：目标服务自身开启 CORS 白名单

### 路径不规范的服务
在渠道编辑弹窗勾选「高级：自定义端点路径」，分别指定：

```
对话端点   /chat/completions
生图端点   /images/generations
视频端点   /videos/generations
模型端点   /models
```

---

## 四、快捷键

| 快捷键 | 功能 |
|---|---|
| 滚轮 | 缩放（以鼠标为锚点） |
| 空格 / 中键 / 右键拖拽 | 平移画布 |
| 左键拖拽空白 | 框选 |
| 拖节点右侧圆点 | 连线 |
| `Delete` | 删除选中 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销 / 重做 |
| `Ctrl+A` | 全选 |
| `Ctrl+D` | 复制选中 |
| `Ctrl+S` | 导出 JSON |
| `Ctrl+1` | 适应视图 |
| `Esc` | 取消选择 / 关闭弹窗 |

---

## 五、项目结构

```
thunder-canvas/
├── index.html              # Vite 入口
├── vite.config.js
├── proxy-server.js         # 本地 CORS 代理（零依赖）
└── src/
    ├── main.jsx
    ├── App.jsx             # 画布主容器：视口 / 交互 / 调度
    ├── styles.css
    ├── lib/
    │   ├── store.js        # 状态中心：节点 / 连线 / 渠道 / Agent / 撤销重做
    │   ├── api.js          # OpenAI 兼容接口层（含路径探测与响应归一化）
    │   ├── engine.js       # DAG 执行引擎：拓扑分层 + 并行 + 上下文传递
    │   └── useStore.js     # React 订阅桥接
    ├── canvas/
    │   ├── GridCanvas.jsx  # Canvas2D 网格背景
    │   ├── EdgeCanvas.jsx  # Canvas2D 连线层（含流光动画）
    │   ├── Minimap.jsx     # Canvas2D 小地图
    │   ├── Gallery3D.jsx   # Three.js 3D 画廊
    │   └── geometry.js     # 贝塞尔几何与命中检测
    └── components/
        ├── Topbar.jsx      # 顶部工具栏
        ├── Sidebar.jsx     # 节点库 / Agent / 渠道
        ├── NodeCard.jsx    # 节点卡片（DOM 渲染）
        ├── Inspector.jsx   # 右侧属性面板
        ├── Modals.jsx      # 渠道 / Agent 编辑弹窗
        └── Toasts.jsx
```

---

## 六、数据安全

- API Key、画布数据、生成记录**全部保存在浏览器 localStorage**，不会上传到任何服务器
- 浏览器前台直连你配置的接口，请求不经过任何第三方中转（除非你主动选择 proxy 模式）
- 导出 JSON 可自行备份 / 迁移

---

## 七、已知边界

- **本地 Agent / MCP / Codex 插件**：原项目通过本机常驻进程 + MCP 实现，
  纯前端网页无法直接操作本地进程，本版本未包含该能力。
- **视频生成**：各家异步任务协议不统一，已做「返回地址直取 + 任务 ID 轮询」双路径兼容，
  极端定制化服务可能需要在高级设置里调整端点。
- 项目处于开发阶段，不保证历史存储格式兼容，重要数据请及时导出 JSON。

---

MIT License
