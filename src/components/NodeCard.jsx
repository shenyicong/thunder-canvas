/* ==========================================================
 * NodeCard.jsx —— 画布上的单个节点
 * ----------------------------------------------------------
 * 说明：节点用 DOM 渲染而非 Canvas —— 因为节点内需要
 *       textarea 编辑、图片预览、滚动、复制等原生交互能力，
 *       这是 Figma / tldraw 等成熟画布工具的通用取舍。
 * ========================================================== */
import { memo } from 'react';
import { NODE_TYPES } from '../lib/store.js';
import { renderMarkdown } from '../lib/engine.js';

const STATUS_TEXT = {
  idle: '',
  running: '执行中…',
  done: '完成',
  error: '失败'
};

/** 渠道 + 模型选择器：按节点能力过滤，模型可下拉 */
function ChannelPicker({ cap, node, channels, set }) {
  const list = channels.filter((c) => !c.supports || c.supports.includes(cap));
  const cur = channels.find((c) => c.id === node.data.channelId);
  const models = (cur && cur.models) || [];
  const dlId = `dl-${node.id}-${cap}`;

  return (
    <div className="nb-row">
      <select
        className="nb-select"
        value={node.data.channelId || ''}
        onChange={(e) => {
          const ch = channels.find((c) => c.id === e.target.value);
          set({ channelId: e.target.value, model: (ch && ch.models && ch.models[0]) || '' });
        }}
      >
        <option value="">选择渠道…</option>
        {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        {!list.length && <option value="" disabled>（还没有支持该能力的渠道）</option>}
      </select>
      <input
        className="nb-text"
        list={dlId}
        placeholder={models[0] || '模型名'}
        value={node.data.model || ''}
        onChange={(e) => set({ model: e.target.value })}
      />
      <datalist id={dlId}>
        {models.map((m) => <option key={m} value={m} />)}
      </datalist>
    </div>
  );
}

function NodeCard({
  node, selected, channels, agents, running,
  onPointerDownCard, onStartLink, onResizeStart, onDataChange, onOpenImagePicker
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
            <ChannelPicker cap="chat" node={node} channels={channels} set={set} />
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
            <ChannelPicker cap="image" node={node} channels={channels} set={set} />
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
            <ChannelPicker cap="video" node={node} channels={channels} set={set} />
            {node.data.videoUrl
              ? <video src={node.data.videoUrl} controls style={{ width: '100%', marginTop: 6 }} />
              : <div className="nb-hint">暂无视频</div>}
          </>
        )}

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
