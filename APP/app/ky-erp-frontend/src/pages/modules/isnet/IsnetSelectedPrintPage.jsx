import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  Printer,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { getIsnetLocalFile, openBlobInNewTab, reserveBlobTab } from "../../../services/isnetLocalFileApi";
import {
  getIsnetSelectedPrintBundle,
  getIsnetSelectedPrintQueue,
  markIsnetSelectedPrintQueuePrinted,
  removeIsnetSelectedPrintQueue,
} from "../../../services/isnetSelectedPrintApi";
import "../IsnetPage.css";
import "./IsnetSelectedPrintPage.css";

function dateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}

export default function IsnetSelectedPrintPage() {
  const [result, setResult] = useState({ rows: [], waiting: 0, printed: 0 });
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getIsnetSelectedPrintQueue();
      setResult(data || { rows: [], waiting: 0, printed: 0 });
      setSelected((current) => current.filter((key) => data?.rows?.some((row) => row.key === key)));
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Yazdırma kuyruğu yüklenemedi." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const waitingKeys = useMemo(
    () => result.rows.filter((row) => !row.printedAt && row.pdfReady).map((row) => row.key),
    [result.rows],
  );

  function toggle(key, checked) {
    setSelected((current) => checked
      ? [...new Set([...current, key])]
      : current.filter((item) => item !== key));
  }

  async function openPdf(row) {
    const preview = reserveBlobTab();
    setBusy(`pdf-${row.key}`);
    setNotice(null);
    try {
      const blob = await getIsnetLocalFile(row.key, "pdf");
      openBlobInNewTab(blob, preview);
    } catch (error) {
      try { preview?.close(); } catch { /* Preview tab cleanup is best-effort. */ }
      setNotice({ tone: "error", text: error?.message || "PDF açılamadı." });
    } finally {
      setBusy("");
    }
  }

  async function printRows(keys) {
    const targetKeys = keys.length ? keys : waitingKeys;
    if (!targetKeys.length) {
      setNotice({ tone: "warning", text: "Yazdırılacak bekleyen belge seçilmedi." });
      return;
    }
    const preview = reserveBlobTab();
    setBusy("print");
    setNotice(null);
    try {
      const blob = await getIsnetSelectedPrintBundle(targetKeys);
      openBlobInNewTab(blob, preview);
      if (window.confirm(`${targetKeys.length} belge yazdırma için açıldı. Çıktı alındı olarak işaretlensin mi?`)) {
        await markIsnetSelectedPrintQueuePrinted(targetKeys);
        setNotice({ tone: "success", text: `${targetKeys.length} belge yazdırıldı olarak kaydedildi.` });
        setSelected([]);
        await load();
      } else {
        setNotice({ tone: "info", text: "PDF açıldı; belgeler kuyrukta beklemeye devam ediyor." });
      }
    } catch (error) {
      try { preview?.close(); } catch { /* Preview tab cleanup is best-effort. */ }
      setNotice({ tone: "error", text: error?.message || "Toplu PDF oluşturulamadı." });
    } finally {
      setBusy("");
    }
  }

  async function removeRows() {
    if (!selected.length) {
      setNotice({ tone: "warning", text: "Kuyruktan kaldırılacak belgeleri seçin." });
      return;
    }
    if (!window.confirm(`${selected.length} belge yazdırma kuyruğundan kaldırılsın mı?`)) return;
    setBusy("remove");
    try {
      await removeIsnetSelectedPrintQueue(selected);
      setNotice({ tone: "success", text: `${selected.length} belge kuyruktan kaldırıldı.` });
      setSelected([]);
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Belgeler kuyruktan kaldırılamadı." });
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="isnet-page isnet-selected-print-page">
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker"><Printer size={14} /> KULLANICI SEÇİMLİ YAZDIRMA</span>
          <h1>Yazdırma Kuyruğu</h1>
          <p>Yalnız Belge Merkezi'nden sizin eklediğiniz PDF'ler burada bekler.</p>
        </div>
        <div className="isnet-hero__actions">
          <span className="isnet-badge isnet-badge--blue">Bekleyen: {result.waiting}</span>
          <button type="button" className="isnet-btn isnet-btn--secondary" onClick={load} disabled={loading}><RefreshCw size={15} /> Yenile</button>
          <button type="button" className="isnet-btn isnet-btn--primary" onClick={() => printRows([])} disabled={busy === "print" || !waitingKeys.length}>{busy === "print" ? <LoaderCircle size={15} className="spin" /> : <Printer size={15} />} Tüm Bekleyenleri Aç</button>
        </div>
      </header>

      {notice && <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>{notice.text}</div>}

      <section className="isnet-card">
        <div className="isnet-section-head">
          <div><small>SEÇİLEN BELGELER</small><h2>{result.rows.length} belge</h2><p>Yazdırılan belgeler geçmişte kalır; yeniden eklenirse tekrar beklemeye alınır.</p></div>
          <div className="isnet-action-row">
            <button type="button" className="isnet-btn isnet-btn--secondary" onClick={removeRows} disabled={busy === "remove" || !selected.length}><Trash2 size={14} /> Seçilenleri Kaldır</button>
            <button type="button" className="isnet-btn isnet-btn--primary" onClick={() => printRows(selected)} disabled={busy === "print" || !selected.length}><Printer size={14} /> Seçilenleri Aç</button>
          </div>
        </div>

        {loading ? <div className="isnet-empty"><LoaderCircle className="spin" /><strong>Kuyruk yükleniyor</strong></div> : !result.rows.length ? <div className="isnet-empty"><CheckCircle2 /><strong>Yazdırma kuyruğu boş</strong><p>Belge Merkezi'nden PDF'leri seçip Yazdırmaya Ekle işlemini kullanın.</p></div> : (
          <div className="isnet-table-wrap">
            <table className="isnet-table">
              <thead><tr><th><input type="checkbox" checked={selected.length > 0 && selected.length === result.rows.length} onChange={(event) => setSelected(event.target.checked ? result.rows.map((row) => row.key) : [])} /></th><th>Tarih</th><th>Belge</th><th>Firma / Model</th><th>Durum</th><th>İşlem</th></tr></thead>
              <tbody>{result.rows.map((row) => <tr key={row.key}><td><input type="checkbox" checked={selected.includes(row.key)} onChange={(event) => toggle(row.key, event.target.checked)} /></td><td>{row.dateText || "-"}</td><td><strong>{row.documentNo}</strong><small>{row.kind === "invoice" ? "Fatura" : "İrsaliye"}</small></td><td>{row.partnerName}<small>{row.modelName || "-"}</small></td><td>{row.printedAt ? <span className="isnet-badge isnet-badge--green">Yazdırıldı · {dateTime(row.printedAt)}</span> : row.pdfReady ? <span className="isnet-badge isnet-badge--warning">Bekliyor</span> : <span className="isnet-badge isnet-badge--error">PDF eksik</span>}</td><td><button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => openPdf(row)} disabled={!row.pdfReady || busy === `pdf-${row.key}`}><FileText size={14} /> PDF Aç</button></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
