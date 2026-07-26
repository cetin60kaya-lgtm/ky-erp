import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileArchive, FileText, Loader2, X, XCircle } from "lucide-react";
import "./InvoiceUploadReviewModal.css";

const textByLocalName = (root, name) => {
  const node = Array.from(root?.getElementsByTagName("*") || []).find(
    (item) => item.localName === name,
  );
  return String(node?.textContent || "").trim();
};

const partyName = (root, partyNameKey) => {
  const party = Array.from(root?.getElementsByTagName("*") || []).find(
    (item) => item.localName === partyNameKey,
  );
  return textByLocalName(party, "RegistrationName") || textByLocalName(party, "Name");
};

const readText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Dosya okunamadı."));
    reader.readAsText(file);
  });

export async function buildInvoiceUploadPreview(fileList, mode = "supplier") {
  return Promise.all(
    Array.from(fileList || []).map(async (file, index) => {
      const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
      const base = {
        key: `${index}-${file.name}-${file.size}-${file.lastModified}`,
        file,
        fileName: file.name,
        size: file.size,
        valid: true,
        serverCheck: extension !== "xml",
        invoiceNo: "",
        issueDate: "",
        party: "",
        total: "",
        currency: "",
        lineCount: 0,
      };
      if (extension !== "xml") return base;
      try {
        const content = await readText(file);
        const documentXml = new DOMParser().parseFromString(content, "application/xml");
        if (documentXml.querySelector("parsererror")) throw new Error("XML yapısı bozuk.");
        const root = documentXml.documentElement;
        if (root?.localName !== "Invoice") throw new Error("Dosya UBL fatura XML'i değil.");
        const lines = Array.from(root.getElementsByTagName("*")).filter(
          (item) => item.localName === "InvoiceLine",
        );
        const invoiceNo = textByLocalName(root, "ID");
        return {
          ...base,
          invoiceNo,
          issueDate: textByLocalName(root, "IssueDate"),
          party: partyName(
            root,
            mode === "supplier" ? "AccountingSupplierParty" : "AccountingCustomerParty",
          ),
          total: textByLocalName(root, "PayableAmount"),
          currency: textByLocalName(root, "DocumentCurrencyCode"),
          lineCount: lines.length,
          valid: Boolean(invoiceNo && lines.length),
          error: !invoiceNo
            ? "Fatura numarası yok."
            : !lines.length
              ? "Fatura kalemi yok."
              : "",
        };
      } catch (error) {
        return { ...base, valid: false, error: error?.message || "XML okunamadı." };
      }
    }),
  );
}

const formatSize = (value) => {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

export default function InvoiceUploadReviewModal({
  open,
  title,
  rows = [],
  results = null,
  busy = false,
  progress = "",
  onClose,
  onConfirm,
}) {
  const [selected, setSelected] = useState(new Set());
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(rows.filter((row) => row.valid).map((row) => row.key)));
  }, [open, rows]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.key) && row.valid),
    [rows, selected],
  );
  if (!open) return null;
  const resultMode = Array.isArray(results);
  const successCount = resultMode
    ? results.filter((item) => item.status === "SAVED").length
    : 0;
  const duplicateCount = resultMode
    ? results.filter((item) => item.status === "DUPLICATE").length
    : 0;
  const errorCount = resultMode
    ? results.filter((item) => item.status === "ERROR").length
    : 0;

  return (
    <div className="invoice-review-backdrop" role="presentation">
      <section className="invoice-review-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <h2>{title}</h2>
            <p>
              {resultMode
                ? "Her dosyanın kayıt sonucu aşağıdadır. Hatalı dosyalar diğer kayıtları etkilemez."
                : "Dosyaları kontrol edin, seçimi tamamlayın ve yalnızca onayladıklarınızı havuza kaydedin."}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Kapat"><X size={20} /></button>
        </header>

        {resultMode ? (
          <>
            <div className="invoice-review-summary">
              <span className="saved">{successCount} kaydedildi</span>
              <span className="duplicate">{duplicateCount} mükerrer</span>
              <span className="error">{errorCount} hatalı</span>
            </div>
            <div className="invoice-review-table-wrap">
              <table><thead><tr><th>Sonuç</th><th>Dosya / Fatura</th><th>Açıklama</th></tr></thead>
                <tbody>{results.map((item, index) => (
                  <tr key={`${item.fileName}-${index}`}>
                    <td><span className={`invoice-result ${String(item.status).toLowerCase()}`}>
                      {item.status === "SAVED" ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      {item.status === "SAVED" ? "Kaydedildi" : item.status === "DUPLICATE" ? "Mükerrer" : "Hata"}
                    </span></td>
                    <td><b>{item.invoiceNo || item.fileName || "Dosya"}</b><small>{item.invoiceNo ? item.fileName : ""}</small></td>
                    <td>{item.message || "İşlem tamamlandı."}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="invoice-review-toolbar">
              <button type="button" onClick={() => setSelected(new Set(rows.filter((row) => row.valid).map((row) => row.key)))}>Tümünü Seç</button>
              <button type="button" onClick={() => setSelected(new Set())}>Seçimi Temizle</button>
              <b>{selectedRows.length} / {rows.length} dosya seçili</b>
            </div>
            <div className="invoice-review-table-wrap">
              <table><thead><tr><th></th><th>Dosya</th><th>Fatura No</th><th>Tarih</th><th>Firma</th><th>Kalem</th><th>Tutar</th><th>Kontrol</th></tr></thead>
                <tbody>{rows.map((row) => (
                  <tr key={row.key} className={!row.valid ? "invalid" : ""}>
                    <td><input type="checkbox" checked={selected.has(row.key)} disabled={!row.valid || busy} onChange={() => setSelected((current) => { const next = new Set(current); next.has(row.key) ? next.delete(row.key) : next.add(row.key); return next; })} /></td>
                    <td><span className="invoice-file-name">{row.serverCheck ? <FileArchive size={16} /> : <FileText size={16} />}<span><b>{row.fileName}</b><small>{formatSize(row.size)}</small></span></span></td>
                    <td>{row.invoiceNo || "Sunucuda okunacak"}</td><td>{row.issueDate || "-"}</td><td>{row.party || "-"}</td><td>{row.lineCount || "-"}</td><td>{row.total ? `${row.total} ${row.currency}` : "-"}</td>
                    <td><span className={`invoice-check ${row.valid ? "ok" : "bad"}`}>{row.valid ? (row.serverCheck ? "Sunucu kontrolü" : "Hazır") : row.error}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}

        <footer>
          {busy ? <span className="invoice-review-progress"><Loader2 size={17} className="spin" /> {progress || "Dosyalar kaydediliyor…"}</span> : <span />}
          <div><button type="button" className="secondary" onClick={onClose} disabled={busy}>{resultMode ? "Kapat" : "Vazgeç"}</button>
          {!resultMode ? <button type="button" className="primary" disabled={busy || !selectedRows.length} onClick={() => onConfirm(selectedRows)}>{selectedRows.length} FATURAYI ONAYLA VE KAYDET</button> : null}</div>
        </footer>
      </section>
    </div>
  );
}
