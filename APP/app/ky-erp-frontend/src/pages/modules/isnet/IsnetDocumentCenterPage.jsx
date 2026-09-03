import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  Upload,
  Wifi,
} from "lucide-react";
import {
  fetchEBelgePool,
  reconcileAllEBelge,
  reconcileEBelge,
  uploadEBelge,
} from "../../../services/eBelgeApi";
import { startDailySync } from "../../../services/isnetApi";
import "./EBelgeCenterPage.css";

const todayText = () => new Date().toISOString().slice(0, 10);
const recentStartText = () => {
  const date = new Date();
  date.setDate(date.getDate() - 62);
  return date.toISOString().slice(0, 10);
};

const FILTERS = [
  ["ALL", "Tüm Belgeler"],
  ["INCOMING_INVOICE", "Gelen Faturalar"],
  ["OUTGOING_INVOICE", "Giden Faturalar"],
  ["INCOMING_DISPATCH", "Gelen İrsaliyeler"],
  ["OUTGOING_DISPATCH", "Giden İrsaliyeler"],
  ["MATCHING", "Eşleşme Bekleyenler"],
  ["ISSUES", "Sorun / Kontrol"],
];

const CATEGORY_LABELS = {
  INCOMING_INVOICE: "Gelen Fatura",
  OUTGOING_INVOICE: "Giden Fatura",
  INCOMING_DISPATCH: "Gelen İrsaliye",
  OUTGOING_DISPATCH: "Giden İrsaliye",
  OTHER: "Diğer Belge",
};

const MATCH_LABELS = {
  MATCHED: ["Tam Eşleşti", "success"],
  PARTIAL: ["Kısmi Eşleşme", "warning"],
  MISMATCH: ["Uyuşmazlık", "error"],
  SUGGESTED: ["Önerilen Eşleşme", "info"],
  UNMATCHED: ["Eşleşme Bekliyor", "warning"],
  NOT_REQUIRED: ["İrsaliye", "neutral"],
};

