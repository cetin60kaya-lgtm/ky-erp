import { useEffect, useMemo, useState } from "react";
import { useCallback } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../../utils/api";
import "./expenseCategoriesWorkspace.css";

const emptyForm = () => ({
  id: "",
  ad: "",
  kategoriTipi: "GIDER",
  anaKategoriId: "",
  sira: 0,
  aciklama: "",
  aktifMi: true,
});
const rowsOf = (payload) => {
  const value = payload?.data?.data || payload?.data || payload || [];
  return Array.isArray(value) ? value : value?.rows || [];
};

export default function ExpenseCategoriesWorkspace({ activeMainCompany }) {
  const company = useMemo(() => ({
    mainCompanySlug: activeMainCompany?.slug,
    mainCompanyId: activeMainCompany?.id,
  }), [activeMainCompany?.id, activeMainCompany?.slug]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("UNCATEGORIZED");
  const [categoryCompanies, setCategoryCompanies] = useState([]);
  const [uncategorized, setUncategorized] = useState([]);
  const [selectedUncategorized, setSelectedUncategorized] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPassive, setShowPassive] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const syncRules = async (dryRun) => {
    setSyncBusy(true);
    try {
      const response = await apiPost("/muhasebe/accounting/sync/company-rules", { ...company, dryRun, preserveExplicitOverrides: true });
      setSyncResult(response?.data?.data || response?.data || response);
      if (!dryRun) {
        setNotice("Firma kategori ve davranış kuralları senkronize edildi.");
        await load();
      }
    } catch (error) {
      setNotice(error?.message || "Firma kuralları senkronize edilemedi.");
    } finally {
      setSyncBusy(false);
    }
  };

  const loadCategories = useCallback(async () => {
    setCategories(
      rowsOf(
        await apiGet("/muhasebe/rapor-kategorileri", {
          ...company,
          active: showPassive ? undefined : "ACTIVE",
          _ts: Date.now(),
        }),
      ),
    );
  }, [company, showPassive]);
  const loadFirms = useCallback(async (categoryId = selectedCategory, firmSearch = "") => {
    setLoading(true);
    try {
      const [current, missing] = await Promise.all([
        apiGet("/muhasebe/rapor-kategori-firmalari", {
          ...company,
          categoryId: firmSearch ? undefined : categoryId,
          search: firmSearch || undefined,
          _ts: Date.now(),
        }),
        apiGet("/muhasebe/rapor-kategori-firmalari", {
          ...company,
          categoryId: "UNCATEGORIZED",
          _ts: Date.now(),
        }),
      ]);
      setCategoryCompanies(rowsOf(current));
      setUncategorized(rowsOf(missing));
      setSelectedUncategorized([]);
    } catch (error) {
      setNotice(error?.message || "Firmalar alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [company, selectedCategory]);
  const load = useCallback(async () => {
    try {
      await loadCategories();
      await loadFirms();
    } catch (error) {
      setNotice(error?.message || "Kategori ekranı yüklenemedi.");
    }
  }, [loadCategories, loadFirms]);
  useEffect(() => {
    load();
  }, [activeMainCompany?.slug, activeMainCompany?.id, load]);
  useEffect(() => {
    loadCategories();
  }, [loadCategories, showPassive]);
  useEffect(() => {
    loadFirms(selectedCategory);
  }, [loadFirms, selectedCategory]);

  const saveCategory = async (event) => {
    event?.preventDefault();
    try {
      const payload = { ...company, ...form };
      if (form.id)
        await apiPatch(
          `/muhasebe/rapor-kategorileri/${encodeURIComponent(form.id)}`,
          payload,
        );
      else await apiPost("/muhasebe/rapor-kategorileri", payload);
      setNotice(form.id ? "Kategori düzenlendi." : "Kategori eklendi.");
      setForm(emptyForm());
      setFormOpen(false);
      await loadCategories();
    } catch (error) {
      setNotice(error?.message || "Kategori kaydedilemedi.");
    }
  };
  const removeCategory = async (row) => {
    if (
      !window.confirm(
        `${row.ad} silinecek veya kullanılıyorsa pasife alınacak. Devam edilsin mi?`,
      )
    )
      return;
    try {
      const response = await apiDelete(
        `/muhasebe/rapor-kategorileri/${encodeURIComponent(row.id)}`,
        company,
      );
      if (selectedCategory === row.id) setSelectedCategory("UNCATEGORIZED");
      setNotice(
        response?.passiveOnly || response?.data?.passiveOnly
          ? "Kategori geçmişi korunarak listeden kaldırıldı."
          : "Kategori silindi.",
      );
      await loadCategories();
    } catch (error) {
      setNotice(error?.message || "Kategori silinemedi.");
    }
  };
  const assign = async (companyIds, categoryId) => {
    if (!companyIds.length) return setNotice("Önce firma seçin.");
    await apiPost("/muhasebe/rapor-kategori-firmalari/ata", {
      ...company,
      companyIds,
      categoryId: categoryId === "UNCATEGORIZED" ? null : categoryId,
    });
    setNotice(`${companyIds.length} firma kategorisi güncellendi.`);
    await loadCategories();
    await loadFirms(selectedCategory);
  };
  const toggleMissing = (id) =>
    setSelectedUncategorized((old) =>
      old.includes(id) ? old.filter((value) => value !== id) : [...old, id],
    );
  const active = categories.find((row) => row.id === selectedCategory);
  const searchActive = Boolean(appliedSearch);
  const runFirmSearch = () => {
    const value = search.trim();
    setAppliedSearch(value);
    loadFirms(selectedCategory, value);
  };

  return (
    <div className="ecw">
      <section className="ecw-head">
        <div>
          <h2>Kategorileri Düzenle</h2>
          <p>
            Kategori ekleyin, düzenleyin; firmaları kategoriye bağlayın veya
            çıkarın.
          </p>
        </div>
        <div className="ecw-actions">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && runFirmSearch()}
            placeholder="Tüm firmalarda ara"
          />
          <button onClick={runFirmSearch}>Firma Ara</button>
          <button onClick={() => setShowPassive((value) => !value)}>
            {showPassive ? "Yalnız Aktif Kategoriler" : "Tüm Kategoriler"}
          </button>
          <button
            className="primary"
            onClick={() => {
              setForm(emptyForm());
              setFormOpen(true);
            }}
          >
            Yeni Kategori Ekle
          </button>
          <button className="primary" onClick={() => { setSyncResult(null); setSyncOpen(true); }}>Genel Senkronize Et</button>
        </div>
      </section>
      {syncOpen ? <div className="ecw-sync-backdrop"><section className="ecw-sync-modal"><h3>Firma Kurallarını Senkronize Et</h3><p>Firma kategori ve davranışları tüm eski muhasebe kayıtlarına yeniden uygulanacaktır. Kullanıcının özel olarak değiştirdiği kayıtlar korunacaktır.</p>{syncResult ? <div className="ecw-sync-summary"><span>İşlenecek firma <b>{syncResult.companiesProcessed || 0}</b></span><span>Düzeltilecek kategori <b>{syncResult.categoriesResolved || 0}</b></span><span>PENDING'den çıkarılacak <b>{syncResult.pendingRecordsResolved || 0}</b></span><span>Korunan özel override <b>{syncResult.explicitOverridesPreserved || 0}</b></span><span>Çözülemeyen firma <b>{syncResult.unresolvedCompanies?.length || 0}</b></span></div> : null}<div className="ecw-actions"><button onClick={() => setSyncOpen(false)}>Vazgeç</button><button disabled={syncBusy} onClick={() => syncRules(true)}>Önizleme</button><button className="primary" disabled={syncBusy} onClick={() => syncRules(false)}>{syncBusy ? "İşleniyor…" : "Senkronize Et"}</button></div></section></div> : null}
      {notice ? (
        <div className="ecw-notice">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      ) : null}
      {formOpen ? (
        <section className="ecw-form">
          <Field label="Kategori adı">
            <input
              value={form.ad}
              onChange={(event) => setForm({ ...form, ad: event.target.value })}
            />
          </Field>
          <Field label="Tip">
            <select
              value={form.kategoriTipi}
              onChange={(event) =>
                setForm({ ...form, kategoriTipi: event.target.value })
              }
            >
              <option value="GIDER">Gider</option>
              <option value="GELIR">Gelir</option>
              <option value="PERSONEL">Personel</option>
              <option value="KDV">KDV</option>
              <option value="DIGER">Diğer</option>
            </select>
          </Field>
          <Field label="Ana kategori">
            <select
              value={form.anaKategoriId || ""}
              onChange={(event) =>
                setForm({ ...form, anaKategoriId: event.target.value })
              }
            >
              <option value="">Yok</option>
              {categories
                .filter((row) => row.id !== form.id)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.ad}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Sıra">
            <input
              type="number"
              value={form.sira || 0}
              onChange={(event) =>
                setForm({ ...form, sira: event.target.value })
              }
            />
          </Field>
          <Field label="Açıklama">
            <input
              value={form.aciklama || ""}
              onChange={(event) =>
                setForm({ ...form, aciklama: event.target.value })
              }
            />
          </Field>
          <label className="ecw-check">
            <input
              type="checkbox"
              checked={form.aktifMi !== false}
              onChange={(event) =>
                setForm({ ...form, aktifMi: event.target.checked })
              }
            />{" "}
            Aktif
          </label>
          <div className="ecw-actions">
            <button onClick={() => setFormOpen(false)}>Vazgeç</button>
            <button className="primary" onClick={saveCategory}>
              Kaydet
            </button>
          </div>
        </section>
      ) : null}
      <div className="ecw-layout">
        <section className="ecw-panel categories">
          <div className="ecw-panel-head">
            <h3>Kategori Listesi</h3>
            <span>{categories.length}</span>
          </div>
          <button
            className={
              selectedCategory === "UNCATEGORIZED" && !searchActive
                ? "category active"
                : "category"
            }
            onClick={() => {
              setSearch("");
              setAppliedSearch("");
              setSelectedCategory("UNCATEGORIZED");
              loadFirms("UNCATEGORIZED", "");
            }}
          >
            <span>Kategorisiz Firmalar</span>
            <b>{uncategorized.length}</b>
          </button>
          {categories.map((row) => (
            <div
              className={`category-line ${selectedCategory === row.id && !searchActive ? "active" : ""} ${row.aktifMi === false ? "passive" : ""}`}
              key={row.id}
            >
              <button
                className="category"
                onClick={() => {
                  setSearch("");
                  setAppliedSearch("");
                  setSelectedCategory(row.id);
                  loadFirms(row.id, "");
                }}
              >
                <span>{row.ad}</span>
                <b>{row.firmaSayisi || 0}</b>
              </button>
              <button
                className="icon-action"
                title="Kategoriyi düzenle"
                aria-label="Kategoriyi düzenle"
                onClick={() => {
                  setForm({ ...row });
                  setFormOpen(true);
                }}
              >
                ✎
              </button>
              <button
                className="icon-action danger"
                title="Kategoriyi sil"
                aria-label="Kategoriyi sil"
                onClick={() => removeCategory(row)}
              >
                ×
              </button>
            </div>
          ))}
        </section>
        <section className="ecw-panel">
          <div className="ecw-panel-head">
            <div>
              <h3>
                {searchActive
                  ? "Tüm Firma Arama Sonuçları"
                  : active?.ad || "Kategorisiz Firmalar"}
              </h3>
              <p>
                {searchActive
                  ? `“${appliedSearch}” araması`
                  : active
                    ? "Bu kategorideki firmalar"
                    : "Firmaları seçip hedef kategoriye ekleyin"}
              </p>
            </div>
            <span>
              {searchActive || active
                ? categoryCompanies.length
                : uncategorized.length}{" "}
              firma
            </span>
          </div>
          {!active && !searchActive ? (
            <div className="ecw-bulk">
              <label>
                <input
                  type="checkbox"
                  checked={
                    uncategorized.length > 0 &&
                    selectedUncategorized.length === uncategorized.length
                  }
                  onChange={(event) =>
                    setSelectedUncategorized(
                      event.target.checked
                        ? uncategorized.map((row) => row.id)
                        : [],
                    )
                  }
                />{" "}
                Tümünü seç
              </label>
              <select id="ecw-target-category" defaultValue="">
                <option value="">Hedef kategori seçin</option>
                {categories
                  .filter((row) => row.aktifMi)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.ad}
                    </option>
                  ))}
              </select>
              <button
                className="primary"
                disabled={!selectedUncategorized.length}
                onClick={() => {
                  const target = document.getElementById(
                    "ecw-target-category",
                  )?.value;
                  target
                    ? assign(selectedUncategorized, target)
                    : setNotice("Hedef kategori seçin.");
                }}
              >
                Seçilenleri Ekle
              </button>
            </div>
          ) : null}
          {loading ? (
            <div className="ecw-state">Yükleniyor…</div>
          ) : (
            <div className="ecw-firms">
              {(searchActive || active ? categoryCompanies : uncategorized).map(
                (row) =>
                  searchActive ? (
                    <div key={row.id}>
                      <div>
                        <strong>{row.firmaAdi}</strong>
                        <span>
                          {row.firmaTipi} · {row.resmiGayri}
                        </span>
                      </div>
                      <select
                        defaultValue=""
                        onChange={(event) =>
                          event.target.value &&
                          assign([row.id], event.target.value)
                        }
                      >
                        <option value="">Kategoriye ata…</option>
                        {categories.filter((item) => item.aktifMi).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.ad}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : active ? (
                    <div key={row.id}>
                      <div>
                        <strong>{row.firmaAdi}</strong>
                        <span>
                          {row.firmaTipi} · {row.resmiGayri}
                        </span>
                      </div>
                      <button onClick={() => assign([row.id], null)}>
                        Kategoriden Çıkar
                      </button>
                    </div>
                  ) : (
                    <label key={row.id}>
                      <input
                        type="checkbox"
                        checked={selectedUncategorized.includes(row.id)}
                        onChange={() => toggleMissing(row.id)}
                      />
                      <div>
                        <strong>{row.firmaAdi}</strong>
                        <span>
                          {row.firmaTipi} · {row.resmiGayri}
                        </span>
                      </div>
                    </label>
                  ),
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="ecw-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
