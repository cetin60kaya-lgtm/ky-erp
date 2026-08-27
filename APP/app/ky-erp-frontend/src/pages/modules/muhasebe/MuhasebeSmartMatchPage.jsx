import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
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
import { fetchCompanies, fetchProducts } from "../../../services/muhasebeService";
import {
  assignPendingProductLine,
  createProductAliasSmart,
  getExpenseCategoriesForMatch,
  getPendingProductLines,
  getProductAliasesSmart,
  getSmartLotStock,
  getSmartMatchSummary,
  passiveProductAliasSmart,
  setSmartProductRule,
  synchronizeSupplierRouting,
} from "../../../services/muhasebeSmartMatchApi";
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";
import "./MuhasebeSmartMatchPage.css";

const SECTIONS = [
  ["pending", "Boya / Kimya Kalemleri", PackageSearch],
  ["product", "Ürün Aliasları", Link2],
  ["rules", "Boyahane Ürün Kuralları", Route],
  ["lots", "Lot ve Stok", Boxes],
];

const CHEMICAL_KEYS = [
  "KIMYA",
  "BOYA",
  "KIMYEVI",
  "PIGMENT",
  "BASKI PATI",
  "FIKSATOR",
  "TUTKAL",
  "URAS",
  "TURAN",
  "SELVI",
];

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.liste)) return value.liste;
  return [];
}

function cleanKey(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/İ/g, "I")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/\s+/g, " ");
}

function truthyFlag(value) {
  if (value === true || value === 1) return true;
  return ["EVET", "TRUE", "1", "AKTIF", "ACTIVE"].includes(cleanKey(value));
}

function companyName(row) {
  return row?.firmaAdi || row?.name || row?.firma || row?.companyName || "Firma";
}

function productName(row) {
  return row?.urunAdi || row?.name || row?.productName || row?.ad || "Ürün";
}

function companyText(row) {
  const raw = row?.raw || {};
  return cleanKey(
    [
      companyName(row),
      row?.supplierCategory,
      row?.tedarikciKategorisi,
      row?.category,
      row?.kategori,
      row?.sector,
      row?.sektor,
      row?.companyGroup,
      row?.firmaGrubu,
      raw?.supplierCategory,
      raw?.tedarikciKategorisi,
      raw?.category,
      raw?.kategori,
      raw?.sector,
      raw?.sektor,
      raw?.companyGroup,
      raw?.firmaGrubu,
    ].join(" "),
  );
}

function isChemicalSupplierCompany(row) {
  if (!row) return false;
  const raw = row?.raw || {};
  if (
    [
      row?.isChemicalSupplier,
      row?.kimyaBoyaTedarikcisi,
      row?.dyehouseSupplier,
      row?.boyahaneTedarikcisi,
      raw?.isChemicalSupplier,
      raw?.kimyaBoyaTedarikcisi,
      raw?.dyehouseSupplier,
      raw?.boyahaneTedarikcisi,
    ].some(truthyFlag)
  ) {
    return true;
  }
  const text = companyText(row);
  return CHEMICAL_KEYS.some((key) => text.includes(key));
}

function findSupplierCompany(row, companies) {
  const document = row?.document || row?.invoice || {};
  const supplier = row?.supplier || document?.supplier || {};
  const wantedId = String(
    row?.supplierFirmId ||
      row?.supplierCompanyId ||
      document?.companyId ||
      document?.supplierCompanyId ||
      supplier?.id ||
      "",
  );
  if (wantedId) {
    const byId = companies.find(
      (company) => String(company?.id || company?.firmaId || "") === wantedId,
    );
    if (byId) return byId;
  }
  const wantedName = cleanKey(
    row?.supplierName ||
      row?.companyName ||
      document?.supplierName ||
      document?.companyName ||
      document?.firma ||
      document?.tedarikciAdi ||
      supplier?.name ||
      supplier?.firmaAdi,
  );
  if (!wantedName) return null;
  return (
    companies.find((company) => {
      const name = cleanKey(companyName(company));
      return name === wantedName || name.includes(wantedName) || wantedName.includes(name);
    }) || null
  );
}

