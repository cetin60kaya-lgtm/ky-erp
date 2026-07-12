import { ChevronRight } from "lucide-react";
import StatusBadge from "./StatusBadge";
import { getModelImageSource } from "../../../utils/modelImage";

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR").format(date);
}

export default function ModelListTable({ rows, selectedId, onSelect }) {
  return (
    <div className="table-wrap model-track-table-card">
      <table className="table model-track-table">
        <thead>
          <tr>
            <th>Müşteri</th>
            <th>Model</th>
            <th>Son İrsaliye</th>
            <th>Toplam Gelen</th>
            <th>Üretim</th>
            <th>Faturalanan</th>
            <th>Kalan</th>
            <th>Durum</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row?.id}
              className={
                selectedId === row?.id ? "model-track-row-selected" : ""
              }
              onClick={() => onSelect(row)}
            >
              <td>{row?.customer}</td>
              <td>
                <div className="model-track-model-cell">
                  {getModelImageSource(row) ? (
                    <img src={getModelImageSource(row)} alt={row?.model || "Model"} />
                  ) : (
                    <span className="model-track-model-thumb-empty" />
                  )}
                  <span>{row?.model}</span>
                </div>
              </td>
              <td>
                <div className="model-track-cell-stack">
                  <strong>{row?.lastDispatchNo || "-"}</strong>
                  <small>{formatDate(row?.lastDispatchDate)}</small>
                </div>
              </td>
              <td>{formatNumber(row?.incomingQty)}</td>
              <td>{formatNumber(row?.productionQty)}</td>
              <td>{formatNumber(row?.invoicedQty)}</td>
              <td>{formatNumber(row?.remainingQty)}</td>
              <td>
                <StatusBadge status={row?.status} small />
              </td>
              <td>
                <ChevronRight size={16} color="#94a3b8" />
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={9}>Kayıt bulunamadı.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
