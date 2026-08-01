import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import { apiGet, buildApiUrl } from "../../../utils/api";
import "./KesilenFaturalarTab.css";

const PAGE_SIZES = [25, 50, 100];
const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const listOf = (payload) => {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
};
const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  });
const numberText = (value) =>
  Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : parsed.toLocaleDateString("tr-TR");
};
const normalize = (value) =>
  String(value || "").trim().toLocaleUpperCase("tr-TR");

function statusLabel(value) {
  const key = normalize(value);
  if (/SUCCESS|SENT|PROCESSED|APPROVED|TAMAMLANDI|GONDERILDI/.test(key)) return "Başarılı";
  if (/CANCEL|IPTAL|RED/.test(key)) return "İptal";
  if (/ERROR|HATA|REVIEW/.test(key)) return "Kontrol gerekli";
  if (/DRAFT|TASLAK/.test(key)) return "Taslak";
  return "Kontrol bekliyor";
}

function statusTone(value) {
  const key = normalize(value);
  if (/SUCCESS|SENT|PROCESSED|APPROVED|TAMAMLANDI|GONDERILDI/.test(key)) return "success";
  if (/CANCEL|IPTAL|RED|ERROR|HATA/.test(key)) return "danger";
  if (/DRAFT|TASLAK/.test(key)) return "muted";
  return "warning";
}