function money(value, currency = "TRY") {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency || "TRY",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toLocaleString("tr-TR")} ${currency || "TRY"}`;
  }
}

function number(value) {
  return Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

function matchInfo(row) {
  const [label, tone] = MATCH_LABELS[row?.matchStatus] || [row?.matchStatus || "Kontrol", "neutral"];
  return { label, tone };
}

export default function IsnetDocumentCenterPage({ activeMainCompany }) {
  const inputRef = useRef(null);
  const [range, setRange] = useState({ startDate: recentStartText(), endDate: todayText() });
  const [category, setCategory] = useState("ALL");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState({ rows: [], total: 0, summary: {} });
  const [selectedId, setSelectedId] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);

  const params = useMemo(
    () => ({ ...range, category, search, limit: 1000 }),
    [category, range, search],
  );

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug && !activeMainCompany?.mainCompanySlug) return;
    setLoading(true);
    try {
      const data = await fetchEBelgePool(activeMainCompany, params);
      setResult(data || { rows: [], total: 0, summary: {} });
      setSelectedId((current) => {
        if (current && data?.rows?.some((row) => row.id === current)) return current;
        return data?.rows?.[0]?.id || "";
      });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "e-Belge Havuzu yüklenemedi." });
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany, params]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => result.rows?.find((row) => row.id === selectedId) || null,
    [result.rows, selectedId],
  );

  function acceptFiles(files) {
    const incoming = Array.from(files || []).slice(0, 200);
    setSelectedFiles(incoming);
    if (incoming.length) {
      setNotice({
        tone: "info",
        text: `${incoming.length} dosya hazır. XML, PDF ve ZIP aynı yüklemede birlikte işlenebilir.`,
      });
    }
  }

  async function upload() {
    if (!selectedFiles.length) {
      inputRef.current?.click();
      return;
    }
    setBusy("upload");
    setNotice(null);
    try {
      const data = await uploadEBelge(activeMainCompany, selectedFiles);
      const added = Number(data?.items?.length || 0);
      const attached = Number(data?.skipped?.length || 0);
      const errors = Number(data?.errors?.length || 0);
      const aiUsed = (data?.aiResults || []).filter((row) => row?.status === "AI_ENRICHED").length;
      setNotice({
        tone: errors ? "warning" : "success",
        text: `${added} yeni belge havuza alındı${attached ? `, ${attached} PDF/XML mevcut belgeye ek dosya olarak bağlandı` : ""}${aiUsed ? `, ${aiUsed} taranmış belge AI ile okundu` : ""}${errors ? `, ${errors} dosya kontrol bekliyor` : ""}.`,
      });
      setSelectedFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Toplu belge yükleme tamamlanamadı." });
    } finally {
      setBusy("");
    }
  }

  async function reconcileOne(id) {
    setBusy(`match-${id}`);
    try {
      const data = await reconcileEBelge(activeMainCompany, id);
      const [label] = MATCH_LABELS[data?.status] || [data?.status || "Kontrol edildi"];
      setNotice({ tone: data?.status === "MATCHED" ? "success" : "warning", text: `${label}. Fatura–irsaliye ürün ve miktar kontrolü yenilendi.` });
      await load();
      setSelectedId(id);
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Belge eşleştirmesi yenilenemedi." });
    } finally {
      setBusy("");
    }
  }

  async function reconcileAll() {
    setBusy("match-all");
    try {
      const data = await reconcileAllEBelge(activeMainCompany);
      setNotice({
        tone: Number(data?.mismatch || 0) ? "warning" : "success",
        text: `${Number(data?.total || 0)} fatura kontrol edildi: ${Number(data?.matched || 0)} tam, ${Number(data?.partial || 0)} kısmi, ${Number(data?.mismatch || 0)} uyuşmazlık, ${Number(data?.unmatched || 0)} eşleşme bekliyor.`,
      });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Toplu eşleştirme tamamlanamadı." });
    } finally {
      setBusy("");
    }
  }

  async function syncIsnet() {
    setBusy("isnet-sync");
    try {
      const data = await startDailySync(range);
      await reconcileAllEBelge(activeMainCompany);
      setNotice({
        tone: Number(data?.failed || 0) ? "warning" : "success",
        text: `İşNet bağlantısı tarandı. ${Number(data?.downloaded || 0)} belge indirildi${Number(data?.failed || 0) ? `, ${Number(data.failed)} belge kontrol bekliyor` : ""}. Manuel yükleme sistemi bundan bağımsız çalışmaya devam eder.`,
      });
      await load();
    } catch (error) {
      setNotice({ tone: "warning", text: `${error?.message || "İşNet senkronizasyonu yapılamadı."} Manuel XML/PDF/ZIP yükleme kullanılabilir.` });
    } finally {
      setBusy("");
    }
  }

  const summary = result.summary || {};

  return (
    <main className="ebelge-page" aria-busy={loading}>
      <header className="ebelge-hero">
        <div>
          <span className="ebelge-kicker"><FileText size={15} /> KY ERP · SAĞLAYICIDAN BAĞIMSIZ</span>
          <h1>e-Belge Merkezi</h1>
          <p>XML, PDF, ZIP ve entegrasyon belgeleri tek havuzda. Fatura–irsaliye bağı firma + belge referansı + ürün kalemi + miktar ile doğrulanır.</p>
        </div>
        <div className="ebelge-hero-actions">
          <button type="button" className="ebelge-btn secondary" onClick={syncIsnet} disabled={Boolean(busy)}>
            {busy === "isnet-sync" ? <LoaderCircle size={16} className="spin" /> : <Wifi size={16} />} İşNet Senkronize Et
          </button>
          <button type="button" className="ebelge-btn secondary" onClick={reconcileAll} disabled={Boolean(busy)}>
            {busy === "match-all" ? <LoaderCircle size={16} className="spin" /> : <Link2 size={16} />} Tüm Eşleşmeleri Yenile
          </button>
        </div>
      </header>

      {notice ? <div className={`ebelge-notice ${notice.tone || "info"}`}>{notice.text}</div> : null}

      <section
        className={`ebelge-upload ${dragging ? "dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFiles(event.dataTransfer.files); }}
      >
        <div className="ebelge-upload-icon"><Upload size={26} /></div>
        <div className="ebelge-upload-copy">
          <strong>Toplu Dosya Yükle</strong>
          <span>XML · PDF · ZIP · JPG · PNG · WEBP · en fazla 200 dosya</span>
          <small>XML ana veri kaynağıdır. Metinli PDF doğrudan okunur; taranmış PDF/görsel OCR kullanılmadan AI belge analiziyle işlenir.</small>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xml,.pdf,.zip,.jpg,.jpeg,.png,.webp"
          hidden
          onChange={(event) => acceptFiles(event.target.files)}
        />
        <div className="ebelge-upload-actions">
          <button type="button" className="ebelge-btn secondary" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}>Dosya Seç</button>
          <button type="button" className="ebelge-btn primary" onClick={upload} disabled={Boolean(busy)}>
            {busy === "upload" ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}
            {selectedFiles.length ? `${selectedFiles.length} Dosyayı İşle` : "Yüklemeyi Başlat"}
          </button>
        </div>
      </section>

      {selectedFiles.length ? (
        <div className="ebelge-file-strip">
          {selectedFiles.slice(0, 8).map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}
          {selectedFiles.length > 8 ? <b>+{selectedFiles.length - 8} dosya</b> : null}
        </div>
      ) : null}

      <section className="ebelge-summary">
        <article><span>Toplam Belge</span><strong>{summary.total || 0}</strong></article>
        <article><span>Gelen Fatura</span><strong>{summary.incomingInvoices || 0}</strong></article>
        <article><span>Giden Fatura</span><strong>{summary.outgoingInvoices || 0}</strong></article>
        <article><span>Gelen İrsaliye</span><strong>{summary.incomingDispatches || 0}</strong></article>
        <article><span>Giden İrsaliye</span><strong>{summary.outgoingDispatches || 0}</strong></article>
        <article className="good"><span>Tam Eşleşen</span><strong>{summary.fullyMatched || 0}</strong></article>
        <article className={(summary.actionNeeded || 0) ? "attention" : "good"}><span>Kontrol Gereken</span><strong>{summary.actionNeeded || 0}</strong></article>
      </section>

      <section className="ebelge-card">
        <div className="ebelge-toolbar">
          <div className="ebelge-tabs">
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" className={category === key ? "active" : ""} onClick={() => setCategory(key)}>{label}</button>
            ))}
          </div>
          <div className="ebelge-filters">
            <form onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); }}>
              <Search size={16} />
              <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Belge no, firma veya VKN ara" />
              <button type="submit">Ara</button>
            </form>
            <label><span>Başlangıç</span><input type="date" value={range.startDate} onChange={(event) => setRange((current) => ({ ...current, startDate: event.target.value }))} /></label>
            <label><span>Bitiş</span><input type="date" value={range.endDate} onChange={(event) => setRange((current) => ({ ...current, endDate: event.target.value }))} /></label>
            <button type="button" className="ebelge-icon-btn" title="Yenile" onClick={load} disabled={loading}><RefreshCw size={17} className={loading ? "spin" : ""} /></button>
          </div>
        </div>

        {loading ? (
          <div className="ebelge-empty"><LoaderCircle size={24} className="spin" /><strong>Belge havuzu yükleniyor</strong></div>
        ) : !result.rows?.length ? (
          <div className="ebelge-empty"><CheckCircle2 size={24} /><strong>Bu filtrede belge yok</strong><span>Dosya yükleyebilir veya entegrasyondan senkronize edebilirsiniz.</span></div>
        ) : (
          <div className="ebelge-table-wrap">
            <table className="ebelge-table">
              <thead><tr><th>Tarih / Tür</th><th>Belge</th><th>Firma</th><th>Dosyalar</th><th>Kalem / LOT</th><th>Fatura ↔ İrsaliye</th><th>Tutar</th><th>İşlem</th></tr></thead>
              <tbody>
                {result.rows.map((row) => {
                  const info = matchInfo(row);
                  const linked = row.match?.linkedDispatches || [];
                  return (
                    <tr key={row.id} className={`${selectedId === row.id ? "selected" : ""} ${row.actionNeeded ? "needs-action" : ""}`} onClick={() => setSelectedId(row.id)}>
                      <td><strong>{row.issueDate || "-"}</strong><small>{CATEGORY_LABELS[row.category] || row.category}</small></td>
                      <td><strong>{row.documentNo || "Belge no bekliyor"}</strong><small>{row.status || "CONTROL_WAITING"}</small></td>
                      <td><strong>{row.partnerName}</strong><small>{row.partnerTaxNo || row.companyType || "Firma eşleşmesi bekliyor"}</small></td>
                      <td><div className="ebelge-badges"><span className={row.hasXml ? "ok" : "muted"}>XML {row.hasXml ? "✓" : "—"}</span><span className={row.hasPdf ? "ok" : "muted"}>PDF {row.hasPdf ? "✓" : "—"}</span>{row.aiStatus === "COMPLETED" ? <span className="ai">AI</span> : null}</div></td>
                      <td><strong>{row.lineCount || 0} kalem</strong><small>{row.lotCount || 0} LOT · {row.unmatchedProductCount || 0} ürün eşleşmemiş</small></td>
                      <td>
                        <span className={`ebelge-status ${info.tone}`}>{info.label}</span>
                        {linked.length ? <small>{linked.map((item) => item.documentNo).filter(Boolean).join(" · ")}</small> : row.category.includes("INVOICE") ? <small>İrsaliye bağı aranıyor</small> : <small>Eşleştirme kaynağı</small>}
                      </td>
                      <td><strong>{money(row.grandTotal, row.currency)}</strong><small>KDV {money(row.vatTotal, row.currency)}</small></td>
                      <td onClick={(event) => event.stopPropagation()}>
                        {row.category.includes("INVOICE") ? (
                          <button type="button" className="ebelge-mini-btn" onClick={() => reconcileOne(row.id)} disabled={Boolean(busy)}>
                            {busy === `match-${row.id}` ? <LoaderCircle size={14} className="spin" /> : <Link2 size={14} />} Kontrol Et
                          </button>
                        ) : <span className="ebelge-status neutral">Havuzda</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <section className="ebelge-detail-card">
          <div className="ebelge-detail-head">
            <div>
              <span>{CATEGORY_LABELS[selected.category] || "Belge"}</span>
              <h2>{selected.documentNo || "Belge detayı"}</h2>
              <p>{selected.partnerName} · {selected.lineCount} kalem · {selected.files?.length || 0} dosya</p>
            </div>
            <span className={`ebelge-status ${matchInfo(selected).tone}`}>{matchInfo(selected).label}</span>
          </div>

          {selected.category.includes("INVOICE") ? (
            <>
              <div className="ebelge-relation-summary">
                <article><span>Bağlı İrsaliye</span><strong>{selected.match?.linkedDispatches?.map((row) => row.documentNo).filter(Boolean).join(" + ") || "Bulunamadı"}</strong></article>
                <article><span>Kalem Kontrolü</span><strong>{selected.match ? `${selected.match.matchedLineCount}/${selected.match.totalLineCount}` : "0/0"}</strong></article>
                <article><span>Tam Miktar</span><strong>{selected.match?.exactQuantityLineCount || 0}</strong></article>
                <article><span>Güven</span><strong>%{selected.matchConfidence || 0}</strong></article>
              </div>

              {selected.match?.notes?.length ? (
                <div className={`ebelge-match-note ${selected.matchStatus === "MATCHED" ? "success" : "warning"}`}>
                  {selected.matchStatus === "MATCHED" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <div>{selected.match.notes.map((note) => <span key={note}>{note}</span>)}</div>
                </div>
              ) : null}

              {selected.match?.lines?.length ? (
                <div className="ebelge-line-table-wrap">
                  <table className="ebelge-line-table">
                    <thead><tr><th>Fatura Kalemi</th><th>Fatura</th><th>İrsaliye</th><th>Fark</th><th>Bağlantı</th><th>Durum</th></tr></thead>
                    <tbody>{selected.match.lines.map((line) => (
                      <tr key={line.invoiceLineId}>
                        <td><strong>{line.invoiceProduct}</strong><small>{line.unit}</small></td>
                        <td>{number(line.invoicedQuantity)}</td>
                        <td>{number(line.dispatchedQuantity)}</td>
                        <td className={Math.abs(Number(line.difference || 0)) > 0.0005 ? "diff" : ""}>{number(line.difference)}</td>
                        <td>{line.allocations?.map((item) => `${item.dispatchNo}: ${number(item.quantity)}`).join(" · ") || "—"}</td>
                        <td><span className={`ebelge-status ${line.status === "MATCHED" ? "success" : line.status === "UNMATCHED" ? "error" : "warning"}`}>{line.status}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <div className="ebelge-empty compact"><Link2 size={20} /><strong>Kalem eşleşmesi henüz oluşmadı</strong></div>}
            </>
          ) : (
            <div className="ebelge-match-note info"><FileText size={18} /><div><span>Bu irsaliye havuzda fatura eşleştirmesi için hazır.</span><span>Fatura geldiğinde firma, referans, ürün ve miktar üzerinden otomatik bağlanır.</span></div></div>
          )}
        </section>
      ) : null}
    </main>
  );
}
