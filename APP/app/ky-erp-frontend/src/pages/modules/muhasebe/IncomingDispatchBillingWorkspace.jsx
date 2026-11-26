import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, RefreshCw } from "lucide-react";
import { apiGet } from "../../../utils/api";
import {canonicalCompanySlug} from "../../../utils/companyIdentity";
import "./incomingDispatchBillingWorkspace.css";
import IsnetPartialWorkflow from "./IsnetPartialWorkflow";

const unwrap = value => value?.data?.data ?? value?.data ?? value ?? {};
const day = value => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleDateString("tr-TR");
};
const roleName = role => ({
  CUSTOMER: "Müşteri irsaliyesi",
  SUPPLIER: "Tedarikçi irsaliyesi",
  BOTH: "Müşteri ve tedarikçi · kontrol",
  UNCLASSIFIED: "Cari türü belirlenmemiş",
}[role] || "Cari türü kontrolü");

export default function IncomingDispatchBillingWorkspace({ activeMainCompany, onOpenDocument, actionContext }) {
  const [data, setData] = useState({ loading: true, error: "", rows: [], summary: {}, truncated: false });
  const [filter, setFilter] = useState("CUSTOMER_MISSING");
  const [search, setSearch] = useState("");
  const [period,setPeriod]=useState({from:"",to:""});
  const [partial, setPartial] = useState(null);
  const slug = canonicalCompanySlug(activeMainCompany);
  const refresh = useCallback(async () => {
    if (!slug) {
      setData({ loading: false, error: "Ana firma seçimi zorunludur.", rows: [], summary: {}, truncated: false });
      return;
    }
    setData(old => ({ ...old, loading: true, error: "" }));
    try {
      const result = unwrap(await apiGet("/muhasebe/incoming-dispatches/billing", {
        mainCompanySlug: slug, _ts: Date.now(),
      }));
      if (canonicalCompanySlug(result.mainCompanySlug)!==slug||!Array.isArray(result.rows)) throw Error("Gelen irsaliye firma kapsamı doğrulanamadı.");
      setData({ loading: false, error: "", rows: result.rows,
        summary: result.summary || {}, truncated: result.truncated === true });
    } catch (error) {
      setData({loading:false,rows:[],summary:{},truncated:false,error:error?.message||"Gelen irsaliye bağlantıları alınamadı."});
    }
  }, [slug]);
  useEffect(() => { setPartial(null); void refresh(); }, [refresh]);

  useEffect(()=>{if(actionContext?.targetModule!=="e-belge"||actionContext.targetTab!=="gelen-irsaliyeler")return;if(["CUSTOMER_MISSING","CUSTOMER_DISPATCH_MISSING","ROLE_REVIEW"].includes(actionContext.billingFilter)){setFilter(actionContext.billingFilter);setSearch("");setPeriod({from:actionContext.from||"",to:actionContext.to||""});setPartial(null)}},[actionContext?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const dated=useMemo(()=>data.rows.filter(row=>{const d=String(row.issueDate||"").slice(0,10);return (!period.from||d>=period.from)&&(!period.to||d<=period.to)}),[data.rows,period]);
  const shown = useMemo(() => dated.filter(row => {
    const matches = filter === "ALL" ||
      (filter === "CUSTOMER_DISPATCH_MISSING" && row.companyType === "CUSTOMER" && row.dispatchLinkStatus === "DISPATCH_LINK_MISSING") ||
      (filter === "CUSTOMER_MISSING" && row.companyType === "CUSTOMER" && row.status === "INVOICE_LINK_MISSING") ||
      (filter === "CUSTOMER_LINKED" && row.companyType === "CUSTOMER" && row.status === "INVOICE_LINKED") ||
      (filter === "SUPPLIER" && row.companyType === "SUPPLIER") ||
      (filter === "ROLE_REVIEW" && row.status === "ROLE_REVIEW");
    return matches && (row.dispatchNo + " " + row.companyName + " " + (row.invoiceNumbers || []).join(" "))
      .toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR").trim());
  }), [dated, filter, search]);

  const count=predicate=>data.loading||data.error?null:dated.filter(predicate).length;
  const filters = [
    ["CUSTOMER_DISPATCH_MISSING", "Müşteri · Sevk Bağı Bekleyen", count(x=>x.companyType==="CUSTOMER"&&x.dispatchLinkStatus==="DISPATCH_LINK_MISSING")],
    ["CUSTOMER_MISSING", "Müşteri · Fatura Bağı Bekleyen", count(x=>x.companyType==="CUSTOMER"&&x.status==="INVOICE_LINK_MISSING")],
    ["CUSTOMER_LINKED", "Müşteri · Fatura Bağlı", count(x=>x.companyType==="CUSTOMER"&&x.status==="INVOICE_LINKED")],
    ["SUPPLIER", "Tedarikçi İrsaliyeleri", count(x=>x.companyType==="SUPPLIER")],
    ["ROLE_REVIEW", "Cari Türü Kontrolü", count(x=>x.status==="ROLE_REVIEW")],
    ["ALL", "Tümü", count(()=>true)],
  ];

  return <section className="idb-root" aria-label="Gelen irsaliye müşteri tedarikçi fatura bağlantısı">
    <header className="idb-header">
      <div><h3>Gelen İrsaliye · Faturalandırma Takibi</h3>
        <p>Müşteri iş irsaliyesi ile tedarikçi mal irsaliyesi ayrıdır. Sadece doğrulanmış fatura bağlantısı gösterilir.</p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={data.loading}><RefreshCw size={15}/> Yenile</button>
    </header>
    <div className="idb-filters" role="group" aria-label="Gelen irsaliye ayrımı">
      {filters.map(([key, label, count]) => <button type="button" key={key}
        aria-pressed={filter === key} className={filter === key ? "active" : ""}
        onClick={() => setFilter(key)}>{label} <b>{count??"—"}</b></button>)}
    </div>
    {(period.from||period.to)&&<div>Kaynak belge dönemi: {period.from||"—"} – {period.to||"—"} <button type="button" onClick={()=>setPeriod({from:"",to:""})}>Tüm Dönem</button></div>}
    <label className="idb-search">Belge no / firma ara
      <input value={search} onChange={event => setSearch(event.target.value)}
        placeholder="Örneğin Taha, irsaliye numarası" />
    </label>
    {data.error && <div className="idb-error" role="alert"><AlertTriangle size={16}/> {data.error}</div>}
    {data.truncated && <div className="idb-warning">Son 2.000 gelen irsaliye kontrol edildi. Daha eski kayıtlar bu sayımda bulunmayabilir.</div>}
    {partial && <IsnetPartialWorkflow key={slug+":"+partial.id} row={partial} slug={slug} onClose={()=>setPartial(null)}/>}
    {data.loading ? <p className="idb-loading">Fatura bağları kontrol ediliyor…</p> :
      <div className="idb-scroll"><table>
        <thead><tr><th>İrsaliye / Tarih</th><th>Firma</th><th>İrsaliye Türü</th>
          <th>Giden Sevk Bağı</th><th>Fatura Bağı</th><th>İşlem</th></tr></thead>
        <tbody>
          {shown.map(row => <tr key={row.id}>
            <td><strong>{row.dispatchNo || "No bekliyor"}</strong><small>{day(row.issueDate)}</small></td>
            <td>{row.companyName || "Cari eşleşmesi bekliyor"}</td>
            <td>{roleName(row.companyType)}{row.roleSource==="VERIFIED_SALES_HISTORY"&&<small> · Satış faturası geçmişi</small>}{row.roleSource==="VERIFIED_PURCHASE_HISTORY"&&<small> · Alış faturası geçmişi</small>}{row.roleSource==="ROLE_CONFLICT_REVIEW"&&<small> · Cari kontrolü</small>}</td>
            <td>{row.companyType!=="CUSTOMER"?"—":row.dispatchLinkStatus==="DISPATCH_LINKED"?<span className="idb-linked">{row.outgoingDispatchNumbers?.join(", ")||"Sevk bağı mevcut"}</span>:<span className="idb-pending">Sevk bağı bulunamadı</span>}</td>
            <td>{row.status === "ROLE_REVIEW" ?
              <span className="idb-note"><AlertTriangle size={14}/> Cari türünü doğrula</span> :
              row.status === "INVOICE_LINKED" ?
              <span className="idb-linked"><CheckCircle2 size={14}/> {row.invoiceNumbers?.join(", ") || "Fatura bağı mevcut"}</span> :
              <span className="idb-pending">Fatura bağlantısı bulunamadı · kontrol bekliyor</span>}</td>
            <td><button type="button" onClick={() => onOpenDocument?.(row.id)}>
              <FileText size={14}/> İrsaliyeyi Aç
            </button>{row.companyType==="CUSTOMER"&&row.companyCardRole==="CUSTOMER"&&<button type="button" onClick={()=>setPartial(row)}>Gelenden irsaliye oluştur</button>}{row.companyType==="CUSTOMER"&&row.companyCardRole!=="CUSTOMER"&&<span>İşlem öncesi cari doğrulaması gerekli</span>}</td>
          </tr>)}
        </tbody>
      </table>{!shown.length && <p className="idb-empty">Bu filtrede kayıt yok.</p>}</div>}
    <p className="idb-caveat"><strong>Fatura kesimi:</strong> Bu kontrol sadece mevcut belgeleri okur.
      Sevk veya fatura bağı bulunmaması, sağlayıcıda belgenin hiç düzenlenmediğini kanıtlamaz. Bağlı belge bütün miktarın tamamlandığı anlamına gelmez; kısmi işlemleri kalem önizlemesinden kontrol edin.
      Yeni fatura oluşturma/gönderme, yetkili İşNet fatura düzenleme akışı ayrıca doğrulanmadan otomatik başlatılmaz.</p>
  </section>;
}
