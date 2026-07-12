export default function ErpQuickEntryPanel({ title = "Hızlı Giriş", fields = [], onCreateDraft }) {
  return (
    <section className="content-card erp-quick-entry-panel">
      <div className="section-header">
        <div>
          <h3>{title}</h3>
          <p>Az alanla taslak oluştur, otomatik tespit ve eksik veri takibini kuyruğa bırak.</p>
        </div>
      </div>
      <div className="form-grid">
        {fields.map((field) => (
          <label className="field" key={field.key}>
            <span>{field.label}</span>
            {field.type === "file" ? (
              <input type="file" accept={field.accept} />
            ) : field.type === "select" ? (
              <select defaultValue="">
                <option value="">Seçin</option>
                {(field.options || []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input placeholder={field.placeholder || field.label} />
            )}
          </label>
        ))}
      </div>
      <div className="action-bar mt-16">
        <button className="primary-btn" type="button" onClick={onCreateDraft}>
          Taslak oluştur ve kuyruğa gönder
        </button>
      </div>
    </section>
  );
}
