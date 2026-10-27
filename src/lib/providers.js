/* ==========================================================
 * providers.js —— 模型服务商目录
 * ----------------------------------------------------------
 * 每个服务商描述：
 *   protocol  'openai' —— 标准 OpenAI 路径，填 Key 即用
 *             'custom' —— 自有协议，用 templates 里的请求模板
 *   supports  该服务商能做的能力：chat / image / video
 *   models    各类能力的模型建议（可下拉选择，也可手填）
 *   templates 自有协议的请求模板（{{prompt}} 等占位符）
 *
 * 说明：模型 ID 各平台会更新，选完可点「拉模型」从 /models
 *       自动获取真实列表，因此这里给的是常见可用值。
 * ========================================================== */

export const PROVIDERS = [
  /* ==================== 生图 / 文本：OpenAI 兼容 ==================== */
  {
    key: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    tag: '⭐ 推荐 · 国内直连 · 新用户送额度',
    baseUrl: 'https://api.siliconflow.cn/v1',
    signup: 'https://cloud.siliconflow.cn',
    protocol: 'openai',
    supports: ['chat', 'image'],
    models: {
      image: ['Kwai-Kolors/Kolors', 'Qwen/Qwen-Image', 'black-forest-labs/FLUX.1-schnell', 'stabilityai/stable-diffusion-3-5-large'],
      chat: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3']
    },
    note: '一个 Key 同时用 FLUX、Kolors、Qwen-Image，国内访问稳定'
  },
  {
    key: 'zhipu',
    name: '智谱 BigModel',
    tag: '国内直连 · 有免费额度',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    signup: 'https://open.bigmodel.cn',
    protocol: 'openai',
    supports: ['chat', 'image', 'video'],
    models: {
      image: ['cogview-4', 'cogview-3-flash'],
      chat: ['glm-4-flash', 'glm-4-plus'],
      video: ['cogvideox-3', 'cogvideox-2']
    },
    note: 'CogView-4 生图 + CogVideoX 生视频，glm-4-flash 免费',
    templates: {
      video: {
        submitUrl: 'https://open.bigmodel.cn/api/paas/v4/videos/generations',
        submitBody: '{"model":"{{model}}","prompt":"{{prompt}}"}',
        taskIdPath: 'id',
        pollUrl: 'https://open.bigmodel.cn/api/paas/v4/videos/generations/{{taskId}}',
        resultPath: 'video_result.0.url',
        statusPath: 'task_status',
        doneValues: ['SUCCESS'],
        failValues: ['FAIL']
      }
    }
  },
  {
    key: 'volc',
    name: '火山方舟（豆包）',
    tag: '国内直连 · 图像+视频都能做',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    signup: 'https://console.volcengine.com/ark',
    protocol: 'openai',
    supports: ['chat', 'image', 'video'],
    models: {
      image: ['doubao-seedream-3-0-t2i-250415'],
      chat: ['doubao-pro-32k'],
      video: [
        'doubao-seedance-1-0-pro-250528',
        'doubao-seedance-1-0-lite-t2v-250428',
        'doubao-seedance-1-0-lite-i2v-250428'
      ]
    },
    note: 'Seedream 生图 + Seedance 生视频；视频走自有异步协议，已内置模板',
    templates: {
      video: {
        submitUrl: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
        submitBody: '{"model":"{{model}}","content":[{"type":"text","text":"{{prompt}}"}]}',
        taskIdPath: 'id',
        pollUrl: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{{taskId}}',
        resultPath: 'content.video_url',
        statusPath: 'status',
        doneValues: ['succeeded', 'success'],
        failValues: ['failed', 'canceled']
      }
    }
  },
  {
    key: 'dashscope',
    name: '阿里百炼（通义万相）',
    tag: '国内直连 · 图+视频',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    signup: 'https://bailian.console.aliyun.com',
    protocol: 'openai',
    supports: ['chat', 'image', 'video'],
    models: {
      image: ['wanx2.1-t2i-turbo', 'wanx2.1-t2i-plus'],
      chat: ['qwen-plus', 'qwen-max'],
      video: ['wan2.2-t2v-plus', 'wan2.2-t2v-flash', 'wan2.2-i2v-plus']
    },
    note: '万相生图 + 通义万相生视频（走原生异步协议，模板已内置）',
    templates: {
      video: {
        submitUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        submitHeaders: '{"X-DashScope-Async":"enable"}',
        submitBody: '{"model":"{{model}}","input":{"prompt":"{{prompt}}"}}',
        taskIdPath: 'output.task_id',
        pollUrl: 'https://dashscope.aliyuncs.com/api/v1/tasks/{{taskId}}',
        resultPath: 'output.video_url',
        statusPath: 'output.task_status',
        doneValues: ['SUCCEEDED'],
        failValues: ['FAILED', 'CANCELED']
      }
    }
  },
  {
    key: 'openai',
    name: 'OpenAI 官方',
    tag: '需海外网络',
    baseUrl: 'https://api.openai.com/v1',
    signup: 'https://platform.openai.com',
    protocol: 'openai',
    supports: ['chat', 'image', 'video'],
    models: {
      image: ['gpt-image-1', 'gpt-image-1-mini', 'dall-e-3'],
      chat: ['gpt-4o-mini', 'gpt-4o'],
      video: ['sora-2', 'sora-2-pro']    },
    note: 'gpt-image-1 质量最好；Sora 走 /videos 异步任务'
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    tag: '纯文本 · 便宜',
    baseUrl: 'https://api.deepseek.com/v1',
    signup: 'https://platform.deepseek.com',
    protocol: 'openai',
    supports: ['chat'],
    models: { chat: ['deepseek-chat', 'deepseek-reasoner'] },
    note: '只做文本，适合 Agent 的推理与文案环节'
  },
  {
    key: 'moonshot',
    name: 'Moonshot 月之暗面',
    tag: '纯文本 · 中文强',
    baseUrl: 'https://api.moonshot.cn/v1',
    signup: 'https://platform.moonshot.cn',
    protocol: 'openai',
    supports: ['chat'],
    models: { chat: ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-latest'] },
    note: '长文本理解好，适合做 Agent 汇总'
  },

  /* ==================== 聚合站（一个 Key 通吃） ==================== */
  {
    key: 'newapi',
    name: 'newapi / 自建聚合站',
    tag: '一个 Key 通吃多家',
    baseUrl: 'https://your-domain.com/v1',
    signup: '',
    protocol: 'openai',
    supports: ['chat', 'image', 'video'],
    models: {
      image: ['gpt-image-1', 'flux-pro-1.1'],
      chat: ['gpt-4o-mini'],
      video: ['sora-2', 'kling-v2-master', 'veo3', 'hailuo-02', 'wan2.2-t2v-plus']
    },
    note: '填你自己的中转站地址，模型名以站点支持为准'
  },
  {
    key: '302ai',
    name: '302.AI 聚合',
    tag: '一站式 · 图像视频都有',
    baseUrl: 'https://api.302.ai/v1',
    signup: 'https://302.ai',
    protocol: 'openai',
    supports: ['chat', 'image', 'video'],
    models: {
      image: ['gpt-image-1', 'flux-pro-1.1', 'seedream-3.0'],
      chat: ['gpt-4o-mini', 'claude-sonnet-4', 'deepseek-v3'],
      video: ['kling-v2-master', 'hailuo-02', 'veo3', 'seedance-1-0-pro', 'wan2.2-t2v-plus', 'vidu-q1']
    },
    note: '一个 Key 调各家模型，适合不想逐个注册的情况'
  },

  /* ==================== 生视频：自有协议（模板已内置） ==================== */
  {
    key: 'minimax',
    name: 'MiniMax 海螺',
    tag: '视频 · 自有协议',
    baseUrl: 'https://api.minimax.chat/v1',
    signup: 'https://platform.minimaxi.com',
    protocol: 'custom',
    supports: ['chat', 'video'],
    models: { chat: ['abab6.5s-chat'], video: ['MiniMax-Hailuo-02', 'T2V-01', 'T2V-01-Director', 'I2V-01', 'video-01'] },
    note: '海螺视频，已内置异步任务模板',
    templates: {
      video: {
        submitUrl: 'https://api.minimax.chat/v1/video_generation?GroupId={{groupId}}',
        submitBody: '{"model":"{{model}}","prompt":"{{prompt}}"}',
        taskIdPath: 'task_id',
        pollUrl: 'https://api.minimax.chat/v1/query/video_generation?task_id={{taskId}}',
        resultPath: 'file_id',
        statusPath: 'status',
        doneValues: ['Success'],
        failValues: ['Fail']
      }
    }
  },
  {
    key: 'kling',
    name: '可灵 Kling',
    tag: '视频 · 需 JWT 签名',
    baseUrl: 'https://api.klingai.com',
    signup: 'https://klingai.com',
    protocol: 'custom',
    supports: ['video'],
    models: { video: ['kling-v2-master', 'kling-v2-1', 'kling-v2', 'kling-v1-6', 'kling-v1-5'] },
    note: '认证走 JWT（AK/SK 签名），建议用聚合站转发；直连需自行生成 token',
    templates: {
      video: {
        submitUrl: 'https://api.klingai.com/v1/videos/text2video',
        submitBody: '{"model_name":"{{model}}","prompt":"{{prompt}}"}',
        taskIdPath: 'data.task_id',
        pollUrl: 'https://api.klingai.com/v1/videos/text2video/{{taskId}}',
        resultPath: 'data.task_result.videos.0.url',
        statusPath: 'data.task_status',
        doneValues: ['succeed'],
        failValues: ['failed']
      }
    }
  },
  {
    key: 'runway',
    name: 'Runway',
    tag: '视频 · 自有协议',
    baseUrl: 'https://api.dev.runwayml.com',
    signup: 'https://dev.runwayml.com',
    protocol: 'custom',
    supports: ['video'],
    models: { video: ['gen4_turbo', 'gen4_aleph', 'gen3a_turbo'] },
    note: '需指定 X-Runway-Version 头，已放在模板里',
    templates: {
      video: {
        submitUrl: 'https://api.dev.runwayml.com/v1/image_to_video',
        submitHeaders: '{"X-Runway-Version":"2024-11-06"}',
        submitBody: '{"model":"{{model}}","promptText":"{{prompt}}","ratio":"1280:720","duration":5}',
        taskIdPath: 'id',
        pollUrl: 'https://api.dev.runwayml.com/v1/tasks/{{taskId}}',
        resultPath: 'output.0',
        statusPath: 'status',
        doneValues: ['SUCCEEDED'],
        failValues: ['FAILED']
      }
    }
  },
  {
    key: 'luma',
    name: 'Luma Dream Machine',
    tag: '视频 · 自有协议',
    baseUrl: 'https://api.lumalabs.ai',
    signup: 'https://lumalabs.ai/dream-machine/api',
    protocol: 'custom',
    supports: ['video'],
    models: { video: ['ray-2', 'ray-flash-2', 'ray-1-6'] },
    note: '已内置生成 + 轮询模板',
    templates: {
      video: {
        submitUrl: 'https://api.lumalabs.ai/dream-machine/v1/generations',
        submitBody: '{"model":"{{model}}","prompt":"{{prompt}}"}',
        taskIdPath: 'id',
        pollUrl: 'https://api.lumalabs.ai/dream-machine/v1/generations/{{taskId}}',
        resultPath: 'assets.video',
        statusPath: 'state',
        doneValues: ['completed'],
        failValues: ['failed']
      }
    }
  },

  /* ==================== 通用 ==================== */
  {
    key: 'chatgpt2api',
    name: 'chatgpt2api（自建）',
    tag: '本地转发',
    baseUrl: 'http://localhost:8000/v1',
    signup: '',
    protocol: 'openai',
    supports: ['chat', 'image'],
    models: { image: ['gpt-image-1'], chat: ['gpt-4o-mini'] },
    note: '本机部署的转发服务'
  },
  {
    key: 'grok2api',
    name: 'grok2api（自建）',
    tag: '本地转发',
    baseUrl: 'http://localhost:8000/v1',
    signup: '',
    protocol: 'openai',
    supports: ['chat', 'image'],
    models: { image: ['grok-2-image'], chat: ['grok-2'] },
    note: '本机部署的转发服务'
  },
  {
    key: 'flow2api',
    name: 'flow2api（自建）',
    tag: '本地转发 · 生视频',
    baseUrl: 'http://localhost:8000/v1',
    signup: '',
    protocol: 'openai',
    supports: ['chat', 'video'],
    models: { chat: ['veo-3'], video: ['veo-3', 'veo-3-fast'] },
    note: '本机部署的转发服务'
  },
  {
    key: 'custom',
    name: '自定义 / 其他',
    tag: '任意 OpenAI 兼容接口',
    baseUrl: '',
    signup: '',
    protocol: 'openai',
    supports: ['chat', 'image', 'video'],
    models: { image: [], chat: [], video: [] },
    note: '手填 Base URL；非标准协议请用高级里的「请求模板」'
  }
];

export const getProvider = (key) => PROVIDERS.find((p) => p.key === key) || null;

/** 按能力筛选服务商 */
export const providersByCapability = (cap) =>
  PROVIDERS.filter((p) => (p.supports || []).includes(cap));

/** 能力中文名 */
export const CAP_LABEL = {
  chat: '文本对话',
  image: '生图',
  video: '生视频'
};
