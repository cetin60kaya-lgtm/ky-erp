import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  filterCompaniesByQuery,
  findCompanyByName,
  findBestCompanyMatch,
  getSelectableCompanies,
  normalizeCompanyText,
} from "../../../lib/companyHelpers";
import {
  AccountingPageShell,
  KpiCard,
  SectionCard,
  StatusBadge,
  EmptyState,
  IconButton,
} from "../../../components/erp/AccountingUi";
import { ErpIcon } from "../../../components/erp/IconMap";
import {
  API_BASE,
  apiDelete as clientApiDelete,
  apiGet as clientApiGet,
  apiPatch as clientApiPatch,
  apiPost as clientApiPost,
  apiUpload as clientApiUpload,
} from "../../../utils/api";
import {
  tr,
  DEFAULT_BIZIM_DOCUMENT_PATHS,
  DOCUMENT_SECTION_CONFIG,
  PDF_DOCUMENT_CLASS_OPTIONS,
  CARI_KASA_TYPE_OPTIONS,
  uid,
  parseMoney,
  normalizeDateForInput,
  formatMoney,
  MetricBox,
  extractModelNameFromDocumentFileName,
  normalizeFlowType,
  flowTypeMeta,
  normalizeMainCompany,
  requireMainCompany,
  unwrapApiPayload,
  SectionHeader,
  MuhasebePageHeader,
  ActionBar,
  Input,
  Textarea,
  Select,
  MoneyInput,
  CompanyQuickPicker,
  PaymentTypeManager,
  getCariKasaTypeConfig,
  getCariKasaTypeFromRow,
  getCariKasaTypeLabel,
  createCariKasaForm,
  emptyDraft,
  normalizeLineItem,
  deriveDraftTotals,
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,

} from "./_muhasebeShared";

