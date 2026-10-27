/* ==========================================================
 * NodeCard.jsx —— 画布上的单个节点
 * ----------------------------------------------------------
 * 说明：节点用 DOM 渲染而非 Canvas —— 因为节点内需要
 *       textarea 编辑、图片预览、滚动、复制等原生交互能力，
 *       这是 Figma / tldraw 等成熟画布工具的通用取舍。
 * ========================================================== */
import { memo, useState, useEffect, useRef } from 'react';
import { NODE_TYPES, getUpstream } from '../lib/store.js';
import { getProvider, PROVIDERS, getProviderMeta } from '../lib/providers.js';
import { renderMarkdown, collectUpstream } from '../lib/engine.js';

const STATUS_TEXT = {
  idle: '',
  running: '执行中…',
  done: '完成',
  error: '失败'
};

const CUSTOM_MODEL = '__custom__';

/** 统一模型选择器（对标截图里的「模型下拉面板」）：
 *  - 列出「已配置渠道」的全部模型 + 「可一键接入」的服务商目录模型
 *  - 点选即生成：自动确保对应渠道存在并绑定，缺 Key 时弹窗引导填写
 *  - 底部「配置自定义模型」可接入任意 OpenAI 兼容接口 */
function ModelPicker({ cap, node, channels, set, onPickModel, onOpenChannel, onOpenChannels }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  const curCh = channels.find((c) => c.id === node.data.channelId);
  const curProvider = curCh && getProvider(curCh.providerKey);
  const model = node.data.model || '';

  // 厂商图标 + 该能力的预估单价（来自 providers.js 的 PROVIDER_META）
  const priceOf = (p) => (p && getProviderMeta(p.key).pricing[cap]) || '';
  const iconOf = (p) => (p ? getProviderMeta(p.key).icon : '🧩');

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const capModels = (provider, ch) => {
    if (provider && provider.models && provider.models[cap] && provider.models[cap].length) return provider.models[cap];
    return (ch && ch.models) || [];
  };

  // 已配置渠道（支持该能力且有模型）
  const cfgGroups = channels
    .filter((c) => !c.supports || c.supports.includes(cap))
    .map((c) => {
      const p = getProvider(c.providerKey);
      return { ch: c, provider: p, models: capModels(p, c) };
    })
    .filter((g) => g.models.length);

  // 可一键接入的服务商（目录支持该能力，且尚未建渠道）
  const cfgKeys = new Set(channels.map((c) => c.providerKey));
  const catProviders = PROVIDERS.filter((p) => (p.supports || []).includes(cap) && !cfgKeys.has(p.key));

  const ql = q.trim().toLowerCase();
  const match = (m, pname) => !ql || m.toLowerCase().includes(ql) || (pname || '').toLowerCase().includes(ql);

  const btnLabel = model
    ? (curProvider ? curProvider.name + ' · ' : '') + model
    : '选择模型…';

  return (
    <div className="model-picker" ref={ref}>
      <button className={'mp-btn' + (model ? ' has' : '')} onClick={() => setOpen((v) => !v)}>
        <span className="mp-btn-label">{btnLabel}</span>
        <span className="mp-caret">▾</span>
      </button>

      {curCh && (
        <div className="mp-cur">
          渠道：{curCh.name}
          {!curCh.apiKey && <span className="mp-need"> · 待填 Key</span>}
          <span className="mp-edit" onClick={() => onOpenChannel(curCh.id)}>去填</span>
        </div>
      )}

      {model && curProvider && (
        <div className="mp-pbar">
          <span className="mp-icon">{iconOf(curProvider)}</span>
          <span>预计 {priceOf(curProvider) || '以厂商为准'} · {curProvider.name}</span>
        </div>
      )}

      {open && (
        <div className="mp-panel">
          <input
            className="mp-search"
            placeholder="搜索模型 / 服务商…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />

          {!cfgGroups.length && !catProviders.length && (
            <div className="nb-hint">暂无可用模型，请先在右侧「渠道」接入服务商。</div>
          )}

          {cfgGroups.map((g) => (
            <div className="mp-group" key={'c' + g.ch.id}>
              <div className="mp-ghead">
                <span className="mp-dot" style={{ background: g.provider ? '#3fb950' : '#888' }} />
                <span className="mp-icon">{iconOf(g.provider)}</span>
                已配置 · {g.provider ? g.provider.name : g.ch.name}
              </div>
              {g.models.filter((m) => match(m, g.provider && g.provider.name)).map((m) => {
                const on = model === m && node.data.channelId === g.ch.id;
                return (
                  <div
                    key={m}
                    className={'mp-item' + (on ? ' on' : '')}
                    onClick={() => { set({ channelId: g.ch.id, model: m }); setOpen(false); }}
                  >
                    <span className="mp-icon">{iconOf(g.provider)}</span>
                    <span className="mp-name">{m}</span>
                    {priceOf(g.provider) && <span className="mp-price">{priceOf(g.provider)}</span>}
                    {on && <span className="mp-check">✓</span>}
                  </div>
                );
              })}
            </div>
          ))}

          {catProviders.length > 0 && (
            <div className="mp-group">
              <div className="mp-ghead">
                <span className="mp-dot" style={{ background: '#7c5cff' }} />
                ⚡ 可一键接入（点选即建渠道，填 Key 即用）
              </div>
              {catProviders.map((p) => (
                <div className="mp-provider" key={p.key}>
                  <div className="mp-pname">
                    <span className="mp-icon">{iconOf(p)}</span>
                    {p.name}
                    {priceOf(p) && <span className="mp-price muted">{priceOf(p)}</span>}
                  </div>
                  {(p.models[cap] || []).filter((m) => match(m, p.name)).map((m) => (
                    <div
                      key={m}
                      className={'mp-item' + (model === m && curProvider && curProvider.key === p.key ? ' on' : '')}
                      onClick={() => { onPickModel(node.id, p.key, m); setOpen(false); }}
                    >
                      <span className="mp-icon">{iconOf(p)}</span>
                      <span className="mp-name">{m}</span>
                      {priceOf(p) && <span className="mp-price">{priceOf(p)}</span>}
                      {model === m && curProvider && curProvider.key === p.key && <span className="mp-check">✓</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="mp-foot">
            <button className="btn" onClick={() => { setOpen(false); onOpenChannel(); }}>配置自定义模型</button>
            {onOpenChannels && (
              <button className="btn" onClick={() => { setOpen(false); onOpenChannels(); }}>管理渠道</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NodeCard({
  node, selected, channels, agents, running,
  onPointerDownCard, onStartLink, onResizeStart, onDataChange, onOpenImagePicker, onOpenChannels,
  onPickModel, onOpenChannel
}) {
  const def = NODE_TYPES[node.type];
  const status = node.status || 'idle';

  /** 修改 data（不写历史，历史由交互结束时统一 commit） */
  const set = (patch) => onDataChange(node.id, patch);

  /** 阻止画布把节点内的点击当成拖拽 */
  const stop = (e) => e.stopPropagation();

  return (
    <div
      className={[
        'node', def.cls,
        selected ? 'selected' : '',
        status === 'running' ? 'running' : '',
        status === 'done' ? 'done' : '',
        status === 'error' ? 'error' : ''
      ].join(' ')}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      onMouseDown={(e) => onPointerDownCard(e, node)}
      data-node-id={node.id}
    >
      {/* ---------- 头部 ---------- */}
      <div className="node-head">
        <span className="nh-icon">{def.icon}</span>
        <span className="nh-title">{node.title}</span>
        <span className={'nh-status ' + status}>
          {running && status === 'running'
            ? (node.statusText || STATUS_TEXT.running)
            : STATUS_TEXT[status]}
        </span>
      </div>

      {/* ---------- 主体：按类型渲染 ---------- */}
      <div className="node-body" onMouseDown={stop} onWheel={stop}>

        {/* 便签 / 提示词 */}
        {(node.type === 'note' || node.type === 'prompt') && (
          <textarea
            className="nb-input"
            style={{ height: node.h - 60 }}
            value={node.data.text || ''}
            placeholder={node.type === 'prompt' ? '输入创作需求…' : '记录想法…'}
            onChange={(e) => set({ text: e.target.value })}
          />
        )}

        {/* 图片 */}
        {node.type === 'image' && (
          <>
            {node.data.src
              ? <img src={node.data.src} alt="" style={{ width: '100%', borderRadius: 5 }} />
              : (
                <div className="nb-empty-box" onClick={() => onOpenImagePicker(node.id)}>
                  点击上传 / 粘贴图片 URL
                </div>
              )}
            <div className="nb-row" style={{ marginTop: 6 }}>
              <input
                className="nb-text"
                placeholder="图片说明（可选）"
                value={node.data.caption || ''}
                onChange={(e) => set({ caption: e.target.value })}
              />
            </div>
            {node.data.src && (
              <div className="btn-row">
                <button className="btn" onClick={() => onOpenImagePicker(node.id)}>更换</button>
                <button className="btn" onClick={() => set({ src: '' })}>清除</button>
              </div>
            )}
          </>
        )}

        {/* AI 对话 */}
        {node.type === 'chat' && (
          <>
            <textarea
              className="nb-input"
              placeholder="给模型的指令（可留空，直接用上游内容）"
              value={node.data.instruction || ''}
              onChange={(e) => set({ instruction: e.target.value })}
            />
            <ModelPicker cap="chat" node={node} channels={channels} set={set} onPickModel={onPickModel} onOpenChannel={onOpenChannel} onOpenChannels={onOpenChannels} />
            <div
              className={'nb-output' + (node.data.output ? '' : ' empty')}
              dangerouslySetInnerHTML={{
                __html: node.data.output
                  ? renderMarkdown(node.data.output)
                  : '（暂无输出）'
              }}
            />
          </>
        )}

        {/* AI 生图 */}
        {node.type === 'imagegen' && (
          <>
            <textarea
              className="nb-input"
              placeholder="画面描述（可留空，直接用上游内容）"
              value={node.data.instruction || ''}
              onChange={(e) => set({ instruction: e.target.value })}
            />
            <ModelPicker cap="image" node={node} channels={channels} set={set} onPickModel={onPickModel} onOpenChannel={onOpenChannel} onOpenChannels={onOpenChannels} />
            <div className="nb-row">
              <select
                className="nb-select"
                value={node.data.size || '1024x1024'}
                onChange={(e) => set({ size: e.target.value })}
              >
                {['1024x1024', '1024x1536', '1536x1024', '512x512', 'auto'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                className="nb-num nb-text"
                type="number" min="1" max="8"
                value={node.data.n || 1}
                onChange={(e) => set({ n: parseInt(e.target.value || 1, 10) })}
              />
            </div>
            <div className="nb-media">
              {(node.data.images || []).map((u, i) => (
                <div className="media-item" key={i} style={{ width: '48%' }}>
                  <img src={u} alt="" />
                </div>
              ))}
              {!(node.data.images || []).length && (
                <div className="nb-hint">暂无图片，运行后生成结果会显示在这里</div>
              )}
            </div>
          </>
        )}

        {/* AI 生视频 */}
        {node.type === 'videogen' && (
          <>
            <textarea
              className="nb-input"
              placeholder="视频描述（可留空，直接用上游内容）"
              value={node.data.instruction || ''}
              onChange={(e) => set({ instruction: e.target.value })}
            />
            <ModelPicker cap="video" node={node} channels={channels} set={set} onPickModel={onPickModel} onOpenChannel={onOpenChannel} onOpenChannels={onOpenChannels} />
            {node.data.videoUrl
              ? <video src={node.data.videoUrl} controls style={{ width: '100%', marginTop: 6 }} />
              : <div className="nb-hint">暂无视频</div>}
          </>
        )}

        {/* AI 超清放大 */}
        {node.type === 'upscale' && (
          <>
            <div className="nb-row">
              <select
                className="nb-select"
                value={node.data.scale || '4x'}
                onChange={(e) => set({ scale: e.target.value })}
              >
                {['2x', '4x', '8x'].map((s) => <option key={s} value={s}>{s} 放大</option>)}
              </select>
            </div>
            <textarea
              className="nb-input"
              placeholder="放大要求（可留空，默认高清锐化）"
              value={node.data.instruction || ''}
              onChange={(e) => set({ instruction: e.target.value })}
            />
            <ModelPicker cap="image" node={node} channels={channels} set={set} onPickModel={onPickModel} onOpenChannel={onOpenChannel} onOpenChannels={onOpenChannels} />
            <div className="nb-media">
              {(node.data.images || []).map((u, i) => (
                <div className="media-item" key={i} style={{ width: '48%' }}>
                  <img src={u} alt="" />
                </div>
              ))}
              {!(node.data.images || []).length && (
                <div className="nb-hint">连接上游生图 / 图片节点，运行后在此显示放大结果</div>
              )}
            </div>
          </>
        )}

        {/* 成果汇总（实时聚合上游） */}
        {node.type === 'output' && (() => {
          const ctx = collectUpstream(node.id);
          const allText = ctx.text || '';
          return (
            <>
              <div className="out-actions">
                <button
                  className="btn"
                  disabled={!allText}
                  onClick={() => navigator.clipboard && navigator.clipboard.writeText(allText)}
                  title="复制所有文本成果"
                >复制文本</button>
                <span className="out-count">
                  {ctx.images.length} 图 · {ctx.videos.length} 视频 · {allText ? '有文本' : '无文本'}
                </span>
              </div>
              <div className="out-scroll">
                {ctx.videos.length > 0 && (
                  <div className="out-block">
                    <div className="out-label">视频</div>
                    {ctx.videos.map((u, i) => (
                      <video key={i} src={u} controls style={{ width: '100%', marginBottom: 6, borderRadius: 5 }} />
                    ))}
                  </div>
                )}
                {ctx.images.length > 0 && (
                  <div className="out-block">
                    <div className="out-label">图片</div>
                    <div className="nb-media">
                      {ctx.images.map((u, i) => (
                        <div className="media-item" key={i} style={{ width: '48%' }}>
                          <a href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {allText && (
                  <div className="out-block">
                    <div className="out-label">文本</div>
                    <div
                      className="nb-output"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(allText) }}
                    />
                  </div>
                )}
                {!allText && !ctx.images.length && !ctx.videos.length && (
                  <div className="nb-hint">把其它节点连到本节点，运行后在这里汇总所有成果</div>
                )}
              </div>
            </>
          );
        })()}

        {/* Agent 节点：多 Agent 协同 */}
        {node.type === 'agent' && (
          <>
            <div className="nb-row">
              <label style={{ flex: '0 0 46px' }}>Agents</label>
              <div className="chip-wrap">
                {agents.map((a) => {
                  const on = (node.data.agentIds || []).includes(a.id);
                  return (
                    <button
                      key={a.id}
                      className={'chip' + (on ? ' on' : '')}
                      style={on ? { borderColor: a.color, background: a.color + '22', color: a.color } : {}}
                      onClick={() => {
                        const cur = node.data.agentIds || [];
                        set({
                          agentIds: on ? cur.filter((x) => x !== a.id) : cur.concat(a.id)
                        });
                      }}
                      title={a.role || a.name}
                    >{a.name}</button>
                  );
                })}
                {!agents.length && <span className="nb-hint">请先在右侧「Agent」页创建 Agent</span>}
              </div>
            </div>
            <textarea
              className="nb-input"
              placeholder="任务指令（可留空，直接用上游内容）"
              value={node.data.instruction || ''}
              onChange={(e) => set({ instruction: e.target.value })}
            />
            <div className="nb-row">
              <label style={{ flex: '0 0 46px' }}>汇总</label>
              <select
                className="nb-select"
                value={node.data.summarizerId || ''}
                onChange={(e) => set({ summarizerId: e.target.value })}
              >
                <option value="">不汇总（保留各方观点）</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* 多 Agent 输出 */}
            {(node.data.outputs || []).map((o, i) => (
              <div className="agent-output" key={i}>
                <div className="ao-head">
                  <span className="dot" style={{ background: o.color || '#7c5cff' }} />
                  <span style={{ flex: 1 }}>{o.agentName}</span>
                  {o.error && <span className="badge err">失败</span>}
                </div>
                <div className="ao-body">
                  {o.error ? o.error : (o.text || '（无输出）')}
                </div>
              </div>
            ))}

            {node.data.summary && (
              <div className="agent-output" style={{ borderColor: '#3fb950' }}>
                <div className="ao-head" style={{ background: 'rgba(63,185,80,.15)' }}>
                  <span className="dot" style={{ background: '#3fb950' }} />
                  <span style={{ flex: 1 }}>汇总结论</span>
                </div>
                <div className="ao-body">{node.data.summary}</div>
              </div>
            )}

            {!(node.data.outputs || []).length && !node.data.summary && (
              <div className="nb-hint">运行后，各 Agent 的输出会分列显示在这里</div>
            )}
          </>
        )}
      </div>

      {/* ---------- 端口 ---------- */}
      <div
        className="port port-in"
        data-port="in"
        data-node-id={node.id}
        onMouseDown={stop}
      />
      <div
        className="port port-out"
        data-port="out"
        data-node-id={node.id}
        onMouseDown={(e) => onStartLink(e, node)}
      />

      {/* ---------- 缩放手柄 ---------- */}
      <div className="node-resize" onMouseDown={(e) => onResizeStart(e, node)} />
    </div>
  );
}

export default memo(NodeCard);
