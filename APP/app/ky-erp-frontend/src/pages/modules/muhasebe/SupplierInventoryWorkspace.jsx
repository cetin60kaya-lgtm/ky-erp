import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  FlaskConical,
  PackageCheck,
  Plus,
  RefreshCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { apiGet, apiPatch, apiPost, apiUpload } from "../../../utils/api";
import "./supplierInvoicesWorkspace.css";

const PAGE_SIZES = [25, 50, 100];
const INVOICE_STATUS_OPTIONS = [
  ["ALL", "Tümü"],
  ["CONTROL_WAITING", "Kontrol bekliyor"],
  ["READY", "İşleme hazır"],
  ["PROCESSED", "İşlendi"],
  ["REJECTED", "Reddedildi"],
];
const LOT_STATUS_OPTIONS = [
  ["ALL", "Tüm lotlar"],
  ["AVAILABLE", "Kullanılabilir"],
  ["QUARANTINE", "Karantina"],
  ["DEPLETED", "Bitti"],
  ["INACTIVE", "Pasif"],
];

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  });

const numberText = (value) =>
  Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 3 });

const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : parsed.toLocaleDateString("tr-TR");
};

const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const listOf = (payload) => {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
};

function statusLabel(value) {
  const key = normalize(value);
  if (/DEPLETED|BITTI/.test(key)) return "Bitti";
  if (/QUARANTINE|KARANTINA/.test(key)) return "Karantina";
  if (/INACTIVE|PASIF/.test(key)) return "Pasif";
  if (/AVAILABLE|KULLANILABILIR/.test(key)) return "Kullanılabilir";
  if (/PROCESSED|APPROVED|ISLENDI/.test(key)) return "İşlendi";
  if (/READY|HAZIR/.test(key)) return "İşleme hazır";
  if (/REJECT|RED/.test(key)) return "Reddedildi";
  if (/MISSING|EKSIK/.test(key)) return "Eksik bilgi";
  return "Kontrol bekliyor";
}

function statusTone(value) {
  const key = normalize(value);
  if (/AVAILABLE|PROCESSED|APPROVED|ISLENDI/.test(key)) return "success";
  if (/DEPLETED|INACTIVE/.test(key)) return "muted";
  if (/REJECT|RED|ERROR|HATA|QUARANTINE/.test(key)) return "danger";
  if (/READY|HAZIR/.test(key)) return "ready";
  return "warning";
}

