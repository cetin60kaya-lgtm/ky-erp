export default function ErpActionQueue({ items = [], selectedId, onSelect }) {
  return (
    <aside className="erp-action-queue">
      <div className="erp-panel-head">
        <h4>İş Kuyruğu</h4>
        <span>{items.length}</span>
      </div>
      <div className="erp-queue-list">
        {items.map((item) => (
          <button
            type="button"
            key={item?.id}
            className={`erp-queue-item ${String(selectedId) === String(item?.id) ? "active" : ""}`}
            onClick={() => onSelect?.(item)}
          >
            <strong>{item?.title}</strong>
            <span>{item?.subtitle}</span>
            <em>{item?.nextAction}</em>
          </button>
        ))}
        {items.length === 0 ? <div className="erp-empty">Kuyruk boş.</div> : null}
      </div>
    </aside>
  );
}
