import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  FileText,
  Link2,
  RefreshCcw,
  Search,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../../../utils/api";
import "./supplierInvoicesWorkspace.css";

const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const listOf = (payload) => {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
};
const text = (value) => String(value ?? "").trim();
const upper = (value) => text(value).toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? text(value).slice(0, 10) : parsed.toLocaleDateString("tr-TR");
};
const numberText = (value) => Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
const money = (value) => Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });

function policyLabel(value) {
  return {
    REQUIRED: "LOT Zorunlu",
    OPTIONAL: "LOT Opsiyonel",
    NONE: "LOT Kullanılmaz",
  }[upper(value)] || "LOT Kullanılmaz";
}

function statusLabel(value) {
  const key = upper(value);
  if (key === "POSTED") return "İşlendi";
  if (key === "APPROVED") return "Onaylandı";
  if (key === "READY_FOR_APPROVAL") return "İşleme hazır";
  if (key === "REVIEW_REQUIRED") return "Kontrol gerekli";
  if (key === "INGESTED") return "Yeni / Kontrol bekliyor";
  return value || "Kontrol bekliyor";
}

function sourceLabel(row = {}) {
  const value = upper(row.source_type || row.sourceType || row.provider_type || row.providerType);
  if (value.includes("ISNET")) return "İşNet";
  if (value.includes("XML")) return "XML";
  if (value.includes("AI") || value.includes("SCAN")) return "PDF / Görsel";
  return text(row.provider_type || row.source_type || "Manuel");
}

function canonicalInvoice(row = {}) {
  return {
    ...row,
    id: row.id,
    documentNo: row.document_no || row.documentNo || "",
    issueDate: row.issue_date || row.issueDate || row.created_at || row.createdAt,
    companyName: row.party_name || row.companyName || row.supplierName || "",
    status: row.status || "REVIEW_REQUIRED",
    subtotal: Number(row.subtotal || 0),
    taxTotal: Number(row.tax_total ?? row.vatTotal ?? 0),
    payableTotal: Number(row.payable_total ?? row.grandTotal ?? 0),
  };
}

function draftLine(line = {}) {
  const raw = line.raw_metadata || line.rawMetadata || line.raw || {};
  const allocations = Array.isArray(raw.lotAllocations)
    ? raw.lotAllocations
    : Array.isArray(raw?.reconciliation?.allocations)
      ? raw.reconciliation.allocations
      : [];
  return {
    id: line.id,
    lineNo: line.line_no || line.lineNo || "",
    description: line.description || raw.rawName || "Kalem",
    quantity: Number(line.quantity || 0),
    unit: line.unit_code || line.unit || "",
    unitPrice: Number(line.unit_price ?? line.unitPrice ?? 0),
    lineTotal: Number(line.line_total ?? line.lineTotal ?? 0),
    productId: line.product_id || line.productId || "",
    productName: raw.productName || line.productName || "",
    routingType: upper(raw.routingType || "EXPENSE"),
    lotPolicy: upper(raw.lotPolicy || (raw.lotRequired ? "REQUIRED" : "NONE")),
    invoiceLotNo: text(raw.invoiceLotNo || (raw.lotSource === "INVOICE" ? raw.lotNo : "") || raw.lotNo),
    dispatchLotNo: text(raw.dispatchLotNo),
    lotStatus: upper(raw.lotReconciliationStatus || raw.reconciliationStatus || ""),
    allocations,
    allowInvoicePhysicalReceipt: raw.allowInvoicePhysicalReceipt === true,
  };
}

function allocationLots(line) {
  return (line.allocations || [])
    .filter((row) => text(row.lotNo))
    .map((row) => `${text(row.lotNo)} · ${numberText(row.quantity)} ${line.unit || ""}`);
}

function hasDispatchEvidence(line) {
  if (text(line.dispatchLotNo)) return true;
  return (line.allocations || []).some((row) => text(row.lotNo));
}

function Drawer({ invoice, busy, onClose, children, footer }) {
  if (!invoice) return null;
  return (
    <div className="siw-drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside className="siw-drawer wide" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="siw-drawer-header">
          <div>
            <h2>{invoice.documentNo || "Tedarikçi faturası"}</h2>
            <p>{invoice.companyName || "Firma eşleşmesi bekliyor"} · {dateText(invoice.issueDate)} · {statusLabel(invoice.status)}</p>
          </div>
          <button type="button" className="siw-icon-button" onClick={onClose} disabled={busy} aria-label="Kapat"><X size={20} /></button>
        </header>
        <div className="siw-drawer-body">{children}</div>
        <footer className="siw-drawer-footer">{footer}</footer>
      </aside>
    </div>
  );
}

