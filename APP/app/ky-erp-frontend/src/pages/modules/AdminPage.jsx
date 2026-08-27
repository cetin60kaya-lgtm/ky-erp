import { useCallback, useEffect, useMemo, useState } from "react";
import ErpModuleWorkspace from "../../components/erp/ErpModuleWorkspace";
import { apiFetch } from "../../utils/api";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";
import DosyaKlasorYonetimi from "../admin/DosyaKlasorYonetimi";
import AdminUsersPanel from "../admin/AdminUsersPanel";

function emptyForm() {
  return {
    id: "",
    name: "",
    slug: "",
    note: "",
    isActive: true,
  };
}

function slugify(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.items)) return value.items;
  return [];
}

function mapMainCompany(item) {
  return {
    id: String(item?.id ?? ""),
    name: String(item?.name ?? item?.ad ?? ""),
    slug: String(item?.slug ?? item?.kod ?? ""),
    note: String(item?.note ?? ""),
    isActive: item?.isActive !== false,
    lastUpdatedAt: String(item?.updatedAt ?? item?.lastUpdatedAt ?? ""),
  };
}

async function apiRequest(path, options = {}) {
  return apiFetch(`/${path}`, options);
}

function buildMainCompanyQuery(activeMainCompany) {
  const params = new URLSearchParams();
  if (activeMainCompany?.id) params.set("mainCompanyId", activeMainCompany?.id);
  if (activeMainCompany?.slug)
    params.set("mainCompanySlug", activeMainCompany?.slug);
  return params.toString();
}

