import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  Printer,
  RefreshCw,
} from "lucide-react";
import {
  getIsnetBulkPrintPdf,
  getIsnetPrintPdf,
  getIsnetPrintQueue,
  markIsnetBulkPrinted,
  markIsnetPrinted,
} from "../../../services/isnetApi";
import "../IsnetPage.css";

export default function IsnetPrintQueuePage() {
  const [queue, setQueue] = useState({ rows: [], waiting: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const result = await getIsnetPrintQueue();
      setQueue(result || { rows: [], waiting: 0 });
      setSelected((current) =>
        current.filter((key) => (result?.rows || []).some((row) => row.key === key && !row.printedAt)),
      );
      setNotice(null);
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Çıktı kuyruğu alınamadı." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, []);

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return (queue.rows || []).filter((row) =>
      !query ||
      [row.documentNo, row.partnerName, row.modelName, row.dateText]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query),
    );
  }, [queue.rows, search]);

  function openBlob(blob, meta) {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview({ ...meta, url: URL.createObjectURL(blob) });
  }

  async function openRow(row) {
    setBusy(`open-${row.key}`);
    setNotice(null);
    try {
      const blob = await getIsnetPrintPdf(row.key);
      openBlob(blob, { row, keys: [row.key], bulk: false });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "PDF çıktısı açılamadı." });
    } finally {
      setBusy("");
    }
  }

  async function openBulk(keys) {
    const effectiveKeys = keys.length
      ? keys
      : (queue.rows || []).filter((row) => !row.printedAt).map((row) => row.key);
    if (!effectiveKeys.length) {
      setNotice({ tone: "warning", text: "Toplu çıktı için bekleyen belge yok." });
      return;
    }
    setBusy("bulk");
    setNotice(null);
    try {
      const blob = await getIsnetBulkPrintPdf(effectiveKeys, false);
      openBlob(blob, {
        row: { documentNo: `${effectiveKeys.length} belge`, partnerName: "Toplu çıktı" },
        keys: effectiveKeys,
        bulk: true,
      });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Toplu PDF hazırlanamadı." });
    } finally {
      setBusy("");
    }
  }

  async function confirmPrinted() {
    if (!preview?.keys?.length) return;
    const frame = document.getElementById("isnet-print-frame-v2");
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
    if (!window.confirm("Yazdırma tamamlandı mı? Seçilen belgeler çıktı alındı olarak kaydedilecek.")) return;
    setBusy("printed");
    try {
      if (preview.bulk) await markIsnetBulkPrinted(preview.keys);
      else await markIsnetPrinted(preview.keys[0], true);
      URL.revokeObjectURL(preview.url);
      setPreview(null);
      setSelected([]);
      await load();
      setNotice({ tone: "success", text: `${preview.keys.length} belge çıktı alındı olarak kaydedildi.` });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Çıktı durumu kaydedilemedi." });
    } finally {
      setBusy("");
    }
  }

  function toggle(key) {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  return (
    <main className="isnet-page">
      <header className="isnet-hero">
        <div className="isnet-hero__copy">
          <span className="isnet-kicker"><Printer size={14} /> GERÇEK ÇIKTI KUYRUĞU</span>
          <h1>İşNet Çıktı Kuyruğu</h1>
          <p>Yerelde PDF’i bulunan belgeleri sırayla veya toplu yazdırın ve çıktı durumunu kaydedin.</p>
        </div>
        <div className="isnet-hero__actions">
          <span className="isnet-badge isnet-badge--blue">Bekleyen: {Number(queue.waiting || 0)}</span>
          <button type="button" className="isnet-btn isnet-btn--secondary" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> Yenile
          </button>
          <button type="button" className="isnet-btn isnet-btn--primary" onClick={() => openBulk(selected)} disabled={busy === "bulk"}>
            <Printer size={15} /> {selected.length ? `${selected.length} Seçileni Yazdır` : "Tüm Bekleyenleri Yazdır"}
          </button>
        </div>
      </header>

      {notice && <div className={`isnet-notice isnet-notice--${notice.tone || "info"}`}>{notice.text}</div>}

      <section className="isnet-card">
        <div className="isnet-section-head">
          <div>
            <small>PDF BELGELERİ</small>
            <h2>Yazdırılacak belgeler</h2>
            <p>Çıktı alındı onayı verilmedikçe belge kuyrukta kalır.</p>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Belge no, firma veya model ara" />
        </div>

        {loading ? (
          <div className="isnet-empty"><LoaderCircle size={22} className="spin" /><strong>Kuyruk yükleniyor</strong></div>
        ) : !rows.length ? (
          <div className="isnet-empty"><FileText size={22} /><strong>Yazdırılacak belge yok</strong><p>Tek Senkronizasyon sonrasında yeni PDF belgeleri burada görünür.</p></div>
        ) : (
          <div className="isnet-table-wrap">
            <table className="isnet-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Tarih</th>
                  <th>Belge</th>
                  <th>Firma</th>
                  <th>Model</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td><input type="checkbox" checked={selected.includes(row.key)} disabled={Boolean(row.printedAt)} onChange={() => toggle(row.key)} /></td>
                    <td>{row.dateText || "-"}</td>
                    <td><strong>{row.documentNo || "-"}</strong></td>
                    <td>{row.partnerName || "-"}</td>
                    <td>{row.modelName || "-"}</td>
                    <td>
                      <span className={`isnet-badge isnet-badge--${row.printedAt ? "green" : "warning"}`}>
                        {row.printedAt ? <CheckCircle2 size={13} /> : <Printer size={13} />}
                        {row.printedAt ? "Çıktı alındı" : "Bekliyor"}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="isnet-btn isnet-btn--secondary" onClick={() => openRow(row)} disabled={busy === `open-${row.key}`}>
                        PDF Aç
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {preview && (
        <section className="isnet-card">
          <div className="isnet-section-head">
            <div>
              <small>YAZDIRMA ÖNİZLEMESİ</small>
              <h2>{preview.row.documentNo}</h2>
              <p>{preview.row.partnerName || "İşNet belgesi"}</p>
            </div>
            <button type="button" className="isnet-btn isnet-btn--primary" onClick={confirmPrinted} disabled={busy === "printed"}>
              <Printer size={15} /> Yazdır ve Tamamla
            </button>
          </div>
          <iframe id="isnet-print-frame-v2" title="İşNet PDF çıktısı" src={preview.url} style={{ width: "100%", minHeight: 720, border: 0 }} />
        </section>
      )}
    </main>
  );
}
