import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, RefreshCcw, Truck } from "lucide-react";
import { getEBelgePool } from "../../../services/eBelgeApi";
import SupplierInventoryWorkspace from "./SupplierInventoryWorkspace";
import DocumentPoolPanel from "./DocumentPoolPanel";
import "./supplierDocumentsWorkspace.css";

const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : parsed.toLocaleDateString("tr-TR");
};

const sourceText = (row = {}) => {
  const source = String(row.source_type || row.provider_type || "MANUAL").toUpperCase();
  if (source.includes("ISNET")) return "İşNet";
  if (source.includes("XML")) return "XML";
  if (source.includes("AI") || source.includes("SCAN")) return "PDF / Görsel";
  return row.provider_type || row.source_type || "Manuel";
};

export default function SupplierDocumentsWorkspace({ activeMainCompany, refreshKey = 0 }) {
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

  const load = useCallback(async () => {
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

  useEffect(() => { void load(); }, [load, refreshKey]);

  return (
    <section className="sdw-root">
      <DocumentPoolPanel activeMainCompany={activeMainCompany} />

      <section className="sdw-flow">
        <div><Truck size={20} /><strong>Tedarikçi Alış Zinciri</strong></div>
        <p><b>Tedarikçiden Gelen İrsaliye</b><span>→</span><b>Tedarikçiden Gelen Fatura</b><span>→</span>Gider / KDV / Stok-Lot / Cari</p>
        <small>İşNet yalnız sağlayıcılardan biridir. İşNet, manuel XML/PDF ve tarama belgeleri aynı canonical e-Belge havuzunda birlikte görünür.</small>
      </section>

      <section className="sdw-card">
        <header>
          <div><Truck size={18} /><span><strong>Tedarikçiden Gelen İrsaliyeler</strong><small>Canonical e-Belge havuzu · tüm sağlayıcılar</small></span></div>
          <button type="button" onClick={load}><RefreshCcw size={15} /> Yenile</button>
        </header>
        {error ? <div className="sdw-message error">{error}</div> : null}
        {loading ? <div className="sdw-empty">Tedarikçi irsaliyeleri yükleniyor…</div> : dispatches.length ? (
          <div className="sdw-table-wrap">
            <table><thead><tr><th>Tarih</th><th>Tedarikçi</th><th>İrsaliye No</th><th>Kaynak</th><th>Kalem</th><th>Kontrol</th></tr></thead><tbody>
              {dispatches.map((row) => <tr key={row.id}>
                <td>{dateText(row.issue_date || row.created_at)}</td>
                <td><strong>{row.party_name || "Firma eşleşmesi bekliyor"}</strong></td>
                <td>{row.document_no || "-"}</td>
                <td>{sourceText(row)}</td>
                <td>{Number(row.line_count || 0)}</td>
                <td>{Number(row.issue_count || 0) ? `${row.issue_count} sorun` : (row.status || "Kontrol bekliyor")}</td>
              </tr>)}
            </tbody></table>
          </div>
        ) : <div className="sdw-empty"><FileText size={24} /><strong>Tedarikçi irsaliyesi yok</strong><span>İşNet, XML/PDF veya taramadan gelen tedarikçi irsaliyeleri burada birlikte görünür.</span></div>}
      </section>

      <section className="sdw-invoice-head">
        <div><FileText size={18} /><strong>Tedarikçiden Gelen Faturalar ve Lot İşlemleri</strong></div>
        <small>Fatura işlenince gider/KDV kaydı oluşur; cari borç yalnız firma kartı cari takipliyse eklenir.</small>
      </section>
      <SupplierInventoryWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} />
    </section>
  );
}
