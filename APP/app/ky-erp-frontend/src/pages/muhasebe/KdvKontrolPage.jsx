import { useEffect, useMemo, useState } from "react";
import { getKdvKontrol } from "../../services/muhasebeApi";
import { Kpi, asArray, field, formatMoney } from "./_MuhasebeShared";

const emptyRows = [];

function rowKey(row, index) {
  return String(
    row?.id ||
      row?.sourceId ||
      row?.documentNo ||
      row?.belgeNo ||
      `${field(row, ["firma", "companyName"], "firma")}-${field(row, ["tarih", "date"], index)}`,
  );
}

function rowSide(row) {
  const raw = String(
    field(row, ["flowSide", "direction", "tur", "type"], ""),
  ).toLocaleLowerCase("tr-TR");
  if (
    raw.includes("giden") ||
    raw.includes("satis") ||
    raw.includes("sales") ||
    raw.includes("satış")
  ) {
    return "SALES";
  }
  return "PURCHASE";
}

function rowStatus(row, overrides, index) {
  return overrides[rowKey(row, index)] || "INCLUDED";
}

function statusLabel(status) {
  if (status === "EXCLUDED") return "Toplama dahil degil";
  if (status === "HELD") return "Bekletildi";
  if (status === "CANCELLED") return "Iptal adayi";
  return "Toplama dahil";
}

function statusTone(status) {
  if (status === "EXCLUDED") return "gray";
  if (status === "HELD") return "orange";
  if (status === "CANCELLED") return "red";
  return "green";
}

function Badge({ children, tone = "blue" }) {
  return <span className={`mh-badge ${tone}`}>{children}</span>;
}

