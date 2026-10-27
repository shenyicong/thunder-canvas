/* ==========================================================
 * Topbar.jsx —— 顶部工具栏
 * ========================================================== */
export default function Topbar({
  scale, running, canUndo, canRedo, hasSelection, showGallery, showMinimap,
  tool = 'hand', onTool,
  onNew, onImport, onExport, onUndo, onRedo, onDelete, onDuplicate,
  onRunAll, onRunSelected, onStop,
  onZoomIn, onZoomOut, onZoomReset, onFit,
  onToggleGallery, onToggleMinimap
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo">⚡</span>
        <span className="brand-name">雷霆画布</span>
      </div>

      <div className="tb-group">
        <button className="btn" onClick={onNew} title="清空并新建">新建</button>
        <button className="btn" onClick={onImport} title="导入 JSON">导入</button>
        <button className="btn" onClick={onExport} title="导出 JSON">导出</button>
      </div>

      <div className="tb-divider" />

      {/* 工具：抓手 / 框选 */}
      <div className="tb-group tool-switch">
        <button
          className={'btn icon' + (tool === 'hand' ? ' active' : '')}
          onClick={() => onTool && onTool('hand')}
          title="抓手（H）：在空白处拖拽直接平移画布"
        >✋</button>
        <button
          className={'btn icon' + (tool === 'select' ? ' active' : '')}
          onClick={() => onTool && onTool('select')}
          title="框选（V）：拖拽空白框选节点；按住 Shift 可临时反向"
        >⬚</button>
      </div>

      <div className="tb-divider" />

      <div className="tb-group">
        <button className="btn icon" onClick={onUndo} disabled={!canUndo} title="撤销 Ctrl+Z">↶</button>
        <button className="btn icon" onClick={onRedo} disabled={!canRedo} title="重做 Ctrl+Shift+Z">↷</button>
        <button className="btn icon" onClick={onDuplicate} disabled={!hasSelection} title="复制 Ctrl+D">⧉</button>
        <button className="btn icon danger" onClick={onDelete} disabled={!hasSelection} title="删除 Delete">🗑</button>
      </div>

      <div className="tb-divider" />

      <div className="tb-group">
        <button className="btn primary" onClick={onRunAll} disabled={running}>▶ 运行全部</button>
        <button className="btn" onClick={onRunSelected} disabled={running || !hasSelection}>▶ 运行选中</button>
        <button className="btn" onClick={onStop} disabled={!running}>■ 停止</button>
      </div>

      <div className="tb-spacer" />

      <div className="tb-group">
        <button
          className={'btn' + (showGallery ? ' active' : '')}
          onClick={onToggleGallery}
          title="Three.js 3D 画廊"
        >🌀 3D 画廊</button>
        <button
          className={'btn' + (showMinimap ? ' active' : '')}
          onClick={onToggleMinimap}
          title="小地图"
        >🗺</button>
      </div>

      <div className="tb-divider" />

      <div className="tb-group">
        <button className="btn icon" onClick={onZoomOut} title="缩小">−</button>
        <button className="btn zoom-label" onClick={onZoomReset} title="重置 100%">
          {Math.round(scale * 100)}%
        </button>
        <button className="btn icon" onClick={onZoomIn} title="放大">＋</button>
        <button className="btn" onClick={onFit} title="适应视图 Ctrl+1">适应</button>
      </div>
    </header>
  );
}
