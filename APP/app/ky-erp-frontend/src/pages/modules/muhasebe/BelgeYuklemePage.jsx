import { useCallback, useEffect, useMemo, useState } from "react";
import { ErpIcon } from "../../../components/erp/IconMap";
import {
  approveDocumentIntake,
  bulkApproveDocumentIntake,
  createDocumentIntakeFirm,
  createDocumentIntakeProduct,
  fetchDocumentIntake,
  fetchDocumentIntakeDetail,
  fixDocumentIntake,
  uploadDocumentIntake,
} from "../../../services/muhasebeDocumentService";

const STATUS_TABS = [
  { key: "ALL", label: "Tümü" },
  { key: "CONTROL_WAITING", label: "Kontrol" },
  { key: "MISSING_INFO", label: "Eksik" },
  { key: "READY", label: "Hazır" },
  { key: "APPROVED", label: "Onaylı" },
  { key: "ERROR", label: "Hatalı" },
];

const WORKSPACE_TABS = [
  { key: "dashboard", label: "Yönetim Özeti" },
  { key: "upload", label: "Belge Oku" },
  { key: "invoices", label: "Fatura Merkezi" },
  { key: "firms", label: "Firma Hesapları" },
  { key: "lines", label: "Fatura Kalemleri" },
  { key: "cash", label: "Cari / Nakit" },
  { key: "paint", label: "Boyahane Aksiyon" },
];

const KIND_LABELS = {
  OUR_INVOICE: "Bizim Fatura",
  OUR_DISPATCH: "Bizim İrsaliye",
  CUSTOMER_DISPATCH: "Müşteri İrsaliyesi",
  SUPPLIER_INVOICE: "Tedarikçi Faturası",
  EXPENSE_INVOICE: "Gider Faturası",
  UNKNOWN: "Bilinmeyen",
};

function money(value, digits = 0) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function numberText(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(
    Number(value || 0),
  );
}

function dateText(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return day ? `${day}.${month}.${year}` : value;
}

function statusTone(status) {
  if (status === "APPROVED") return "green";
  if (status === "READY") return "blue";
  if (status === "MISSING_INFO") return "orange";
  if (status === "REJECTED" || status === "ERROR") return "red";
  return "slate";
}

function docAmount(row) {
  return Number(row?.grandTotal || row?.total || 0);
}

function rowQty(row) {
  return Number(
    row?.adet ||
      (row.lines || []).reduce((sum, line) => sum + Number(line?.quantity || 0), 0),
  );
}

function counterparty(row) {
  if (row.documentKind === "OUR_INVOICE" || row.documentKind === "OUR_DISPATCH") {
    return row?.receiverName || "-";
  }
  return row?.issuerName || "-";
}

function Badge({ children, tone = "slate" }) {
  return <span className={`acc-badge ${tone}`}>{children}</span>;
}

