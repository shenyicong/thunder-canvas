/* ==========================================================
 * Sidebar.jsx —— 左侧栏：节点库 / Agent / 渠道
 * ========================================================== */
import { NODE_TYPES } from '../lib/store.js';

export default function Sidebar({ agents, channels, onAddNode, onEditAgent, onEditChannel, onSelectAgent }) {
  return (
    <aside className="sidebar-left">
      {/* ---------- 节点库 ---------- */}
      <div className="side-section">
        <div className="side-title">
          节点库 <span className="hint">点击添加</span>
        </div>
        <div className="node-lib">
          {Object.entries(NODE_TYPES).map(([key, def]) => (
            <div
              key={key}
              className={'lib-item ' + def.cls}
              onClick={() => onAddNode(key)}
              title={def.desc}
            >
              <span className="li-icon">{def.icon}</span>
              <span className="li-main">
                <div className="li-name">{def.name}</div>
                <div className="li-desc">{def.desc}</div>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- Agent ---------- */}
      <div className="side-section">
        <div className="side-title">
          Agents
          <button className="mini-btn" onClick={() => onEditAgent(null)}>+ 新建</button>
        </div>
        <div className="agent-list">
          {agents.length ? agents.map((a) => (
            <div
              key={a.id}
              className="list-item"
              onClick={() => onSelectAgent(a.id)}
              onDoubleClick={() => onEditAgent(a.id)}
              title="双击编辑"
            >
              <span className="dot" style={{ background: a.color }} />
              <span className="li-main">
                <div className="li-name">{a.name}</div>
                <div className="li-sub">{a.role || a.model || '未配置模型'}</div>
              </span>
            </div>
          )) : <div className="list-empty">还没有 Agent，点右上角新建</div>}
        </div>
      </div>

      {/* ---------- 渠道 ---------- */}
      <div className="side-section grow">
        <div className="side-title">
          渠道 Channels
          <button className="mini-btn" onClick={() => onEditChannel(null)}>+ 新建</button>
        </div>
        <div className="channel-list">
          {channels.length ? channels.map((c) => (
            <div
              key={c.id}
              className="list-item"
              onDoubleClick={() => onEditChannel(c.id)}
              title="双击编辑"
            >
              <span
                className="dot"
                style={{ background: c.apiKey ? '#3fb950' : '#647081' }}
              />
              <span className="li-main">
                <div className="li-name">{c.name}</div>
                <div className="li-sub">{c.baseUrl || '未填 Base URL'}</div>
              </span>
            </div>
          )) : <div className="list-empty">还没有渠道，点右上角新建</div>}
        </div>
      </div>

      <div className="side-foot">
        <div className="shortcut-tip">
          <div><kbd>滚轮</kbd> 缩放 · <kbd>空格/中键</kbd> 平移</div>
          <div><kbd>拖拽空白</kbd> 框选 · <kbd>拖圆点</kbd> 连线</div>
          <div><kbd>Del</kbd> 删除 · <kbd>Ctrl+Z</kbd> 撤销</div>
        </div>
      </div>
    </aside>
  );
}
