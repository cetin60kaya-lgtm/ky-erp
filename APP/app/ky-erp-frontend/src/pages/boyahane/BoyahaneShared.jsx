export function Status({ children, tone = "blue" }) {
  return <span className={`bh-status ${tone}`}>{children}</span>;
}

export function Field({ label, children, wide = false }) {
  return (
    <label className={`bh-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function InfoLine({ label, value }) {
  return (
    <div className="bh-info-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Panel({ title, sub, children, actions }) {
  return (
    <section className="bh-card">
      <header className="bh-card-head">
        <div>
          <h2>{title}</h2>
          {sub ? <small>{sub}</small> : null}
        </div>
        {actions ? <div className="bh-head-actions">{actions}</div> : null}
      </header>
      <div className="bh-card-body">{children}</div>
    </section>
  );
}

export function VisualBox({ label = "Görsel", large = false, color }) {
  return (
    <div className={`bh-visual ${large ? "large" : ""}`} style={color ? { background: color } : undefined}>
      <span>{label}</span>
    </div>
  );
}

export function formatKg(value) {
  return `${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} KG`;
}

export function formatGr(value) {
  return `${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} GR`;
}
