import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Printer, RefreshCcw, X } from "lucide-react";
import { apiGet } from "../../../utils/api";
import "./accountingReportsListWorkspace.css";

const REPORTS = [
  { key: "cari-ekstre", name: "Cari ekstre", description: "Firma hareketleri ve bakiye dökümü", category: "Cari" },
  { key: "gelen-faturalar", name: "Gelen faturalar", description: "İşNet ve manuel tedarikçi faturaları", category: "Fatura" },
  { key: "kesilen-faturalar", name: "Kesilen faturalar", description: "Müşterilere kesilen faturaların dönem listesi", category: "Fatura" },
  { key: "kdv-raporu", name: "Gelen / giden KDV", description: "Firma bazlı matrah ve KDV karşılaştırması", category: "KDV" },
  { key: "cek-vade-raporu", name: "Çek vade raporu", description: "Yaklaşan, geciken ve ödenen çekler", category: "Çek" },
  { key: "kar-zarar", name: "Gelir / gider ve kâr zarar", description: "Dönemsel gelir, gider ve net sonuç", category: "Finans" },
  { key: "faturasi-kesilmeyen-modeller", name: "Faturası kesilmeyen modeller", description: "İrsaliye ve fatura adet farkları", category: "Kontrol" },
  { key: "mail-takip", name: "Ekstre ve mail takip", description: "Ekstre istekleri, mail ve alıcı eksikleri", category: "Mail" },
  { key: "aylik-yonetim-ozeti", name: "Aylık yönetim özeti", description: "Cari, fatura, KDV ve çek toplamları", category: "Yönetim" },
];

const iso = (date) => date.toISOString().slice(0, 10);
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
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toLocaleDateString("tr-TR");
};
const inRange = (value, from, to) => {
  const date = String(value || "").slice(0, 10);
  if (!date) return true;
  return (!from || date >= from) && (!to || date <= to);
};
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function normalizeTable(columns, rows, summary = []) {
  return { columns, rows, summary };
}

