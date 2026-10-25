import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, RefreshCcw, Truck } from "lucide-react";
import { getEBelgePool } from "../../../services/eBelgeApi";
import CanonicalSupplierInventoryWorkspace from "./CanonicalSupplierInventoryWorkspace";
import { DOCUMENT_PAGE_SIZE, documentPageMeta } from "./documentPageMeta";
import "./supplierDocumentsWorkspace.css";
import "./documentPagination.css";

const VIEWS = new Set(["dispatches", "invoices"]);

const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toLocaleDateString("tr-TR");
};

const sourceText = (row = {}) => {
  const source = String(row.source_type || row.provider_type || "MANUAL").toUpperCase();
  if (source.includes("ISNET")) return "İşNet";
  if (source.includes("XML")) return "XML";
  if (source.includes("AI") || source.includes("SCAN")) return "PDF / Görsel";
  return row.provider_type || row.source_type || "Manuel";
};

export default function SupplierDocumentsWorkspace({ activeMainCompany, refreshKey = 0, openModule }) {
  const [view, setView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("purchaseView") || "dispatches";
    return VIEWS.has(requested) ? requested : "dispatches";
  });
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState(() => documentPageMeta());
  const requestSeq = useRef(0);

  const params = useMemo(() => ({
    mainCompanySlug: activeMainCompany?.slug,
    mainCompanyId: activeMainCompany?.id,
    filter: "INCOMING_DISPATCH",
    q: query,
    page,
    pageSize: DOCUMENT_PAGE_SIZE,
  }), [activeMainCompany?.id, activeMainCompany?.slug, page, query]);

  const loadDispatches = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setError("");
    try {
      const result = await getEBelgePool({ ...params, _ts: Date.now() });
      if (requestId !== requestSeq.current) return;
      const nextMeta = documentPageMeta(result, page);
      if (nextMeta.page !== page) {
        setPage(nextMeta.page);
        return;
      }
      setPageMeta(nextMeta);
      setDispatches(Array.isArray(result?.items) ? result.items : []);
    } catch (requestError) {
      if (requestId !== requestSeq.current) return;
      setDispatches([]);
      setPageMeta(documentPageMeta());
      setError(requestError?.message || "Tedarikçi irsaliyeleri alınamadı.");
    } finally {
      if (requestId === requestSeq.current) setLoading(false);
    }
  }, [page, params]);

  useEffect(() => { setPage(1); }, [activeMainCompany?.id, activeMainCompany?.slug]);
  useEffect(() => {
    if (view !== "dispatches") return undefined;
    const timer = window.setTimeout(() => void loadDispatches(), 180);
    return () => window.clearTimeout(timer);
  }, [loadDispatches, refreshKey, view]);

  const openEBelge = () => openModule?.("e-belge", { tabKey: "belge-havuzu" });

  return (
    <section className="sdw-root">
      <div className="accounting-subbar" role="tablist" aria-label="Tedarikçi alış belgeleri görünümü">
        <button type="button" className={view === "dispatches" ? "active" : ""} onClick={() => setView("dispatches")}><Truck size={16} /> İrsaliyeler</button>
        <button type="button" className={view === "invoices" ? "active" : ""} onClick={() => setView("invoices")}><FileText size={16} /> Faturalar</button>
        <span className="sdw-rule-note">İrsaliye = fiziksel stok · Fatura = maliyet / KDV / cari</span>
        <button type="button" className="sdw-ebutton" onClick={openEBelge}>e‑Belge’de Aç</button>
      </div>

      {view === "dispatches" ? (
        <section className="sdw-card">
          <header>
            <div><Truck size={18} /><span><strong>Tedarikçiden Gelen İrsaliyeler</strong><small>Canonical e‑Belge havuzu · fiziksel giriş gerçeği</small></span></div>
            <button type="button" onClick={loadDispatches}><RefreshCcw size={15} /> Yenile</button>
          </header>
          <div className="sdw-inline-info">Belge içeriği, sağlayıcı/XML/PDF düzeltmeleri ve eşleştirme e‑Belge Merkezi’nde yapılır. Muhasebe burada irsaliyenin stok/LOT sonucunu izler.</div>
          <label className="sdw-search">İrsaliye / tedarikçi ara
            <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Belge no, firma veya VKN" />
          </label>
          {error ? <div className="sdw-message error">{error}</div> : null}
          {error ? null : loading ? <div className="sdw-empty">Tedarikçi irsaliyeleri yükleniyor…</div> : dispatches.length ? (
            <div className="sdw-table-wrap"><table><thead><tr><th>Tarih</th><th>Tedarikçi</th><th>İrsaliye No</th><th>Kaynak</th><th>Kalem</th><th>Kontrol</th></tr></thead><tbody>
              {dispatches.map((row) => (
                <tr key={row.id}>
                  <td>{dateText(row.issue_date || row.created_at)}</td>
                  <td><strong>{row.party_name || "Firma eşleşmesi bekliyor"}</strong></td>
                  <td>{row.document_no || "-"}</td>
                  <td>{sourceText(row)}</td>
                  <td>{Number(row.line_count || 0)}</td>
                  <td>{Number(row.issue_count || 0) ? `${row.issue_count} sorun` : (row.status || "Kontrol bekliyor")}</td>
                </tr>
              ))}
            </tbody></table></div>
          ) : <div className="sdw-empty"><FileText size={24} /><strong>Tedarikçi irsaliyesi yok</strong><span>Gelen irsaliyeler e‑Belge havuzuna ulaştığında burada otomatik görünür.</span></div>}
          {!error && !loading && pageMeta.total > 0 ? <nav className="accounting-document-pagination" aria-label="Gelen irsaliye sayfaları">
            <span>{pageMeta.start}–{pageMeta.end} / {pageMeta.total} kayıt · Sayfa {pageMeta.page}/{pageMeta.pageCount}</span>
            <div>
              <button type="button" aria-label="Önceki sayfa" disabled={!pageMeta.hasPrevious} onClick={() => setPage((current) => Math.max(1, current - 1))}>Önceki</button>
              <button type="button" aria-label="Sonraki sayfa" disabled={!pageMeta.hasNext} onClick={() => setPage((current) => current + 1)}>Sonraki</button>
            </div>
          </nav> : null}
        </section>
      ) : (
        <CanonicalSupplierInventoryWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} openEBelge={openEBelge} />
      )}
    </section>
  );
}
