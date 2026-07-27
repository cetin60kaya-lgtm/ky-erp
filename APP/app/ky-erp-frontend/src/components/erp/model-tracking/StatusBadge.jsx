export default function StatusBadge({ status, small = false }) {
  const normalized = String(status || "Bekleyen");

  let className = "status-badge status-badge-neutral";
  if (normalized === "Aktif") className = "status-badge status-badge-active";
  if (normalized === "Boyahanede")
    className = "status-badge status-badge-workshop";
  if (normalized === "İmalatta")
    className = "status-badge status-badge-production";
  if (normalized === "Üretimde")
    className = "status-badge status-badge-production";
  if (normalized === "Bekleyen")
    className = "status-badge status-badge-waiting";
  if (normalized === "Kısmi Faturalı")
    className = "status-badge status-badge-partial";
  if (normalized === "Tamamlandı")
    className = "status-badge status-badge-completed";
  if (normalized === "Taslak") className = "status-badge status-badge-draft";
  if (normalized === "Eksik" || normalized === "Uyarı")
    className = "status-badge status-badge-warning";
  if (normalized === "Kritik") className = "status-badge status-badge-critical";

  return (
    <span className={`${className} ${small ? "status-badge-small" : ""}`}>
      {normalized}
    </span>
  );
}
