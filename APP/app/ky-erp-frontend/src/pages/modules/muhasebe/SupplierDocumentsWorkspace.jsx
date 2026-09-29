import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, RefreshCcw, Truck } from "lucide-react";
import { getEBelgePool } from "../../../services/eBelgeApi";
import CanonicalSupplierInventoryWorkspace from "./CanonicalSupplierInventoryWorkspace";
import "./supplierDocumentsWorkspace.css";

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

  const params = useMemo(() => ({
    mainCompanySlug: activeMainCompany?.slug,
    mainCompanyId: activeMainCompany?.id,
    filter: "INCOMING_DISPATCH",
    page: 1,
    pageSize: 100,
  }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const loadDispatches = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getEBelgePool({ ...params, _ts: Date.now() });
      setDispatches(Array.isArray(result?.items) ? result.items : []);
    } catch (requestError) {
      setDispatches([]);
      setError(requestError?.message || "Tedarikçi irsaliyeleri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    if (view === "dispatches") void loadDispatches();
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
          {error ? <div className="sdw-message error">{error}</div> : null}
          {loading ? <div className="sdw-empty">Tedarikçi irsaliyeleri yükleniyor…</div> : dispatches.length ? (
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
        </section>
      ) : (
        <CanonicalSupplierInventoryWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} openEBelge={openEBelge} />
      )}
    </section>
  );
}
