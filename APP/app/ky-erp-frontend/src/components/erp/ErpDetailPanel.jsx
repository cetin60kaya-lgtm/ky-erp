export default function ErpDetailPanel({ record, fields = [], onRunAction }) {
  if (!record) {
    return (
      <aside className="erp-detail-panel">
        <div className="erp-empty">Detay için kayıt seçin.</div>
      </aside>
    );
  }

  return (
    <aside className="erp-detail-panel">
      <div className="erp-panel-head">
        <h4>Seçili Kayıt</h4>
        <span className="erp-status-badge">{record.status}</span>
      </div>
      <dl className="erp-detail-list">
        {fields.map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd>{record[field.key] || "-"}</dd>
          </div>
        ))}
      </dl>
      <div className="erp-missing-box">
        <strong>Eksik Veri</strong>
        {(record.missingFields || []).length ? (
          <ul>
            {record.missingFields.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <span>Eksik veri yok.</span>
        )}
      </div>
      <button className="primary-btn erp-next-action" type="button" onClick={() => onRunAction?.(record)}>
        {record.nextAction || "Sıradaki aksiyonu çalıştır"}
      </button>
      <div className="erp-history">
        <strong>İşlem Geçmişi</strong>
        {(record.history || ["Kayıt oluşturuldu"]).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </aside>
  );
}