export function UrunlerTab({ activeMainCompany }) {
  const [rows, setRows] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeDetailTab, setActiveDetailTab] = useState("kart");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [variantForm, setVariantForm] = useState({
    id: "",
    rawName: "",
    sourceType: "MANUAL",
    note: "",
    isActive: true,
  });
  const [form, setForm] = useState({
    id: "",
    urunAdi: "",
    ticariAdi: "",
    kategori: "Genel",
    birim: "ADET",
    varsayilanAmbalaj: "",
    ambalajVaryantlariMetni: "",
    not: "",
    aktif: true,
  });
  async function load() {
    try {
      const apiProducts = await apiGet("/muhasebe/urunler", {
        ...(activeMainCompany || {}),
        limit: 1000,
      });
      setRows(
        Array.isArray(apiProducts)
           ? apiProducts
          : Array.isArray(apiProducts.data)
             ? apiProducts.data
            : [],
      );
      setMessage("");
    } catch (e) {
      setRows([]);
      setMessage(e.message || "Ürün verisi API üzerinden yüklenemedi.");
    }
  }

  async function loadAliases() {
    try {
      setAliases(await apiGet("/muhasebe/product-aliases", activeMainCompany));
    } catch (e) {
      setMessage(e.message || "Ürün alias listesi yüklenemedi.");
    }
  }

  useEffect(() => {
    load();
    loadAliases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  const selectedProduct =
    rows.find(
      (item) => String(item?.id) === String(selectedProductId || form.id),
    ) || null;

  const selectedAliases = aliases.filter(
    (item) =>
      item?.isDeleted !== true &&
      (String(item.matchedProductId || "") ===
        String(selectedProduct?.id || "") ||
        String(item.matchedProductId || "") ===
          String(selectedProduct?.legacyId || selectedProduct?.raw?.id || "")),
  );

  function parsePackageInfo(value) {
    const text = String(value || "").trim();
    const match = text.match(/(\d+(:[.,]\d+))\s*(KG|LT|ML|ADET|AD)\b/i);
    return {
      kg: match
         ? `${match[1].replace(".", ",")} ${match[2].toUpperCase()}`
        : "",
      ambalaj: match?.[0] || "",
    };
  }

  function productVariantSummary(product) {
    const variants = [
      product.varsayilanAmbalaj,
      ...(Array.isArray(product.ambalajVaryantlari)
         ? product.ambalajVaryantlari
        : []),
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return variants.length ? variants.join(", ") : "-";
  }

  const selectedVariantRows = useMemo(() => {
    if (!selectedProduct) return [];
    const packageRows = [
      selectedProduct.varsayilanAmbalaj,
      ...(Array.isArray(selectedProduct.ambalajVaryantlari)
         ? selectedProduct.ambalajVaryantlari
        : []),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value, index) => {
        const parsed = parsePackageInfo(value);
        return {
          id: `pkg_${index}_${value}`,
          rawName: value,
          parseName: selectedProduct.urunAdi || selectedProduct.ticariAdi || "",
          parseKg: parsed.kg,
          parseAmbalaj: parsed.ambalaj || value,
          matchedProductName:
            selectedProduct.urunAdi || selectedProduct.ticariAdi || "",
          matchType: index === 0 ? "Varsayılan Ambalaj" : "Ambalaj Varyantı",
          sourceType: "ÜRÜN KARTI",
          isActive: selectedProduct.aktif !== false,
          isPackageRow: true,
        };
      });

    const aliasRows = selectedAliases.map((alias) => {
      const rawName = alias.rawName || alias.alias || "";
      const parsed = parsePackageInfo(rawName);
      return {
        ...alias,
        rawName,
        parseName:
          rawName
            .replace(/\b\d+(:[.,]\d+)\s*(KG|LT|ML|ADET|AD)\b/gi, "")
            .trim() || rawName,
        parseKg: parsed.kg,
        parseAmbalaj: parsed.ambalaj,
        matchedProductName:
          alias.matchedProductName ||
          selectedProduct.urunAdi ||
          selectedProduct.ticariAdi ||
          "",
        matchType: alias.matchType || alias.eslesmeTipi || "Alias",
        sourceType: alias.sourceType || alias.source || alias.kaynak || "-",
        isActive: alias.isActive !== false,
        isPackageRow: false,
      };
    });

    return [...packageRows, ...aliasRows];
  }, [selectedAliases, selectedProduct]);

  async function save() {
    try {
      await apiPost("/muhasebe/urunler", form, activeMainCompany);
      setMessage(
        form.id ? "Ürün kartı güncellendi." : "Ürün kartı kaydedildi.",
      );
      setForm({
        id: "",
        urunAdi: "",
        ticariAdi: "",
        kategori: "Genel",
        birim: "ADET",
        varsayilanAmbalaj: "",
        ambalajVaryantlariMetni: "",
        not: "",
        aktif: true,
      });
      await load();
    } catch (e) {
      setMessage(
        e.message ||
          "Bu ürün mevcut görünüyor. Yeni kart açmak yerine eşleştirme kullanın.",
      );
    }
  }

  function editRow(row) {
    setForm({
      id: row?.id,
      urunAdi: row?.urunAdi || "",
      ticariAdi: row?.ticariAdi || "",
      kategori: row?.kategori || "Genel",
      birim: row?.birim || "ADET",
      varsayilanAmbalaj: row?.varsayilanAmbalaj || row?.ambalaj || "",
      ambalajVaryantlariMetni: Array.isArray(row?.ambalajVaryantlari)
         ? row?.ambalajVaryantlari.join(", ")
        : "",
      not: row?.not || "",
      aktif: row?.aktif !== false,
    });
    setSelectedProductId(String(row?.id));
    setActiveDetailTab("kart");
    setMessage("Ürün düzenleme formu açıldı.");
  }

  async function saveVariant() {
    if (!selectedProduct?.id) {
      setMessage("Önce varyant eklenecek ürünü seçin.");
      return;
    }
    if (!String(variantForm.rawName || "").trim()) {
      setMessage("Ham yazım alanı zorunludur.");
      return;
    }

    const payload = {
      rawName: variantForm.rawName,
      matchedProductId: selectedProduct?.id,
      sourceType: variantForm.sourceType || "MANUAL",
      note: variantForm.note,
      isActive: variantForm.isActive,
    };

    try {
      if (variantForm.id) {
        await apiPatch(
          `/muhasebe/product-aliases/${encodeURIComponent(variantForm.id)}`,
          payload,
          activeMainCompany,
        );
        setMessage("Varyant güncellendi.");
      } else {
        await apiPost("/muhasebe/product-aliases", payload, activeMainCompany);
        setMessage("Yeni varyant / alias eklendi.");
      }
      setVariantForm({
        id: "",
        rawName: "",
        sourceType: "MANUAL",
        note: "",
        isActive: true,
      });
      await loadAliases();
    } catch (e) {
      setMessage(e.message || "Varyant kaydedilemedi.");
    }
  }

  async function passiveVariant(alias) {
    if (!alias.id) return;
    const approved = window.confirm(
      "Bu varyant kaydı silinsin mi (Kayıt pasife alınacaktır.)",
    );
    if (!approved) return;
    try {
      await apiPatch(
        `/muhasebe/product-aliases/${encodeURIComponent(alias.id)}`,
        { ...alias, isActive: false },
        activeMainCompany,
      );
      setMessage("Varyant silindi (pasife alındı).");
      await loadAliases();
    } catch (e) {
      setMessage(e.message || "Varyant silinemedi.");
    }
  }

  const visibleRows = rows.filter(
    (item) =>
      `${item?.urunAdi} ${item?.ticariAdi || ""} ${item?.kategori || ""} ${
        item?.varsayilanAmbalaj || ""
      }`
        .toLocaleLowerCase("tr-TR")
        .includes(search.toLocaleLowerCase("tr-TR")) &&
      (!statusFilter ||
        (statusFilter === "AKTIF"
           ? item?.aktif !== false
          : item.aktif === false)),
  );

  return (
    <div className="content-grid muhasebe-page">
      <MuhasebePageHeader
        title={tr.urunler}
        subtitle="Ürün kartı, parse eşleşme varyantları ve evrak görünümünü aynı çalışma omurgasında yönetin."
      />
      <div className="content-card muhasebe-page-body">
        {message ? <div className="warning-box">{message}</div> : null}
        <div className="info-grid info-grid-4">
          <MetricBox
            icon="urunler"
            label="Toplam Ürün"
            value={rows.length}
            subText="Ürün ana kartı"
            tone="blue"
          />
          <MetricBox
            icon="goruntule"
            label="Gösterilen"
            value={visibleRows.length}
            subText="Filtre sonucu"
            tone="green"
          />
          <MetricBox
            icon="saat"
            label="Eşleşme Bekleyen"
            value={aliases.filter((item) => !item?.matchedProductId).length}
            subText="Alias kontrolü"
            tone="orange"
          />
          <MetricBox
            icon="users"
            label="Seçili Varyant"
            value={selectedAliases.length}
            subText="Seçili ürün aliası"
            tone="purple"
          />
        </div>
        <div className="split-layout mt-16 muhasebe-top-panels">
          <div className="panel-block muhasebe-product-list-panel">
            <h4>Ürün Listesi</h4>
            <div className="form-grid form-grid-compact mt-12">
              <Input
                label="Ürün Ara"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select
                label="Durum"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: "", label: "Tümü" },
                  { value: "AKTIF", label: "Aktif" },
                  { value: "PASIF", label: "Pasif" },
                ]}
              />
            </div>
            <div className="muhasebe-product-card-list">
              {visibleRows.map((item) => (
                <button
                  key={item?.id}
                  type="button"
                  className={`muhasebe-product-card ${
                    String(selectedProductId) === String(item?.id)
                       ? "is-selected"
                      : ""
                  }`}
                  onClick={() => editRow(item)}
                >
                  <div className="muhasebe-product-card-main">
                    <strong title={item?.urunAdi || ""}>
                      {item?.urunAdi || "-"}
                    </strong>
                    <span
                      className={
                        item.aktif === false
                           ? "warn-chip small-chip"
                          : "ok-chip small-chip"
                      }
                    >
                      {item.aktif === false ? "Pasif" : "Aktif"}
                    </span>
                  </div>
                  <div
                    className="muhasebe-product-card-sub"
                    title={item?.ticariAdi || ""}
                  >
                    {item?.ticariAdi || "-"}
                  </div>
                  <div className="muhasebe-product-card-meta">
                    <span>{item?.kategori || "-"}</span>
                    <span>{item?.birim || "-"}</span>
                    <span title={productVariantSummary(item)}>
                      {productVariantSummary(item)}
                    </span>
                  </div>
                </button>
              ))}
              {!visibleRows.length ? (
                <div className="notice-box">Ürün bulunamadı.</div>
              ) : null}
            </div>
          </div>

          <div className="panel-block">
            <h4>Seçili Ürün Detayı</h4>
            {selectedProduct ? (
              <>
                <div className="action-bar mt-12">
                  {[
                    { key: "kart", label: "Ürün Kartı" },
                    { key: "varyant", label: "Parse / Eşleşme / Varyantlar" },
                    { key: "evrak", label: "Ürün Evrakları" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={
                        activeDetailTab === tab.key ? "primary-btn" : "soft-btn"
                      }
                      onClick={() => setActiveDetailTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeDetailTab === "kart"  (
                  <div className="mt-16">
                    <div className="form-grid form-grid-compact">
                      <Input
                        label="Ürün Adı"
                        value={form.urunAdi}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, urunAdi: e.target.value }))
                        }
                      />
                      <Input
                        label="Ticari Adı"
                        value={form.ticariAdi}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, ticariAdi: e.target.value }))
                        }
                      />
                      <Input
                        label="Kategori"
                        value={form.kategori}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, kategori: e.target.value }))
                        }
                      />
                      <Input
                        label="Birim"
                        value={form.birim}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, birim: e.target.value }))
                        }
                      />
                      <Input
                        label="Varsayılan Ambalaj"
                        value={form.varsayilanAmbalaj}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            varsayilanAmbalaj: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Ambalaj Varyantları"
                        value={form.ambalajVaryantlariMetni}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            ambalajVaryantlariMetni: e.target.value,
                          }))
                        }
                        placeholder="10 KG, 30 KG, 40 KG"
                      />
                      <Textarea
                        label="Not"
                        value={form.not}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, not: e.target.value }))
                        }
                        rows={2}
                      />
                    </div>
                    <ActionBar>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={form.aktif}
                          onChange={(e) =>
                            setForm((p) => ({ ...p, aktif: e.target.checked }))
                          }
                        />{" "}
                        Aktif
                      </label>
                      <button className="primary-btn" onClick={save}>
                        {form.id ? "Ürünü Güncelle" : "Ürün Kaydet"}
                      </button>
                    </ActionBar>
                    <div className="split-layout mt-16">
                      <div className="panel-block">
                        <h4>Seçili Ürün Özeti</h4>
                        <ul className="simple-list">
                          <li>Ürün: {selectedProduct.urunAdi}</li>
                          <li>Ticari: {selectedProduct.ticariAdi || "-"}</li>
                          <li>
                            Varsayılan Ambalaj:{" "}
                            {selectedProduct.varsayilanAmbalaj || "-"}
                          </li>
                          <li>
                            Aktif Varyant:{" "}
                            {selectedProduct.ambalajVaryantlari.join(", ") ||
                              "-"}
                          </li>
                          <li>Alias: {selectedAliases.length}</li>
                          <li>
                            Evrak: {Number(selectedProduct.evrakSayisi || 0)}{" "}
                            kayıt
                          </li>
                          <li>
                            Sistem Durum Önerisi:{" "}
                            {selectedProduct.evrakDurumu ||
                              selectedProduct.urunDurumu ||
                              "Kontrol"}
                          </li>
                          <li>Not: {selectedProduct.not || "-"}</li>
                        </ul>
                      </div>
                      <div className="panel-block">
                        <h4>Ürün Kimliği</h4>
                        <div className="status-text">
                          Lot ve stok hareketleri bu ekranda tutulmaz. Lot
                          bilgisi belge kalemi seviyesinde kalır; ileride
                          Envanter / Stok modülü kullanır.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeDetailTab === "varyant"  (
                  <div className="mt-16">
                    <div className="belge-items-toolbar">
                      <div>
                        <h4>Parse / Eşleşme / Varyantlar</h4>
                        <div className="status-text">
                          Seçili ürünün ham yazım eşleşmeleri, KG/ambalaj parse
                          sonuçları ve varyant kayıtları burada yönetilir.
                        </div>
                      </div>
                      <ActionBar>
                        <button
                          className="soft-btn"
                          type="button"
                          onClick={() =>
                            setVariantForm({
                              id: "",
                              rawName: "",
                              sourceType: "MANUAL",
                              note: "",
                              isActive: true,
                            })
                          }
                        >
                          Yeni Eşleşme Ekle
                        </button>
                        <button
                          className="primary-btn"
                          type="button"
                          onClick={saveVariant}
                        >
                          {variantForm.id
                             ? "Düzenlemeyi Kaydet"
                            : "Yeni Varyant Ekle"}
                        </button>
                      </ActionBar>
                    </div>

                    <div className="form-grid form-grid-compact mt-16">
                      <Input
                        label="Ham Yazım"
                        value={variantForm.rawName}
                        onChange={(e) =>
                          setVariantForm((p) => ({
                            ...p,
                            rawName: e.target.value,
                          }))
                        }
                        placeholder="S 10 CLEAR 30 KG"
                      />
                      <Input
                        label="Kayıtlı Ürün"
                        value={
                          selectedProduct.urunAdi ||
                          selectedProduct.ticariAdi ||
                          ""
                        }
                        onChange={() => {}}
                        readOnly
                      />
                      <Select
                        label="Eşleşme Tipi / Kaynak"
                        value={variantForm.sourceType}
                        onChange={(e) =>
                          setVariantForm((p) => ({
                            ...p,
                            sourceType: e.target.value,
                          }))
                        }
                        options={[
                          { value: "MANUAL", label: "Elle eklenen alias" },
                          {
                            value: "PACKAGING_VARIANT",
                            label: "Ambalaj varyantı",
                          },
                          {
                            value: "SUPPLIER_LINE",
                            label: "Tedarikçi kalem adı",
                          },
                          {
                            value: "DOCUMENT_LEARNED",
                            label: "Belgeden öğrenilen",
                          },
                        ]}
                      />
                      <Input
                        label="Not"
                        value={variantForm.note}
                        onChange={(e) =>
                          setVariantForm((p) => ({
                            ...p,
                            note: e.target.value,
                          }))
                        }
                      />
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={variantForm.isActive}
                          onChange={(e) =>
                            setVariantForm((p) => ({
                              ...p,
                              isActive: e.target.checked,
                            }))
                          }
                        />{" "}
                        Aktif
                      </label>
                    </div>

                    <div className="table-wrap mt-16">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Ham Yazım</th>
                            <th>Parse Ürün Adı</th>
                            <th>Parse KG</th>
                            <th>Parse Ambalaj</th>
                            <th>Kayıtlı Ürün</th>
                            <th>Eşleşme Tipi</th>
                            <th>Kaynak</th>
                            <th>Durum</th>
                            <th>İşlem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedVariantRows.map((alias) => (
                            <tr key={alias.id}>
                              <td>{alias.rawName || "-"}</td>
                              <td>{alias.parseName || "-"}</td>
                              <td>{alias.parseKg || "-"}</td>
                              <td>{alias.parseAmbalaj || "-"}</td>
                              <td>{alias.matchedProductName || "-"}</td>
                              <td>{alias.matchType || "-"}</td>
                              <td>{alias.sourceType || "-"}</td>
                              <td>
                                {alias.isActive === false ? "Pasif" : "Aktif"}
                              </td>
                              <td>
                                {!alias.isPackageRow ? (
                                  <>
                                    <button
                                      className="soft-btn tiny-btn"
                                      type="button"
                                      onClick={() =>
                                        setVariantForm({
                                          id: alias.id,
                                          rawName: alias.rawName || "",
                                          sourceType:
                                            alias.sourceType || "MANUAL",
                                          note: alias.note || "",
                                          isActive: alias.isActive !== false,
                                        })
                                      }
                                    >
                                      Düzenle
                                    </button>
                                    <button
                                      className="soft-btn tiny-btn"
                                      type="button"
                                      disabled={alias.isActive === false}
                                      onClick={() => passiveVariant(alias)}
                                    >
                                      Sil
                                    </button>
                                  </>
                                ) : (
                                  <span className="status-text">
                                    Ürün kartından gelir
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {!selectedVariantRows.length ? (
                            <tr>
                              <td colSpan={9}>Varyant / alias kaydı yok.</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {activeDetailTab === "evrak"  (
                  <div className="mt-16">
                    <h4>Ürün Evrakları</h4>
                    <div className="status-text">
                      Evrak altyapısı ürün özel, ana firma ortak ve firma ortak
                      kapsamlarını destekler. Dosyalar hard delete yapılmadan
                      pasife alınacak şekilde saklanır.
                    </div>
                    <div className="info-grid info-grid-4 mt-16">
                      <div className="info-box">
                        <span>MSDS</span>
                        <strong>Kontrol</strong>
                      </div>
                      <div className="info-box">
                        <span>TDS</span>
                        <strong>Kontrol</strong>
                      </div>
                      <div className="info-box">
                        <span>ZDHC</span>
                        <strong>Kontrol</strong>
                      </div>
                      <div className="info-box">
                        <span>Kapsam</span>
                        <strong>Ürün / Ortak</strong>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="notice-box mt-12">
                Sağ detay sekmelerini kullanmak için soldan ürün seçin.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