function isChemicalSupplierRow(row, companies) {
  const company = findSupplierCompany(row, companies);
  if (company) return isChemicalSupplierCompany(company);
  const document = row?.document || row?.invoice || {};
  const fallback = cleanKey(
    [
      row?.supplierName,
      row?.companyName,
      document?.supplierName,
      document?.companyName,
      document?.firma,
      document?.tedarikciAdi,
      row?.supplier?.name,
      row?.supplier?.firmaAdi,
    ].join(" "),
  );
  return CHEMICAL_KEYS.some((key) => fallback.includes(key));
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

export default function MuhasebeSmartMatchPage({ activeMainCompany }) {
  const companyKey = activeMainCompany?.slug || activeMainCompany?.id || "";
  const loadedRef = useRef({});
  const requestRef = useRef(0);

  const [activeSection, setActiveSection] = useState("pending");
  const [summary, setSummary] = useState({});
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pendingLines, setPendingLines] = useState([]);
  const [productAliases, setProductAliases] = useState([]);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState("");
  const [productLoading, setProductLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [selectedLineId, setSelectedLineId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [aliasForm, setAliasForm] = useState({
    productId: "",
    rawName: "",
    supplierFirmId: "",
  });
  const [ruleForm, setRuleForm] = useState({
    productId: "",
    expenseCategoryId: "",
  });

  const chemicalCompanies = useMemo(
    () => companies.filter(isChemicalSupplierCompany),
    [companies],
  );

  const visiblePendingLines = useMemo(
    () => pendingLines.filter((row) => isChemicalSupplierRow(row, companies)),
    [companies, pendingLines],
  );

  const visibleAliases = useMemo(
    () =>
      productAliases.filter((row) => {
        const supplierId = String(
          row?.supplierFirmId || row?.supplierCompanyId || row?.raw?.supplierFirmId || "",
        );
        if (!supplierId) return false;
        return chemicalCompanies.some(
          (company) => String(company?.id || company?.firmaId || "") === supplierId,
        );
      }),
    [chemicalCompanies, productAliases],
  );

  const visibleLots = useMemo(
    () => lots.filter((row) => isChemicalSupplierRow(row, companies)),
    [companies, lots],
  );

  const selectedLine = useMemo(
    () =>
      visiblePendingLines.find(
        (row) => String(row.id) === String(selectedLineId),
      ) || null,
    [selectedLineId, visiblePendingLines],
  );

  const selectedRuleProduct = useMemo(
    () => products.find((row) => String(row.id) === String(ruleForm.productId)) || null,
    [products, ruleForm.productId],
  );

  const loadSummary = useCallback(async () => {
    if (!companyKey) return;
    try {
      const result = await getSmartMatchSummary(activeMainCompany);
      setSummary(result || {});
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Özet alınamadı." });
    }
  }, [activeMainCompany, companyKey]);

  const ensureProducts = useCallback(async () => {
    if (products.length) return products;
    setProductLoading(true);
    try {
      const result = rowsOf(await fetchProducts(activeMainCompany));
      setProducts(result);
      return result;
    } finally {
      setProductLoading(false);
    }
  }, [activeMainCompany, products]);

  const loadSection = useCallback(
    async (section, force = false) => {
      if (!companyKey) return;
      if (!force && loadedRef.current[section]) return;
      const requestId = ++requestRef.current;
      setLoading(section);
      setNotice(null);
      try {
        let result = null;
        if (section === "pending") {
          result = await loadModuleData({
            scope: `muhasebe:${companyKey}:akilli-esleme:pending`,
            sources: {
              pending: { critical: true, load: () => getPendingProductLines(activeMainCompany, { limit: 50 }) },
              companies: { fallback: [], load: () => fetchCompanies(activeMainCompany) },
            },
          });
          if (result.states.companies.status !== "error") setCompanies(rowsOf(result.data.companies));
          if (result.states.pending.status !== "error") setPendingLines(rowsOf(result.data.pending));
        }
        if (section === "product") {
          result = await loadModuleData({
            scope: `muhasebe:${companyKey}:akilli-esleme:product`,
            sources: {
              aliases: { critical: true, load: () => getProductAliasesSmart(activeMainCompany, { limit: 100 }) },
              companies: { fallback: [], load: () => fetchCompanies(activeMainCompany) },
              products: { fallback: [], load: () => fetchProducts(activeMainCompany) },
            },
          });
          if (result.states.companies.status !== "error") setCompanies(rowsOf(result.data.companies));
          if (result.states.products.status !== "error") setProducts(rowsOf(result.data.products));
          if (result.states.aliases.status !== "error") setProductAliases(rowsOf(result.data.aliases));
        }
        if (section === "rules") {
          result = await loadModuleData({
            scope: `muhasebe:${companyKey}:akilli-esleme:rules`,
            sources: {
              products: { critical: true, load: () => fetchProducts(activeMainCompany) },
              categories: { fallback: [], load: () => getExpenseCategoriesForMatch(activeMainCompany) },
            },
          });
          if (result.states.products.status !== "error") setProducts(rowsOf(result.data.products));
          if (result.states.categories.status !== "error") setCategories(rowsOf(result.data.categories));
        }
        if (section === "lots") {
          result = await loadModuleData({
            scope: `muhasebe:${companyKey}:akilli-esleme:lots`,
            sources: {
              lots: { critical: true, load: () => getSmartLotStock(activeMainCompany, { limit: 100 }) },
              companies: { fallback: [], load: () => fetchCompanies(activeMainCompany) },
            },
          });
          if (result.states.companies.status !== "error") setCompanies(rowsOf(result.data.companies));
          if (result.states.lots.status !== "error") setLots(rowsOf(result.data.lots));
        }
        loadedRef.current[section] = !result?.hasCriticalError;
        const warning = moduleLoadMessage(result, "Seçili bölümün ana verisi alınamadı; son başarılı liste korunuyor.", "Bazı yardımcı listeler yenilenemedi; ana bölüm kullanılabilir.");
        if (warning) setNotice({ tone: result?.hasCriticalError ? "error" : "warning", text: warning });
      } catch (error) {
        setNotice({
          tone: "error",
          text: error?.message || "Seçili bölüm yüklenemedi.",
        });
      } finally {
        if (requestRef.current === requestId) setLoading("");
      }
    },
    [activeMainCompany, companyKey],
  );

  useEffect(() => {
    loadedRef.current = {};
    requestRef.current += 1;
    setCompanies([]);
    setProducts([]);
    setPendingLines([]);
    setProductAliases([]);
    setLots([]);
    setSelectedLineId("");
    setSelectedProductId("");
  }, [companyKey]);

  useEffect(() => {
    if (!companyKey) return;
    void loadSummary();
  }, [companyKey, loadSummary]);

  useEffect(() => {
    if (!companyKey) return;
    void loadSection(activeSection);
  }, [activeSection, companyKey, loadSection]);

  async function refreshCurrent() {
    loadedRef.current[activeSection] = false;
    await Promise.allSettled([loadSummary(), loadSection(activeSection, true)]);
  }

  async function runAction(key, action, successText) {
    setBusy(key);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "success", text: successText });
      const refreshes = await Promise.allSettled([loadSummary(), loadSection(activeSection, true)]);
      if (refreshes.some((result) => result.status === "rejected")) {
        setNotice({ tone: "warning", text: `${successText} Ekranın bir bölümü yenilenemedi.` });
      }
      return true;
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşlem tamamlanamadı." });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function openLineEditor(line) {
    setSelectedLineId(String(line.id));
    setSelectedProductId(String(line?.suggestedProductId || ""));
    await ensureProducts();
  }

  async function assignSelectedLine() {
    if (!selectedLine || !selectedProductId) {
      setNotice({ tone: "warning", text: "Önce doğru ürünü seçin." });
      return;
    }
    const supplier = findSupplierCompany(selectedLine, companies);
    if (!isChemicalSupplierCompany(supplier) && !isChemicalSupplierRow(selectedLine, companies)) {
      setNotice({
        tone: "warning",
        text: "Bu tedarikçi boya/kimya firması değildir. Ürün ve lot bağlantısı yapılmadı.",
      });
      return;
    }
    const saved = await runAction(
      `line-${selectedLine.id}`,
      () =>
        assignPendingProductLine(activeMainCompany, selectedLine.id, {
          productId: selectedProductId,
          supplierFirmId:
            supplier?.id ||
            selectedLine?.document?.companyId ||
            selectedLine?.supplierFirmId ||
            "",
          approvedBy: "MUHASEBE_USER",
          routingType: "BOYAHANE",
          requiresLot: true,
        }),
      "Boya/kimya kalemi ürüne bağlandı. Lot bilgisi Boyahane akışında izlenecek.",
    );
    if (saved) {
      setSelectedLineId("");
      setSelectedProductId("");
    }
  }

  async function saveAlias() {
    const supplier = chemicalCompanies.find(
      (row) => String(row.id || row.firmaId) === String(aliasForm.supplierFirmId),
    );
    if (!aliasForm.productId || !aliasForm.rawName.trim() || !supplier) {
      setNotice({
        tone: "warning",
        text: "Boya/kimya tedarikçisi, doğru ürün ve faturadaki açıklama zorunludur.",
      });
      return;
    }
    const saved = await runAction(
      "product-alias",
      () =>
        createProductAliasSmart(activeMainCompany, {
          ...aliasForm,
          routingType: "BOYAHANE",
          requiresLot: true,
        }),
      "Boya/kimya ürün aliası kaydedildi.",
    );
    if (saved) setAliasForm({ productId: "", rawName: "", supplierFirmId: "" });
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
          routingType: "BOYAHANE",
          expenseCategoryId: ruleForm.expenseCategoryId,
          expenseCategoryName: category?.ad || category?.name || "",
          productGroup: "BOYAHANE",
          requiresLot: true,
          updatedBy: "MUHASEBE_USER",
        }),
      "Ürün Boyahane stok ve lot kuralına bağlandı.",
    );
  }

  async function syncRouting() {
    await runAction(
      "routing-sync",
      () => synchronizeSupplierRouting(activeMainCompany),
      "Tedarikçi kayıtları yeniden kontrol edildi. Yalnız boya/kimya firmaları lot akışına yönlendirilecek.",
    );
  }

  return (
    <main className="msm-page">
      <header className="msm-header">
        <div>
          <span>BOYAHANE TEDARİK AKIŞI</span>
          <h1>Boya / Kimya Ürün ve Lot Eşleştirme</h1>
          <p>
            Bu ekran yalnız boya ve kimya tedarikçileri içindir. Diğer tedarikçi
            faturaları ürün aliası veya lot istemeden gider kategorisine gider.
          </p>
        </div>
        <div className="msm-header-actions">
          <button type="button" onClick={() => void refreshCurrent()} disabled={Boolean(loading)}>
            <RefreshCw size={17} /> Yenile
          </button>
          <button
            type="button"
            className="primary"
            onClick={syncRouting}
            disabled={busy === "routing-sync"}
          >
            {busy === "routing-sync" ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
            Kayıtları Kontrol Et
          </button>
        </div>
      </header>

      <div className="msm-notice warning">
        Yemek, ambalaj, elektrik, bakım, nakliye ve benzeri tedarikçiler burada görünmez;
        doğrudan gider kategorisi ve cari/KDV akışında işlenir.
      </div>

      {notice ? <div className={`msm-notice ${notice.tone}`}>{notice.text}</div> : null}

      <section className="msm-summary-grid">
        <SummaryCard
          label="Boya/kimya bekleyen"
          value={visiblePendingLines.length}
          note="İlk 50 açık kayıt içinde"
        />
        <SummaryCard
          label="Boya/kimya aliası"
          value={visibleAliases.length}
          note="Tedarikçi + ürün bağlantısı"
        />
        <SummaryCard
          label="Aktif lot"
          value={visibleLots.length || summary.activeLotCount}
          note={`${numberText(summary.remainingLotQuantity)} kalan miktar`}
        />
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

      {loading === activeSection ? (
        <div className="msm-loading">
          <LoaderCircle className="spin" /> Yalnız seçili bölüm yükleniyor...
        </div>
      ) : null}

      {!loading && activeSection === "pending" ? (
        <>
          {selectedLine ? (
            <section className="msm-panel form-panel">
              <div className="msm-panel-head">
                <div>
                  <h2>Seçili Boya/Kimya Kalemini Eşleştir</h2>
                  <p>
                    {selectedLine?.document?.documentNo || "Fatura"} · {selectedLine.productName || selectedLine.description || "Kalem"}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedLineId("")}>Kapat</button>
              </div>
              <label>
                Doğru ürün
                <select
                  value={selectedProductId}
                  onChange={(event) => setSelectedProductId(event.target.value)}
                  disabled={productLoading}
                >
                  <option value="">{productLoading ? "Ürünler yükleniyor..." : "Ürün seçin"}</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{productName(product)}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="primary"
                onClick={assignSelectedLine}
                disabled={!selectedProductId || busy === `line-${selectedLine.id}`}
              >
                <CheckCircle2 size={16} /> Eşleştir ve Lot Akışına Al
              </button>
            </section>
          ) : null}

          <section className="msm-panel">
            <div className="msm-panel-head">
              <div>
                <h2>Boya/Kimya Eşleşmesi Bekleyen Kalemler</h2>
                <p>
                  Satır başına ürün listesi oluşturulmaz. Ürünler yalnız seçilen tek
                  kalem için yüklenir; bu nedenle sayfa donmaz.
                </p>
              </div>
              <strong>{visiblePendingLines.length}</strong>
            </div>
            <div className="msm-table-wrap">
              <table>
                <thead>
                  <tr><th>Fatura</th><th>Tedarikçi</th><th>Gelen kalem</th><th>Adet</th><th>İşlem</th></tr>
                </thead>
                <tbody>
                  {visiblePendingLines.map((line) => {
                    const supplier = findSupplierCompany(line, companies);
                    return (
                      <tr key={line.id}>
                        <td>
                          <b>{line?.document?.documentNo || "-"}</b>
                          <small>{line?.document?.date ? String(line.document.date).slice(0, 10) : ""}</small>
                        </td>
                        <td>{companyName(supplier) || line?.document?.companyName || "-"}</td>
                        <td>
                          <b>{line.productName || line.description || "Adsız kalem"}</b>
                          <small>{line.lotNo ? `Lot: ${line.lotNo}` : "Lot bilgisi bekleniyor"}</small>
                        </td>
                        <td>{numberText(line.quantity)} {line.unit || ""}</td>
                        <td>
                          <button type="button" className="compact primary" onClick={() => void openLineEditor(line)}>
                            <CheckCircle2 size={15} /> Ürün Seç
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!visiblePendingLines.length ? (
                    <tr><td colSpan="5" className="empty">Boya/kimya ürünü eşleşmesi bekleyen kayıt yok.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {!loading && activeSection === "product" ? (
        <section className="msm-two-column">
          <article className="msm-panel form-panel">
            <h2>Boya/Kimya Ürün Aliası Ekle</h2>
            <label>
              Boya/kimya tedarikçisi
              <select value={aliasForm.supplierFirmId} onChange={(event) => setAliasForm((current) => ({ ...current, supplierFirmId: event.target.value }))}>
                <option value="">Tedarikçi seçin</option>
                {chemicalCompanies.map((company) => (
                  <option key={company.id || company.firmaId} value={company.id || company.firmaId}>{companyName(company)}</option>
                ))}
              </select>
            </label>
            <label>
              Doğru ürün
              <select value={aliasForm.productId} onChange={(event) => setAliasForm((current) => ({ ...current, productId: event.target.value }))}>
                <option value="">Ürün seçin</option>
                {products.map((product) => <option key={product.id} value={product.id}>{productName(product)}</option>)}
              </select>
            </label>
            <label>
              Faturada gelen açıklama
              <input value={aliasForm.rawName} onChange={(event) => setAliasForm((current) => ({ ...current, rawName: event.target.value }))} placeholder="Örn. Fikse patı / pigment / tutkal" />
            </label>
            <button type="button" className="primary" onClick={saveAlias} disabled={busy === "product-alias"}>
              <Save size={16} /> Kaydet
            </button>
          </article>
          <article className="msm-panel">
            <div className="msm-panel-head">
              <div><h2>Kayıtlı Boya/Kimya Aliasları</h2><p>Diğer tedarikçilere ait aliaslar bu ekranda gösterilmez.</p></div>
              <strong>{visibleAliases.length}</strong>
            </div>
            <div className="msm-list">
              {visibleAliases.map((row) => (
                <div key={row.id}>
                  <div><b>{row.rawName}</b><small>→ {row.product?.name || row.matchedProductName || row.productId}</small></div>
                  <button type="button" title="Pasife al" onClick={() => runAction(`product-delete-${row.id}`, () => passiveProductAliasSmart(activeMainCompany, row.id), "Ürün aliası pasife alındı.")}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {!visibleAliases.length ? <p className="empty">Kayıtlı boya/kimya ürün aliası yok.</p> : null}
            </div>
          </article>
        </section>
      ) : null}

      {!loading && activeSection === "rules" ? (
        <section className="msm-two-column">
          <article className="msm-panel form-panel">
            <h2>Boyahane Stok ve Lot Kuralı</h2>
            <label>
              Ürün
              <select value={ruleForm.productId} onChange={(event) => setRuleForm((current) => ({ ...current, productId: event.target.value }))}>
                <option value="">Ürün seçin</option>
                {products.map((product) => <option key={product.id} value={product.id}>{productName(product)}</option>)}
              </select>
            </label>
            <label>
              Gider kategorisi
              <select value={ruleForm.expenseCategoryId} onChange={(event) => setRuleForm((current) => ({ ...current, expenseCategoryId: event.target.value }))}>
                <option value="">Kategori seçilmedi</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.ad || category.name}</option>)}
              </select>
            </label>
            <button type="button" className="primary" onClick={saveRule} disabled={busy === "product-rule"}>
              <Save size={16} /> Boyahane Kuralını Kaydet
            </button>
          </article>
          <article className="msm-panel rule-explain">
            <h2>{selectedRuleProduct ? productName(selectedRuleProduct) : "Kural Özeti"}</h2>
            <div><b>Yalnız boya/kimya</b><p>Ürün Boyahane stoğuna girer ve gerçek lot numarası zorunlu olur.</p></div>
            <div><b>Diğer tedarikçiler</b><p>Lot oluşturmaz; doğrudan gider kategorisi, cari ve KDV akışına gider.</p></div>
          </article>
        </section>
      ) : null}

      {!loading && activeSection === "lots" ? (
        <section className="msm-panel">
          <div className="msm-panel-head">
            <div><h2>Boya/Kimya Lot ve Stok Kayıtları</h2><p>Yalnız doğrulanmış boya/kimya tedarikçi faturalarından oluşur.</p></div>
            <strong>{visibleLots.length}</strong>
          </div>
          <div className="msm-table-wrap">
            <table>
              <thead><tr><th>Lot</th><th>Ürün</th><th>Tedarikçi</th><th>Giriş</th><th>Kalan</th><th>Durum</th></tr></thead>
              <tbody>
                {visibleLots.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.lotNo}</b></td>
                    <td>{row.product?.name || row.productName || "Ürün kartı yok"}</td>
                    <td>{row.supplier?.name || row.supplierName || "-"}</td>
                    <td>{numberText(row.quantity)}</td>
                    <td>{numberText(row.remainingQuantity)}</td>
                    <td><span className={`status ${String(row.status || "").toLowerCase()}`}>{row.status || "ACTIVE"}</span></td>
                  </tr>
                ))}
                {!visibleLots.length ? <tr><td colSpan="6" className="empty">Boya/kimya lot kaydı yok.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