function EmptyState({ icon: Icon = Archive, title, description }) {
  return (
    <div className="siw-empty">
      <Icon size={28} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function Drawer({ open, width = "wide", title, subtitle, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="siw-drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside
        className={`siw-drawer ${width}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="siw-drawer-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="siw-icon-button" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </header>
        <div className="siw-drawer-body">{children}</div>
        {footer ? <footer className="siw-drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}

function buildLineDrafts(detail, aliases, profile) {
  const aliasMap = new Map(
    (aliases || []).map((alias) => [normalize(alias.normalizedRawName || alias.rawName), alias]),
  );
  return (detail?.lines || []).map((line) => {
    const rawName = line.rawName || line.description || "Kalem";
    const alias = aliasMap.get(normalize(rawName)) || {};
    return {
      lineId: line.id,
      rawName,
      productId: alias.productId || "",
      productName: alias.productName || "",
      aliasName: alias.aliasName || alias.productName || rawName,
      lotNo: line.lotNo || "",
      quantity: Number(line.quantity || 0),
      unit: line.unit || alias.unit || profile?.defaultUnit || "KG",
      unitPrice: Number(line.unitPrice || 0),
      totalCost: Number(line.lineTotal || line.subtotal || 0),
      warehouse: profile?.defaultWarehouse || "BOYAHANE",
      productionDate: "",
      expiryDate: "",
      status: "AVAILABLE",
    };
  });
}

export default function SupplierInventoryWorkspace({ activeMainCompany, refreshKey = 0 }) {
  const [view, setView] = useState("invoices");
  const [rows, setRows] = useState([]);
  const [lots, setLots] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [lineDrafts, setLineDrafts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const uploadRef = useRef(null);

  const companyParams = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    }),
    [activeMainCompany?.id, activeMainCompany?.slug],
  );

  const approvedProducts = useMemo(
    () =>
      products.filter(
        (row) =>
          row.approvalStatus === "APPROVED" && row.isActive !== false,
      ),
    [products],
  );

  const loadProducts = useCallback(async () => {
    try {
      const payload = await apiGet("/boyahane/products", {
        ...companyParams,
        _ts: Date.now(),
      });
      setProducts(listOf(payload));
    } catch (requestError) {
      setProducts([]);
      setError(requestError?.message || "Onaylı Boyahane ürünleri alınamadı.");
    }
  }, [companyParams]);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiGet("/muhasebe/belge-import", {
        ...companyParams,
        search,
        status,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        _ts: Date.now(),
      });
      const data = listOf(payload);
      setRows(data);
      setTotal(Number(payload?.pagination?.total ?? payload?.data?.pagination?.total ?? data.length));
    } catch (requestError) {
      setRows([]);
      setTotal(0);
      setError(requestError?.message || "Tedarikçi faturaları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [companyParams, page, pageSize, search, status]);

  const loadLots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await apiGet("/boyahane/workflow/lots", {
        ...companyParams,
        search,
        status,
        _ts: Date.now(),
      });
      const data = listOf(payload);
      setLots(data);
      setTotal(data.length);
    } catch (requestError) {
      setLots([]);
      setTotal(0);
      setError(requestError?.message || "Boyahane lot stokları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [companyParams, search, status]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts, refreshKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (view === "invoices") loadInvoices();
      else loadLots();
    }, 160);
    return () => window.clearTimeout(timer);
  }, [loadInvoices, loadLots, refreshKey, view]);

  useEffect(() => {
    setPage(1);
  }, [search, status, view]);

  const openInvoice = useCallback(async (row) => {
    setSelected({ ...row, detailType: "invoice" });
    setDetailLoading(true);
    setMessage("");
    try {
      const detailPayload = await apiGet(
        `/muhasebe/belge-import/${encodeURIComponent(row.id)}`,
        { ...companyParams, _ts: Date.now() },
      );
      const detail = unwrap(detailPayload);
      const companyId = detail.companyId || detail.firmId;
      const [profilePayload, aliasesPayload] = companyId
        ? await Promise.all([
            apiGet(`/muhasebe/chemical-suppliers/${encodeURIComponent(companyId)}/profile`, companyParams),
            apiGet(`/muhasebe/chemical-suppliers/${encodeURIComponent(companyId)}/aliases`, companyParams),
          ])
        : [{ data: { isChemicalSupplier: false } }, { data: [] }];
      const nextProfile = unwrap(profilePayload);
      setSelected({ ...detail, detailType: "invoice" });
      setProfile(nextProfile);
      setLineDrafts(buildLineDrafts(detail, listOf(aliasesPayload), nextProfile));
    } catch (requestError) {
      setMessage(requestError?.message || "Fatura detayı alınamadı.");
    } finally {
      setDetailLoading(false);
    }
  }, [companyParams]);

  const openLot = useCallback(async (row) => {
    setSelected({ ...row, detailType: "lot" });
    setDetailLoading(true);
    setMessage("");
    try {
      const payload = await apiGet(
        `/boyahane/workflow/lots/${encodeURIComponent(row.id || row.fileName)}`,
        { ...companyParams, _ts: Date.now() },
      );
      setSelected({ ...unwrap(payload), detailType: "lot" });
    } catch (requestError) {
      setMessage(requestError?.message || "Lot detayı alınamadı.");
    } finally {
      setDetailLoading(false);
    }
  }, [companyParams]);

  const patchLine = (lineId, field, value) => {
    setLineDrafts((current) =>
      current.map((line) =>
        line.lineId === lineId ? { ...line, [field]: value } : line,
      ),
    );
  };

  const applyProduct = (lineId, productId) => {
    const product = approvedProducts.find(
      (item) => String(item.id) === String(productId),
    );
    setLineDrafts((current) =>
      current.map((line) =>
        line.lineId === lineId
          ? {
              ...line,
              productId,
              productName: product?.productName || product?.name || "",
              aliasName:
                line.aliasName ||
                product?.productName ||
                product?.name ||
                line.rawName,
              unit: line.unit || product?.unit || profile?.defaultUnit || "KG",
            }
          : line,
      ),
    );
  };

  const createProductForLine = async (line) => {
    const name = String(line.aliasName || line.rawName || "").trim();
    if (!name) return;
    setSaving(true);
    setMessage("");
    try {
      const payload = await apiPost("/boyahane/products", {
        ...companyParams,
        productName: name,
        dyeType: "GENEL",
        unit: line.unit || profile?.defaultUnit || "KG",
        source: "SUPPLIER_INVOICE",
      });
      const product = unwrap(payload);
      await loadProducts();
      setLineDrafts((current) =>
        current.map((item) =>
          item.lineId === line.lineId
            ? {
                ...item,
                productId: product.id,
                productName: product.productName || product.name,
              }
            : item,
        ),
      );
      setMessage(`${product.productName || product.name} onaylı Boyahane ürünü olarak oluşturuldu.`);
    } catch (requestError) {
      const productId = requestError?.details?.productId || requestError?.error?.details?.productId;
      if (productId) {
        applyProduct(line.lineId, productId);
      }
      setMessage(requestError?.message || "Onaylı ürün oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  };

  const saveChemicalProfile = async (isChemicalSupplier) => {
    if (!selected?.companyId) return;
    setSaving(true);
    setMessage("");
    try {
      const payload = await apiPatch(
        `/muhasebe/chemical-suppliers/${encodeURIComponent(selected.companyId)}/profile`,
        {
          ...companyParams,
          ...profile,
          isChemicalSupplier,
          defaultWarehouse: profile?.defaultWarehouse || "BOYAHANE",
          defaultUnit: profile?.defaultUnit || "KG",
          requireLot: true,
          allowNegativeStock: false,
        },
      );
      const nextProfile = unwrap(payload);
      setProfile(nextProfile);
      setLineDrafts((current) =>
        current.map((line) => ({
          ...line,
          unit: line.unit || nextProfile.defaultUnit || "KG",
          warehouse: line.warehouse || nextProfile.defaultWarehouse || "BOYAHANE",
        })),
      );
      setMessage(
        isChemicalSupplier
          ? "Firma boya/kimyasal tedarikçisi olarak işaretlendi."
          : "Firma normal tedarikçi olarak güncellendi.",
      );
      await loadInvoices();
    } catch (requestError) {
      setMessage(requestError?.message || "Firma türü güncellenemedi.");
    } finally {
      setSaving(false);
    }
  };

  const lineErrors = useMemo(() => {
    if (!profile?.isChemicalSupplier) return [];
    const errors = [];
    lineDrafts.forEach((line, index) => {
      if (!line.productId) errors.push(`${index + 1}. kalemde onaylı ürün seçilmedi.`);
      if (!String(line.lotNo || "").trim()) errors.push(`${index + 1}. kalemde lot no eksik.`);
      if (Number(line.quantity || 0) <= 0) errors.push(`${index + 1}. kalemde miktar sıfır.`);
    });
    return errors;
  }, [lineDrafts, profile?.isChemicalSupplier]);

  const transferToDyehouse = async () => {
    if (!selected?.id || lineErrors.length) {
      setMessage(lineErrors.join(" ") || "Aktarım için fatura seçin.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const payload = await apiPost(
        `/muhasebe/belge-import/${encodeURIComponent(selected.id)}/boyahane-transfer-v2`,
        {
          ...companyParams,
          lines: lineDrafts.map((line) => ({
            ...line,
            quantity: Number(line.quantity || 0),
            unitPrice: Number(line.unitPrice || 0),
            totalCost: Number(line.totalCost || 0),
          })),
        },
      );
      setSelected((current) => ({
        ...current,
        boyahaneTransferStatus: unwrap(payload)?.status || "COMPLETED",
      }));
      setMessage("Onaylı ürün, firma aliası, lot ve stok giriş hareketi birlikte oluşturuldu.");
      await Promise.all([loadInvoices(), loadLots(), loadProducts()]);
    } catch (requestError) {
      setMessage(requestError?.message || "Boyahane lot aktarımı tamamlanamadı.");
    } finally {
      setSaving(false);
    }
  };

  const processInvoice = async () => {
    if (!selected?.id) return;
    setSaving(true);
    setMessage("");
    try {
      const payload = await apiPost(
        `/muhasebe/belge-import/${encodeURIComponent(selected.id)}/approve`,
        { ...companyParams, confirm: true },
      );
      setSelected({ ...unwrap(payload), detailType: "invoice" });
      setMessage("Fatura cari, KDV ve gider akışına işlendi.");
      await loadInvoices();
    } catch (requestError) {
      setMessage(requestError?.message || "Fatura işlenemedi.");
    } finally {
      setSaving(false);
    }
  };

  const uploadDocuments = async () => {
    if (!uploadFiles.length) return;
    setSaving(true);
    setMessage("");
    try {
      const formData = new FormData();
      uploadFiles.forEach((file) => formData.append("files", file));
      if (activeMainCompany?.slug) formData.set("mainCompanySlug", activeMainCompany.slug);
      if (activeMainCompany?.id) formData.set("mainCompanyId", activeMainCompany.id);
      const payload = await apiUpload("/muhasebe/belge-import/upload", formData);
      const result = unwrap(payload);
      setUploadFiles([]);
      setUploadOpen(false);
      setMessage(`${Number(result.createdCount || result.created?.length || 0)} belge kontrol listesine alındı.`);
      await loadInvoices();
    } catch (requestError) {
      setMessage(requestError?.message || "Belge yükleme tamamlanamadı.");
    } finally {
      setSaving(false);
    }
  };

  const changeView = (nextView) => {
    setView(nextView);
    setStatus("ALL");
    setSearch("");
    setPage(1);
    setSelected(null);
    setMessage("");
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const displayedRows = view === "invoices" ? rows : lots;
  const statusOptions = view === "invoices" ? INVOICE_STATUS_OPTIONS : LOT_STATUS_OPTIONS;

  return (
    <section className="siw-root">
      <header className="siw-toolbar">
        <div className="siw-view-switch" role="tablist" aria-label="Tedarikçi ve lot görünümü">
          <button type="button" className={view === "invoices" ? "active" : ""} onClick={() => changeView("invoices")}>
            <FileText size={17} /> Faturalar
          </button>
          <button type="button" className={view === "lots" ? "active" : ""} onClick={() => changeView("lots")}>
            <Boxes size={17} /> Boyahane Lot Stoku
          </button>
        </div>
        <div className="siw-toolbar-actions">
          <span className="siw-sync-note">{approvedProducts.length} onaylı ürün</span>
          <button type="button" className="siw-secondary-button" onClick={() => (view === "invoices" ? loadInvoices() : loadLots())}>
            <RefreshCcw size={16} /> Yenile
          </button>
          {view === "invoices" ? (
            <button type="button" className="siw-secondary-button" onClick={() => setUploadOpen(true)}>
              <Upload size={16} /> Fatura Yükle
            </button>
          ) : null}
        </div>
      </header>

      <div className="siw-filterbar">
        <label className="siw-search">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={view === "invoices" ? "Firma, fatura no veya ürün ara" : "Ürün, lot, firma veya fatura ara"} />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {view === "invoices" ? (
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} kayıt</option>)}
          </select>
        ) : null}
        <span className="siw-result-count">{total} kayıt</span>
      </div>

      {message ? <div className="siw-message" role="status">{message}</div> : null}
      {error ? <div className="siw-error" role="alert"><CircleAlert size={18} /><span>{error}</span></div> : null}

      <div className="siw-table-card">
        {loading ? (
          <div className="siw-loading">Veriler yükleniyor…</div>
        ) : displayedRows.length === 0 ? (
          <EmptyState
            icon={view === "invoices" ? FileText : Boxes}
            title={view === "invoices" ? "Tedarikçi faturası bulunamadı" : "Boyahane lot stoku bulunamadı"}
            description={view === "invoices" ? "İşNet veya manuel faturalar burada görünür." : "Aktarılan lotlar burada görünür."}
          />
        ) : (
          <div className="siw-table-wrap">
            {view === "invoices" ? (
              <table>
                <thead><tr><th>Tarih</th><th>Firma</th><th>Fatura No</th><th>Matrah</th><th>KDV</th><th>Genel Toplam</th><th>Kaynak</th><th>Durum</th></tr></thead>
                <tbody>{rows.map((row) => (
                  <tr key={row.id} onClick={() => openInvoice(row)} tabIndex={0}>
                    <td>{dateText(row.issueDate)}</td>
                    <td><strong>{row.companyName || row.supplierName || "Eşleşme bekliyor"}</strong></td>
                    <td>{row.documentNo || "-"}</td>
                    <td>{money(row.subtotal)}</td>
                    <td>{money(row.vatTotal)}</td>
                    <td><strong>{money(row.grandTotal)}</strong></td>
                    <td>{/ISNET/.test(normalize(row.sourceType)) ? "İşNet" : "Manuel"}</td>
                    <td><span className={`siw-status ${statusTone(row.status)}`}>{statusLabel(row.status)}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : (
              <table>
                <thead><tr><th>Ürün</th><th>Tür</th><th>Firma</th><th>Lot</th><th>Giriş</th><th>Kullanılan</th><th>Kalan</th><th>Birim</th><th>Fatura</th><th>Durum</th></tr></thead>
                <tbody>{lots.map((row) => (
                  <tr key={row.id || row.fileName} onClick={() => openLot(row)} tabIndex={0}>
                    <td><strong>{row.productName || "-"}</strong></td>
                    <td>{row.dyeType || "-"}</td>
                    <td>{row.supplierName || row.companyName || "-"}</td>
                    <td>{row.lotNo || "-"}</td>
                    <td>{numberText(row.entryKg)}</td>
                    <td>{numberText(row.usedKg)}</td>
                    <td><strong>{numberText(row.remainingKg)}</strong></td>
                    <td>{row.unit || "-"}</td>
                    <td>{row.invoiceNo || row.documentNo || "-"}</td>
                    <td><span className={`siw-status ${statusTone(row.status)}`}>{statusLabel(row.status)}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {view === "invoices" && pageCount > 1 ? (
        <footer className="siw-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Önceki</button>
          <span>{page} / {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Sonraki <ChevronRight size={16} /></button>
        </footer>
      ) : null}

      <Drawer
        open={Boolean(selected)}
        title={selected?.detailType === "lot" ? selected?.productName || "Lot Detayı" : selected?.documentNo || "Fatura Detayı"}
        subtitle={selected?.detailType === "lot" ? `${selected?.supplierName || selected?.companyName || "-"} · ${selected?.lotNo || "Lot yok"}` : `${selected?.companyName || selected?.supplierName || "Firma eşleşmesi bekliyor"} · ${dateText(selected?.issueDate)}`}
        onClose={() => { setSelected(null); setMessage(""); }}
        footer={selected?.detailType === "invoice" ? (
          <>
            <button type="button" className="siw-secondary-button" onClick={() => setSelected(null)}>Kapat</button>
            {profile?.isChemicalSupplier ? (
              <button type="button" className="siw-secondary-button" disabled={saving || detailLoading || lineErrors.length > 0 || selected?.boyahaneTransferStatus === "COMPLETED"} onClick={transferToDyehouse}>
                <FlaskConical size={17} /> {selected?.boyahaneTransferStatus === "COMPLETED" ? "Boyahaneye Aktarıldı" : "Boyahaneye Aktar"}
              </button>
            ) : null}
            <button type="button" className="siw-primary-button" disabled={saving || detailLoading || /PROCESSED|APPROVED/.test(normalize(selected?.status))} onClick={processInvoice}>
              <CheckCircle2 size={17} /> Faturayı İşle
            </button>
          </>
        ) : <button type="button" className="siw-primary-button" onClick={() => setSelected(null)}>Tamam</button>}
      >
        {detailLoading ? <div className="siw-loading">Detay yükleniyor…</div> : selected?.detailType === "lot" ? (
          <div className="siw-detail-stack">
            <section className="siw-summary-grid">
              <div><span>Ürün</span><strong>{selected.productName || "-"}</strong></div>
              <div><span>Tür</span><strong>{selected.dyeType || "-"}</strong></div>
              <div><span>Firma</span><strong>{selected.supplierName || selected.companyName || "-"}</strong></div>
              <div><span>Lot</span><strong>{selected.lotNo || "-"}</strong></div>
              <div><span>Giriş</span><strong>{numberText(selected.entryKg)} {selected.unit}</strong></div>
              <div><span>Kullanılan</span><strong>{numberText(selected.usedKg)} {selected.unit}</strong></div>
              <div><span>Kalan</span><strong>{numberText(selected.remainingKg)} {selected.unit}</strong></div>
              <div><span>Fatura</span><strong>{selected.invoiceNo || selected.documentNo || "-"}</strong></div>
            </section>
            <section className="siw-section">
              <header><h3>Stok hareketleri</h3></header>
              {(selected.movements || []).length ? (
                <div className="siw-table-wrap compact"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Miktar</th><th>Açıklama</th></tr></thead><tbody>{selected.movements.map((movement) => (
                  <tr key={movement.id || movement.fileName}><td>{dateText(movement.createdAt)}</td><td>{movement.type === "IN" ? "Giriş" : "Sarf"}</td><td>{numberText(movement.quantity)} {movement.unit || selected.unit}</td><td>{movement.note || "-"}</td></tr>
                ))}</tbody></table></div>
              ) : <EmptyState title="Hareket bulunamadı" description="Bu lot için stok hareketi yok." />}
            </section>
          </div>
        ) : (
          <div className="siw-detail-stack">
            <section className="siw-summary-grid">
              <div><span>Firma</span><strong>{selected?.companyName || selected?.supplierName || "-"}</strong></div>
              <div><span>Fatura no</span><strong>{selected?.documentNo || "-"}</strong></div>
              <div><span>Tarih</span><strong>{dateText(selected?.issueDate)}</strong></div>
              <div><span>Matrah</span><strong>{money(selected?.subtotal)}</strong></div>
              <div><span>KDV</span><strong>{money(selected?.vatTotal)}</strong></div>
              <div><span>Genel toplam</span><strong>{money(selected?.grandTotal)}</strong></div>
            </section>

            <section className="siw-section">
              <header className="siw-section-header">
                <div><h3>Firma türü</h3><p>Lot alanları yalnız boya/kimyasal tedarikçisinde açılır.</p></div>
                <label className="siw-toggle">
                  <input type="checkbox" checked={Boolean(profile?.isChemicalSupplier)} disabled={saving || !selected?.companyId} onChange={(event) => saveChemicalProfile(event.target.checked)} />
                  <span /> Boya / Kimyasal Tedarikçisi
                </label>
              </header>
              {profile?.isChemicalSupplier ? (
                <div className="siw-inline-form">
                  <label>Varsayılan depo<input value={profile?.defaultWarehouse || "BOYAHANE"} onChange={(event) => setProfile((current) => ({ ...current, defaultWarehouse: event.target.value }))} /></label>
                  <label>Varsayılan birim<input value={profile?.defaultUnit || "KG"} onChange={(event) => setProfile((current) => ({ ...current, defaultUnit: event.target.value }))} /></label>
                  <button type="button" className="siw-secondary-button" disabled={saving} onClick={() => saveChemicalProfile(true)}>Kaydet</button>
                </div>
              ) : null}
            </section>

            <section className="siw-section">
              <header><h3>Fatura kalemleri</h3><span>{lineDrafts.length} kalem</span></header>
              {!lineDrafts.length ? <EmptyState title="Fatura kalemi bulunamadı" description="Belge kalemleri okunamadığı için işlem yapılamıyor." /> : profile?.isChemicalSupplier ? (
                <div className="siw-lot-editor">
                  {lineDrafts.map((line, index) => (
                    <article className="siw-lot-line" key={line.lineId || index}>
                      <header><strong>{index + 1}. {line.rawName}</strong><span>{numberText(line.quantity)} {line.unit}</span></header>
                      <div className="siw-lot-grid">
                        <label>
                          Onaylı Boyahane ürünü
                          <select value={line.productId} onChange={(event) => applyProduct(line.lineId, event.target.value)}>
                            <option value="">Onaylı ürün seçin</option>
                            {approvedProducts.map((product) => <option key={product.id} value={product.id}>{product.productName || product.name}</option>)}
                          </select>
                          {!line.productId ? (
                            <button type="button" className="siw-inline-create" disabled={saving || !line.aliasName} onClick={() => createProductForLine(line)}>
                              <Plus size={14} /> Bu adla onaylı ürün oluştur
                            </button>
                          ) : null}
                        </label>
                        <label>Firma bazlı alias<input value={line.aliasName} onChange={(event) => patchLine(line.lineId, "aliasName", event.target.value)} /></label>
                        <label>Lot no<input value={line.lotNo} onChange={(event) => patchLine(line.lineId, "lotNo", event.target.value)} /></label>
                        <label>Miktar<input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => patchLine(line.lineId, "quantity", event.target.value)} /></label>
                        <label>Birim<input value={line.unit} onChange={(event) => patchLine(line.lineId, "unit", event.target.value)} /></label>
                        <label>Depo<input value={line.warehouse} onChange={(event) => patchLine(line.lineId, "warehouse", event.target.value)} /></label>
                        <label>Üretim tarihi<input type="date" value={line.productionDate} onChange={(event) => patchLine(line.lineId, "productionDate", event.target.value)} /></label>
                        <label>Son kullanma tarihi<input type="date" value={line.expiryDate} onChange={(event) => patchLine(line.lineId, "expiryDate", event.target.value)} /></label>
                        <label>Birim maliyet<input type="number" min="0" step="0.0001" value={line.unitPrice} onChange={(event) => patchLine(line.lineId, "unitPrice", event.target.value)} /></label>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="siw-table-wrap compact"><table><thead><tr><th>Ürün</th><th>Miktar</th><th>Birim</th><th>Birim fiyat</th><th>Toplam</th></tr></thead><tbody>{lineDrafts.map((line) => (
                  <tr key={line.lineId}><td>{line.rawName}</td><td>{numberText(line.quantity)}</td><td>{line.unit || "-"}</td><td>{money(line.unitPrice)}</td><td>{money(line.totalCost)}</td></tr>
                ))}</tbody></table></div>
              )}
            </section>

            {profile?.isChemicalSupplier ? (
              <section className={`siw-callout ${lineErrors.length ? "danger" : ""}`}>
                <PackageCheck size={22} />
                <div>
                  <strong>Boyahane aktarım kontrolü</strong>
                  <span>{selected?.boyahaneTransferStatus === "COMPLETED" ? "Onaylı ürün, alias, lot ve stok girişi oluşturuldu." : lineErrors.length ? lineErrors.join(" ") : "Tüm kalemler onaylı ürüne bağlı; aktarım hazır."}</span>
                </div>
              </section>
            ) : null}
          </div>
        )}
      </Drawer>

      <Drawer open={uploadOpen} width="small" title="Manuel Fatura Yükle" subtitle="İşNet dışında kalan PDF, XML veya ZIP belgeleri." onClose={() => setUploadOpen(false)} footer={<><button type="button" className="siw-secondary-button" onClick={() => setUploadOpen(false)}>Vazgeç</button><button type="button" className="siw-primary-button" disabled={saving || !uploadFiles.length} onClick={uploadDocuments}><Upload size={17} /> Yükle</button></>}>
        <button type="button" className="siw-upload-box" onClick={() => uploadRef.current?.click()}><Upload size={28} /><strong>PDF, XML veya ZIP seçin</strong><span>Belgeler R2 arşivine kaydedilir ve kontrol listesine alınır.</span></button>
        <input ref={uploadRef} type="file" multiple accept=".pdf,.xml,.zip,application/pdf,text/xml,application/xml,application/zip" hidden onChange={(event) => setUploadFiles(Array.from(event.target.files || []))} />
        {uploadFiles.length ? <div className="siw-upload-list">{uploadFiles.map((file) => <div key={`${file.name}-${file.size}`}><FileText size={16} /><span>{file.name}</span><small>{numberText(file.size / 1024)} KB</small></div>)}</div> : null}
      </Drawer>
    </section>
  );
}