function EmptyState({ title, description }) {
  return (
    <div className="sif-empty">
      <FileText size={28} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export default function KesilenFaturalarTab({ activeMainCompany }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    }),
    [activeMainCompany?.id, activeMainCompany?.slug],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiGet("/muhasebe/kesilen-faturalar", {
        ...params,
        search,
        status,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        _ts: Date.now(),
      });
      const data = listOf(payload);
      setRows(data);
      setTotal(Number(payload?.pagination?.total ?? payload?.data?.pagination?.total ?? unwrap(payload)?.total ?? data.length));
    } catch (requestError) {
      setRows([]);
      setTotal(0);
      setError(requestError?.message || "Kesilen faturalar alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, params, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, status, pageSize]);

  const openDetail = async (row) => {
    setSelected(row);
    setDetailLoading(true);
    setDetailError("");
    try {
      const payload = await apiGet(`/muhasebe/kesilen-faturalar/${encodeURIComponent(row.id)}`, {
        ...params,
        _ts: Date.now(),
      });
      setSelected(unwrap(payload));
    } catch (requestError) {
      setDetailError(requestError?.message || "Fatura detayı alınamadı.");
    } finally {
      setDetailLoading(false);
    }
  };

  const fileUrl = (key) =>
    key
      ? buildApiUrl(`/api/files/${String(key).split("/").map(encodeURIComponent).join("/")}`)
      : "";

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const summary = useMemo(
    () => ({
      amount: rows.reduce((sum, row) => sum + Number(row.grandTotal || 0), 0),
      vat: rows.reduce((sum, row) => sum + Number(row.vatTotal || 0), 0),
      pending: rows.filter((row) => statusTone(row.status) === "warning").length,
    }),
    [rows],
  );

  return (
    <section className="sif-root">
      <header className="sif-toolbar">
        <label className="sif-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Müşteri, fatura no, model veya sipariş ara"
          />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ALL">Tüm durumlar</option>
          <option value="DRAFT">Taslak</option>
          <option value="SENT">Gönderildi</option>
          <option value="PROCESSED">Başarılı</option>
          <option value="REVIEW_REQUIRED">Kontrol gerekli</option>
          <option value="CANCELLED">İptal</option>
        </select>
        <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} kayıt</option>)}
        </select>
        <button type="button" onClick={load}><RefreshCcw size={16} /> Yenile</button>
      </header>

      <section className="sif-summary">
        <div><span>Görünen fatura</span><strong>{rows.length}</strong></div>
        <div><span>Genel toplam</span><strong>{money(summary.amount)}</strong></div>
        <div><span>Hesaplanan KDV</span><strong>{money(summary.vat)}</strong></div>
        <div className={summary.pending ? "attention" : ""}><span>Kontrol bekleyen</span><strong>{summary.pending}</strong></div>
      </section>

      {error ? <div className="sif-error"><CircleAlert size={18} /> {error}</div> : null}

      <section className="sif-table-card">
        {loading ? (
          <div className="sif-loading">Kesilen faturalar yükleniyor…</div>
        ) : rows.length ? (
          <div className="sif-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Müşteri</th>
                  <th>Fatura No</th>
                  <th>Model</th>
                  <th>Adet</th>
                  <th>Matrah</th>
                  <th>KDV</th>
                  <th>Toplam</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => openDetail(row)} tabIndex={0}>
                    <td>{dateText(row.issueDate)}</td>
                    <td><strong>{row.companyName || "Firma eşleşmesi bekliyor"}</strong></td>
                    <td>{row.documentNo || "-"}</td>
                    <td>{row.modelName || "-"}</td>
                    <td>{numberText(row.quantity)}</td>
                    <td>{money(row.subtotal)}</td>
                    <td>{money(row.vatTotal)}</td>
                    <td><strong>{money(row.grandTotal)}</strong></td>
                    <td><span className={`sif-status ${statusTone(row.status)}`}>{statusLabel(row.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Kesilen fatura bulunamadı"
            description="İşNet’ten alınan kesilen faturalar burada görünür. Bu ekranda manuel ve yinelenen belge işlemi yoktur."
          />
        )}
      </section>

      {pageCount > 1 ? (
        <footer className="sif-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Önceki</button>
          <span>{page} / {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Sonraki <ChevronRight size={16} /></button>
        </footer>
      ) : null}

      {selected ? (
        <div className="sif-drawer-layer" role="presentation" onMouseDown={() => setSelected(null)}>
          <aside className="sif-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>{selected.documentNo || "Fatura Detayı"}</h2>
                <p>{selected.companyName || "Firma eşleşmesi bekliyor"} · {dateText(selected.issueDate)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Kapat"><X size={20} /></button>
            </header>
            <div className="sif-drawer-body">
              {detailLoading ? <div className="sif-loading">Fatura detayı yükleniyor…</div> : null}
              {detailError ? <div className="sif-error"><CircleAlert size={18} /> {detailError}</div> : null}
              {!detailLoading ? (
                <>
                  <section className="sif-detail-summary">
                    <div><span>Müşteri</span><strong>{selected.companyName || "-"}</strong></div>
                    <div><span>Fatura no</span><strong>{selected.documentNo || "-"}</strong></div>
                    <div><span>Model</span><strong>{selected.modelName || "-"}</strong></div>
                    <div><span>Sipariş</span><strong>{selected.orderNo || "-"}</strong></div>
                    <div><span>Adet</span><strong>{numberText(selected.quantity)}</strong></div>
                    <div><span>Matrah</span><strong>{money(selected.subtotal)}</strong></div>
                    <div><span>KDV</span><strong>{money(selected.vatTotal)}</strong></div>
                    <div><span>Toplam</span><strong>{money(selected.grandTotal)}</strong></div>
                    <div><span>Kaynak</span><strong>{/ISNET/i.test(String(selected.sourceType || "")) ? "İşNet" : "Manuel"}</strong></div>
                    <div><span>Durum</span><strong>{statusLabel(selected.status)}</strong></div>
                  </section>

                  <section className="sif-section">
                    <header><h3>Fatura kalemleri</h3><span>{Array.isArray(selected.lines) ? selected.lines.length : 0} kalem</span></header>
                    {Array.isArray(selected.lines) && selected.lines.length ? (
                      <div className="sif-table-wrap compact">
                        <table>
                          <thead><tr><th>Ürün / Açıklama</th><th>Miktar</th><th>Birim</th><th>Birim fiyat</th><th>KDV</th><th>Toplam</th></tr></thead>
                          <tbody>
                            {selected.lines.map((line) => (
                              <tr key={line.id || `${line.rawName}-${line.lineNo}`}>
                                <td><strong>{line.rawName || line.description || "Kalem"}</strong></td>
                                <td>{numberText(line.quantity)}</td>
                                <td>{line.unit || "-"}</td>
                                <td>{money(line.unitPrice)}</td>
                                <td>{money(line.vatAmount)}</td>
                                <td><strong>{money(line.lineTotal)}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState title="Fatura kalemi bulunamadı" description="İşNet kaydında satır detayı bulunmuyor." />
                    )}
                  </section>

                  {selected.raw?.fileKey || selected.raw?.pdfKey || selected.raw?.xmlKey ? (
                    <section className="sif-files">
                      <h3>Belge dosyaları</h3>
                      <div>
                        {selected.raw?.fileKey ? <a href={fileUrl(selected.raw.fileKey)} target="_blank" rel="noreferrer">Belgeyi aç</a> : null}
                        {selected.raw?.pdfKey ? <a href={fileUrl(selected.raw.pdfKey)} target="_blank" rel="noreferrer">PDF aç</a> : null}
                        {selected.raw?.xmlKey ? <a href={fileUrl(selected.raw.xmlKey)} target="_blank" rel="noreferrer">XML aç</a> : null}
                      </div>
                    </section>
                  ) : null}
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
