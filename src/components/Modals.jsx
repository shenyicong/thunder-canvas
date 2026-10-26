/* ==========================================================
 * Modals.jsx —— 渠道 / Agent 编辑弹窗
 * ========================================================== */
import { useState } from 'react';
import {
  CHANNEL_PRESETS, addChannel, addAgent, commit, getChannel
} from '../lib/store.js';

/** 通用弹窗外壳 */
export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <span>{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
 * 渠道编辑
 * ---------------------------------------------------------- */
export function ChannelModal({ channel, onClose }) {
  const isNew = !channel;
  const [form, setForm] = useState(() => channel || {
    name: '新渠道',
    preset: 'custom',
    baseUrl: '',
    apiKey: '',
    models: [],
    mode: 'auto',
    endpoints: {
      chat: '/chat/completions',
      image: '/images/generations',
      video: '/videos/generations',
      models: '/models'
    }
  });
  const [advanced, setAdvanced] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const applyPreset = (key) => {
    const p = CHANNEL_PRESETS.find((x) => x.key === key);
    if (!p) return;
    set({ preset: key, name: p.name, baseUrl: p.baseUrl });
  };

  const submit = () => {
    if (!form.baseUrl.trim()) { alert('请填写 Base URL'); return; }
    if (isNew) addChannel(form);
    else Object.assign(getChannel(channel.id), form);
    commit(); // 写入历史 + 持久化 + 触发重渲染
    onClose();
  };

  return (
    <Modal
      title={isNew ? '新建渠道' : '编辑渠道'}
      onClose={onClose}
      footer={(
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={submit}>保存</button>
        </>
      )}
    >
      <div className="field">
        <label>快速模板</label>
        <select
          className="sel"
          value={form.preset}
          onChange={(e) => applyPreset(e.target.value)}
        >
          {CHANNEL_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>{p.name} — {p.note}</option>
          ))}
        </select>
        <div className="desc">
          chatgpt2api / grok2api / flow2api / newapi 都实现了 OpenAI 兼容协议，
          选模板只是预填 Base URL，实际以你的部署地址为准。
        </div>
      </div>

      <div className="field">
        <label>名称</label>
        <input className="inp" value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </div>

      <div className="field">
        <label>Base URL</label>
        <input
          className="inp"
          placeholder="https://api.openai.com/v1"
          value={form.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
        />
        <div className="desc">带不带 /v1 都可以，调用失败时会自动尝试另一种写法。</div>
      </div>

      <div className="field">
        <label>API Key</label>
        <input
          className="inp"
          type="password"
          placeholder="sk-xxx"
          value={form.apiKey}
          onChange={(e) => set({ apiKey: e.target.value })}
        />
        <div className="desc">仅保存在浏览器 localStorage，不会上传到任何服务器。</div>
      </div>

      <div className="field">
        <label>请求模式</label>
        <select className="sel" value={form.mode} onChange={(e) => set({ mode: e.target.value })}>
          <option value="auto">auto — 直连，失败自动走 CORS 代理（推荐）</option>
          <option value="direct">direct — 只直连</option>
          <option value="proxy">proxy — 只走 CORS 代理</option>
        </select>
        <div className="desc">
          浏览器直连可能被目标服务的 CORS 策略拦截。若报跨域错误，
          改用 proxy，或本地运行 <code>node proxy-server.js</code> 后把 Base URL 指向它。
        </div>
      </div>

      <div className="field">
        <label>
          模型名（逗号分隔，可留空后在面板点「拉模型」自动获取）
        </label>
        <input
          className="inp"
          placeholder="gpt-4o-mini, gpt-image-1"
          value={(form.models || []).join(', ')}
          onChange={(e) => set({
            models: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
          })}
        />
      </div>

      <div className="check-line" onClick={() => setAdvanced(!advanced)}>
        <input type="checkbox" checked={advanced} onChange={() => setAdvanced(!advanced)} />
        高级：自定义端点路径（适配路径不规范的中转站）
      </div>

      {advanced && (
        <div className="section-card">
          {[
            ['chat', '对话端点'],
            ['image', '生图端点'],
            ['video', '视频端点'],
            ['models', '模型列表端点']
          ].map(([k, label]) => (
            <div className="field" key={k}>
              <label>{label}</label>
              <input
                className="inp"
                value={form.endpoints[k]}
                onChange={(e) => set({
                  endpoints: { ...form.endpoints, [k]: e.target.value }
                })}
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ----------------------------------------------------------
 * Agent 编辑
 * ---------------------------------------------------------- */
export function AgentModal({ agent, channels, onClose }) {
  const isNew = !agent;
  const [form, setForm] = useState(() => agent || {
    name: '新 Agent',
    role: '',
    channelId: (channels[0] && channels[0].id) || '',
    model: '',
    systemPrompt: '你是一个专业的 AI 助手，请根据输入完成任务，回答简洁、结构化。',
    temperature: 0.7,
    color: '#7c5cff'
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const curChannel = channels.find((c) => c.id === form.channelId);

  const submit = () => {
    if (!form.name.trim()) { alert('请填写 Agent 名称'); return; }
    if (isNew) addAgent(form);
    else Object.assign(agent, form);
    commit();
    onClose();
  };

  const COLORS = ['#7c5cff', '#4c8dff', '#3fb950', '#ff7b4c', '#bc4cff', '#d29922', '#f85149'];

  return (
    <Modal
      title={isNew ? '新建 Agent' : '编辑 Agent'}
      onClose={onClose}
      footer={(
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={submit}>保存</button>
        </>
      )}
    >
      <div className="field-row">
        <div className="field" style={{ flex: 2 }}>
          <label>名称</label>
          <input className="inp" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label>标识色</label>
          <div className="chip-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                className={'chip' + (form.color === c ? ' on' : '')}
                style={form.color === c ? { borderColor: c, background: c + '22', color: c } : {}}
                onClick={() => set({ color: c })}
              >●</button>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <label>角色定位</label>
        <input
          className="inp"
          placeholder="如：负责发散创意方向"
          value={form.role}
          onChange={(e) => set({ role: e.target.value })}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label>使用渠道</label>
          <select
            className="sel"
            value={form.channelId}
            onChange={(e) => set({ channelId: e.target.value })}
          >
            <option value="">（未绑定）</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>模型</label>
          <input
            className="inp"
            list="agent-model-list"
            placeholder={curChannel && curChannel.models && curChannel.models[0] ? curChannel.models[0] : 'gpt-4o-mini'}
            value={form.model}
            onChange={(e) => set({ model: e.target.value })}
          />
          <datalist id="agent-model-list">
            {(curChannel && curChannel.models || []).map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
      </div>

      <div className="field">
        <label>温度（0 ~ 2）</label>
        <input
          className="inp" type="number" step="0.1" min="0" max="2"
          value={form.temperature}
          onChange={(e) => set({ temperature: parseFloat(e.target.value) })}
        />
      </div>

      <div className="field">
        <label>系统提示词（决定这个 Agent 的"人格"与产出风格）</label>
        <textarea
          className="ta" style={{ minHeight: 140 }}
          value={form.systemPrompt}
          onChange={(e) => set({ systemPrompt: e.target.value })}
        />
      </div>
    </Modal>
  );
}
