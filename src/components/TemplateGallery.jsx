/* ==========================================================
 * TemplateGallery.jsx —— 工作流模板库弹窗（对标 RunningHub 模板市场）
 * ========================================================== */
import { useState } from 'react';

function Card({ tpl, onLoad, onDelete, deletable }) {
  const nodeCount = (tpl.nodes || []).length;
  const edgeCount = (tpl.edges || []).length;
  return (
    <div className="tpl-card">
      <div className="tpl-icon">{tpl.icon || '🧩'}</div>
      <div className="tpl-main">
        <div className="tpl-name">{tpl.name}</div>
        <div className="tpl-desc">{tpl.desc}</div>
        <div className="tpl-tags">
          {(tpl.tags || []).map((t) => <span className="tpl-tag" key={t}>{t}</span>)}
          <span className="tpl-meta">{nodeCount} 节点 · {edgeCount} 连线</span>
        </div>
      </div>
      <div className="tpl-actions">
        <button className="btn primary" onClick={() => onLoad(tpl.key)}>套用</button>
        {deletable && (
          <button className="btn danger" onClick={() => onDelete(tpl.key)} title="删除我的模板">删除</button>
        )}
      </div>
    </div>
  );
}

export default function TemplateGallery({ templates, onClose, onLoad, onSave, onDeleteUser }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    onSave(name.trim(), desc.trim());
    setName(''); setDesc(''); setNaming(false);
  };

  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal tpl-modal" style={{ width: 720, maxWidth: '92vw' }}>
        <div className="modal-head">
          <span>📚 工作流模板库 <em className="muted">· 对标 RunningHub，一键套用</em></span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body tpl-body">
          <div className="tpl-savebar">
            {naming ? (
              <div className="tpl-save-form">
                <input className="inp" placeholder="模板名称" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="inp" placeholder="一句话说明（可选）" value={desc} onChange={(e) => setDesc(e.target.value)} />
                <button className="btn primary" onClick={submit} disabled={!name.trim()}>保存</button>
                <button className="btn" onClick={() => setNaming(false)}>取消</button>
              </div>
            ) : (
              <button className="btn" onClick={() => setNaming(true)}>＋ 把当前画布存为模板</button>
            )}
            <span className="muted">套用模板会自动创建所需渠道与 Agent（默认留空 Key，填好即可运行）</span>
          </div>

          <div className="tpl-section-title">内置模板</div>
          <div className="tpl-grid">
            {(templates.builtin || []).map((t) => (
              <Card key={t.key} tpl={t} onLoad={onLoad} />
            ))}
          </div>

          {(templates.user && templates.user.length) > 0 && (
            <>
              <div className="tpl-section-title">我的模板</div>
              <div className="tpl-grid">
                {(templates.user || []).map((t) => (
                  <Card key={t.key} tpl={t} onLoad={onLoad} onDelete={onDeleteUser} deletable />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