export default function CanonicalSupplierInventoryWorkspace({ activeMainCompany, refreshKey = 0 }) {
  const [view, setView] = useState("invoices");
  const [invoices, setInvoices] = useState([]);
  const [lots, setLots] = useState([]);
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [lines, setLines] = useState([]);
  const [issues, setIssues] = useState([]);
  const [relations, setRelations] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const companyParams = useMemo(() => ({
    mainCompanySlug: activeMainCompany?.slug,
    mainCompanyId: activeMainCompany?.id,
  }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const approvedProducts = useMemo(
    () => products.filter((row) => row.approvalStatus === "APPROVED" && row.isActive !== false),
    [products],
  );
  const productMap = useMemo(
    () => new Map(approvedProducts.map((row) => [String(row.id), row])),
    [approvedProducts],
  );

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    setLoading(true);
    setError("");
    try {
      const [invoicePayload, productPayload, lotPayload] = await Promise.all([
        apiGet("/e-belge/pool", { ...companyParams, filter: "INCOMING_INVOICE", q: search, page: 1, pageSize: 100, _ts: Date.now() }),
        apiGet("/boyahane/products", { ...companyParams, _ts: Date.now() }),
        apiGet("/boyahane/workflow/lots", { ...companyParams, search, status: "ALL", _ts: Date.now() }),
      ]);
      const invoiceData = unwrap(invoicePayload);
      setInvoices((Array.isArray(invoiceData?.items) ? invoiceData.items : []).map(canonicalInvoice));
      setProducts(listOf(productPayload));
      setLots(listOf(lotPayload));
    } catch (requestError) {
      setError(requestError?.message || "Tedarikçi belge/stok verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany?.slug, companyParams, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 160);
    return () => window.clearTimeout(timer);
  }, [load, refreshKey]);

  const openInvoice = useCallback(async (row) => {
    setSelected(row);
    setLines([]);
    setIssues([]);
    setRelations([]);
    setMessage("");
    setDetailLoading(true);
    try {
      const payload = await apiGet(`/e-belge/documents/${encodeURIComponent(row.id)}`, { ...companyParams, _ts: Date.now() });
      const detail = unwrap(payload);
      setSelected(canonicalInvoice(detail));
      setLines((detail.lines || []).map(draftLine));
      setIssues((detail.issues || []).filter((issue) => !issue.is_resolved));
      setRelations(detail.relations || []);
    } catch (requestError) {
      setMessage(requestError?.message || "Fatura detayı alınamadı.");
    } finally {
      setDetailLoading(false);
    }
  }, [companyParams]);

  const changeLine = (id, patch) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  };

  const applyProduct = (line, productId) => {
    const product = productMap.get(String(productId));
    changeLine(line.id, {
      productId,
      productName: product?.productName || product?.name || "",
      routingType: productId ? "BOYAHANE" : line.routingType,
      lotPolicy: upper(product?.lotPolicy || (product?.lotRequired === false ? "OPTIONAL" : productId ? "REQUIRED" : line.lotPolicy)),
      unit: line.unit || product?.unit || "KG",
    });
  };

  const requiredLotErrors = useMemo(() => lines.flatMap((line) => {
    const product = productMap.get(String(line.productId));
    const policy = upper(product?.lotPolicy || line.lotPolicy || "NONE");
    if (policy !== "REQUIRED") return [];
    const hasLot = text(line.invoiceLotNo) || hasDispatchEvidence(line);
    return hasLot ? [] : [`${line.lineNo || "?"}. kalem (${line.description}): LOT zorunlu.`];
  }), [lines, productMap]);

  async function saveLines() {
    if (!selected?.id) return;
    for (const line of lines) {
      const product = productMap.get(String(line.productId));
      const lotPolicy = upper(product?.lotPolicy || line.lotPolicy || "NONE");
      await apiPatch(
        `/e-belge/documents/${encodeURIComponent(selected.id)}/lines/${encodeURIComponent(line.id)}`,
        {
          ...companyParams,
          ...(line.productId ? { productId: line.productId } : {}),
          lotNo: lotPolicy === "NONE" ? "" : line.invoiceLotNo,
          allowInvoicePhysicalReceipt: lotPolicy === "REQUIRED" && !hasDispatchEvidence(line) && line.allowInvoicePhysicalReceipt === true,
          unitCode: line.unit,
        },
      );
    }
  }

  async function saveAndReconcile() {
    if (!selected?.id) return;
    setSaving(true);
    setMessage("");
    try {
      await saveLines();
      await apiPost(`/e-belge/documents/${encodeURIComponent(selected.id)}/reconcile`, companyParams);
      setMessage("Ürün/LOT bilgileri kaydedildi; fatura ve irsaliye kanıtları yeniden uzlaştırıldı.");
      await openInvoice(selected);
      await load();
    } catch (requestError) {
      setMessage(requestError?.message || "Belge uzlaştırması tamamlanamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function finalizeInvoice() {
    if (!selected?.id) return;
    if (requiredLotErrors.length) {
      setMessage(requiredLotErrors.join(" "));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await saveLines();
      await apiPost(`/e-belge/documents/${encodeURIComponent(selected.id)}/reconcile`, companyParams);
      const payload = await apiPost(
        `/e-belge/documents/${encodeURIComponent(selected.id)}/finalize`,
        { ...companyParams, confirm: true },
      );
      const data = unwrap(payload);
      setMessage("Fatura canonical olarak işlendi. Fiziksel stok tek kez, maliyet/KDV/cari ise finansal belge üzerinden kaydedildi.");
      setSelected((current) => ({ ...current, status: data?.status || "POSTED" }));
      await load();
    } catch (requestError) {
      setMessage(requestError?.message || "Fatura son onayı tamamlanamadı.");
      try { await openInvoice(selected); } catch { /* detail refresh is best effort */ }
    } finally {
      setSaving(false);
    }
  }

  const filteredLots = lots.filter((row) => {
    const q = upper(search);
    return !q || upper(`${row.productName} ${row.lotNo} ${row.supplierName || row.companyName} ${row.documentNo || row.invoiceNo}`).includes(q);
  });

  return (
    <section className="siw-root">
      <div className="siw-toolbar">
        <div className="siw-view-switch">
          <button type="button" className={view === "invoices" ? "active" : ""} onClick={() => setView("invoices")}><FileText size={16} /> Faturalar</button>
          <button type="button" className={view === "lots" ? "active" : ""} onClick={() => setView("lots")}><Boxes size={16} /> Boyahane LOT</button>
        </div>
        <label className="siw-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Belge, firma, ürün veya LOT ara" /></label>
        <button type="button" className="siw-secondary-button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>
      </div>

      <div className="siw-callout">
        <ShieldCheck size={22} />
        <div><strong>Tek canonical stok / LOT düzeni</strong><span>LOT kararı tedarikçiye değil ürün kartına aittir. İrsaliye fiziksel stok gerçeği, fatura maliyet/KDV/cari gerçeğidir; aynı mal ikinci kez stoğa girmez.</span></div>
      </div>

      {error ? <div className="siw-message error">{error}</div> : null}
      {message && !selected ? <div className="siw-message">{message}</div> : null}

      {view === "invoices" ? (
        <div className="siw-table-wrap">
          <table>
            <thead><tr><th>Tarih</th><th>Firma</th><th>Fatura No</th><th>Kaynak</th><th>Tutar</th><th>Durum</th><th>Kontrol</th></tr></thead>
            <tbody>{invoices.map((row) => (
              <tr key={row.id} onClick={() => openInvoice(row)} style={{ cursor: "pointer" }}>
                <td>{dateText(row.issueDate)}</td><td><strong>{row.companyName || "Firma bekliyor"}</strong></td><td>{row.documentNo || "-"}</td><td>{sourceLabel(row)}</td><td>{money(row.payableTotal)}</td><td>{statusLabel(row.status)}</td><td><button type="button" className="siw-secondary-button" onClick={(event) => { event.stopPropagation(); openInvoice(row); }}>Aç</button></td>
              </tr>
            ))}</tbody>
          </table>
          {!loading && !invoices.length ? <div className="siw-empty"><FileText size={25} /><strong>Tedarikçi faturası yok</strong><span>İşNet, XML/PDF ve tarama belgeleri aynı havuzda görünür.</span></div> : null}
        </div>
      ) : (
        <div className="siw-table-wrap">
          <table>
            <thead><tr><th>Ürün</th><th>LOT</th><th>Tedarikçi</th><th>Belge</th><th>Giriş</th><th>Kalan</th><th>Durum</th></tr></thead>
            <tbody>{filteredLots.map((row) => (
              <tr key={row.id || row.fileName}><td><strong>{row.productName || "-"}</strong></td><td>{row.lotNo || "-"}</td><td>{row.supplierName || row.companyName || "-"}</td><td>{row.documentNo || row.invoiceNo || "-"}</td><td>{numberText(row.entryKg || row.quantity)} {row.unit || "KG"}</td><td>{numberText(row.remainingKg ?? row.remainingQuantity)} {row.unit || "KG"}</td><td>{row.status || "-"}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <Drawer
        invoice={selected}
        busy={saving}
        onClose={() => { setSelected(null); setMessage(""); }}
        footer={<>
          <button type="button" className="siw-secondary-button" onClick={() => setSelected(null)} disabled={saving}>Kapat</button>
          <button type="button" className="siw-secondary-button" onClick={saveAndReconcile} disabled={saving || detailLoading}><Link2 size={17} /> Kaydet + Uzlaştır</button>
          <button type="button" className="siw-primary-button" onClick={finalizeInvoice} disabled={saving || detailLoading || upper(selected?.status) === "POSTED"}><CheckCircle2 size={17} /> Faturayı İşle</button>
        </>}
      >
        {message ? <div className="siw-message">{message}</div> : null}
        {detailLoading ? <div className="siw-empty">Belge ayrıntısı yükleniyor…</div> : null}

        {issues.length ? <section className="siw-callout danger"><AlertTriangle size={22} /><div><strong>{issues.length} açık kontrol var</strong><span>{issues.map((issue) => issue.message || issue.issue_code).join(" · ")}</span></div></section> : null}
        {relations.length ? <section className="siw-callout"><Truck size={22} /><div><strong>{relations.length} belge bağlantısı</strong><span>{relations.map((row) => `${row.related_document_no || "İrsaliye"} (${row.related_document_type || row.relation_type || "eşleşme"})`).join(" · ")}</span></div></section> : null}
        {requiredLotErrors.length ? <section className="siw-callout danger"><AlertTriangle size={22} /><div><strong>LOT tamamlanmadan işlenemez</strong><span>{requiredLotErrors.join(" ")}</span></div></section> : null}

        <section className="siw-card">
          <header><div><Boxes size={18} /><span><strong>Belge Kalemleri · Ürün Bazlı LOT</strong><small>Firma kimyasal olsa da olmasa da kural seçilen ürün kartından gelir.</small></span></div></header>
          <div className="siw-table-wrap wide">
            <table>
              <thead><tr><th>#</th><th>Kalem</th><th>Miktar</th><th>Ürün</th><th>Yönlendirme</th><th>LOT Kuralı</th><th>Fatura LOT</th><th>İrsaliye LOT / Dağılım</th><th>Fatura-önce Fiziksel Kabul</th></tr></thead>
              <tbody>{lines.map((line) => {
                const product = productMap.get(String(line.productId));
                const policy = upper(product?.lotPolicy || line.lotPolicy || "NONE");
                const dispatchLots = allocationLots(line);
                const dispatchEvidence = hasDispatchEvidence(line);
                const conflict = line.lotStatus === "CONFLICT";
                return (
                  <tr key={line.id}>
                    <td>{line.lineNo || "-"}</td>
                    <td><strong>{line.description}</strong><small style={{ display: "block" }}>{money(line.lineTotal)}</small></td>
                    <td>{numberText(line.quantity)} {line.unit}</td>
                    <td><select value={line.productId} onChange={(event) => applyProduct(line, event.target.value)}><option value="">Ürün yok / gider satırı</option>{approvedProducts.map((row) => <option key={row.id} value={row.id}>{row.productName || row.name}</option>)}</select></td>
                    <td>{line.productId ? "BOYAHANE" : (line.routingType || "EXPENSE")}</td>
                    <td><strong>{policyLabel(policy)}</strong></td>
                    <td>{policy === "NONE" ? <span>-</span> : <input value={line.invoiceLotNo} onChange={(event) => changeLine(line.id, { invoiceLotNo: event.target.value })} placeholder={policy === "REQUIRED" ? "LOT zorunlu" : "Varsa LOT"} />}</td>
                    <td>{conflict ? <strong style={{ color: "var(--danger, #b42318)" }}>LOT ÇATIŞMASI</strong> : dispatchLots.length ? dispatchLots.map((value) => <div key={value}>{value}</div>) : line.dispatchLotNo ? line.dispatchLotNo : <span>İrsaliye kanıtı yok</span>}</td>
                    <td>{policy === "REQUIRED" && !dispatchEvidence ? <label><input type="checkbox" checked={line.allowInvoicePhysicalReceipt} onChange={(event) => changeLine(line.id, { allowInvoicePhysicalReceipt: event.target.checked })} /> İrsaliye gelmeden geçici fiziksel kabulü açıkça onayla</label> : <span>{dispatchEvidence ? "İrsaliye esas alınır" : "Gerekmez"}</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </section>
      </Drawer>
    </section>
  );
}