function Metric({ label, value, sub, tone = "blue" }) {
  return (
    <div className={`acc-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function shortMissing(fields = []) {
  return Array.isArray(fields) && fields.length ? fields.join(", ") : "-";
}

export function BelgeYuklemePage({ activeMainCompany, initialView = "upload" }) {
  const [files, setFiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState(null);
  const [statusTab, setStatusTab] = useState("ALL");
  const [view, setView] = useState(initialView);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [firmSearch, setFirmSearch] = useState("");

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const refresh = useCallback(
    async (nextSelectedId = selectedId) => {
      if (!activeMainCompany?.slug) return;
      const nextRows = await fetchDocumentIntake(activeMainCompany, { search }).catch(
        () => [],
      );
      setRows(nextRows);
      const firstId = nextSelectedId || nextRows[0].id || "";
      if (firstId) {
        const detail = await fetchDocumentIntakeDetail(
          activeMainCompany,
          firstId,
        ).catch(() => nextRows.find((row) => row.id === firstId));
        setSelected(detail || null);
        setSelectedId(firstId);
      } else {
        setSelected(null);
        setSelectedId("");
      }
    },
    [activeMainCompany, search, selectedId],
  );

  useEffect(() => {
    refresh("");
  }, [refresh]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return rows
      .filter((row) => {
        if (statusTab === "ALL") return true;
        if (statusTab === "ERROR") return ["REJECTED", "ARCHIVED"].includes(row?.status);
        return row.status === statusTab;
      })
      .filter((row) => {
        if (!q) return true;
        return `${row?.originalFileName} ${row?.documentNo} ${row?.issuerName} ${row?.receiverName} ${row?.modelGuess}`
          .toLocaleLowerCase("tr-TR")
          .includes(q);
      });
  }, [rows, search, statusTab]);

  const invoiceRows = useMemo(
    () =>
      visibleRows.filter((row) =>
        ["OUR_INVOICE", "SUPPLIER_INVOICE", "EXPENSE_INVOICE"].includes(
          row?.documentKind,
        ),
      ),
    [visibleRows],
  );

  const dispatchRows = useMemo(
    () =>
      visibleRows.filter((row) =>
        ["OUR_DISPATCH", "CUSTOMER_DISPATCH"].includes(row?.documentKind),
      ),
    [visibleRows],
  );

  const lineRows = useMemo(() => {
    return visibleRows.flatMap((row) =>
      (row.lines || []).map((line) => ({
        ...line,
        documentId: row?.id,
        documentNo: row?.documentNo,
        documentKind: row?.documentKind,
        status: row?.status,
        firmName: counterparty(row),
        issueDate: row?.issueDate,
        invoiceNo: row?.invoiceNo,
        dispatchNo: row?.dispatchNo,
      })),
    );
  }, [visibleRows]);

  const firmRows = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const name = counterparty(row);
      if (!name || name === "-") return;
      const current =
        map.get(name) ||
        {
          name,
          docs: 0,
          incomingDocs: 0,
          outgoingDocs: 0,
          receivable: 0,
          payable: 0,
          dispatchQty: 0,
          lastDate: "",
          missing: 0,
        };
      current.docs += 1;
      current.incomingDocs += row.direction === "INCOMING" ? 1 : 0;
      current.outgoingDocs += row.direction === "OUTGOING" ? 1 : 0;
      current.receivable += row.documentKind === "OUR_INVOICE" ? docAmount(row) : 0;
      current.payable +=
        row.documentKind === "SUPPLIER_INVOICE" ||
        row.documentKind === "EXPENSE_INVOICE"
           ? docAmount(row)
          : 0;
      current.dispatchQty +=
        row.documentKind === "CUSTOMER_DISPATCH" ||
        row.documentKind === "OUR_DISPATCH"
           ? rowQty(row)
          : 0;
      current.missing += row.status === "MISSING_INFO" ? 1 : 0;
      current.lastDate =
        !current?.lastDate || String(row?.issueDate || "") > current?.lastDate
           ? row?.issueDate || current?.lastDate
          : current?.lastDate;
      map.set(name, current);
    });
    const q = firmSearch.trim().toLocaleLowerCase("tr-TR");
    return [...map.values()]
      .filter((item) => !q || item?.name.toLocaleLowerCase("tr-TR").includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [rows, firmSearch]);

  const selectedFirmRows = useMemo(() => {
    if (!selected) return [];
    const firm = counterparty(selected);
    return rows
      .filter((row) => counterparty(row) === firm)
      .sort((a, b) => String(b.issueDate || "").localeCompare(String(a.issueDate || "")));
  }, [rows, selected]);

  const paintRows = useMemo(
    () =>
      lineRows.filter(
        (line) =>
          line?.lotNo ||
          line.productGroup === "BOYAHANE" ||
          line.documentKind === "SUPPLIER_INVOICE",
      ),
    [lineRows],
  );

  const summary = useMemo(() => {
    const sales = rows
      .filter((row) => row.documentKind === "OUR_INVOICE")
      .reduce((sum, row) => sum + docAmount(row), 0);
    const purchases = rows
      .filter((row) =>
        ["SUPPLIER_INVOICE", "EXPENSE_INVOICE"].includes(row?.documentKind),
      )
      .reduce((sum, row) => sum + docAmount(row), 0);
    const vatIn = rows
      .filter((row) =>
        ["SUPPLIER_INVOICE", "EXPENSE_INVOICE"].includes(row?.documentKind),
      )
      .reduce((sum, row) => sum + Number(row?.vatTotal || 0), 0);
    const vatOut = rows
      .filter((row) => row.documentKind === "OUR_INVOICE")
      .reduce((sum, row) => sum + Number(row?.vatTotal || 0), 0);
    return {
      docs: rows.length,
      ready: rows.filter((row) => row.status === "READY").length,
      missing: rows.filter((row) => row.status === "MISSING_INFO").length,
      sales,
      purchases,
      vatNet: vatOut - vatIn,
      customerDispatchQty: rows
        .filter((row) => row.documentKind === "CUSTOMER_DISPATCH")
        .reduce((sum, row) => sum + rowQty(row), 0),
      paintLots: paintRows.filter((line) => line?.lotNo).length,
    };
  }, [rows, paintRows]);

  async function selectRow(row) {
    setSelectedId(row?.id);
    const detail = await fetchDocumentIntakeDetail(activeMainCompany, row?.id).catch(
      () => row,
    );
    setSelected(detail);
  }

  async function uploadFiles() {
    if (!files.length || !activeMainCompany?.slug) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await uploadDocumentIntake(activeMainCompany, files);
      setFiles([]);
      await refresh(result?.items?.[0].id || "");
      setMessage(`${result?.items.length || 0} belge okundu ve kontrol havuzuna alındı.`);
    } catch (error) {
      setMessage(error?.message || "Belge yükleme tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function createFirm() {
    if (!selected.id) return;
    setBusy(true);
    try {
      const next = await createDocumentIntakeFirm(activeMainCompany, selected.id, {
        confirm: true,
        firmType:
          selected.documentKind === "OUR_INVOICE" ||
          selected.documentKind === "CUSTOMER_DISPATCH"
             ? "CUSTOMER"
            : "SUPPLIER",
      });
      await refresh(next.id);
      setMessage("Firma taslağı kaydedildi ve belgeye bağlandı.");
    } catch (error) {
      setMessage(error?.message || "Firma açılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function createProduct(line) {
    const targetDocumentId = line?.documentId || selected.id;
    if (!targetDocumentId || !line?.id) return;
    setBusy(true);
    try {
      const next = await createDocumentIntakeProduct(
        activeMainCompany,
        targetDocumentId,
        line?.id,
        {
          confirm: true,
          productGroup: line?.productDraftJson.productGroup || "BOYAHANE",
          unit: line?.unit || "KG",
        },
      );
      await refresh(next.id || targetDocumentId);
      setMessage("Ürün taslağı kaydedildi ve kaleme bağlandı.");
    } catch (error) {
      setMessage(error?.message || "Ürün açılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function approveOne() {
    if (!selected.id) return;
    setBusy(true);
    try {
      const result = await approveDocumentIntake(activeMainCompany, selected.id);
      await refresh(selected.id);
      setMessage(
        result?.skipped
           ? result?.reason
          : "Belge onaylandı; cari, KDV, model ve lot işlemleri çalıştırıldı.",
      );
    } catch (error) {
      setMessage(error?.message || "Belge onaylanamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkApprove() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBusy(true);
    try {
      const result = await bulkApproveDocumentIntake(activeMainCompany, ids);
      await refresh(selectedId);
      const approved = (result?.results || []).filter(
        (item) => item?.ok && !item?.skipped,
      ).length;
      const skipped = (result?.results || []).length - approved;
      setMessage(`${approved} belge onaylandı, ${skipped} belge atlandı.`);
      setSelectedIds(new Set());
    } catch (error) {
      setMessage(error?.message || "Toplu onay tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateKind(documentKind) {
    if (!selected.id) return;
    fixDocumentIntake(activeMainCompany, selected.id, { documentKind })
      .then((next) => refresh(next.id))
      .catch((error) => setMessage(error?.message || "Belge türü güncellenemedi."));
  }

  function renderUploadPanel() {
    return (
      <section className="acc-upload">
        <label
          className="acc-drop"
          onDragOver={(event) => event?.preventDefault()}
          onDrop={(event) => {
            event?.preventDefault();
            setFiles((prev) => [...prev, ...Array.from(event?.dataTransfer.files || [])]);
          }}
        >
          <input
            type="file"
            multiple
            accept=".pdf,.xml,.zip,application/pdf,application/xml,text/xml,application/zip"
            onChange={(event) =>
              setFiles((prev) => [...prev, ...Array.from(event?.target.files || [])])
            }
          />
          <ErpIcon name="yukle" size={30} />
          <strong>PDF / XML / ZIP belge bırak</strong>
          <span>XML toplu, PDF günlük; ZIP içeriği ayrı belge olarak okunur.</span>
        </label>
        <div className="acc-filebox">
          <div className="acc-filelist">
            {files.length ? (
              files.map((file, index) => (
                <div key={`${file?.name}-${index}`}>
                  <span>{file?.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev?.filter((_, i) => i !== index))}
                  >
                    Sil
                  </button>
                </div>
              ))
            ) : (
              <p>Seçili dosya yok.</p>
            )}
          </div>
          <button
            className="acc-primary"
            type="button"
            disabled={busy || !files.length}
            onClick={uploadFiles}
          >
            Dosyaları Yükle ve Oku
          </button>
        </div>
      </section>
    );
  }

  function renderInvoiceTable() {
    return (
      <div className="acc-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Seç</th>
              <th>Belge No</th>
              <th>Tür</th>
              <th>Firma</th>
              <th>Tarih</th>
              <th>Model</th>
              <th>İrsaliye</th>
              <th>Fatura</th>
              <th>Adet</th>
              <th>Matrah</th>
              <th>KDV</th>
              <th>Toplam</th>
              <th>Durum</th>
              <th>Eksik</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr className={selectedId === row?.id ? "active" : ""} key={row?.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row?.id)}
                    onChange={() => toggleSelected(row?.id)}
                  />
                </td>
                <td>{row?.documentNo || "-"}</td>
                <td>{KIND_LABELS[row?.documentKind] || row?.documentKind}</td>
                <td>{counterparty(row)}</td>
                <td>{dateText(row?.issueDate)}</td>
                <td>{row?.modelGuess || "-"}</td>
                <td>{row?.dispatchNo || "-"}</td>
                <td>{row?.invoiceNo || "-"}</td>
                <td>{numberText(rowQty(row))}</td>
                <td>{money(row?.subtotal)}</td>
                <td>{money(row?.vatTotal)}</td>
                <td>{money(row?.grandTotal)}</td>
                <td>
                  <Badge tone={statusTone(row?.status)}>{row?.status}</Badge>
                </td>
                <td>{shortMissing(row?.missingFields)}</td>
                <td>
                  <button type="button" onClick={() => selectRow(row)}>
                    Aç
                  </button>
                </td>
              </tr>
            ))}
            {!visibleRows.length ? (
              <tr>
                <td colSpan={15} className="acc-empty">
                  Bu filtrede belge yok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    );
  }

  function renderFirmAccounts() {
    return (
      <div className="acc-split">
        <section className="acc-panel">
          <div className="acc-panel-head">
            <strong>Firma Kartları ve Hesap Görme</strong>
            <input
              value={firmSearch}
              onChange={(event) => setFirmSearch(event?.target.value)}
              placeholder="Firma ara"
            />
          </div>
          <div className="acc-table-wrap short">
            <table>
              <thead>
                <tr>
                  <th>Firma</th>
                  <th>Belge</th>
                  <th>Alacak</th>
                  <th>Borç</th>
                  <th>Bakiye</th>
                  <th>İrsaliye Adedi</th>
                  <th>Son Tarih</th>
                  <th>Eksik</th>
                </tr>
              </thead>
              <tbody>
                {firmRows.map((firm) => (
                  <tr key={firm.name}>
                    <td>{firm.name}</td>
                    <td>{firm.docs}</td>
                    <td>{money(firm.receivable)}</td>
                    <td>{money(firm.payable)}</td>
                    <td>{money(firm.receivable - firm.payable)}</td>
                    <td>{numberText(firm.dispatchQty)}</td>
                    <td>{dateText(firm.lastDate)}</td>
                    <td>{firm.missing || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="acc-panel">
          <div className="acc-panel-head">
            <strong>Seçili Firmanın Faturaları</strong>
            <span>{selected ? counterparty(selected) : "Belge seç"}</span>
          </div>
          <div className="acc-stack">
            {selectedFirmRows.map((row) => (
              <button
                className={selectedId === row?.id ? "acc-doc-card active" : "acc-doc-card"}
                key={row?.id}
                type="button"
                onClick={() => selectRow(row)}
              >
                <strong>{row?.documentNo}</strong>
                <span>{KIND_LABELS[row?.documentKind]} · {dateText(row?.issueDate)}</span>
                <b>{money(row?.grandTotal)}</b>
              </button>
            ))}
            {!selectedFirmRows.length ? <div className="acc-empty box">Firma hareketi yok.</div> : null}
          </div>
        </section>
      </div>
    );
  }

  function renderLineCenter() {
    return (
      <section className="acc-panel">
        <div className="acc-panel-head">
          <strong>Fatura Kalemleri</strong>
          <span>{lineRows.length} kalem</span>
        </div>
        <div className="acc-table-wrap medium">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Firma</th>
                <th>Belge</th>
                <th>Kalem</th>
                <th>Miktar</th>
                <th>Birim</th>
                <th>KDV</th>
                <th>Lot</th>
                <th>Ürün</th>
                <th>Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {lineRows.map((line) => (
                <tr key={`${line?.documentId}-${line?.id}`}>
                  <td>{dateText(line?.issueDate)}</td>
                  <td>{line?.firmName}</td>
                  <td>{line?.documentNo}</td>
                  <td>{line?.rawName || line?.description}</td>
                  <td>{numberText(line?.quantity)}</td>
                  <td>{line?.unit || "-"}</td>
                  <td>%{line?.vatRate || 0}</td>
                  <td>{line?.lotNo || "-"}</td>
                  <td>
                    <Badge tone={line?.productId ? "green" : "orange"}>
                      {line?.productMatchStatus || "PENDING"}
                    </Badge>
                  </td>
                  <td>
                    <button type="button" onClick={() => selectRow({ id: line?.documentId })}>
                      Belgeye Git
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderCash() {
    return (
      <div className="acc-split cash">
        <section className="acc-panel">
          <div className="acc-panel-head">
            <strong>Cari / KDV Görünümü</strong>
            <span>Onay öncesi taslak hareketler</span>
          </div>
          <div className="acc-ledger-grid">
            <Metric label="Satış faturası" value={money(summary.sales)} sub="Cari alacak" />
            <Metric label="Tedarik + gider" value={money(summary.purchases)} sub="Cari borç" tone="orange" />
            <Metric label="Net KDV" value={money(summary.vatNet)} sub="Çıkış - giriş" tone={summary.vatNet >= 0 ? "blue" : "green"} />
            <Metric label="Hazır kayıt" value={summary.ready} sub="Onaylanabilir" tone="green" />
          </div>
          {renderInvoiceTable()}
        </section>
      </div>
    );
  }

  function renderPaintActions() {
    return (
      <section className="acc-panel">
        <div className="acc-panel-head">
          <strong>Boyahane Hızlı Aksiyon</strong>
          <span>Lotlu tedarik kalemleri</span>
        </div>
        <div className="acc-paint-grid">
          {paintRows.map((line) => (
            <div className="acc-paint-card" key={`${line?.documentId}-${line?.id}`}>
              <div>
                <strong>{line?.rawName || line?.description}</strong>
                <span>{line?.firmName} · {line?.documentNo}</span>
              </div>
              <div className="acc-paint-meta">
                <b>{numberText(line?.quantity)} {line?.unit || ""}</b>
                <Badge tone={line?.lotNo ? "orange" : "slate"}>{line?.lotNo ? `Lot ${line?.lotNo}` : "Lot yok"}</Badge>
                <Badge tone={line?.productId ? "green" : "orange"}>
                  {line?.productId ? "Ürün bağlı" : "Ürün bekliyor"}
                </Badge>
              </div>
              <div className="acc-paint-actions">
                <button type="button" onClick={() => selectRow({ id: line?.documentId })}>
                  Belgeyi Aç
                </button>
                <button type="button" disabled={Boolean(line?.productId) || busy} onClick={() => createProduct(line)}>
                  Ürün Aç
                </button>
                <button type="button" disabled={!line?.productId || !line?.lotNo}>
                  Lot Oluştur
                </button>
              </div>
            </div>
          ))}
          {!paintRows.length ? <div className="acc-empty box">Boyahane aksiyonu bekleyen kalem yok.</div> : null}
        </div>
      </section>
    );
  }

  function renderDashboard() {
    return (
      <div className="acc-dashboard">
        <section className="acc-panel">
          <div className="acc-panel-head">
            <strong>Bugünkü Muhasebe Kontrolü</strong>
            <span>{rows.length} belge havuzda</span>
          </div>
          <div className="acc-checklist">
            <div><b>{summary.missing}</b><span>Eksik bilgi</span></div>
            <div><b>{summary.ready}</b><span>Onaya hazır</span></div>
            <div><b>{invoiceRows.length}</b><span>Fatura</span></div>
            <div><b>{dispatchRows.length}</b><span>İrsaliye</span></div>
            <div><b>{summary.paintLots}</b><span>Boyahane lot</span></div>
          </div>
        </section>
        {renderFirmAccounts()}
      </div>
    );
  }

  function renderMainView() {
    if (view === "dashboard") return renderDashboard();
    if (view === "firms") return renderFirmAccounts();
    if (view === "lines") return renderLineCenter();
    if (view === "cash") return renderCash();
    if (view === "paint") return renderPaintActions();
    return (
      <>
        {view === "upload" ? renderUploadPanel() : null}
        <section className="acc-panel">
          <div className="acc-panel-head">
            <strong>{view === "invoices" ? "Fatura ve İrsaliye Merkezi" : "Kontrol Havuzu"}</strong>
            <button type="button" disabled={busy || !selectedIds.size} onClick={bulkApprove}>
              Eksiksizleri Toplu Onayla
            </button>
          </div>
          {renderInvoiceTable()}
        </section>
      </>
    );
  }

  return (
    <div className="acc-workspace">
      <style>{STYLE}</style>
      <div className="acc-head">
        <div>
          <span>Muhasebe / Belge, Firma, Cari ve Boyahane Bağlantısı</span>
          <h2>Muhasebe Çalışma Masası</h2>
        </div>
        <Badge tone="blue">{activeMainCompany?.name || "Ana firma seçili değil"}</Badge>
      </div>

      <div className="acc-tabs">
        {WORKSPACE_TABS.map((item) => (
          <button
            className={view === item?.key ? "active" : ""}
            key={item?.key}
            type="button"
            onClick={() => setView(item?.key)}
          >
            {item?.label}
          </button>
        ))}
      </div>

      <div className="acc-metrics">
        <Metric label="Belge" value={summary.docs} sub="Havuz" />
        <Metric label="Müşteri irsaliye" value={numberText(summary.customerDispatchQty)} sub="Model bağlanacak" />
        <Metric label="Satış" value={money(summary.sales)} sub="Bizim fatura" tone="green" />
        <Metric label="Alış / gider" value={money(summary.purchases)} sub="Tedarik + gider" tone="orange" />
        <Metric label="Net KDV" value={money(summary.vatNet)} sub="Kontrol" />
        <Metric label="Lot aksiyonu" value={summary.paintLots} sub="Boyahane" tone="red" />
      </div>

      {message ? <div className="acc-message">{message}</div> : null}

      <div className="acc-filterbar">
        <div>
          {STATUS_TABS.map((item) => (
            <button
              className={statusTab === item?.key ? "active" : ""}
              key={item?.key}
              type="button"
              onClick={() => setStatusTab(item?.key)}
            >
              {item?.label}
              <span>
                {item.key === "ALL"
                   ? rows.length
                  : rows.filter((row) =>
                      item.key === "ERROR"
                         ? ["REJECTED", "ARCHIVED"].includes(row?.status)
                        : row.status === item?.key,
                    ).length}
              </span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event?.target.value)}
          placeholder="Belge, firma, model, ürün ara"
        />
        <button type="button" onClick={() => refresh(selectedId)}>Yenile</button>
      </div>

      <div className="acc-main">
        <main>{renderMainView()}</main>
        <aside className="acc-detail">
          {selected ? (
            <>
              <div className="acc-detail-title">
                <strong>{selected.documentNo || selected.originalFileName}</strong>
                <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
              </div>
              <div className="acc-preview">
                <ErpIcon name="belge" size={30} />
                <span>{selected.originalFileName}</span>
              </div>
              <div className="acc-detail-grid">
                <span>Kesen firma</span><strong>{selected.issuerName || "-"}</strong>
                <span>Alıcı firma</span><strong>{selected.receiverName || "-"}</strong>
                <span>Hesap kartı</span><strong>{counterparty(selected)}</strong>
                <span>Belge türü</span>
                <select value={selected.documentKind} onChange={(event) => updateKind(event?.target.value)}>
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <span>Model</span><strong>{selected.modelGuess || "-"}</strong>
                <span>Adet</span><strong>{numberText(rowQty(selected))}</strong>
                <span>Matrah / KDV</span><strong>{money(selected.subtotal)} / {money(selected.vatTotal)}</strong>
                <span>Toplam</span><strong>{money(selected.grandTotal)}</strong>
              </div>

              <div className="acc-actions">
                {!selected.firmId ? (
                  <button type="button" disabled={busy} onClick={createFirm}>Yeni Firma Aç</button>
                ) : null}
                {(selected.lines || []).some((line) => !line?.productId) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => createProduct((selected.lines || []).find((line) => !line?.productId))}
                  >
                    İlk Eksik Ürünü Aç
                  </button>
                ) : null}
                <button
                  className="acc-primary"
                  type="button"
                  disabled={busy || selected.status === "APPROVED" || selected.status === "MISSING_INFO"}
                  onClick={approveOne}
                >
                  Onayla ve İşle
                </button>
              </div>

              <div className="acc-side-section">
                <h3>Eksikler</h3>
                <p>{shortMissing(selected.missingFields)}</p>
                {(selected.lines || [])
                  .filter((line) => line?.lotNo)
                  .map((line) => (
                    <div className="acc-mini-row" key={`${line?.id}-lot`}>
                      <span>Lot {line?.lotNo}</span>
                      <button type="button" disabled={!line?.productId}>Lot Oluştur</button>
                    </div>
                  ))}
              </div>

              <div className="acc-side-section">
                <h3>Kalemler</h3>
                {(selected.lines || []).map((line) => (
                  <div className="acc-line-card" key={line?.id}>
                    <strong>{line?.rawName || line?.description}</strong>
                    <span>{numberText(line?.quantity)} {line?.unit || ""} · KDV %{line?.vatRate || 0}</span>
                    <small>{line?.lotNo ? `Lot ${line?.lotNo}` : "Lot yok"}</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="acc-empty box">Kayıt seç.</div>
          )}
        </aside>
      </div>
    </div>
  );
}

const STYLE = `
.acc-workspace{display:grid;gap:12px;color:#102548}
.acc-head,.acc-upload,.acc-panel,.acc-detail{background:#fff;border:1px solid #dbe6f5;border-radius:8px;box-shadow:0 10px 24px rgba(15,35,68,.05)}
.acc-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px}.acc-head span{font-size:12px;color:#64748b;font-weight:800}.acc-head h2{margin:4px 0 0;font-size:22px}
.acc-tabs,.acc-filterbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.acc-tabs button,.acc-filterbar button,.acc-table-wrap button,.acc-actions button,.acc-mini-row button,.acc-paint-actions button,.acc-filelist button{border:1px solid #d6e1f0;background:#fff;border-radius:7px;min-height:32px;padding:0 10px;font-weight:850;color:#16335d;cursor:pointer}.acc-tabs button.active,.acc-filterbar button.active{background:#1d63ee;border-color:#1d63ee;color:#fff}.acc-filterbar{background:#fff;border:1px solid #dbe6f5;border-radius:8px;padding:8px}.acc-filterbar div{display:flex;gap:6px;flex-wrap:wrap}.acc-filterbar button span{margin-left:6px;font-size:11px}.acc-filterbar input,.acc-panel-head input{margin-left:auto;min-height:32px;border:1px solid #d6e1f0;border-radius:7px;padding:0 10px;min-width:260px}
.acc-metrics{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:8px}.acc-metric{border:1px solid #dbe6f5;border-radius:8px;background:#fff;padding:10px 12px;display:grid;gap:3px}.acc-metric span{font-size:12px;color:#64748b;font-weight:800}.acc-metric strong{font-size:20px}.acc-metric small{color:#64748b}.acc-metric.green strong{color:#15803d}.acc-metric.orange strong{color:#b45309}.acc-metric.red strong{color:#b91c1c}
.acc-message{background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:8px;padding:9px 12px;font-weight:850}.acc-main{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:12px;align-items:start}.acc-main main{display:grid;gap:12px;min-width:0}
.acc-upload{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:12px;padding:12px}.acc-drop{min-height:120px;border:2px dashed #9cc0ff;border-radius:8px;background:#f8fbff;display:grid;place-items:center;align-content:center;gap:6px;text-align:center;color:#64748b;cursor:pointer}.acc-drop input{display:none}.acc-drop strong{color:#102548}.acc-filebox{display:grid;grid-template-rows:1fr auto;gap:8px}.acc-filelist{border:1px solid #e2eaf6;border-radius:8px;max-height:96px;overflow:auto;padding:8px}.acc-filelist div{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #edf2f8}.acc-filelist p{margin:0;color:#64748b}
.acc-primary{border:1px solid #1d63ee!important;background:#1d63ee!important;color:#fff!important;border-radius:8px;min-height:36px;padding:0 14px;font-weight:900;cursor:pointer}.acc-primary:disabled,button:disabled{opacity:.55;cursor:not-allowed}
.acc-panel{min-width:0;padding:10px}.acc-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.acc-panel-head strong{font-size:15px}.acc-panel-head span{color:#64748b;font-weight:800}
.acc-table-wrap{overflow:auto;border:1px solid #e2eaf6;border-radius:8px;max-height:calc(100vh - 438px)}.acc-table-wrap.short{max-height:410px}.acc-table-wrap.medium{max-height:calc(100vh - 330px)}.acc-table-wrap table{border-collapse:collapse;min-width:1320px;width:100%;font-size:12px}.acc-table-wrap th,.acc-table-wrap td{padding:8px;border-bottom:1px solid #edf2f8;text-align:left;white-space:nowrap}.acc-table-wrap th{position:sticky;top:0;background:#f8fbff;color:#30496f;z-index:2}.acc-table-wrap tr.active td{background:#eaf2ff}
.acc-detail{position:sticky;top:12px;padding:12px;display:grid;gap:10px;max-height:calc(100vh - 182px);overflow:auto}.acc-detail-title{display:flex;justify-content:space-between;gap:8px;align-items:center}.acc-preview{min-height:76px;border:1px dashed #bfd4f2;border-radius:8px;background:#f8fbff;display:grid;place-items:center;align-content:center;gap:5px;color:#64748b;text-align:center}.acc-detail-grid{display:grid;grid-template-columns:96px minmax(0,1fr);gap:7px;align-items:center}.acc-detail-grid span{color:#64748b}.acc-detail-grid strong{min-width:0;overflow:hidden;text-overflow:ellipsis}.acc-detail-grid select{min-height:32px;border:1px solid #d6e1f0;border-radius:7px}
.acc-actions{display:grid;gap:7px}.acc-side-section{border-top:1px solid #e7eef8;padding-top:10px}.acc-side-section h3{font-size:14px;margin:0 0 7px}.acc-side-section p{margin:0;color:#92400e;font-weight:850}.acc-mini-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #fde7bd;background:#fffbeb;border-radius:8px;padding:7px;margin-bottom:6px}.acc-line-card{display:grid;gap:3px;border:1px solid #e2eaf6;border-radius:8px;padding:8px;margin-bottom:7px}.acc-line-card span,.acc-line-card small{color:#64748b}
.acc-split{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);gap:12px}.acc-split.cash{grid-template-columns:1fr}.acc-stack{display:grid;gap:8px;max-height:410px;overflow:auto}.acc-doc-card{border:1px solid #dbe6f5;background:#fff;border-radius:8px;padding:10px;text-align:left;display:grid;gap:4px;cursor:pointer}.acc-doc-card.active{border-color:#1d63ee;background:#eff6ff}.acc-doc-card span{color:#64748b}.acc-doc-card b{color:#102548}.acc-ledger-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}.acc-dashboard{display:grid;gap:12px}.acc-checklist{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.acc-checklist div{border:1px solid #e2eaf6;border-radius:8px;padding:10px;background:#f8fbff;display:grid;gap:4px}.acc-checklist b{font-size:24px}.acc-checklist span{color:#64748b;font-weight:800}
.acc-paint-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}.acc-paint-card{border:1px solid #dbe6f5;border-radius:8px;padding:10px;display:grid;gap:10px}.acc-paint-card span{display:block;color:#64748b;margin-top:3px}.acc-paint-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.acc-paint-actions{display:flex;gap:7px;flex-wrap:wrap}
.acc-badge{display:inline-flex;align-items:center;justify-content:center;min-height:22px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:900;background:#f1f5f9;color:#475569}.acc-badge.green{background:#dcfce7;color:#15803d}.acc-badge.orange{background:#fff2d8;color:#b45309}.acc-badge.blue{background:#eaf2ff;color:#1d63ee}.acc-badge.red{background:#fee2e2;color:#b91c1c}.acc-empty{text-align:center!important;color:#64748b;padding:22px!important}.acc-empty.box{border:1px dashed #bfd4f2;border-radius:8px;background:#f8fbff}
@media(max-width:1450px){.acc-metrics{grid-template-columns:repeat(3,1fr)}.acc-main,.acc-upload,.acc-split{grid-template-columns:1fr}.acc-detail{position:static}.acc-filterbar input{margin-left:0;width:100%}}
`;