export default function KdvKontrolPage({ activeMainCompany }) {
  const [rows, setRows] = useState(emptyRows);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [sideFilter, setSideFilter] = useState("ALL");
  const [reviewOverrides, setReviewOverrides] = useState({});
  const [selectedId, setSelectedId] = useState("");

  const loadRows = () => {
    setLoading(true);
    getKdvKontrol(activeMainCompany || {})
      .then((payload) => {
        const next = asArray(payload);
        setRows(next.length ? next : emptyRows);
        setMessage("");
        setSelectedId((current) =>
          current && next.some((row, index) => rowKey(row, index) === current)
            ? current
            : rowKey(next[0] || {}, 0),
        );
      })
      .catch((error) => {
        setRows(emptyRows);
        setMessage(error?.message || "KDV listesi alinamadi.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRows();
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  const decoratedRows = useMemo(
    () =>
      rows.map((row, index) => ({
        row,
        key: rowKey(row, index),
        side: rowSide(row),
        status: rowStatus(row, reviewOverrides, index),
        company: field(row, ["firma", "companyName"], "-"),
        documentNo: field(row, ["belgeNo", "documentNo"], "-"),
        date: field(row, ["tarih", "date"], "-"),
        subtotal: Number(field(row, ["matrah", "subtotal"], 0)),
        vatRate: Number(field(row, ["kdvOrani", "vatRate"], 0)),
        vat: Number(field(row, ["kdv", "vatAmount", "vat"], 0)),
        total: Number(field(row, ["toplam", "grandTotal"], 0)),
      })),
    [rows, reviewOverrides],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return decoratedRows.filter((item) => {
      if (sideFilter !== "ALL" && item.side !== sideFilter) return false;
      if (!query) return true;
      return `${item.company} ${item.documentNo} ${item.date}`
        .toLocaleLowerCase("tr-TR")
        .includes(query);
    });
  }, [decoratedRows, search, sideFilter]);

  const selected = useMemo(
    () =>
      decoratedRows.find((item) => item.key === selectedId) ||
      filteredRows[0] ||
      decoratedRows[0] ||
      null,
    [decoratedRows, filteredRows, selectedId],
  );

  const totals = useMemo(() => {
    const included = decoratedRows.filter((item) => item.status === "INCLUDED");
    const gelenKdv = included
      .filter((item) => item.side === "PURCHASE")
      .reduce((sum, item) => sum + item.vat, 0);
    const gidenKdv = included
      .filter((item) => item.side === "SALES")
      .reduce((sum, item) => sum + item.vat, 0);
    const excludedKdv = decoratedRows
      .filter((item) => item.status !== "INCLUDED")
      .reduce((sum, item) => sum + item.vat, 0);
    const devredenKdv = 0;
    return {
      gelenKdv,
      gidenKdv,
      devredenKdv,
      excludedKdv,
      netKdv: gidenKdv - gelenKdv - devredenKdv,
      includedCount: included.length,
    };
  }, [decoratedRows]);

  const setReviewStatus = (key, status) => {
    setReviewOverrides((current) => {
      const next = { ...current };
      if (status === "INCLUDED") delete next[key];
      else next[key] = status;
      return next;
    });
  };

  return (
    <div className="mh-management-page mh-kdv-page">
      {message ? <div className="warning-box">{message}</div> : null}

      <div className="mh-kpi-grid four">
        <Kpi label="Giden KDV" value={totals.gidenKdv} />
        <Kpi label="Gelen KDV" value={totals.gelenKdv} tone="green" />
        <Kpi label="Hariç / Bekleyen KDV" value={totals.excludedKdv} tone="orange" />
        <Kpi label="Net KDV" value={totals.netKdv} tone="dark" />
      </div>

      <section className="mh-kdv-layout">
        <main className="mh-card">
          <div className="mh-card-head">
            <div>
              <h2>KDV Gelen / Giden Kontrol Listesi</h2>
              <small>
                {totals.includedCount} belge toplama dahil, {decoratedRows.length - totals.includedCount} belge bekliyor veya haric.
              </small>
            </div>
            <button className="soft-btn" type="button" onClick={loadRows} disabled={loading}>
              {loading ? "Guncelleniyor..." : "Hemen Guncelle"}
            </button>
          </div>
          <div className="mh-card-body mh-stack">
            <div className="mh-kdv-toolbar">
              <input
                value={search}
                onChange={(event) => setSearch(event?.target.value)}
                placeholder="Firma, belge no veya tarih ara"
              />
              <select
                value={sideFilter}
                onChange={(event) => setSideFilter(event?.target.value)}
              >
                <option value="ALL">Tum KDV hareketleri</option>
                <option value="PURCHASE">Gelen / Alis KDV</option>
                <option value="SALES">Giden / Satis KDV</option>
              </select>
            </div>

            <div className="mh-table-wrap mh-kdv-table">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Firma</th>
                    <th>Belge No</th>
                    <th>Yon</th>
                    <th>Matrah</th>
                    <th>KDV %</th>
                    <th>KDV</th>
                    <th>Toplam</th>
                    <th>Kontrol</th>
                    <th>Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item) => (
                    <tr
                      key={item.key}
                      className={selected?.key === item.key ? "selected" : ""}
                      onClick={() => setSelectedId(item.key)}
                    >
                      <td>{item.date}</td>
                      <td>{item.company}</td>
                      <td><strong>{item.documentNo}</strong></td>
                      <td>
                        <Badge tone={item.side === "SALES" ? "orange" : "green"}>
                          {item.side === "SALES" ? "Giden" : "Gelen"}
                        </Badge>
                      </td>
                      <td>{formatMoney(item.subtotal)}</td>
                      <td>%{item.vatRate.toFixed(0)}</td>
                      <td><strong>{formatMoney(item.vat)}</strong></td>
                      <td>{formatMoney(item.total)}</td>
                      <td><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></td>
                      <td>
                        <div className="mh-kdv-row-actions">
                          <button type="button" onClick={(event) => { event.stopPropagation(); setReviewStatus(item.key, "INCLUDED"); }}>
                            Dahil
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); setReviewStatus(item.key, "HELD"); }}>
                            Beklet
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); setReviewStatus(item.key, "EXCLUDED"); }}>
                            Haric
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredRows.length ? (
                    <tr>
                      <td colSpan="10">Secili filtrede KDV kaydi yok.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        <aside className="mh-card">
          <div className="mh-card-head">
            <h2>KDV Belge Karari</h2>
            <Badge tone={statusTone(selected?.status)}>{statusLabel(selected?.status)}</Badge>
          </div>
          <div className="mh-card-body mh-side-lines">
            <Line label="Firma" value={selected?.company || "-"} />
            <Line label="Belge No" value={selected?.documentNo || "-"} />
            <Line label="Yon" value={selected?.side === "SALES" ? "Giden / satis KDV" : "Gelen / alis KDV"} />
            <Line label="Matrah" value={formatMoney(selected?.subtotal || 0)} />
            <Line label="KDV" value={formatMoney(selected?.vat || 0)} />
            <Line label="Toplam" value={formatMoney(selected?.total || 0)} />
            <div className="mh-kdv-decision-actions">
              <button className="primary-btn" type="button" disabled={!selected} onClick={() => setReviewStatus(selected.key, "INCLUDED")}>
                Toplama Dahil Et
              </button>
              <button className="soft-btn" type="button" disabled={!selected} onClick={() => setReviewStatus(selected.key, "HELD")}>
                Sonra Guncelle
              </button>
              <button className="soft-btn" type="button" disabled={!selected} onClick={() => setReviewStatus(selected.key, "EXCLUDED")}>
                Toplamdan Haric Tut
              </button>
              <button className="soft-btn danger" type="button" disabled={!selected} onClick={() => setReviewStatus(selected.key, "CANCELLED")}>
                Iptal Adayi Yap
              </button>
            </div>
            <div className="notice-box">
              Bu kararlar ekrandaki KDV kontrol toplamini anlik etkiler. Kaydi silmez, SQL hareketi iptal etmez.
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="mh-side-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
