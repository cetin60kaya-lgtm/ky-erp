import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { getYonetimOzeti } from "../../services/muhasebeApi";
import {
  DataTable,
  Kpi,
  Status,
  emptyRows,
  field,
  formatMoney,
  formatNumber,
  normalizeSummary,
} from "./_MuhasebeShared";

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function MuhasebeYonetimOzeti({ activeMainCompany, openTab }) {
  const [filters, setFilters] = useState({
    startDate: monthStart(),
    endDate: today(),
    companyId: "",
    officialType: "",
  });
  const [data, setData] = useState({ summary: normalizeSummary({}), ...emptyRows });
  const [loading, setLoading] = useState(false);

  const summary = useMemo(() => normalizeSummary(data), [data]);

  const load = async () => {
    setLoading(true);
    try {
      const payload = await getYonetimOzeti({ ...filters, ...(activeMainCompany || {}) });
      setData({
        summary: normalizeSummary(payload),
        gunlukIsListesi: payload?.gunlukIsListesi.length ? payload?.gunlukIsListesi : emptyRows.gunlukIsListesi,
        kesilenFaturalar: payload?.kesilenFaturalar.length ? payload?.kesilenFaturalar : emptyRows.kesilenFaturalar,
        gelenFaturalar: payload?.gelenFaturalar.length ? payload?.gelenFaturalar : emptyRows.gelenFaturalar,
        yapilanIsler: payload?.yapilanIsler.length ? payload?.yapilanIsler : emptyRows.yapilanIsler,
        yaklasanOdemeler: payload?.yaklasanOdemeler.length ? payload?.yaklasanOdemeler : emptyRows.yaklasanOdemeler,
      });
    } catch {
      setData({ summary: normalizeSummary({}), ...emptyRows });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="mh-management-page">
      <section className="mh-card">
        <div className="mh-filterbar">
          <label>
            <span>Başlangıç tarihi</span>
            <input type="date" value={filters.startDate} onChange={(e) => setFilter("startDate", e.target.value)} />
          </label>
          <label>
            <span>Bitiş tarihi</span>
            <input type="date" value={filters.endDate} onChange={(e) => setFilter("endDate", e.target.value)} />
          </label>
          <label>
            <span>Firma filtresi</span>
            <input value={filters.companyId} onChange={(e) => setFilter("companyId", e.target.value)} placeholder="Firma adı veya ID" />
          </label>
          <label>
            <span>Resmi / gayri</span>
            <select value={filters.officialType} onChange={(e) => setFilter("officialType", e.target.value)}>
              <option value="">Tümü</option>
              <option value="RESMI">Resmi</option>
              <option value="GAYRI">Gayri</option>
            </select>
          </label>
          <button className="mh-btn primary" type="button" onClick={load}><RefreshCw size={15} /> Yenile</button>
          <button className="mh-btn" type="button" onClick={() => window.print()}><Printer size={15} /> Haftalık özet yazdır</button>
          <button className="mh-btn" type="button" onClick={() => window.print()}><Printer size={15} /> Aylık özet yazdır</button>
        </div>
      </section>

      <div className="mh-layout-main-right">
        <div>
          <div className="mh-kpi-grid dense">
            <Kpi label="Kesilen Fatura Toplamı" value={summary.kesilenFaturaToplami} />
            <Kpi label="Gelen Fatura Toplamı" value={summary.gelenFaturaToplami} tone="green" />
            <Kpi label="Yapılan İş / Üretim Toplamı" value={summary.yapilanIsToplami} tone="purple" money={false} />
            <Kpi label="Tahsilat Toplamı" value={summary.tahsilatToplami} tone="green" />
            <Kpi label="Ödeme Toplamı" value={summary.odemeToplami} tone="orange" />
            <Kpi label="Tahsilat Bekleyen" value={summary.tahsilatBekleyen} tone="orange" />
            <Kpi label="Ödeme Bekleyen" value={summary.odemeBekleyen} tone="red" />
            <Kpi label="Gelen KDV" value={summary.gelenKdv} tone="green" />
            <Kpi label="Giden KDV" value={summary.gidenKdv} />
            <Kpi label="Devreden KDV" value={summary.devredenKdv} tone="orange" />
            <Kpi label="Net KDV" value={summary.netKdv} tone="dark" />
            <Kpi label="Tahmini Kar" value={summary.tahminiKar} tone="purple" />
            <Kpi label="Onay Bekleyen Belge" value={summary.onayBekleyenBelge} money={false} tone="red" />
            <Kpi label="Mail Bekleyen Fatura" value={summary.mailBekleyenFatura} money={false} />
            <Kpi label="Alıcı / Departman Eksik" value={summary.departmanYetkilisiEksik} money={false} tone="orange" />
            <Kpi label="Ekstreye Girmeyen Fatura" value={summary.ekstreyeGirmeyen} money={false} tone="red" />
          </div>
          <small className="mh-note">Tahmini Kar = kesilen fatura toplamı - gelen fatura toplamı - ödeme toplamı.</small>

          <section className="mh-card">
            <div className="mh-card-head"><h2>Günlük Muhasebe İş Listesi</h2>{loading ? <Status>Yükleniyor</Status> : null}</div>
            <div className="mh-card-body">
              <DataTable
                rows={data?.gunlukIsListesi}
                columns={[
                  { key: "oncelik", label: "Öncelik", render: (r) => field(r, ["oncelik", "priority"]) },
                  { key: "is", label: "İş", render: (r) => field(r, ["is", "job", "title"]) },
                  { key: "firma", label: "Firma", render: (r) => field(r, ["firma", "companyName", "firmName"]) },
                  { key: "model", label: "Model" },
                  { key: "belge", label: "Belge", render: (r) => field(r, ["belge", "documentNo"]) },
                  { key: "tutar", label: "Tutar", render: (r) => formatMoney(field(r, ["tutar", "amount"], 0)) },
                  { key: "durum", label: "Durum", render: (r) => <Status tone="orange">{field(r, ["durum", "status"])}</Status> },
                  { key: "islem", label: "İşlem", render: () => <button className="mh-btn">Aç</button> },
                ]}
              />
            </div>
          </section>

          <div className="mh-management-grid">
            <Panel title="Kesilen Faturalar">
              <DataTable rows={data?.kesilenFaturalar} columns={[
                { key: "tarih", label: "Tarih", render: (r) => field(r, ["tarih", "date"]) },
                { key: "belgeNo", label: "Belge No", render: (r) => field(r, ["belgeNo", "documentNo"]) },
                { key: "firma", label: "Firma", render: (r) => field(r, ["firma", "companyName"]) },
                { key: "model", label: "Model" },
                { key: "adet", label: "Adet", render: (r) => formatNumber(field(r, ["adet", "qty"], 0)) },
                { key: "tutar", label: "Tutar", render: (r) => formatMoney(field(r, ["tutar", "amount"], 0)) },
                { key: "kdv", label: "KDV", render: (r) => formatMoney(field(r, ["kdv", "vat"], 0)) },
                { key: "cariDurum", label: "Cari Durum" },
                { key: "mailDurumu", label: "Mail Durumu" },
              ]} />
            </Panel>
            <Panel title="Gelen Faturalar">
              <DataTable rows={data?.gelenFaturalar} columns={[
                { key: "tarih", label: "Tarih", render: (r) => field(r, ["tarih", "date"]) },
                { key: "belgeNo", label: "Belge No", render: (r) => field(r, ["belgeNo", "documentNo"]) },
                { key: "firma", label: "Firma", render: (r) => field(r, ["firma", "companyName"]) },
                { key: "tutar", label: "Tutar", render: (r) => formatMoney(field(r, ["tutar", "amount"], 0)) },
                { key: "kdv", label: "KDV", render: (r) => formatMoney(field(r, ["kdv", "vat"], 0)) },
                { key: "odemeDurumu", label: "Ödeme Durumu" },
                { key: "cariDurum", label: "Cari Durum" },
              ]} />
            </Panel>
            <Panel title="Yapılan İşler / Üretim Özeti">
              <DataTable rows={data?.yapilanIsler} columns={[
                { key: "tarih", label: "Tarih" },
                { key: "firma", label: "Firma" },
                { key: "model", label: "Model" },
                { key: "siparisNo", label: "Sipariş No" },
                { key: "gelenAdet", label: "Gelen Adet", render: (r) => formatNumber(field(r, ["gelenAdet", "incomingQty"], 0)) },
                { key: "uretilenAdet", label: "Üretilen Adet", render: (r) => formatNumber(field(r, ["uretilenAdet", "producedQty"], 0)) },
                { key: "tamTakim", label: "Tam Takım", render: (r) => formatNumber(field(r, ["tamTakim"], 0)) },
                { key: "faturalananAdet", label: "Faturalanan Adet", render: (r) => formatNumber(field(r, ["faturalananAdet", "invoiceQty"], 0)) },
                { key: "kalanAdet", label: "Kalan Adet", render: (r) => formatNumber(field(r, ["kalanAdet", "remainingQty"], 0)) },
                { key: "durum", label: "Durum" },
              ]} />
            </Panel>
            <Panel title="Yaklaşan Ödeme / Çek Vadeleri">
              <DataTable rows={data?.yaklasanOdemeler} columns={[
                { key: "vade", label: "Vade" },
                { key: "firma", label: "Firma" },
                { key: "belge", label: "Belge" },
                { key: "odemeTipi", label: "Ödeme Tipi" },
                { key: "tutar", label: "Tutar", render: (r) => formatMoney(field(r, ["tutar", "amount"], 0)) },
                { key: "durum", label: "Durum" },
              ]} />
            </Panel>
          </div>
        </div>

        <aside className="mh-card">
          <div className="mh-card-head"><h2>Yönetim Özeti</h2></div>
          <div className="mh-card-body mh-side-lines">
            <Line label="Bu ay satış" value={formatMoney(summary.kesilenFaturaToplami)} />
            <Line label="Bu ay alış / gider" value={formatMoney(summary.gelenFaturaToplami)} />
            <Line label="Tahmini kar" value={formatMoney(summary.tahminiKar)} />
            <Line label="Gelen KDV" value={formatMoney(summary.gelenKdv)} />
            <Line label="Giden KDV" value={formatMoney(summary.gidenKdv)} />
            <Line label="Net KDV" value={formatMoney(summary.netKdv)} />
            <Line label="Tahsilat bekleyen" value={formatMoney(summary.tahsilatBekleyen)} />
            <Line label="Ödeme bekleyen" value={formatMoney(summary.odemeBekleyen)} />
            <button className="mh-btn primary" onClick={() => window.print()}>Haftalık özet yazdır</button>
            <button className="mh-btn" onClick={() => openTab?.("rapor")}>Aylık rapor aç</button>
            <button className="mh-btn" onClick={() => openTab?.("mail")}>Mail bekleyenleri aç</button>
            <button className="mh-btn" onClick={() => openTab?.("mail")}>Ekstre farklarını aç</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="mh-card">
      <div className="mh-card-head"><h2>{title}</h2></div>
      <div className="mh-card-body">{children}</div>
    </section>
  );
}

function Line({ label, value }) {
  return <div className="mh-side-line"><span>{label}</span><b>{value}</b></div>;
}
