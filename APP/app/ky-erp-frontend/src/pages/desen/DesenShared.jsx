export function Status({ children, tone = "blue" }) {
  return <span className={`dw-status ${tone}`}>{children}</span>;
}

export function Field({ label, children, wide = false }) {
  return (
    <label className={`dw-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function InfoLine({ label, value }) {
  return (
    <div className="dw-info-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function VisualBox({ label = "Desen Görseli", large = false }) {
  return <div className={`dw-visual ${large ? "large" : ""}`}>{label}</div>;
}

export function Section({ title, children }) {
  return (
    <section className="dw-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
