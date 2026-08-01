import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../../../utils/api";

const money = (value) => Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const date = (value) => value ? new Date(value).toLocaleDateString("tr-TR") : "-";
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};
const rowsOf = (value) => Array.isArray(value) ? value : [];

function Metric({ label, value, emphasis = false }) {
  return <div className={`management-metric ${emphasis ? "emphasis" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function CompactList({ title, columns, rows, renderRow, emptyText }) {
  return (
    <section className="management-list-card">
      <header><h2>{title}</h2><span>{rows.length} kayıt</span></header>
      <div className="management-table-wrap">
        <table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{rows.length ? rows.map(renderRow) : <tr><td colSpan={columns.length}><div className="management-empty">{emptyText}</div></td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}

export default function ManagementOverviewWorkspace({ activeMainCompany, refreshKey, goTab }) {
  const [state, setState] = useState({ loading: true, error: "", data: {} });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await apiGet("/muhasebe/yonetim-ozeti", {
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
        _ts: Date.now(),
      });
      setState({ loading: false, error: "", data: unwrap(payload) });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Yönetim özeti şu anda alınamadı.", data: {} });
    }
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => { load(); }, [load, refreshKey]);
  const data = useMemo(() => state.data || {}, [state.data]);
  const totals = data.totals || {};
  const receivable = Number(data.toplamAlacak ?? data.tahsilatBekleyen ?? totals.receivable ?? 0);
  const payable = Number(data.toplamBorc ?? data.odemeBekleyen ?? totals.payable ?? 0);
  const netBalance = Number(data.netBakiye ?? totals.balance ?? receivable - payable);
  const incomingVat = Number(data.gelenKdv ?? totals.vatIncoming ?? 0);
  const outgoingVat = Number(data.gidenKdv ?? totals.vatOutgoing ?? 0);
  const netVat = Number(data.odenecekKdv ?? data.netKdv ?? totals.vatPayable ?? outgoingVat - incomingVat);
  const recentMovements = rowsOf(data.sonCariHareketler || data.recentMovements).slice(0, 10);
  const topSuppliers = rowsOf(data.enYuksekTedarikciler).slice(0, 10);
  const topCustomers = rowsOf(data.enYuksekMusteriler).slice(0, 10);
  const upcomingChecks = rowsOf(data.yaklasanCekler || data.yaklasanOdemeler).slice(0, 10);
  const missingDocuments = useMemo(() => rowsOf(data.eksikBelgeler).length
    ? rowsOf(data.eksikBelgeler).slice(0, 10)
    : rowsOf(data.gunlukIsListesi).filter((row) => /belge|eşleş|esles/i.test(`${row?.is || ""} ${row?.durum || ""}`)).slice(0, 10), [data]);

  if (state.loading) return <div className="management-skeleton">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>;
  if (state.error) return <section className="management-controlled-state"><strong>Yönetim özeti yüklenemedi.</strong><span>{state.error}</span><button type="button" onClick={load}>Tekrar dene</button></section>;

  return (
    <div className="management-overview">
      <section className="management-primary-metrics">
        <Metric label="Toplam alacak" value={money(receivable)} emphasis />
        <Metric label="Toplam borç" value={money(payable)} emphasis />
        <Metric label="Net bakiye" value={money(netBalance)} emphasis />
      </section>
      <section className="management-secondary-metrics">
        <Metric label="Bu ay gelen fatura" value={money(data.buAyGelenFatura ?? data.buAyAlisGider)} />
        <Metric label="Bu ay kesilen fatura" value={money(data.buAyKesilenFatura ?? data.buAySatis)} />
        <Metric label="Gelen KDV" value={money(incomingVat)} />
        <Metric label="Giden KDV" value={money(outgoingVat)} />
        <Metric label={netVat > 0 ? "Ödenecek KDV" : "Devreden KDV"} value={money(Math.abs(netVat))} />
        <Metric label="Yaklaşan çek" value={money(data.yaklasanCekToplami ?? data.cekOzet?.yaklasanCekTutari)} />
        <Metric label="Vadesi geçen cari" value={money(data.vadesiGecenCari)} />
        <Metric label="İşNet son senkronizasyon" value={data.isnetSonSenkronizasyon ? date(data.isnetSonSenkronizasyon) : "Henüz yok"} />
        <Metric label="Kontrol bekleyen belge" value={String(data.kontrolBekleyenBelge ?? data.onayBekleyenBelge ?? 0)} />
      </section>
      <div className="management-lists-grid">
        <CompactList title="Son cari hareketler" columns={["Tarih", "Firma", "Açıklama", "Tutar"]} rows={recentMovements} emptyText="Henüz cari hareket yok." renderRow={(row, index) => <tr key={row.id || index}><td>{date(row.tarih || row.movementDate)}</td><td>{row.firma || row.companyName || "-"}</td><td>{row.aciklama || row.description || "-"}</td><td>{money(row.tutar || row.amount)}</td></tr>} />
        <CompactList title="Bu ay en yüksek tedarikçiler" columns={["Firma", "Belge", "Toplam"]} rows={topSuppliers} emptyText="Bu ay tedarikçi faturası yok." renderRow={(row, index) => <tr key={row.id || row.firma || index}><td>{row.firma || row.companyName || "-"}</td><td>{row.belgeSayisi || row.count || 0}</td><td>{money(row.toplam || row.total)}</td></tr>} />
        <CompactList title="Bu ay en yüksek müşteriler" columns={["Firma", "Belge", "Toplam"]} rows={topCustomers} emptyText="Bu ay kesilen fatura yok." renderRow={(row, index) => <tr key={row.id || row.firma || index}><td>{row.firma || row.companyName || "-"}</td><td>{row.belgeSayisi || row.count || 0}</td><td>{money(row.toplam || row.total)}</td></tr>} />
        <CompactList title="Yaklaşan çekler" columns={["Vade", "Firma", "Çek no", "Tutar"]} rows={upcomingChecks} emptyText="Yaklaşan çek bulunmuyor." renderRow={(row, index) => <tr key={row.id || index}><td>{date(row.vadeTarihi || row.dueDate)}</td><td>{row.firma || row.companyName || "-"}</td><td>{row.cekNo || row.checkNo || "-"}</td><td>{money(row.tutar || row.amount)}</td></tr>} />
        <CompactList title="Eksik / eşleşmeyen belgeler" columns={["Belge", "Firma", "Eksik", "İşlem"]} rows={missingDocuments} emptyText="Eksik veya eşleşmeyen belge yok." renderRow={(row, index) => <tr key={row.id || row.belge || index}><td>{row.belgeNo || row.belge || row.documentNo || "-"}</td><td>{row.firma || "-"}</td><td>{row.durum || row.eksik || "Kontrol"}</td><td><button type="button" onClick={() => goTab("tedarikci-faturalar")}>İncele</button></td></tr>} />
      </div>
    </div>
  );
}
