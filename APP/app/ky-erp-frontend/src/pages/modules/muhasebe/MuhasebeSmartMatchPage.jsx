import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Boxes,
  Building2,
  CheckCircle2,
  Link2,
  LoaderCircle,
  PackageSearch,
  RefreshCw,
  Route,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  fetchCompanies,
  fetchProducts,
} from "../../../services/muhasebeService";
import {
  assignPendingProductLine,
  createCompanyAlias,
  createProductAliasSmart,
  getCompanyAliases,
  getExpenseCategoriesForMatch,
  getPendingProductLines,
  getProductAliasesSmart,
  getSmartLotStock,
  getSmartMatchSummary,
  passiveCompanyAlias,
  passiveProductAliasSmart,
  setSmartProductRule,
  synchronizeSupplierRouting,
} from "../../../services/muhasebeSmartMatchApi";
import "./MuhasebeSmartMatchPage.css";

const SECTIONS = [
  ["pending", "Bekleyen Kalemler", PackageSearch],
  ["company", "Firma Aliasları", Building2],
  ["product", "Ürün Aliasları", Link2],
  ["rules", "Ürün Kuralları", Route],
  ["lots", "Lot ve Stok", Boxes],
];

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.liste)) return value.liste;
  return [];
}

function companyName(row) {
  return row?.firmaAdi || row?.name || row?.firma || row?.companyName || "Firma";
}

function productName(row) {
  return row?.urunAdi || row?.name || row?.productName || row?.ad || "Ürün";
}

function numberText(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(
    Number(value || 0),
  );
}

function SummaryCard({ label, value, note }) {
  return (
    <article className="msm-summary-card">
      <span>{label}</span>
      <strong>{numberText(value)}</strong>
      <small>{note}</small>
    </article>
  );
}

