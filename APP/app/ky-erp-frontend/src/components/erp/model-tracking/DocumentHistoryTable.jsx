import { Download, Eye, ExternalLink } from "lucide-react";
import StatusBadge from "./StatusBadge";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR").format(date);
}

export default function DocumentHistoryTable({ rows, compact = false }) {
  return (
    <div className="table-wrap model-track-table-card">
      <table className="table model-track-table">
        <thead>
          <tr>
            <th>Belge Tipi</th>
            <th>Belge No</th>
            <th>Tarih</th>
            <th>Durum</th>
            <th>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item?.id || `${item?.type}-${item?.no}`}>
              <td>{item?.type || item?.belgeTipi || "-"}</td>
              <td>{item?.no || item?.documentNo || "-"}</td>
              <td>{formatDate(item?.date || item?.tarih)}</td>
              <td>
                <StatusBadge
                  status={item?.status || "Tamamlandı"}
                  small={compact}
                />
              </td>
              <td>
                <div className="model-track-icon-actions">
                  <button
                    type="button"
                    className="model-track-icon-btn"
                    aria-label="Görüntüle"
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    type="button"
                    className="model-track-icon-btn"
                    aria-label="İndir"
                  >
                    <Download size={15} />
                  </button>
                  <button
                    type="button"
                    className="model-track-icon-btn"
                    aria-label="Aç"
                  >
                    <ExternalLink size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={5}>Belge geçmişi bulunamadı.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
