export default function SummaryCard({ icon, label, value, helper }) {
  return (
    <article className="model-track-summary-card">
      <div className="model-track-summary-icon">{icon}</div>
      <div>
        <h4>{label}</h4>
        <strong>{value}</strong>
        {helper ? <p>{helper}</p> : null}
      </div>
    </article>
  );
}