export default function AdminPage({ activeTab, activeMainCompany }) {
  const activeMainCompanyId = activeMainCompany?.id || "";
  const activeMainCompanySlug = activeMainCompany?.slug || "";
  const [firmalar, setFirmalar] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");
  const [info, setInfo] = useState("Ana firmalar yükleniyor...");
  const [isBusy, setIsBusy] = useState(false);
  const [tabRows, setTabRows] = useState([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [aliasRows, setAliasRows] = useState([]);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [aliasSearch, setAliasSearch] = useState("");
  const [aliasFilter, setAliasFilter] = useState("all");
  const [aliasHitThreshold, setAliasHitThreshold] = useState(5);
  const [aliasShowDeleted, setAliasShowDeleted] = useState(false);
  const [productAliasRows, setProductAliasRows] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [productAliasSearch, setProductAliasSearch] = useState("");
  const [productAliasFilter, setProductAliasFilter] = useState("all");
  const [productAliasHitThreshold, setProductAliasHitThreshold] = useState(5);
  const [productAliasShowDeleted, setProductAliasShowDeleted] = useState(false);
  const [companyAliasLoading, setCompanyAliasLoading] = useState(false);
  const [productAliasLoading, setProductAliasLoading] = useState(false);
  const [companyAliasError, setCompanyAliasError] = useState("");
  const [productAliasError, setProductAliasError] = useState("");
  const [mainCompanyDeleteState, setMainCompanyDeleteState] = useState({
    open: false,
    step: 1,
    item: null,
    adminPassword: "",
    busy: false,
  });
  const [mainCompanyTransferState, setMainCompanyTransferState] = useState({
    open: false,
    item: null,
    targetId: "",
    adminPassword: "",
    busy: false,
  });
  const [aliasForm, setAliasForm] = useState({
    id: "",
    rawName: "",
    matchedCompanyId: "",
    sourceType: "MANUAL",
    isActive: true,
    note: "",
  });
  const [productAliasForm, setProductAliasForm] = useState({
    id: "",
    rawName: "",
    matchedProductId: "",
    sourceType: "MANUAL",
    isActive: true,
    note: "",
  });

  const filteredFirmalar = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return firmalar;
    return firmalar.filter((item) =>
      [
        item?.name,
        item?.slug,
        item?.isActive ? "aktif" : "pasif",
        item?.lastUpdatedAt,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [firmalar, search]);

  const activeCount = firmalar.filter((x) => x.isActive).length;
  const passiveCount = firmalar.filter((x) => !x.isActive).length;

  const filteredAliasRows = useMemo(() => {
    const q = aliasSearch.trim().toLocaleLowerCase("tr-TR");
    const threshold = Math.max(1, Number(aliasHitThreshold) || 1);
    let rows = Array.isArray(aliasRows) ? [...aliasRows] : [];

    if (aliasFilter === "active") {
      rows = rows.filter((row) => row?.isActive !== false);
    } else if (aliasFilter === "passive") {
      rows = rows.filter((row) => row.isActive === false);
    } else if (aliasFilter === "top-hits") {
      rows = rows
        .filter((row) => Number(row?.hitCount || 0) >= threshold)
        .sort((a, b) => Number(b.hitCount || 0) - Number(a.hitCount || 0));
    }

    if (!q) return rows;
    return rows.filter((row) =>
      [
        row?.rawName,
        row?.normalizedRawName,
        row?.matchedCompanyName,
        row?.sourceType,
        row.isActive === false ? "pasif" : "aktif",
        row.isDeleted === true ? "silinmis" : "",
        row?.note,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [aliasRows, aliasSearch, aliasFilter, aliasHitThreshold]);

  const filteredProductAliasRows = useMemo(() => {
    const q = productAliasSearch.trim().toLocaleLowerCase("tr-TR");
    const threshold = Math.max(1, Number(productAliasHitThreshold) || 1);
    let rows = Array.isArray(productAliasRows) ? [...productAliasRows] : [];

    if (productAliasFilter === "active") {
      rows = rows.filter((row) => row?.isActive !== false);
    } else if (productAliasFilter === "passive") {
      rows = rows.filter((row) => row.isActive === false);
    } else if (productAliasFilter === "top-hits") {
      rows = rows
        .filter((row) => Number(row?.hitCount || 0) >= threshold)
        .sort((a, b) => Number(b.hitCount || 0) - Number(a.hitCount || 0));
    }

    if (!q) return rows;
    return rows.filter((row) =>
      [
        row?.rawName,
        row?.normalizedRawName,
        row?.matchedProductName,
        row?.matchedProductCode,
        row?.sourceType,
        row.isActive === false ? "pasif" : "aktif",
        row.isDeleted === true ? "silinmis" : "",
        row?.note,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [
    productAliasRows,
    productAliasSearch,
    productAliasFilter,
    productAliasHitThreshold,
  ]);

  const loadCompanyAliases = useCallback(async () => {
    const query = buildMainCompanyQuery({
      id: activeMainCompanyId,
      slug: activeMainCompanySlug,
    });
    if (!query) {
      setAliasRows([]);
      setCompanyOptions([]);
      setCompanyAliasError("Aktif ana firma seçilmedi.");
      setCompanyAliasLoading(false);
      return;
    }
    try {
      setCompanyAliasLoading(true);
      setCompanyAliasError("");
      const result = await loadModuleData({
        scope: `admin:${activeMainCompanySlug || activeMainCompanyId}:firma-alias:${aliasShowDeleted}`,
        sources: {
          aliases: { critical: true, load: () => apiRequest(`admin/company-aliases${query}&includeDeleted=${aliasShowDeleted ? "true" : "false"}`) },
          companies: { fallback: [], load: () => apiRequest(`muhasebe/firma-kartlari${query}`) },
        },
      });
      if (result.states.aliases.status !== "error") setAliasRows(toRows(result.data.aliases));
      if (result.states.companies.status !== "error") setCompanyOptions(toRows(result.data.companies));
      setCompanyAliasError(moduleLoadMessage(result, "Firma eşleştirmeleri alınamadı; son başarılı liste korunuyor.", "Firma seçenekleri yenilenemedi; eşleştirme listesi kullanılabilir."));
    } catch (error) {
      setCompanyAliasError("Firma eşleştirmeleri alınamadı.");
      setInfo(`Hata: ${error?.message}`);
      setAliasRows([]);
    } finally {
      setCompanyAliasLoading(false);
    }
  }, [activeMainCompanyId, activeMainCompanySlug, aliasShowDeleted]);

  const loadProductAliases = useCallback(async () => {
    const query = buildMainCompanyQuery({
      id: activeMainCompanyId,
      slug: activeMainCompanySlug,
    });
    if (!query) {
      setProductAliasRows([]);
      setProductOptions([]);
      setProductAliasError("Aktif ana firma seçilmedi.");
      setProductAliasLoading(false);
      return;
    }
    try {
      setProductAliasLoading(true);
      setProductAliasError("");
      const result = await loadModuleData({
        scope: `admin:${activeMainCompanySlug || activeMainCompanyId}:urun-alias:${productAliasShowDeleted}`,
        sources: {
          aliases: { critical: true, load: () => apiRequest(`admin/product-aliases${query}&includeDeleted=${productAliasShowDeleted ? "true" : "false"}`) },
          products: { fallback: [], load: () => apiRequest(`muhasebe/urunler${query}`) },
        },
      });
      if (result.states.aliases.status !== "error") setProductAliasRows(toRows(result.data.aliases));
      if (result.states.products.status !== "error") setProductOptions(toRows(result.data.products));
      setProductAliasError(moduleLoadMessage(result, "Ürün eşleştirmeleri alınamadı; son başarılı liste korunuyor.", "Ürün seçenekleri yenilenemedi; eşleştirme listesi kullanılabilir."));
    } catch (error) {
      setProductAliasError("Ürün eşleştirmeleri alınamadı.");
      setInfo(`Hata: ${error?.message}`);
      setProductAliasRows([]);
    } finally {
      setProductAliasLoading(false);
    }
  }, [activeMainCompanyId, activeMainCompanySlug, productAliasShowDeleted]);

  const loadTabRows = useCallback(
    async (tabKey) => {
      const endpointMap = {
        "eposta-kayit": "admin/eposta-kisileri",
        "firma-esleme": "admin/firma-eslemeleri",
        "kdv-baglantisi": "admin/kdv-baglantilari",
        yedekleme: "admin/yedekleme-durumu",
        loglar: "admin/loglar",
      };
      const endpoint = endpointMap[tabKey];
      if (!endpoint) {
        setTabRows([]);
        return;
      }
      try {
        setTabLoading(true);
        const query = buildMainCompanyQuery({
          id: activeMainCompanyId,
          slug: activeMainCompanySlug,
        });
        const path =
          tabKey === "eposta-kayit" && query
             ? `${endpoint}${query}`
            : endpoint;
        const data = await apiRequest(path);
        setTabRows(toRows(data));
      } catch {
        setTabRows([]);
      } finally {
        setTabLoading(false);
      }
    },
    [activeMainCompanyId, activeMainCompanySlug],
  );

  useEffect(() => {
    loadMainCompanies();
  }, []);

  useEffect(() => {
    if (activeTab === "ana-firma-yonetimi") return;
    if (activeTab === "firma-esleme") {
      loadCompanyAliases();
      return;
    }
    if (activeTab === "urun-esleme") {
      loadProductAliases();
      return;
    }
    loadTabRows(activeTab);
  }, [activeTab, loadCompanyAliases, loadProductAliases, loadTabRows]);

  const erpViewMap = {
    "admin-yonetim-ozeti": "dashboard",
    "ana-firma-ayarlar": "quick",
    eslestirmeler: "workflow",
    "yedekleme-loglar": "report",
  };

  if (activeTab === "dosya-klasor-yonetimi") {
    return <DosyaKlasorYonetimi activeMainCompany={activeMainCompany} />;
  }

  if (activeTab === "kullanicilar") {
    return <AdminUsersPanel />;
  }

  if (erpViewMap[activeTab]) {
    return (
      <ErpModuleWorkspace
        moduleKey="admin"
        activeView={erpViewMap[activeTab]}
      />
    );
  }

  async function loadMainCompanies() {
    try {
      setIsBusy(true);
      const data = await apiRequest("admin/main-companies");
      const rows = toRows(data).map(mapMainCompany);
      setFirmalar(rows);
      setInfo("Ana firma listesi güncellendi.");
    } catch (error) {
      setInfo(`Hata: ${error?.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  function updateForm(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (
        field === "name" &&
        (!prev.slug || prev.slug === slugify(prev?.name))
      ) {
        next.slug = slugify(value);
      }
      return next;
    });
  }

  function resetForm() {
    setForm(emptyForm());
  }

  async function handleSave(e) {
    e.preventDefault();

    if (!form.name.trim()) {
      setInfo("Ana firma adı zorunlu.");
      return;
    }

    if (!form.slug.trim()) {
      setInfo("Slug zorunlu.");
      return;
    }

    try {
      setIsBusy(true);
      if (form.id) {
        await apiRequest(`admin/main-companies/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            id: form.id,
            name: form.name.trim(),
            slug: slugify(form.slug),
            note: String(form.note || "").trim(),
            isActive: Boolean(form.isActive),
          }),
        });
        setInfo("Ana firma güncellendi.");
      } else {
        await apiRequest("admin/main-companies", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            slug: slugify(form.slug),
            note: String(form.note || "").trim(),
            isActive: Boolean(form.isActive),
          }),
        });
        setInfo("Ana firma eklendi.");
      }
      resetForm();
      await loadMainCompanies();
    } catch (error) {
      setInfo(`Hata: ${error?.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  function handleEdit(item) {
    setForm({ ...item });
    setInfo(`Düzenleme açıldı: ${item?.name}`);
  }

  async function handleToggle(item) {
    try {
      setIsBusy(true);
      await apiRequest(`admin/main-companies/${item?.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          id: item?.id,
          name: item?.name,
          slug: item?.slug,
          note: item?.note || "",
          isActive: !item?.isActive,
        }),
      });
      setInfo("Aktif/pasif durumu güncellendi.");
      await loadMainCompanies();
    } catch (error) {
      setInfo(`Hata: ${error?.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  function openMainCompanyDelete(item) {
    setMainCompanyDeleteState({
      open: true,
      step: 1,
      item,
      adminPassword: "",
      busy: false,
    });
  }

  function closeMainCompanyDelete() {
    setMainCompanyDeleteState({
      open: false,
      step: 1,
      item: null,
      adminPassword: "",
      busy: false,
    });
  }

  async function confirmMainCompanyDelete() {
    const { item, adminPassword } = mainCompanyDeleteState;
    if (!item) return;
    if (!String(adminPassword || "").trim()) {
      setInfo("Admin şifresi zorunludur.");
      return;
    }
    setMainCompanyDeleteState((prev) => ({ ...prev, busy: true }));
    try {
      const result = await apiRequest(
        `admin/main-companies/${item?.id}/delete`,
        {
          method: "POST",
          body: JSON.stringify({ adminPassword }),
        },
      );
      setInfo(result?.message || `"${item?.name}" silindi.`);
      closeMainCompanyDelete();
      await loadMainCompanies();
    } catch (error) {
      setInfo(`Hata: ${error?.message}`);
      setMainCompanyDeleteState((prev) => ({ ...prev, busy: false }));
    }
  }

  function openMainCompanyTransfer(item) {
    setMainCompanyTransferState({
      open: true,
      item,
      targetId: "",
      adminPassword: "",
      busy: false,
    });
  }

  function closeMainCompanyTransfer() {
    setMainCompanyTransferState({
      open: false,
      item: null,
      targetId: "",
      adminPassword: "",
      busy: false,
    });
  }

  async function confirmMainCompanyTransfer() {
    const { item, targetId, adminPassword } = mainCompanyTransferState;
    if (!item) return;
    if (!targetId) {
      setInfo("Hedef firma seçiniz.");
      return;
    }
    if (!String(adminPassword || "").trim()) {
      setInfo("Admin şifresi zorunludur.");
      return;
    }
    setMainCompanyTransferState((prev) => ({ ...prev, busy: true }));
    try {
      const result = await apiRequest(
        `admin/main-companies/${item?.id}/transfer`,
        {
          method: "POST",
          body: JSON.stringify({ targetId, adminPassword }),
        },
      );
      setInfo(result?.message || "Veriler aktarıldı.");
      closeMainCompanyTransfer();
    } catch (error) {
      setInfo(`Hata: ${error?.message}`);
      setMainCompanyTransferState((prev) => ({ ...prev, busy: false }));
    }
  }

  function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("tr-TR");
  }

  async function saveAlias(e) {
    e.preventDefault();
    const query = buildMainCompanyQuery({
      id: activeMainCompanyId,
      slug: activeMainCompanySlug,
    });
    if (!query) {
      setInfo("Önce aktif ana firma seçin.");
      return;
    }
    if (!aliasForm.rawName.trim() || !aliasForm.matchedCompanyId) {
      setInfo("Ham ad ve eşleşen firma zorunludur.");
      return;
    }

    const payload = {
      ...aliasForm,
      mainCompanyId: activeMainCompanyId,
      mainCompanySlug: activeMainCompanySlug,
    };
    try {
      setIsBusy(true);
      if (aliasForm.id) {
        await apiRequest(`admin/company-aliases/${aliasForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setInfo("Firma alias kaydı güncellendi.");
      } else {
        await apiRequest("admin/company-aliases", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setInfo("Firma alias kaydı eklendi.");
      }
      setAliasForm({
        id: "",
        rawName: "",
        matchedCompanyId: "",
        sourceType: "MANUAL",
        isActive: true,
        note: "",
      });
      await loadCompanyAliases();
    } catch (error) {
      setInfo(`Hata: ${error?.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  function editAlias(row) {
    setAliasForm({
      id: String(row?.id || ""),
      rawName: String(row?.rawName || ""),
      matchedCompanyId: String(row?.matchedCompanyId || ""),
      sourceType: String(row?.sourceType || "MANUAL"),
      isActive: row?.isActive !== false,
      note: String(row?.note || ""),
    });
  }

  async function runCompanyAliasAction(id, action) {
    const payload = {
      mainCompanyId: activeMainCompanyId,
      mainCompanySlug: activeMainCompanySlug,
    };
    try {
      setIsBusy(true);
      await apiRequest(`admin/company-aliases/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadCompanyAliases();
      setInfo("Firma alias kaydı güncellendi.");
    } catch (error) {
      setInfo(`Hata: ${error?.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function saveProductAlias(e) {
    e.preventDefault();
    const query = buildMainCompanyQuery({
      id: activeMainCompanyId,
      slug: activeMainCompanySlug,
    });
    if (!query) {
      setInfo("Önce aktif ana firma seçin.");
      return;
    }
    if (
      !productAliasForm.rawName.trim() ||
      !productAliasForm.matchedProductId
    ) {
      setInfo("Ham ad ve eşleşen ürün zorunludur.");
      return;
    }
    const payload = {
      ...productAliasForm,
      mainCompanyId: activeMainCompanyId,
      mainCompanySlug: activeMainCompanySlug,
    };
    try {
      setIsBusy(true);
      if (productAliasForm.id) {
        await apiRequest(`admin/product-aliases/${productAliasForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("admin/product-aliases", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setProductAliasForm({
        id: "",
        rawName: "",
        matchedProductId: "",
        sourceType: "MANUAL",
        isActive: true,
        note: "",
      });
      await loadProductAliases();
      setInfo("Ürün alias kaydı güncellendi.");
    } catch (error) {
      setInfo(`Hata: ${error?.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  function editProductAlias(row) {
    setProductAliasForm({
      id: String(row?.id || ""),
      rawName: String(row?.rawName || ""),
      matchedProductId: String(row?.matchedProductId || ""),
      sourceType: String(row?.sourceType || "MANUAL"),
      isActive: row?.isActive !== false,
      note: String(row?.note || ""),
    });
  }

  async function runProductAliasAction(id, action) {
    const payload = {
      mainCompanyId: activeMainCompanyId,
      mainCompanySlug: activeMainCompanySlug,
    };
    try {
      setIsBusy(true);
      await apiRequest(`admin/product-aliases/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadProductAliases();
      setInfo("Ürün alias kaydı güncellendi.");
    } catch (error) {
      setInfo(`Hata: ${error?.message}`);
    } finally {
      setIsBusy(false);
    }
  }

  function renderGenericTable(title) {
    if (tabLoading) {
      return (
        <div className="content-grid">
          <section className="content-card">
            <div className="ky-card-head">
              <h3>{title}</h3>
            </div>
            <div className="ky-placeholder-box">Yükleniyor...</div>
          </section>
        </div>
      );
    }

    if (!tabRows.length) {
      return (
        <div className="content-grid">
          <section className="content-card">
            <div className="ky-card-head">
              <h3>{title}</h3>
            </div>
            <div className="ky-placeholder-box">Kayıt bulunamadı.</div>
          </section>
        </div>
      );
    }

    const headers = Array.from(
      new Set(
        tabRows.flatMap((row) =>
          row && typeof row === "object" ? Object.keys(row) : [],
        ),
      ),
    );

    return (
      <div className="content-grid">
        <section className="content-card">
          <div className="ky-card-head">
            <h3>{title}</h3>
          </div>
          <div className="ky-table-wrap">
            <table className="ky-table">
              <thead>
                <tr>
                  {headers.map((head) => (
                    <th key={head}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabRows.map((row, idx) => (
                  <tr key={idx}>
                    {headers.map((head) => (
                      <td key={`${idx}-${head}`}>
                        {String(row?.[head] ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (activeTab === "eposta-kayit") {
    return renderGenericTable("E-Posta Kayıtları");
  }

  if (activeTab === "firma-esleme") {
    return (
      <div className="content-grid">
        <section className="content-card">
          <div className="ky-card-head">
            <h3>Firma Eşleştirmeleri</h3>
          </div>

          <div className="ky-admin-info">
            Aktif Ana Firma: {activeMainCompany?.name || "Seçim yok"}
          </div>

          <div className="ky-admin-topbar mt-16">
            <input
              className="ky-admin-search"
              value={aliasSearch}
              onChange={(e) => setAliasSearch(e.target.value)}
              placeholder="Alias ara..."
            />
            <select
              className="ky-admin-search"
              value={aliasFilter}
              onChange={(e) => setAliasFilter(e.target.value)}
            >
              <option value="all">Tümü</option>
              <option value="active">Sadece Aktif</option>
              <option value="passive">Sadece Pasif</option>
              <option value="top-hits">Hit Eşiğine Göre</option>
            </select>
            {aliasFilter === "top-hits" ? (
              <input
                className="ky-admin-search"
                type="number"
                min={1}
                step={1}
                value={aliasHitThreshold}
                onChange={(e) =>
                  setAliasHitThreshold(Math.max(1, Number(e.target.value) || 1))
                }
                placeholder="Min hit"
                title="Minimum hit eşiği"
              />
            ) : null}
            <label className="ky-form-check">
              <input
                type="checkbox"
                checked={aliasShowDeleted}
                onChange={(e) => setAliasShowDeleted(e.target.checked)}
              />{" "}
              Silinmişleri Göster
            </label>
          </div>

          <form className="ky-form-grid mt-16" onSubmit={saveAlias}>
            <div className="ky-form-field ky-span-2">
              <label>Ham Firma Adı</label>
              <input
                value={aliasForm.rawName}
                onChange={(e) =>
                  setAliasForm((p) => ({ ...p, rawName: e.target.value }))
                }
              />
            </div>
            <div className="ky-form-field ky-span-2">
              <label>Eşleşen Firma</label>
              <select
                value={aliasForm.matchedCompanyId}
                onChange={(e) =>
                  setAliasForm((p) => ({
                    ...p,
                    matchedCompanyId: e.target.value,
                  }))
                }
              >
                <option value="">Firma seçin</option>
                {companyOptions.map((item) => (
                  <option key={item?.id} value={item?.id}>
                    {item?.firma}
                  </option>
                ))}
              </select>
            </div>
            <div className="ky-form-field">
              <label>Kaynak</label>
              <input
                value={aliasForm.sourceType}
                onChange={(e) =>
                  setAliasForm((p) => ({ ...p, sourceType: e.target.value }))
                }
              />
            </div>
            <div className="ky-form-field">
              <label>Not</label>
              <input
                value={aliasForm.note}
                onChange={(e) =>
                  setAliasForm((p) => ({ ...p, note: e.target.value }))
                }
              />
            </div>
            <div className="ky-form-check">
              <label>
                <input
                  type="checkbox"
                  checked={aliasForm.isActive}
                  onChange={(e) =>
                    setAliasForm((p) => ({ ...p, isActive: e.target.checked }))
                  }
                />{" "}
                Aktif
              </label>
            </div>
            <div className="ky-form-actions ky-span-2">
              <button
                type="submit"
                className="ky-primary-btn"
                disabled={isBusy}
              >
                {aliasForm.id ? "Eşleşmeyi Güncelle" : "Eşleşme Kaydet"}
              </button>
            </div>
          </form>

          <div className="ky-table-wrap mt-16">
            <table className="ky-table">
              <thead>
                <tr>
                  <th>Ana Firma</th>
                  <th>Ham Firma Adı</th>
                  <th>Normalize Ad</th>
                  <th>Eşleşen Temiz Firma</th>
                  <th>Kaynak</th>
                  <th>Hit Count</th>
                  <th>Son Görülme</th>
                  <th>Aktif/Pasif</th>
                  <th>Silinmiş mi</th>
                  <th>Not</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {companyAliasLoading ? (
                  <tr>
                    <td colSpan={11}>Yükleniyor...</td>
                  </tr>
                ) : companyAliasError ? (
                  <tr>
                    <td colSpan={11}>{companyAliasError}</td>
                  </tr>
                ) : filteredAliasRows.length ? (
                  filteredAliasRows.map((row) => (
                    <tr key={row?.id}>
                      <td>{activeMainCompany?.name || "-"}</td>
                      <td>{row?.rawName}</td>
                      <td>{row?.normalizedRawName}</td>
                      <td>
                        <strong>{row?.matchedCompanyName}</strong>
                      </td>
                      <td>
                        <span
                          className={
                            row.sourceType === "MERGE" ||
                            row.sourceType === "DUPLICATE_CARD_HINT"
                               ? "warn-chip small-chip"
                              : "neutral-chip small-chip"
                          }
                        >
                          {row?.sourceType || "-"}
                        </span>
                      </td>
                      <td>{row?.hitCount || 0}</td>
                      <td>{formatDate(row?.lastSeenAt)}</td>
                      <td>{row?.isActive !== false ? "Aktif" : "Pasif"}</td>
                      <td>{row.isDeleted === true ? "Evet" : "Hayır"}</td>
                      <td>{row?.note || ""}</td>
                      <td>
                        <button
                          className="ky-soft-btn"
                          type="button"
                          onClick={() => editAlias(row)}
                        >
                          Düzenle
                        </button>
                        {row.isDeleted === true ? (
                          <button
                            className="ky-soft-btn"
                            type="button"
                            onClick={() =>
                              runCompanyAliasAction(row?.id, "restore")
                            }
                          >
                            Geri Al
                          </button>
                        ) : (
                          <>
                            <button
                              className="ky-soft-btn"
                              type="button"
                              onClick={() =>
                                runCompanyAliasAction(
                                  row?.id,
                                  row?.isActive !== false
                                     ? "deactivate"
                                    : "activate",
                                )
                              }
                            >
                              {row?.isActive !== false
                                 ? "Pasife Al"
                                : "Aktif Et"}
                            </button>
                            <button
                              className="ky-soft-btn"
                              type="button"
                              onClick={() =>
                                runCompanyAliasAction(row?.id, "delete")
                              }
                            >
                              Sil
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11}>Filtreye uygun eşleştirme kaydı yok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (activeTab === "urun-esleme") {
    return (
      <div className="content-grid">
        <section className="content-card">
          <div className="ky-card-head">
            <h3>Ürün Eşleştirmeleri</h3>
          </div>

          <div className="ky-admin-info">
            Aktif Ana Firma: {activeMainCompany?.name || "Seçim yok"}
          </div>

          <div className="ky-admin-topbar mt-16">
            <input
              className="ky-admin-search"
              value={productAliasSearch}
              onChange={(e) => setProductAliasSearch(e.target.value)}
              placeholder="Ürün alias ara..."
            />
            <select
              className="ky-admin-search"
              value={productAliasFilter}
              onChange={(e) => setProductAliasFilter(e.target.value)}
            >
              <option value="all">Tümü</option>
              <option value="active">Sadece Aktif</option>
              <option value="passive">Sadece Pasif</option>
              <option value="top-hits">Hit Eşiğine Göre</option>
            </select>
            {productAliasFilter === "top-hits" ? (
              <input
                className="ky-admin-search"
                type="number"
                min={1}
                step={1}
                value={productAliasHitThreshold}
                onChange={(e) =>
                  setProductAliasHitThreshold(
                    Math.max(1, Number(e.target.value) || 1),
                  )
                }
              />
            ) : null}
            <label className="ky-form-check">
              <input
                type="checkbox"
                checked={productAliasShowDeleted}
                onChange={(e) => setProductAliasShowDeleted(e.target.checked)}
              />{" "}
              Silinmişleri Göster
            </label>
          </div>

          <form className="ky-form-grid mt-16" onSubmit={saveProductAlias}>
            <div className="ky-form-field ky-span-2">
              <label>Ham Ürün Adı</label>
              <input
                value={productAliasForm.rawName}
                onChange={(e) =>
                  setProductAliasForm((p) => ({
                    ...p,
                    rawName: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ky-form-field ky-span-2">
              <label>Eşleşen Ürün</label>
              <select
                value={productAliasForm.matchedProductId}
                onChange={(e) =>
                  setProductAliasForm((p) => ({
                    ...p,
                    matchedProductId: e.target.value,
                  }))
                }
              >
                <option value="">Ürün seçin</option>
                {productOptions.map((item) => (
                  <option key={item?.id} value={item?.id}>
                    {item?.urunAdi || item?.ticariAdi}
                  </option>
                ))}
              </select>
            </div>
            <div className="ky-form-field">
              <label>Kaynak</label>
              <input
                value={productAliasForm.sourceType}
                onChange={(e) =>
                  setProductAliasForm((p) => ({
                    ...p,
                    sourceType: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ky-form-field">
              <label>Not</label>
              <input
                value={productAliasForm.note}
                onChange={(e) =>
                  setProductAliasForm((p) => ({ ...p, note: e.target.value }))
                }
              />
            </div>
            <div className="ky-form-check">
              <label>
                <input
                  type="checkbox"
                  checked={productAliasForm.isActive}
                  onChange={(e) =>
                    setProductAliasForm((p) => ({
                      ...p,
                      isActive: e.target.checked,
                    }))
                  }
                />{" "}
                Aktif
              </label>
            </div>
            <div className="ky-form-actions ky-span-2">
              <button
                type="submit"
                className="ky-primary-btn"
                disabled={isBusy}
              >
                {productAliasForm.id ? "Eşleşmeyi Güncelle" : "Eşleşme Kaydet"}
              </button>
            </div>
          </form>

          <div className="ky-table-wrap mt-16">
            <table className="ky-table">
              <thead>
                <tr>
                  <th>Ana Firma</th>
                  <th>Ham Ürün Adı</th>
                  <th>Normalize Ad</th>
                  <th>Eşleşen Ürün</th>
                  <th>Ürün Kodu</th>
                  <th>Hit Count</th>
                  <th>Son Görülme</th>
                  <th>Aktif/Pasif</th>
                  <th>Silinmiş mi</th>
                  <th>Not</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {productAliasLoading ? (
                  <tr>
                    <td colSpan={11}>Yükleniyor...</td>
                  </tr>
                ) : productAliasError ? (
                  <tr>
                    <td colSpan={11}>{productAliasError}</td>
                  </tr>
                ) : filteredProductAliasRows.length ? (
                  filteredProductAliasRows.map((row) => (
                    <tr key={row?.id}>
                      <td>{activeMainCompany?.name || "-"}</td>
                      <td>{row?.rawName}</td>
                      <td>{row?.normalizedRawName}</td>
                      <td>{row?.matchedProductName}</td>
                      <td>{row?.matchedProductCode || ""}</td>
                      <td>{row?.hitCount || 0}</td>
                      <td>{formatDate(row?.lastSeenAt)}</td>
                      <td>{row?.isActive !== false ? "Aktif" : "Pasif"}</td>
                      <td>{row.isDeleted === true ? "Evet" : "Hayır"}</td>
                      <td>{row?.note || ""}</td>
                      <td>
                        <button
                          className="ky-soft-btn"
                          type="button"
                          onClick={() => editProductAlias(row)}
                        >
                          Düzenle
                        </button>
                        {row.isDeleted === true ? (
                          <button
                            className="ky-soft-btn"
                            type="button"
                            onClick={() =>
                              runProductAliasAction(row?.id, "restore")
                            }
                          >
                            Geri Al
                          </button>
                        ) : (
                          <>
                            <button
                              className="ky-soft-btn"
                              type="button"
                              onClick={() =>
                                runProductAliasAction(
                                  row?.id,
                                  row?.isActive !== false
                                     ? "deactivate"
                                    : "activate",
                                )
                              }
                            >
                              {row?.isActive !== false
                                 ? "Pasife Al"
                                : "Aktif Et"}
                            </button>
                            <button
                              className="ky-soft-btn"
                              type="button"
                              onClick={() =>
                                runProductAliasAction(row?.id, "delete")
                              }
                            >
                              Sil
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11}>
                      Filtreye uygun ürün eşleştirme kaydı yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (activeTab === "kdv-baglantisi") {
    return renderGenericTable("KDV Bağlantısı");
  }

  if (activeTab === "yedekleme") {
    return renderGenericTable("Yedekleme");
  }

  if (activeTab === "loglar") {
    return renderGenericTable("Loglar");
  }

  return (
    <div className="content-grid">
      <div className="ky-admin-topbar">
        <div>
          <h1>Ana Firma Yönetimi</h1>
          <p>Ana firmaları burada ekle, düzenle ve aktif/pasif yönet.</p>
        </div>
        <input
          className="ky-admin-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ana firma ara..."
        />
      </div>

      <div className="ky-admin-stats">
        <div className="ky-stat-box">
          <span>Toplam Ana Firma</span>
          <strong>{firmalar.length}</strong>
        </div>
        <div className="ky-stat-box">
          <span>Aktif</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="ky-stat-box">
          <span>Pasif</span>
          <strong>{passiveCount}</strong>
        </div>
      </div>

      <div className="ky-admin-info">
        {isBusy ? "İşleniyor... " : ""}
        {info}
      </div>

      {mainCompanyDeleteState.open ? (
        <div
          className="ky-admin-delete-panel"
          style={{
            border: "2px solid #c0392b",
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
            background: "#fff5f5",
          }}
        >
          {mainCompanyDeleteState.step === 1 ? (
            <>
              <h3 style={{ color: "#c0392b", marginTop: 0 }}>
                Ana Firma Sil — Adım 1 / 2
              </h3>
              <p>
                <strong>{mainCompanyDeleteState.item.name}</strong> ana
                firmasını silmek istediğinizden emin misiniz
              </p>
              <p style={{ fontSize: 13, color: "#555" }}>
                Bu işlem geri alınamaz. Tüm veriler önce yedeklenir, ardından
                kalıcı silinir.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  className="ky-soft-btn"
                  type="button"
                  onClick={closeMainCompanyDelete}
                >
                  Vazgeç
                </button>
                <button
                  className="ky-primary-btn"
                  type="button"
                  style={{ background: "#c0392b", borderColor: "#c0392b" }}
                  onClick={() =>
                    setMainCompanyDeleteState((prev) => ({ ...prev, step: 2 }))
                  }
                >
                  Evet, silmek istiyorum →
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ color: "#c0392b", marginTop: 0 }}>
                Ana Firma Sil — Adım 2 / 2
              </h3>
              <p>
                <strong>{mainCompanyDeleteState.item.name}</strong> silinecek.
                Bu işlemi onaylamak için admin şifresini girin.
              </p>
              <p style={{ fontSize: 13, color: "#c0392b", fontWeight: 600 }}>
                ⚠ Bu işlem kalıcıdır ve geri alınamaz!
              </p>
              <div className="ky-form-field" style={{ maxWidth: 280 }}>
                <label>Admin Şifresi</label>
                <input
                  type="password"
                  value={mainCompanyDeleteState.adminPassword}
                  onChange={(e) =>
                    setMainCompanyDeleteState((prev) => ({
                      ...prev,
                      adminPassword: e.target.value,
                    }))
                  }
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  className="ky-soft-btn"
                  type="button"
                  onClick={closeMainCompanyDelete}
                  disabled={mainCompanyDeleteState.busy}
                >
                  Vazgeç
                </button>
                <button
                  className="ky-soft-btn"
                  type="button"
                  onClick={() =>
                    setMainCompanyDeleteState((prev) => ({
                      ...prev,
                      step: 1,
                      adminPassword: "",
                    }))
                  }
                  disabled={mainCompanyDeleteState.busy}
                >
                  ← Geri
                </button>
                <button
                  className="ky-primary-btn"
                  type="button"
                  style={{ background: "#c0392b", borderColor: "#c0392b" }}
                  onClick={confirmMainCompanyDelete}
                  disabled={mainCompanyDeleteState.busy}
                >
                  {mainCompanyDeleteState.busy
                     ? "Siliniyor..."
                    : "Yedekle ve Kalıcı Sil"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {mainCompanyTransferState.open ? (
        <div
          className="ky-admin-delete-panel"
          style={{
            border: "2px solid #2980b9",
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
            background: "#f0f8ff",
          }}
        >
          <h3 style={{ color: "#2980b9", marginTop: 0 }}>Veri Aktarımı</h3>
          <p>
            <strong>{mainCompanyTransferState.item.name}</strong> firmasındaki
            tüm veriler (firma kartları, belgeler, çekler, ödemeler, hareketler,
            boyahane, üretim vb.) seçeceğiniz ana firmaya aktarılacaktır.
          </p>
          <p style={{ fontSize: 13, color: "#555" }}>
            Kaynak firmadaki veriler silinmez, sadece kopyalanır. ID çakışmaları
            otomatik çözülür.
          </p>
          <div className="ky-form-field" style={{ maxWidth: 320 }}>
            <label>Hedef Ana Firma</label>
            <select
              value={mainCompanyTransferState.targetId}
              onChange={(e) =>
                setMainCompanyTransferState((prev) => ({
                  ...prev,
                  targetId: e.target.value,
                }))
              }
            >
              <option value="">-- Seçiniz --</option>
              {firmalar
                .filter((f) => f.id !== mainCompanyTransferState.item.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="ky-form-field" style={{ maxWidth: 280 }}>
            <label>Admin Şifresi</label>
            <input
              type="password"
              value={mainCompanyTransferState.adminPassword}
              onChange={(e) =>
                setMainCompanyTransferState((prev) => ({
                  ...prev,
                  adminPassword: e.target.value,
                }))
              }
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              className="ky-soft-btn"
              type="button"
              onClick={closeMainCompanyTransfer}
              disabled={mainCompanyTransferState.busy}
            >
              Vazgeç
            </button>
            <button
              className="ky-primary-btn"
              type="button"
              onClick={confirmMainCompanyTransfer}
              disabled={mainCompanyTransferState.busy}
            >
              {mainCompanyTransferState.busy
                 ? "Aktarılıyor..."
                : "Verileri Aktar"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="ky-admin-grid">
        <section className="ky-card">
          <div className="ky-card-head">
            <h3>{form.id ? "Ana Firma Duzenle" : "Yeni Ana Firma"}</h3>
            <button type="button" className="ky-soft-btn" onClick={resetForm}>
              Temizle
            </button>
          </div>

          <form className="ky-form-grid" onSubmit={handleSave}>
            <div className="ky-form-field">
              <label>Ana Firma Adı</label>
              <input
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
              />
            </div>
            <div className="ky-form-field">
              <label>Slug</label>
              <input
                value={form.slug}
                onChange={(e) => updateForm("slug", e.target.value)}
              />
            </div>
            <div className="ky-form-field ky-span-2">
              <label>Not</label>
              <input
                value={form.note || ""}
                onChange={(e) => updateForm("note", e.target.value)}
              />
            </div>
            <div className="ky-form-check ky-span-2">
              <label>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => updateForm("isActive", e.target.checked)}
                />{" "}
                Aktif
              </label>
            </div>
            <div className="ky-form-actions ky-span-2">
              <button
                type="submit"
                className="ky-primary-btn"
                disabled={isBusy}
              >
                {form.id ? "Güncelle" : "Kaydet"}
              </button>
            </div>
          </form>
        </section>

        <section className="ky-card">
          <div className="ky-card-head">
            <h3>Ana Firma Listesi</h3>
          </div>
          <div className="ky-table-wrap">
            <table className="ky-table">
              <thead>
                <tr>
                  <th>Ana Firma</th>
                  <th>Slug</th>
                  <th>Son Güncelleme</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredFirmalar.map((item) => (
                  <tr key={item?.id}>
                    <td>{item?.name}</td>
                    <td>{item?.slug}</td>
                    <td>{formatDate(item?.lastUpdatedAt)}</td>
                    <td>
                      <span
                        className={
                          item?.isActive
                             ? "ky-pill ky-pill-green"
                            : "ky-pill ky-pill-gray"
                        }
                      >
                        {item?.isActive ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td>
                      <div className="ky-row-actions">
                        <button
                          className="ky-soft-btn"
                          onClick={() => handleEdit(item)}
                        >
                          Düzenle
                        </button>
                        <button
                          className="ky-soft-btn"
                          onClick={() => handleToggle(item)}
                        >
                          {item?.isActive ? "Pasif Yap" : "Aktif Yap"}
                        </button>
                        <button
                          className="ky-soft-btn"
                          style={{ color: "#c0392b" }}
                          type="button"
                          onClick={() => openMainCompanyDelete(item)}
                        >
                          Sil
                        </button>
                        <button
                          className="ky-soft-btn"
                          type="button"
                          onClick={() => openMainCompanyTransfer(item)}
                        >
                          Veri Aktar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredFirmalar.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Kayıt bulunamadı.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
