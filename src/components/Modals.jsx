/* ==========================================================
 * Modals.jsx —— 渠道 / Agent 编辑弹窗
 * ========================================================== */
import { useState, useEffect, useRef } from 'react';
import {
  addChannel, addAgent, commit, getChannel
} from '../lib/store.js';
import { PROVIDERS, getProvider, CAP_LABEL } from '../lib/providers.js';

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
  const [form, setForm] = useState(() => (channel
    ? JSON.parse(JSON.stringify(channel))
    : {
      name: '新渠道',
      providerKey: 'custom',
      baseUrl: '',
      apiKey: '',
      models: [],
      protocol: 'openai',
      supports: ['chat', 'image'],
      templates: {},
      mode: 'auto',
      endpoints: {
        chat: '/chat/completions',
        image: '/images/generations',
        video: '/videos/generations',
        models: '/models'
      }
    }));
  const [advanced, setAdvanced] = useState(false);
  const [tplTab, setTplTab] = useState('video');
  const keyRef = useRef(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // 打开弹窗时自动聚焦 API Key 输入框：用户只需粘贴即可
  useEffect(() => {
    const t = setTimeout(() => keyRef.current && keyRef.current.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  /** 选择服务商：一次性把地址、协议、能力、模型、模板都带上 */
  const applyProvider = (key) => {
    const p = getProvider(key);
    if (!p) return;
    const suggested = [
      ...(p.models.image || []),
      ...(p.models.chat || []),
      ...(p.models.video || [])
    ];
    set({
      providerKey: key,
      name: p.name,
      baseUrl: p.baseUrl,
      protocol: p.protocol,
      supports: p.supports || ['chat', 'image'],
      templates: p.templates ? JSON.parse(JSON.stringify(p.templates)) : {},
      models: form.models && form.models.length ? form.models : suggested
    });
  };

  const provider = getProvider(form.providerKey);

  /** 把推荐模型加入模型列表 */
  const addModel = (m) => {
    const list = form.models || [];
    if (list.includes(m)) return;
    set({ models: list.concat(m) });
  };
  const removeModel = (m) => set({ models: (form.models || []).filter((x) => x !== m) });

  const submit = () => {
    if (!form.baseUrl.trim() && form.protocol === 'openai') {
      alert('请填写 Base URL（或重新选择服务商）');
      return;
    }
    const clean = {
      ...form,
      models: (form.models || []).filter(Boolean)
    };
    if (isNew) addChannel(clean);
    else Object.assign(getChannel(channel.id), clean);
    commit();
    onClose();
  };

  /** 当前编辑的模板对象 */
  const tpl = (form.templates && form.templates[tplTab]) || {};
  const setTpl = (patch) => {
    const next = { ...(form.templates || {}) };
    next[tplTab] = { ...tpl, ...patch };
    set({ templates: next });
  };

  const recommended = provider
    ? [...(provider.models.image || []), ...(provider.models.chat || []), ...(provider.models.video || [])]
    : [];

  return (
    <Modal
      title={isNew ? '新建渠道' : '编辑渠道'}
      onClose={onClose}
      footer={(
        <>
          {provider && provider.signup && (
            <a
              className="btn"
              href={provider.signup}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none', marginRight: 'auto' }}
            >去 {provider.name} 注册拿 Key ↗</a>
          )}
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={submit}>保存并启用</button>
        </>
      )}
    >
      {/* ---------- 服务商选择 ---------- */}
      <div className="field">
        <label>① 选择服务商（自动填好地址和能力）</label>
        <div className="provider-grid">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              className={'provider-card' + (form.providerKey === p.key ? ' on' : '')}
              onClick={() => applyProvider(p.key)}
            >
              <div className="pc-name">{p.name}</div>
              <div className="pc-tag">{p.tag}</div>
              <div className="pc-caps">
                {(p.supports || []).map((c) => (
                  <span key={c} className="cap-dot">{CAP_LABEL[c]}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
        {provider && provider.note && (
          <div className="desc">💡 {provider.note}</div>
        )}
      </div>

      {/* ---------- 基础配置 ---------- */}
      <div className="field">
        <label>② 渠道名称</label>
        <input className="inp" value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </div>

      <div className="field">
        <label>Base URL</label>
        <input
          className="inp"
          placeholder="https://api.siliconflow.cn/v1"
          value={form.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
        />
        <div className="desc">带不带 /v1 都行，失败会自动换另一种写法重试。</div>
      </div>

      <div className="field">
        <label>API Key <span style={{ color: 'var(--err)' }}>（必填，否则无法生成）</span></label>
        <input
          ref={keyRef}
          className="inp"
          type="password"
          placeholder="粘贴你的 API Key，如 sk-..."
          value={form.apiKey}
          onChange={(e) => set({ apiKey: e.target.value })}
        />
        <div className="desc">只存在你浏览器本地，不会上传到任何服务器。填好后点「保存并启用」，再到画布点 ▶ 运行全部。</div>
      </div>

      {/* ---------- 模型 ---------- */}
      <div className="field">
        <label>③ 可用模型（选中后节点里可下拉选择）</label>
        <div className="chip-wrap" style={{ marginBottom: 6 }}>
          {(form.models || []).map((m) => (
            <span key={m} className="chip on" style={{ cursor: 'pointer' }} onClick={() => removeModel(m)}>
              {m} ×
            </span>
          ))}
          {!(form.models || []).length && <span className="nb-hint">还没添加模型</span>}
        </div>

        {recommended.length > 0 && (
          <div className="chip-wrap" style={{ marginBottom: 6 }}>
            <span className="chip static" style={{ border: 'none', color: 'var(--txt-2)' }}>推荐：</span>
            {recommended.filter((m) => !(form.models || []).includes(m)).map((m) => (
              <button key={m} className="chip" onClick={() => addModel(m)}>+ {m}</button>
            ))}
          </div>
        )}

        <input
          className="inp"
          placeholder="也可手动输入模型名，回车添加"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
              addModel(e.currentTarget.value.trim());
              e.currentTarget.value = '';
            }
          }}
        />
        <div className="desc">
          保存后可在渠道卡片点「拉模型」从 /models 自动获取真实列表——
          模型名以服务商文档为准，拉取最准。
        </div>
      </div>

      <div className="field">
        <label>请求模式</label>
        <select className="sel" value={form.mode} onChange={(e) => set({ mode: e.target.value })}>
          <option value="auto">auto — 直连，跨域失败自动走代理（推荐）</option>
          <option value="direct">direct — 只直连</option>
          <option value="proxy">proxy — 只走 CORS 代理</option>
        </select>
      </div>

      {/* ---------- 高级 ---------- */}
      <div className="check-line" onClick={() => setAdvanced(!advanced)}>
        <input type="checkbox" checked={advanced} onChange={() => setAdvanced(!advanced)} />
        高级：端点路径 / 请求模板（适配非标准协议）
      </div>

      {advanced && (
        <div className="section-card">
          <div className="field">
            <label>端点路径（OpenAI 兼容协议用）</label>
            {[
              ['chat', '对话'], ['image', '生图'], ['video', '视频'], ['models', '模型列表']
            ].map(([k, label]) => (
              <div className="field-row" key={k} style={{ alignItems: 'center', marginBottom: 6 }}>
                <span style={{ flex: '0 0 56px', fontSize: 11, color: 'var(--txt-1)' }}>{label}</span>
                <input
                  className="inp"
                  value={form.endpoints[k]}
                  onChange={(e) => set({ endpoints: { ...form.endpoints, [k]: e.target.value } })}
                />
              </div>
            ))}
          </div>

          <div className="field">
            <label>
              自定义请求模板
              <span className="badge" style={{ marginLeft: 6 }}>
                {form.protocol === 'custom' ? '当前走模板' : '当前走标准协议'}
              </span>
            </label>
            <div className="desc">
              可灵 / 海螺 / Runway / Luma / 火山 Seedance 这些不是 OpenAI 协议，
              用模板描述「提交地址 + 请求体 + 任务ID位置 + 轮询地址 + 结果位置」即可接入。
              占位符：<code>{'{{prompt}} {{model}} {{key}} {{image}} {{size}} {{n}}'}</code>
            </div>

            <div className="chip-wrap" style={{ marginBottom: 8 }}>
              {['image', 'video'].map((c) => (
                <button
                  key={c}
                  className={'chip' + (tplTab === c ? ' on' : '')}
                  onClick={() => setTplTab(c)}
                >{CAP_LABEL[c]}模板</button>
              ))}
            </div>

            {[
              ['submitUrl', '提交地址 submitUrl'],
              ['submitHeaders', '提交 Headers（JSON，可空）'],
              ['submitBody', '提交 Body（JSON 模板）'],
              ['taskIdPath', '任务ID路径 taskIdPath'],
              ['pollUrl', '轮询地址 pollUrl（含 {{taskId}}）'],
              ['resultPath', '结果路径 resultPath'],
              ['statusPath', '状态路径 statusPath'],
              ['doneValues', '成功状态值（逗号分隔）'],
              ['failValues', '失败状态值（逗号分隔）']
            ].map(([k, label]) => (
              <div className="field" key={k} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10 }}>{label}</label>
                <input
                  className="inp"
                  value={Array.isArray(tpl[k]) ? tpl[k].join(',') : (tpl[k] || '')}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTpl({
                      [k]: (k === 'doneValues' || k === 'failValues')
                        ? v.split(',').map((s) => s.trim()).filter(Boolean)
                        : v
                    });
                  }}
                />
              </div>
            ))}

            <div className="desc">
              例（火山 Seedance）：
              submitUrl <code>https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks</code> ·
              body <code>{'{"model":"{{model}}","content":[{"type":"text","text":"{{prompt}}"}]}'}</code> ·
              taskIdPath <code>id</code> ·
              pollUrl <code>.../tasks/{{taskId}}</code> ·
              resultPath <code>content.video_url</code> ·
              statusPath <code>status</code> · 成功值 <code>succeeded</code>
            </div>
          </div>
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