export default function MuhasebeSmartMatchPage({
  activeMainCompany,
  openModule,
}) {
  const [activeSection, setActiveSection] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [summary, setSummary] = useState({});
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [companyAliases, setCompanyAliases] = useState([]);
  const [productAliases, setProductAliases] = useState([]);
  const [pendingLines, setPendingLines] = useState([]);
  const [lots, setLots] = useState([]);
  const [lineProductSelection, setLineProductSelection] = useState({});
  const [companyAliasForm, setCompanyAliasForm] = useState({
    companyId: "",
    rawName: "",
  });
  const [productAliasForm, setProductAliasForm] = useState({
    productId: "",
    rawName: "",
    supplierFirmId: "",
  });
  const [ruleForm, setRuleForm] = useState({
    productId: "",
    routingType: "EXPENSE",
    expenseCategoryId: "",
    requiresLot: false,
  });

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    setLoading(true);
    setNotice(null);
    try {
      const [
        summaryResult,
        companyResult,
        productResult,
        categoryResult,
        companyAliasResult,
        productAliasResult,
        pendingResult,
        lotResult,
      ] = await Promise.all([
        getSmartMatchSummary(activeMainCompany),
        fetchCompanies(activeMainCompany),
        fetchProducts(activeMainCompany),
        getExpenseCategoriesForMatch(activeMainCompany),
        getCompanyAliases(activeMainCompany),
        getProductAliasesSmart(activeMainCompany),
        getPendingProductLines(activeMainCompany, { limit: 300 }),
        getSmartLotStock(activeMainCompany, { limit: 500 }),
      ]);
      setSummary(summaryResult || {});
      setCompanies(rowsOf(companyResult));
      setProducts(rowsOf(productResult));
      setCategories(rowsOf(categoryResult));
      setCompanyAliases(rowsOf(companyAliasResult));
      setProductAliases(rowsOf(productAliasResult));
      setPendingLines(rowsOf(pendingResult));
      setLots(rowsOf(lotResult));
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Eşleştirme merkezi yüklenemedi." });
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRuleProduct = useMemo(
    () => products.find((row) => String(row.id) === String(ruleForm.productId)) || null,
    [products, ruleForm.productId],
  );

  async function runAction(key, action, successText) {
    setBusy(key);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "success", text: successText });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşlem tamamlanamadı." });
    } finally {
      setBusy("");
    }
  }

  function openAssistant() {
    openModule?.("asistan", {
      tabKey: "sohbet",
      actionContext: {
        sourceModule: "muhasebe",
        sourceRoute: window.location.pathname,
        prompt:
          "Muhasebe eşleştirme merkezini incele. Bekleyen firma ve ürün aliaslarını, kategorisiz tedarikçi faturalarını, lot numarası eksik boya/kimya kalemlerini ve KDV/cari tutarsızlıklarını öncelik sırasıyla özetle.",
      },
    });
  }

  async function saveCompanyAlias() {
    if (!companyAliasForm.companyId || !companyAliasForm.rawName.trim()) {
      setNotice({ tone: "warning", text: "Firma ve yazım farklılığı zorunludur." });
      return;
    }
    await runAction(
      "company-alias",
      () => createCompanyAlias(activeMainCompany, companyAliasForm),
      "Firma aliası kaydedildi. Sonraki belgeler otomatik eşleşecek.",
    );
    setCompanyAliasForm({ companyId: "", rawName: "" });
  }

  async function saveProductAlias() {
    if (!productAliasForm.productId || !productAliasForm.rawName.trim()) {
      setNotice({ tone: "warning", text: "Ürün ve yazım farklılığı zorunludur." });
      return;
    }
    await runAction(
      "product-alias",
      () => createProductAliasSmart(activeMainCompany, productAliasForm),
      "Ürün aliası kaydedildi.",
    );
    setProductAliasForm({ productId: "", rawName: "", supplierFirmId: "" });
  }

  async function assignLine(line) {
    const productId = lineProductSelection[line.id];
    if (!productId) {
      setNotice({ tone: "warning", text: "Önce doğru ürünü seçin." });
      return;
    }
    await runAction(
      `line-${line.id}`,
      () =>
        assignPendingProductLine(activeMainCompany, line.id, {
          productId,
          supplierFirmId: line?.document?.companyId || "",
          approvedBy: "MUHASEBE_USER",
        }),
      "Fatura kalemi ürüne bağlandı ve alias kaydedildi.",
    );
  }

  async function saveRule() {
    if (!ruleForm.productId) {
      setNotice({ tone: "warning", text: "Önce ürün seçin." });
      return;
    }
    const category = categories.find(
      (row) => String(row.id) === String(ruleForm.expenseCategoryId),
    );
    await runAction(
      "product-rule",
      () =>
        setSmartProductRule(activeMainCompany, ruleForm.productId, {
          routingType: ruleForm.routingType,
          expenseCategoryId: ruleForm.expenseCategoryId,
          expenseCategoryName: category?.ad || category?.name || "",
          productGroup: ruleForm.routingType === "BOYAHANE" ? "BOYAHANE" : "GENEL",
          requiresLot: ruleForm.routingType === "BOYAHANE" || ruleForm.requiresLot,
          updatedBy: "MUHASEBE_USER",
        }),
      "Ürün muhasebe ve stok kuralı kaydedildi.",
    );
  }

  async function syncRouting() {
    await runAction(
      "routing-sync",
      () => synchronizeSupplierRouting(activeMainCompany),
      "Tedarikçi faturaları ürün, gider, stok ve Boyahane kurallarına göre yeniden kontrol edildi.",
    );
  }

  return (
    <main className="msm-page">
      <header className="msm-header">
        <div>
          <span>MUHASEBE OTOMASYONU</span>
          <h1>Firma, Ürün, Gider ve Lot Eşleştirme</h1>
          <p>
            Yazım farklarını kalıcı öğrenir; tedarikçi faturalarını gider, stok ve
            Boyahane lotlarına otomatik yönlendirir.
          </p>
        </div>
        <div className="msm-header-actions">
          <button type="button" onClick={openAssistant}>
            <Bot size={17} /> Muhasebe Asistanı
          </button>
          <button type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} /> Yenile
          </button>
          <button
            type="button"
            className="primary"
            onClick={syncRouting}
            disabled={busy === "routing-sync"}
          >
            {busy === "routing-sync" ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
            Tedarikçi Kayıtlarını İşle
          </button>
        </div>
      </header>

      {notice ? <div className={`msm-notice ${notice.tone}`}>{notice.text}</div> : null}

      <section className="msm-summary-grid">
        <SummaryCard label="Bekleyen ürün kalemi" value={summary.unmatchedLineCount} note="Ürün kartına bağlanacak" />
        <SummaryCard label="Firma aliası" value={summary.companyAliasCount} note="Yazım farkı öğrenildi" />
        <SummaryCard label="Ürün aliası" value={summary.productAliasCount} note="Kalem açıklaması öğrenildi" />
        <SummaryCard label="Kategorisiz fatura" value={summary.uncategorizedSupplierDocumentCount} note="Gider kuralı bekliyor" />
        <SummaryCard label="Aktif Boyahane lotu" value={summary.activeLotCount} note={`${numberText(summary.remainingLotQuantity)} kalan miktar`} />
      </section>

      <nav className="msm-section-tabs">
        {SECTIONS.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            className={activeSection === key ? "active" : ""}
            onClick={() => setActiveSection(key)}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="msm-loading"><LoaderCircle className="spin" /> Veriler yükleniyor...</div>
      ) : null}

      {!loading && activeSection === "pending" ? (
        <section className="msm-panel">
          <div className="msm-panel-head">
            <div><h2>Ürün Eşleşmesi Bekleyen Fatura Kalemleri</h2><p>Bir kez eşleştirilen açıklama sonraki faturada otomatik tanınır.</p></div>
            <strong>{pendingLines.length}</strong>
          </div>
          <div className="msm-table-wrap">
            <table>
              <thead><tr><th>Fatura</th><th>Gelen kalem</th><th>Adet</th><th>Doğru ürün</th><th>İşlem</th></tr></thead>
              <tbody>
                {pendingLines.map((line) => (
                  <tr key={line.id}>
                    <td><b>{line?.document?.documentNo || "-"}</b><small>{line?.document?.date ? String(line.document.date).slice(0, 10) : ""}</small></td>
                    <td><b>{line.productName || line.description || "Adsız kalem"}</b><small>{line.lotNo ? `Lot: ${line.lotNo}` : "Lot bilgisi yok"}</small></td>
                    <td>{numberText(line.quantity)} {line.unit || ""}</td>
                    <td>
                      <select value={lineProductSelection[line.id] || ""} onChange={(event) => setLineProductSelection((current) => ({ ...current, [line.id]: event.target.value }))}>
                        <option value="">Ürün seçin</option>
                        {products.map((product) => <option key={product.id} value={product.id}>{productName(product)}</option>)}
                      </select>
                    </td>
                    <td><button type="button" className="compact primary" disabled={busy === `line-${line.id}`} onClick={() => assignLine(line)}><CheckCircle2 size={15} /> Eşleştir</button></td>
                  </tr>
                ))}
                {!pendingLines.length ? <tr><td colSpan="5" className="empty">Bekleyen ürün kalemi yok.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && activeSection === "company" ? (
        <section className="msm-two-column">
          <article className="msm-panel form-panel">
            <h2>Firma Yazım Farkı Ekle</h2>
            <label>Doğru firma<select value={companyAliasForm.companyId} onChange={(event) => setCompanyAliasForm((current) => ({ ...current, companyId: event.target.value }))}><option value="">Firma seçin</option>{companies.map((company) => <option key={company.id} value={company.id}>{companyName(company)}</option>)}</select></label>
            <label>Belgelerde gelen farklı yazım<input value={companyAliasForm.rawName} onChange={(event) => setCompanyAliasForm((current) => ({ ...current, rawName: event.target.value }))} placeholder="Örn. SELVI KIMYA SAN. TIC." /></label>
            <button type="button" className="primary" onClick={saveCompanyAlias} disabled={busy === "company-alias"}><Save size={16} /> Kaydet</button>
          </article>
          <article className="msm-panel">
            <div className="msm-panel-head"><div><h2>Kayıtlı Firma Aliasları</h2><p>Vergi numarası her zaman isim aliasından önce gelir.</p></div><strong>{companyAliases.length}</strong></div>
            <div className="msm-list">{companyAliases.map((row) => <div key={row.id}><div><b>{row.rawName}</b><small>→ {row.company?.name || row.companyId}</small></div><button type="button" title="Pasife al" onClick={() => runAction(`company-delete-${row.id}`, () => passiveCompanyAlias(activeMainCompany, row.id), "Firma aliası pasife alındı.")}><Trash2 size={15} /></button></div>)}{!companyAliases.length ? <p className="empty">Kayıtlı firma aliası yok.</p> : null}</div>
          </article>
        </section>
      ) : null}

      {!loading && activeSection === "product" ? (
        <section className="msm-two-column">
          <article className="msm-panel form-panel">
            <h2>Ürün Yazım Farkı Ekle</h2>
            <label>Doğru ürün<select value={productAliasForm.productId} onChange={(event) => setProductAliasForm((current) => ({ ...current, productId: event.target.value }))}><option value="">Ürün seçin</option>{products.map((product) => <option key={product.id} value={product.id}>{productName(product)}</option>)}</select></label>
            <label>Tedarikçi (isteğe bağlı)<select value={productAliasForm.supplierFirmId} onChange={(event) => setProductAliasForm((current) => ({ ...current, supplierFirmId: event.target.value }))}><option value="">Tüm tedarikçiler</option>{companies.map((company) => <option key={company.id} value={company.id}>{companyName(company)}</option>)}</select></label>
            <label>Faturada gelen açıklama<input value={productAliasForm.rawName} onChange={(event) => setProductAliasForm((current) => ({ ...current, rawName: event.target.value }))} placeholder="Ürün açıklamasını yazın" /></label>
            <button type="button" className="primary" onClick={saveProductAlias} disabled={busy === "product-alias"}><Save size={16} /> Kaydet</button>
          </article>
          <article className="msm-panel">
            <div className="msm-panel-head"><div><h2>Kayıtlı Ürün Aliasları</h2><p>Ürün kodu ve tedarikçi bilgisi varsa öncelikli kullanılır.</p></div><strong>{productAliases.length}</strong></div>
            <div className="msm-list">{productAliases.map((row) => <div key={row.id}><div><b>{row.rawName}</b><small>→ {row.product?.name || row.productId}</small></div><button type="button" title="Pasife al" onClick={() => runAction(`product-delete-${row.id}`, () => passiveProductAliasSmart(activeMainCompany, row.id), "Ürün aliası pasife alındı.")}><Trash2 size={15} /></button></div>)}{!productAliases.length ? <p className="empty">Kayıtlı ürün aliası yok.</p> : null}</div>
          </article>
        </section>
      ) : null}

      {!loading && activeSection === "rules" ? (
        <section className="msm-two-column">
          <article className="msm-panel form-panel">
            <h2>Ürün Muhasebe ve Stok Kuralı</h2>
            <label>Ürün<select value={ruleForm.productId} onChange={(event) => setRuleForm((current) => ({ ...current, productId: event.target.value }))}><option value="">Ürün seçin</option>{products.map((product) => <option key={product.id} value={product.id}>{productName(product)}</option>)}</select></label>
            <label>Yönlendirme<select value={ruleForm.routingType} onChange={(event) => setRuleForm((current) => ({ ...current, routingType: event.target.value, requiresLot: event.target.value === "BOYAHANE" }))}><option value="EXPENSE">Doğrudan gider</option><option value="STOCK">Genel stok</option><option value="BOYAHANE">Boyahane stok + lot</option></select></label>
            <label>Gider kategorisi<select value={ruleForm.expenseCategoryId} onChange={(event) => setRuleForm((current) => ({ ...current, expenseCategoryId: event.target.value }))}><option value="">Kategori seçilmedi</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.ad || category.name}</option>)}</select></label>
            <label className="check"><input type="checkbox" checked={ruleForm.routingType === "BOYAHANE" || ruleForm.requiresLot} disabled={ruleForm.routingType === "BOYAHANE"} onChange={(event) => setRuleForm((current) => ({ ...current, requiresLot: event.target.checked }))} /> Lot numarası zorunlu</label>
            <button type="button" className="primary" onClick={saveRule} disabled={busy === "product-rule"}><Save size={16} /> Kuralı Kaydet</button>
          </article>
          <article className="msm-panel rule-explain">
            <h2>{selectedRuleProduct ? productName(selectedRuleProduct) : "Kural Önizlemesi"}</h2>
            <div><b>Doğrudan gider</b><p>Fatura cari ve KDV’ye işlenir; stok oluşturulmaz.</p></div>
            <div><b>Genel stok</b><p>Fatura kalemi stok giriş hareketi oluşturur.</p></div>
            <div><b>Boyahane stok + lot</b><p>Stok girişi ve Boyahane lotu birlikte oluşur. Lot numarası yoksa işlem bekletilir, numara uydurulmaz.</p></div>
          </article>
        </section>
      ) : null}

      {!loading && activeSection === "lots" ? (
        <section className="msm-panel">
          <div className="msm-panel-head"><div><h2>Boyahane Lot ve Stok Kayıtları</h2><p>Tedarikçi faturalarından oluşan doğrulanmış lotlar.</p></div><strong>{lots.length}</strong></div>
          <div className="msm-table-wrap"><table><thead><tr><th>Lot</th><th>Ürün</th><th>Tedarikçi</th><th>Giriş</th><th>Kalan</th><th>Durum</th></tr></thead><tbody>{lots.map((row) => <tr key={row.id}><td><b>{row.lotNo}</b></td><td>{row.product?.name || "Ürün kartı yok"}</td><td>{row.supplier?.name || "-"}</td><td>{numberText(row.quantity)}</td><td>{numberText(row.remainingQuantity)}</td><td><span className={`status ${String(row.status || "").toLowerCase()}`}>{row.status || "ACTIVE"}</span></td></tr>)}{!lots.length ? <tr><td colSpan="6" className="empty">Boyahane lot kaydı yok.</td></tr> : null}</tbody></table></div>
        </section>
      ) : null}
    </main>
  );
}
