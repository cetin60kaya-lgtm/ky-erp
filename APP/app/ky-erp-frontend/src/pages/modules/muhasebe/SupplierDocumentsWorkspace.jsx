import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, RefreshCcw, Truck } from "lucide-react";
import { getIsnetDocumentCenter } from "../../../services/isnetDocumentCenterApi";
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

export default function SupplierDocumentsWorkspace({ activeMainCompany, refreshKey = 0 }) {
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const params = useMemo(() => ({
    mainCompanySlug: activeMainCompany?.slug,
    mainCompanyId: activeMainCompany?.id,
    category: "SUPPLIER_INCOMING_DISPATCH",
    page: 1,
    pageSize: 100,
  }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getIsnetDocumentCenter(params);
      setDispatches(Array.isArray(result?.rows) ? result.rows : []);
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
        <small>İşNet bu akışın sağlayıcılarından biridir. Manuel XML/PDF/tarama belgeleri Akıllı Belge Havuzu üzerinden aynı canonical muhasebe çekirdeğine girer.</small>
      </section>

      <section className="sdw-card">
        <header>
          <div><Truck size={18} /><span><strong>Tedarikçiden Gelen İrsaliyeler</strong><small>İşNet satınalma belgeleri</small></span></div>
          <button type="button" onClick={load}><RefreshCcw size={15} /> Yenile</button>
        </header>
        {error ? <div className="sdw-message error">{error}</div> : null}
        {loading ? <div className="sdw-empty">Tedarikçi irsaliyeleri yükleniyor…</div> : dispatches.length ? (
          <div className="sdw-table-wrap">
            <table><thead><tr><th>Tarih</th><th>Tedarikçi</th><th>İrsaliye No</th><th>PDF</th><th>XML</th><th>Durum</th></tr></thead><tbody>
              {dispatches.map((row) => <tr key={row.id}>
                <td>{dateText(row.dateText)}</td>
                <td><strong>{row.partnerName || "Firma eşleşmesi bekliyor"}</strong></td>
                <td>{row.documentNo || "-"}</td>
                <td>{row.pdfSaved ? "Hazır" : "Eksik"}</td>
                <td>{row.xmlSaved ? "Hazır" : "Eksik"}</td>
                <td>Tedarikçi faturası beklenir</td>
              </tr>)}
            </tbody></table>
          </div>
        ) : <div className="sdw-empty"><FileText size={24} /><strong>Tedarikçi irsaliyesi yok</strong><span>İşNet senkronizasyonunda gelen tedarikçi irsaliyeleri burada görünür.</span></div>}
      </section>

      <section className="sdw-invoice-head">
        <div><FileText size={18} /><strong>Tedarikçiden Gelen Faturalar ve Lot İşlemleri</strong></div>
        <small>Fatura işlenince gider/KDV kaydı oluşur; cari borç yalnız firma kartı cari takipliyse eklenir.</small>
      </section>
      <SupplierInventoryWorkspace activeMainCompany={activeMainCompany} refreshKey={refreshKey} />
    </section>
  );
}
