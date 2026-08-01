import { useMemo, useState } from "react";
import { buildApiUrl } from "../../../utils/api";

const REPORTS = [
  ["cari-ekstre", "Cari ekstre", "Firma hareketleri ve bakiye dökümü"],
  ["kdv-raporu", "KDV raporu", "Gelen, giden ve dönem KDV farkı"],
  ["cek-listesi", "Çek listesi", "Açık ve kapanan çekler"],
  ["tedarikci-fatura-kontrol-arsiv", "Tedarikçi fatura kontrol", "Kontrol ve muhasebeleştirme arşivi"],
  ["ekstreye-girmeyen-faturalar", "Ekstreye girmeyen faturalar", "Ödeme ekstresinde bulunmayan belgeler"],
  ["cek-vade-raporu", "Çek vade raporu", "Yaklaşan ve geciken vadeler"],
  ["mail-takip-raporu", "Mail takip raporu", "Gönderim ve alıcı eksikleri"],
  ["aylik-yonetim-ozeti", "Aylık yönetim özeti", "Ayın finansal yönetim görünümü"],
  ["haftalik-yonetim-ozeti", "Haftalık yönetim özeti", "Haftanın kritik muhasebe işleri"],
];
const iso = (date) => date.toISOString().slice(0, 10);

export default function AccountingReportsListWorkspace({ activeMainCompany }) {
  const initial = useMemo(() => { const now = new Date(); return { dateFrom: iso(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)), firmId: "" }; }, []);
  const [filters, setFilters] = useState(initial);
  const open = (type, format) => { const params = { ...filters, mainCompanySlug: activeMainCompany?.slug, mainCompanyId: activeMainCompany?.id }; const path = format === "excel" ? "/muhasebe/rapor-excel" : `/muhasebe/raporlar/${encodeURIComponent(type)}/yazdir`; window.open(buildApiUrl(path, { ...params, tip: type }), "_blank", "noopener,noreferrer"); };
  return <div className="reports-list-workspace"><section className="reports-filter-row"><label>Başlangıç<input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label><label>Bitiş<input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label><label>Firma<input value={filters.firmId} onChange={(event) => setFilters({ ...filters, firmId: event.target.value })} placeholder="Tümü veya firma kimliği" /></label></section><section className="reports-list"><header><span>Rapor</span><span>Açıklama</span><span>Dışa aktarım</span></header>{REPORTS.map(([key, name, description]) => <article key={key}><div><strong>{name}</strong><small>{key}</small></div><p>{description}</p><div><button type="button" onClick={() => open(key, "excel")}>Excel</button><button type="button" onClick={() => open(key, "pdf")}>PDF / Yazdır</button></div></article>)}</section></div>;
}
