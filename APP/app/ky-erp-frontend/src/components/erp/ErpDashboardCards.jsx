function formatValue(value) {
  if (typeof value === "number") return new Intl.NumberFormat("tr-TR").format(value);
  return value ?? "-";
}

export default function ErpDashboardCards({ cards = [] }) {
  return (
    <div className="erp-dashboard-cards">
      {cards.map((card) => (
        <div className="erp-dashboard-card" key={card.key || card.label}>
          <span>{card.label}</span>
          <strong>{formatValue(card.value)}</strong>
          {card.helper ? <small>{card.helper}</small> : null}
        </div>
      ))}
    </div>
  );
}
