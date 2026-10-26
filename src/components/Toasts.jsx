/* ==========================================================
 * Toasts.jsx —— 轻提示
 * ========================================================== */
export default function Toasts({ items, onRemove }) {
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div
          key={t.id}
          className={'toast ' + (t.level || '')}
          onClick={() => onRemove(t.id)}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