export default function AccountingReportsListWorkspace({ activeMainCompany }) {
  const initial = useMemo(() => {
    const now = new Date();
    return {
      dateFrom: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      dateTo: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      firmId: "",
    };
  }, []);
  const [filters, setFilters] = useState(initial);
  const [firms, setFirms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState({ loading: false, error: "", columns: [], rows: [], summary: [] });

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    }),
    [activeMainCompany?.id, activeMainCompany?.slug],
  );

  useEffect(() => {
    apiGet("/muhasebe/firmalar", { ...params, limit: 10000, _ts: Date.now() })
      .then((payload) => setFirms(listOf(payload)))
      .catch(() => setFirms([]));
  }, [params]);

  const firmMap = useMemo(
    () => new Map(firms.map((firm) => [String(firm.id), firm.firmaAdi || firm.name || ""])),
    [firms],
  );

  const loadReport = useCallback(
    async (definition) => {
      setSelected(definition);
      setReport({ loading: true, error: "", columns: [], rows: [], summary: [] });
      try {
        let table;
        const common = {
          ...params,
          firmId: filters.firmId || undefined,
          companyId: filters.firmId || undefined,
          startDate: filters.dateFrom,
          endDate: filters.dateTo,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          limit: 500,
          _ts: Date.now(),
        };

        if (definition.key === "cari-ekstre") {
          const rows = listOf(await apiGet("/muhasebe/cari-hareketler", common));
          table = normalizeTable(
            ["Tarih", "Firma", "İşlem", "Belge No", "Açıklama", "Borç", "Alacak", "Bakiye"],
            rows.map((row) => [
              dateText(row.movement_date || row.date),
              firmMap.get(String(row.company_id || row.firm_id)) || row.company_name || "-",
              row.movement_type || row.type || "-",
              row.document_no || "-",
              row.description || "-",
              money(row.debit),
              money(row.credit),
              money(row.balance_after),
            ]),
          );
        } else if (definition.key === "gelen-faturalar") {
          const rows = listOf(await apiGet("/muhasebe/belge-import", common)).filter((row) =>
            inRange(row.issueDate || row.createdAt, filters.dateFrom, filters.dateTo),
          );
          table = normalizeTable(
            ["Tarih", "Firma", "Fatura No", "Matrah", "KDV", "Toplam", "Kaynak", "Durum"],
            rows.map((row) => [
              dateText(row.issueDate),
              row.companyName || row.supplierName || "-",
              row.documentNo || "-",
              money(row.subtotal),
              money(row.vatTotal),
              money(row.grandTotal),
              /ISNET/i.test(String(row.sourceType || "")) ? "İşNet" : "Manuel",
              row.status || "-",
            ]),
            [["Belge sayısı", rows.length], ["Genel toplam", money(rows.reduce((sum, row) => sum + Number(row.grandTotal || 0), 0))]],
          );
        } else if (definition.key === "kesilen-faturalar") {
          const payload = await apiGet("/muhasebe/kesilen-faturalar", common);
          const rows = listOf(payload).filter((row) => inRange(row.issueDate || row.createdAt, filters.dateFrom, filters.dateTo));
          table = normalizeTable(
            ["Tarih", "Müşteri", "Fatura No", "Model", "Adet", "Matrah", "KDV", "Toplam", "Durum"],
            rows.map((row) => [
              dateText(row.issueDate),
              row.companyName || "-",
              row.documentNo || "-",
              row.modelName || "-",
              Number(row.quantity || 0).toLocaleString("tr-TR"),
              money(row.subtotal),
              money(row.vatTotal),
              money(row.grandTotal),
              row.status || "-",
            ]),
          );
        } else if (definition.key === "kdv-raporu") {
          const month = filters.dateFrom.slice(0, 7);
          const data = unwrap(
            await apiGet("/vat/summary", {
              ...params,
              year: Number(month.slice(0, 4)),
              month: Number(month.slice(5, 7)),
              _ts: Date.now(),
            }),
          );
          const rows = Array.isArray(data.liste) ? data.liste : [];
          table = normalizeTable(
            ["Firma", "Gelen Matrah", "İndirilecek KDV", "Giden Matrah", "Hesaplanan KDV", "Belge"],
            rows.map((row) => [
              row.firma || "-",
              money(row.gelenMatrah),
              money(row.gelenKdv),
              money(row.gidenMatrah),
              money(row.gidenKdv),
              Number(row.belgeSayisi || 0),
            ]),
            [
              ["İndirilecek KDV", money(data.incomingVat)],
              ["Hesaplanan KDV", money(data.outgoingVat)],
              ["Ödenecek KDV", money(data.payableVat)],
              ["Devreden KDV", money(data.carryForwardVat)],
            ],
          );
        } else if (definition.key === "cek-vade-raporu") {
          const data = unwrap(await apiGet("/muhasebe/odeme/cekler", common));
          const rows = Array.isArray(data.rows) ? data.rows : [];
          table = normalizeTable(
            ["Vade", "Kalan Gün", "Banka", "Firma", "Tutar", "Çek No", "Hesap", "Durum"],
            rows.map((row) => [
              dateText(row.dueDate),
              row.remainingDays ?? "-",
              row.bank || row.banka || "-",
              row.companyName || row.firma || "-",
              money(row.amount),
              row.chequeNo || row.cekNo || "-",
              row.account || row.hesap || "-",
              row.status || "-",
            ]),
            [["Toplam çek", money(data.summary?.total)], ["Çek adedi", Number(data.summary?.count || 0)]],
          );
        } else if (definition.key === "kar-zarar") {
          const data = unwrap(await apiGet("/muhasebe/accounting/reports/records", common));
          const rows = Array.isArray(data.records) ? data.records : [];
          table = normalizeTable(
            ["Tarih", "Firma", "Belge No", "Tür", "Kategori", "Tutar", "KDV", "Kayıt"],
            rows.map((row) => [
              dateText(row.date),
              row.companyName || "-",
              row.documentNo || "-",
              row.type === "INCOME" ? "Gelir" : "Gider",
              row.category || "-",
              money(row.amount),
              money(row.vatAmount),
              row.recordType || "-",
            ]),
            [
              ["Toplam gelir", money(data.summary?.totalIncome)],
              ["Toplam gider", money(data.summary?.totalExpense)],
              ["Net sonuç", money(data.summary?.netResult)],
            ],
          );
        } else if (definition.key === "faturasi-kesilmeyen-modeller") {
          const data = unwrap(await apiGet("/muhasebe/customer-dispatches", common));
          const rows = Array.isArray(data.rows) ? data.rows : [];
          table = normalizeTable(
            ["Müşteri", "Model", "Sipariş No", "İrsaliye", "İrsaliye Adedi", "Fatura", "Faturalanan", "Kalan", "Durum"],
            rows.map((row) => [
              row.companyName || "-",
              row.modelName || "-",
              row.orderNo || "-",
              row.dispatchNo || "-",
              Number(row.dispatchQuantity || 0),
              row.invoiceNo || "-",
              Number(row.invoiceQuantity || 0),
              Number(row.remaining || 0),
              row.status || "-",
            ]),
          );
        } else if (definition.key === "mail-takip") {
          const data = unwrap(await apiGet("/muhasebe/mail-ekstre", common));
          const rows = Array.isArray(data.liste) ? data.liste : [];
          table = normalizeTable(
            ["Firma", "Mail", "Bakiye", "Son Ekstre", "Son İstek", "Durum"],
            rows.map((row) => [
              row.firma || "-",
              row.email || "Mail eksik",
              money(row.bakiye),
              dateText(row.sonEkstre || row.lastStatementAt),
              dateText(row.sonIstek || row.lastRequestAt),
              row.status || "-",
            ]),
          );
        } else {
          const data = unwrap(await apiGet("/muhasebe/yonetim-ozeti", common));
          table = normalizeTable(
            ["Gösterge", "Değer"],
            [
              ["Toplam alacak", money(data.toplamAlacak)],
              ["Toplam borç", money(data.toplamBorc)],
              ["Net bakiye", money(data.netBakiye)],
              ["Bu ay gelen fatura", money(data.buAyGelenFatura)],
              ["Bu ay kesilen fatura", money(data.buAyKesilenFatura)],
              ["Ödenecek KDV", money(data.odenecekKdv)],
              ["Devreden KDV", money(data.devredenKdv)],
              ["Yaklaşan çek", money(data.yaklasanCekToplami)],
              ["Kontrol bekleyen belge", Number(data.kontrolBekleyenBelge || 0)],
            ],
          );
        }
        setReport({ loading: false, error: "", ...table });
      } catch (error) {
        setReport({
          loading: false,
          error: error?.message || "Rapor oluşturulamadı.",
          columns: [],
          rows: [],
          summary: [],
        });
      }
    },
    [filters, firmMap, params],
  );

  const exportCsv = () => {
    if (!selected || !report.columns.length) return;
    const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [report.columns, ...report.rows].map((row) => row.map(escapeCsv).join(";"));
    const blob = new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selected.key}-${filters.dateFrom}-${filters.dateTo}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    if (!selected || !report.columns.length) return;
    const summaryHtml = report.summary.length
      ? `<section class="summary">${report.summary.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</section>`
      : "";
    const tableHtml = `<table><thead><tr>${report.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${report.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    popup.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(selected.name)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#172033}h1{font-size:20px;margin:0 0 4px}p{color:#667085;font-size:12px;margin:0 0 18px}.summary{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}.summary div{border:1px solid #dfe4ea;padding:8px 10px;border-radius:6px;display:grid;gap:3px}.summary span{font-size:10px;color:#667085;text-transform:uppercase}.summary strong{font-size:13px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #dfe4ea;padding:6px;text-align:left}th{background:#f4f6f8}@media print{body{margin:8mm}}</style></head><body><h1>${escapeHtml(selected.name)}</h1><p>${escapeHtml(filters.dateFrom)} – ${escapeHtml(filters.dateTo)}</p>${summaryHtml}${tableHtml}<script>window.onload=()=>window.print();</script></body></html>`);
    popup.document.close();
  };

  return (
    <div className="arl-root">
      <section className="arl-filters">
        <label>Başlangıç<input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} /></label>
        <label>Bitiş<input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} /></label>
        <label>Firma<select value={filters.firmId} onChange={(event) => setFilters((current) => ({ ...current, firmId: event.target.value }))}><option value="">Tüm firmalar</option>{firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.firmaAdi || firm.name}</option>)}</select></label>
      </section>

      <section className="arl-list">
        <header><span>Rapor</span><span>Açıklama</span><span>İşlem</span></header>
        {REPORTS.map((definition) => (
          <article key={definition.key}>
            <div><span>{definition.category}</span><strong>{definition.name}</strong></div>
            <p>{definition.description}</p>
            <button type="button" onClick={() => loadReport(definition)}><Eye size={16} /> Önizle</button>
          </article>
        ))}
      </section>

      {selected ? (
        <div className="arl-drawer-layer" role="presentation" onMouseDown={() => setSelected(null)}>
          <aside className="arl-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>{selected.category}</span><h2>{selected.name}</h2><p>{filters.dateFrom} – {filters.dateTo}</p></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Kapat"><X size={20} /></button>
            </header>
            <div className="arl-drawer-body">
              {report.loading ? <div className="arl-empty"><RefreshCcw size={22} /> Rapor hazırlanıyor…</div> : null}
              {report.error ? <div className="arl-error">{report.error}</div> : null}
              {!report.loading && !report.error ? (
                <>
                  {report.summary.length ? <section className="arl-summary">{report.summary.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section> : null}
                  <section className="arl-preview">
                    <div className="arl-table-wrap"><table><thead><tr>{report.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{report.rows.map((row, rowIndex) => <tr key={`${selected.key}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>)}{!report.rows.length ? <tr><td colSpan={Math.max(1, report.columns.length)}><div className="arl-empty"><FileText size={22} /> Bu filtrelerle rapor kaydı bulunamadı.</div></td></tr> : null}</tbody></table></div>
                  </section>
                </>
              ) : null}
            </div>
            <footer>
              <button type="button" disabled={!report.rows.length} onClick={exportCsv}><Download size={16} /> Excel / CSV</button>
              <button type="button" className="primary" disabled={!report.rows.length} onClick={printReport}><Printer size={16} /> PDF / Yazdır</button>
            </footer>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
