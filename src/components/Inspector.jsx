/* ==========================================================
 * Inspector.jsx —— 右侧面板
 * 四个页签：属性 / Agent / 渠道 / 日志
 * ========================================================== */
import { useState, useEffect } from 'react';
import { NODE_TYPES, getNode, updateNode, updateNodeData, commit } from '../lib/store.js';
import { CAP_LABEL } from '../lib/providers.js';
import { getLogs, clearLogs } from '../lib/engine.js';
import { useEvent } from '../lib/useStore.js';

const TABS = [
  { key: 'prop', label: '属性' },
  { key: 'agent', label: 'Agent' },
  { key: 'channel', label: '渠道' },
  { key: 'log', label: '日志' }
];

export default function Inspector({
  tab, setTab, selection, agents, channels,
  onEditAgent, onEditChannel, onRemoveAgent, onRemoveChannel,
  onTestChannel, onFetchModels, onFocusNode
}) {
  const [logs, setLogs] = useState(getLogs());
  // 日志实时刷新
  useEvent('log', () => setLogs(getLogs().slice(-200)));
  useEvent('log:clear', () => setLogs([]));
  useEffect(() => { if (tab === 'log') setLogs(getLogs().slice(-200)); }, [tab]);

  const selNodes = selection.map(getNode).filter(Boolean);
  const one = selNodes.length === 1 ? selNodes[0] : null;

  return (
    <aside className="sidebar-right">
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'tab' + (tab === t.key ? ' active' : '')}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      <div className="tab-panes">
        {/* ================= 属性 ================= */}
        {tab === 'prop' && (
          <div className="tab-pane active">
            {!selNodes.length && (
              <div className="pane-empty">
                未选中任何节点<br />
                <span style={{ fontSize: 11 }}>点击节点查看属性，拖拽空白处可框选多个</span>
              </div>
            )}

            {selNodes.length > 1 && (
              <>
                <div className="pane-title">已选中 {selNodes.length} 个节点</div>
                <div className="pane-sub">批量操作请在画布上直接拖动；属性编辑请单选。</div>
                {selNodes.map((n) => (
                  <div className="section-card" key={n.id} onClick={() => onFocusNode(n.id)} style={{ cursor: 'pointer' }}>
                    <div className="sc-head">
                      <span className="sc-title">
                        {NODE_TYPES[n.type].icon} {n.title}
                      </span>
                      <span className="badge">{n.x}, {n.y}</span>
                    </div>
                  </div>
                ))}
              </>
            )}

            {one && (
              <>
                <div className="pane-title">
                  {NODE_TYPES[one.type].icon} {NODE_TYPES[one.type].name}
                  <span className="badge">{one.status === 'done' ? 'ok' : one.status}</span>
                </div>
                <div className="pane-sub">{NODE_TYPES[one.type].desc}</div>

                <div className="field">
                  <label>节点标题</label>
                  <input
                    className="inp"
                    value={one.title}
                    onChange={(e) => updateNode(one.id, { title: e.target.value })}
                  />
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>宽度</label>
                    <input
                      className="inp" type="number" min="140"
                      value={one.w}
                      onChange={(e) => updateNode(one.id, { w: parseInt(e.target.value || 140, 10) })}
                    />
                  </div>
                  <div className="field">
                    <label>高度</label>
                    <input
                      className="inp" type="number" min="80"
                      value={one.h}
                      onChange={(e) => updateNode(one.id, { h: parseInt(e.target.value || 80, 10) })}
                    />
                  </div>
                </div>

                {/* 类型专属字段 */}
                {(one.type === 'note' || one.type === 'prompt') && (
                  <div className="field">
                    <label>内容</label>
                    <textarea
                      className="ta" style={{ minHeight: 160 }}
                      value={one.data.text || ''}
                      onChange={(e) => updateNodeData(one.id, { text: e.target.value })}
                    />
                  </div>
                )}

                {one.type === 'chat' && (
                  <div className="field">
                    <label>指令</label>
                    <textarea
                      className="ta"
                      value={one.data.instruction || ''}
                      onChange={(e) => updateNodeData(one.id, { instruction: e.target.value })}
                    />
                  </div>
                )}

                {one.type === 'imagegen' && (
                  <>
                    <div className="field">
                      <label>画面描述</label>
                      <textarea
                        className="ta"
                        value={one.data.instruction || ''}
                        onChange={(e) => updateNodeData(one.id, { instruction: e.target.value })}
                      />
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>尺寸</label>
                        <select
                          className="sel"
                          value={one.data.size || '1024x1024'}
                          onChange={(e) => updateNodeData(one.id, { size: e.target.value })}
                        >
                          {['1024x1024', '1024x1536', '1536x1024', '512x512', 'auto'].map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>数量</label>
                        <input
                          className="inp" type="number" min="1" max="8"
                          value={one.data.n || 1}
                          onChange={(e) => updateNodeData(one.id, { n: parseInt(e.target.value || 1, 10) })}
                        />
                      </div>
                    </div>
                    {(one.data.images || []).length > 0 && (
                      <div className="field">
                        <label>生成结果（{one.data.images.length}）</label>
                        <div className="nb-media">
                          {one.data.images.map((u, i) => <img key={i} src={u} alt="" style={{ width: '48%' }} />)}
                        </div>
                        <div className="btn-row">
                          <button
                            className="btn"
                            onClick={() => {
                              one.data.images.forEach((u, i) => {
                                const a = document.createElement('a');
                                a.href = u;
                                a.download = `${one.title}-${i + 1}.png`;
                                a.click();
                              });
                            }}
                          >下载全部</button>
                          <button className="btn" onClick={() => updateNodeData(one.id, { images: [] })}>清空</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {one.type === 'agent' && (
                  <div className="field">
                    <label>参与协同的 Agent（{one.data.agentIds.length}）</label>
                    <div className="desc">
                      多个 Agent 会并行调用、分头产出；指定「汇总 Agent」后，
                      由它把各方结果收敛为唯一结论。
                    </div>
                    {one.data.agentIds.map((id) => {
                      const a = agents.find((x) => x.id === id);
                      if (!a) return null;
                      return (
                        <div className="section-card" key={id}>
                          <div className="sc-head">
                            <span className="sc-title">
                              <span className="dot" style={{ background: a.color, width: 8, height: 8, borderRadius: 8, display: 'inline-block' }} />
                              {a.name}
                            </span>
                            <span className="badge">{a.model || '未设模型'}</span>
                          </div>
                          <div className="desc">{a.role || '（无角色描述）'}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {one.data.output && (
                  <div className="field">
                    <label>输出</label>
                    <div className="nb-output" style={{ maxHeight: 240 }}>
                      {one.data.output}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ================= Agent ================= */}
        {tab === 'agent' && (
          <div className="tab-pane active">
            <div className="pane-title">
              Agent 编排
              <button className="mini-btn" onClick={() => onEditAgent(null)}>+ 新建</button>
            </div>
            <div className="pane-sub">
              每个 Agent 是一套「角色 + 模型 + 系统提示词」。在 Agent 节点里挂载多个
              Agent，即可实现并行分头产出 → 汇总收敛的协同流程。
            </div>

            {!agents.length && <div className="pane-empty">还没有 Agent</div>}

            {agents.map((a) => {
              const ch = channels.find((c) => c.id === a.channelId);
              return (
                <div className="section-card" key={a.id}>
                  <div className="sc-head">
                    <span className="sc-title">
                      <span className="dot" style={{ background: a.color, width: 9, height: 9, borderRadius: 9, display: 'inline-block' }} />
                      {a.name}
                    </span>
                    <span className="sc-actions">
                      <button className="mini-btn" onClick={() => onEditAgent(a.id)}>编辑</button>
                      <button className="mini-btn" onClick={() => onRemoveAgent(a.id)}>删除</button>
                    </span>
                  </div>
                  <div className="desc">{a.role || '（无角色描述）'}</div>
                  <div className="desc">
                    渠道：{ch ? ch.name : '未绑定'} · 模型：{a.model || '未设置'} · 温度：{a.temperature}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ================= 渠道 ================= */}
        {tab === 'channel' && (
          <div className="tab-pane active">
            <div className="pane-title">
              渠道 Channels
              <button className="mini-btn" onClick={() => onEditChannel(null)}>+ 新建</button>
            </div>
            <div className="pane-sub">
              所有实现了 OpenAI 兼容协议的服务都可接入：OpenAI 官方、chatgpt2api、
              grok2api、flow2api、newapi、DeepSeek、Moonshot、智谱、硅基流动、火山方舟等。
              区别只在 Base URL / 路径 / 模型名，可分别配置。
            </div>

            {!channels.length && <div className="pane-empty">还没有渠道</div>}

            {channels.map((c) => (
              <div className="section-card" key={c.id}>
                <div className="sc-head">
                  <span className="sc-title">
                    <span className="dot" style={{ background: c.apiKey ? '#3fb950' : '#647081', width: 9, height: 9, borderRadius: 9, display: 'inline-block' }} />
                    {c.name}
                  </span>
                  <span className="sc-actions">
                    <button className="mini-btn" onClick={() => onFetchModels(c.id)}>拉模型</button>
                    <button className="mini-btn" onClick={() => onTestChannel(c.id)}>测试</button>
                    <button className="mini-btn" onClick={() => onEditChannel(c.id)}>编辑</button>
                    <button className="mini-btn" onClick={() => onRemoveChannel(c.id)}>删除</button>
                  </span>
                </div>
                <div className="desc">{c.baseUrl || '（未填 Base URL）'}</div>
                <div className="chip-wrap" style={{ margin: '5px 0' }}>
                  {(c.supports || []).map((x) => (
                    <span className="cap-badge" key={x}>{CAP_LABEL[x] || x}</span>
                  ))}
                  {c.protocol === 'custom' && <span className="cap-badge warn">自定义模板</span>}
                </div>
                <div className="desc">
                  Key：{c.apiKey ? '✅ 已填写' : '❌ 未填写'}
                  {' · '}模型 {c.models ? c.models.length : 0} 个
                  {' · '}模式 {c.mode}
                </div>
                {c.models && c.models.length > 0 && (
                  <div className="chip-wrap" style={{ marginTop: 6 }}>
                    {c.models.slice(0, 12).map((m) => <span className="chip static" key={m}>{m}</span>)}
                    {c.models.length > 12 && <span className="chip static">+{c.models.length - 12}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ================= 日志 ================= */}
        {tab === 'log' && (
          <div className="tab-pane active">
            <div className="pane-title">
              运行日志
              <button className="mini-btn" onClick={() => { clearLogs(); setLogs([]); }}>清空</button>
            </div>
            <div className="pane-sub">按顺序记录每次执行的分层调度与节点结果。</div>
            {!logs.length && <div className="pane-empty">暂无日志</div>}
            {logs.slice().reverse().map((l, i) => (
              <div className={'log-line ' + l.level} key={i}>
                <span className="ll-time">{l.t.toLocaleTimeString()}</span>
                {l.msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
