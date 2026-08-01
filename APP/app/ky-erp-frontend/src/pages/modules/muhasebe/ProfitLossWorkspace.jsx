import { useEffect, useMemo, useState } from "react";
import { useCallback } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../../utils/api";
import "./profitLossWorkspace.css";

const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};
const iso = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const range = (offset = 0) => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { startDate: iso(first), endDate: iso(last) };
};
const parseAmount = (value) => {
  const text = String(value ?? "").trim().replace(/[₺\s]/g, "");
  if (!text) return 0;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
};

const emptyEntry = (type = "GIDER") => ({
  transactionType: type,
  date: new Date().toISOString().slice(0, 10),
  companyId: "",
  noCompany: "",
  categoryId: "",
  officialType: "GAYRI_RESMI",
  baseAmount: "",
  vatRate: "0",
  vat: "0",
  description: "",
  documentNo: "",
  addToCurrentAccount: false,
  reportIncluded: true,
});

const emptyTemplate = () => ({
  id: "",
  name: "",
  categoryId: "",
  companyId: "",
  amount: "",
  officialType: "GAYRI_RESMI",
  vatRate: "0",
  startMonth: new Date().toISOString().slice(0, 7),
  endMonth: "",
  autoMonthly: true,
  addToCurrentAccount: false,
  active: true,
  description: "",
});

export default function ProfitLossWorkspace({ activeMainCompany, goTab }) {
  const initial = useMemo(() => range(0), []);
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState({});
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState("");
  const [entry, setEntry] = useState(emptyEntry());
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState(emptyTemplate());
  const [fixedModalOpen, setFixedModalOpen] = useState(false);
  const [fixedError, setFixedError] = useState("");
  const [fixedSaving, setFixedSaving] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [openFirm, setOpenFirm] = useState("");
  const [notice, setNotice] = useState("");

  const params = useMemo(() => ({
    mainCompanySlug: activeMainCompany?.slug,
    mainCompanyId: activeMainCompany?.id,
  }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const load = useCallback(async (overrides = {}) => {
    const next = { ...filters, ...overrides };
    if (Object.keys(overrides).length) setFilters(next);
    setLoading(true);
    try {
      const month = next.startDate.slice(0, 7);
      const sameMonth = next.endDate.slice(0, 7) === month;
      if (sameMonth && activeMainCompany?.slug) {
        try {
          await apiPost("/muhasebe/accounting/fixed-expenses-generate-month", {
            ...params,
            month,
          });
        } catch (error) {
          setNotice(error?.message || "Sabit giderler üretilemedi; kayıtlı rapor verileri gösteriliyor.");
        }
      }
      const [report, firms, fixed] = await Promise.all([
        apiGet("/muhasebe/accounting/reports/records", {
          ...params,
          ...next,
          _ts: Date.now(),
        }),
        apiGet("/muhasebe/firmalar", { limit: 1000, _ts: Date.now() }),
        apiGet("/muhasebe/accounting/fixed-expenses", {
          ...params,
          month,
          all: "true",
          _ts: Date.now(),
        }),
      ]);
      setData(unwrap(report));
      const firmData = unwrap(firms);
      setCompanies(Array.isArray(firmData) ? firmData : firmData.rows || []);
      setTemplates(Array.isArray(unwrap(fixed)) ? unwrap(fixed) : []);
    } catch (error) {
      setNotice(error?.message || "Gelir / gider verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany?.slug, filters, params]);

  useEffect(() => {
    load();
  }, [activeMainCompany?.slug, activeMainCompany?.id, load]);

  const quick = (key) => {
    if (key === "current") load(range(0));
    else if (key === "previous") load(range(-1));
    else setPanel("dates");
  };

  const summary = data.summary || {};
  const categories = (data.categories || []).filter((row) => row.aktifMi !== false);
  const groups = data.companySummary || [];
  const incomeGroups = groups.filter((group) =>
    group.records?.some(
      (row) => row.transactionType === "GELIR" && row.reportIncluded === true,
    ),
  );
  const expenseGroups = groups.filter((group) =>
    group.records?.some((row) => row.transactionType === "GIDER"),
  );
  const categoryGroups = useMemo(() => {
    const map = new Map();
    (data.generalExpenses || []).forEach((row) => {
      const key = row.categoryId || row.category || "Kategorisiz";
      const current = map.get(key) || {
        id: key,
        name: row.category || "Kategorisiz",
        total: 0,
        rows: [],
      };
      current.total += Number(row.reportAmount || 0);
      current.rows.push(row);
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [data.generalExpenses]);

  const updateEntry = (key, value) =>
    setEntry((old) => {
      const next = { ...old, [key]: value };
      if (["baseAmount", "vatRate", "officialType"].includes(key)) {
        const rate = next.officialType === "RESMI" ? Number(next.vatRate || 0) : 0;
        next.vat = ((parseAmount(next.baseAmount) * rate) / 100).toFixed(2);
      }
      return next;
    });

  const saveEntry = async (keepOpen = false) => {
    try {
      await apiPost("/muhasebe/accounting/reports/manual-expense", {
        ...params,
        ad:
          entry.noCompany ||
          entry.description ||
          (entry.transactionType === "GELIR" ? "Manuel Gelir" : "Manuel Gider"),
        islemTuru: entry.transactionType,
        tarih: entry.date,
        firmaId: entry.companyId || undefined,
        kategoriId: entry.categoryId || undefined,
        resmiTip: entry.officialType,
        belgeNo: entry.documentNo,
        tutar: parseAmount(entry.baseAmount),
        kdvOrani: Number(entry.vatRate || 0),
        kdv: parseAmount(entry.vat),
        aciklama: entry.description,
        raporaDahil: entry.reportIncluded,
        reportOnly: !entry.addToCurrentAccount,
        postToLedger: entry.addToCurrentAccount,
        cariyeEkle: entry.addToCurrentAccount,
      });
      setNotice(`${entry.transactionType === "GELIR" ? "Gelir" : "Gider"} kaydedildi.`);
      setEntry(emptyEntry(entry.transactionType));
      if (!keepOpen) setPanel("");
      await load();
    } catch (error) {
      setNotice(error?.message || "Kayıt yapılamadı.");
    }
  };

  const openNewTemplate = () => {
    setTemplate({
      ...emptyTemplate(),
      startMonth: filters.startDate.slice(0, 7),
    });
    setFixedError("");
    setFixedModalOpen(true);
  };

  const editTemplate = (row) => {
    setTemplate({
      id: row.id,
      name: row.ad,
      categoryId: row.kategoriId || "",
      companyId: row.firmaId || "",
      amount: String(row.tutar ?? ""),
      officialType: row.resmiTip,
      vatRate: String(row.kdvOrani ?? 0),
      startMonth: row.baslangicAyi,
      endMonth: row.bitisAyi || "",
      autoMonthly: row.herAyOtomatik,
      addToCurrentAccount: row.cariyeEkle,
      active: row.aktifMi,
      description: row.aciklama || "",
    });
    setFixedError("");
    setFixedModalOpen(true);
  };

  const saveTemplate = async () => {
    const amount = parseAmount(template.amount);
    if (!template.name.trim()) return setFixedError("Gider adını yazın.");
    if (!template.categoryId) return setFixedError("Gider kategorisini seçin.");
    if (amount <= 0) return setFixedError("Tutar sıfırdan büyük olmalıdır.");
    if (!template.startMonth) return setFixedError("Başlangıç ayını seçin.");
    if (template.endMonth && template.endMonth < template.startMonth)
      return setFixedError("Bitiş ayı başlangıç ayından önce olamaz.");

    const body = {
      ...params,
      ad: template.name.trim(),
      kategoriId: template.categoryId,
      firmaId: template.companyId || undefined,
      tutar: amount,
      resmiTip: template.officialType,
      kdvOrani: template.officialType === "RESMI" ? Number(template.vatRate || 0) : 0,
      baslangicAyi: template.startMonth,
      bitisAyi: template.endMonth || undefined,
      herAyOtomatik: template.autoMonthly,
      cariyeEkle: template.addToCurrentAccount,
      aktifMi: template.active,
      aciklama: template.description,
    };

    setFixedSaving(true);
    setFixedError("");
    try {
      if (template.id)
        await apiPut(`/muhasebe/accounting/fixed-expenses/${template.id}`, body);
      else await apiPost("/muhasebe/accounting/fixed-expenses", body);
      setNotice(
        `${template.name.trim()} sabit gideri kaydedildi. Geçerli aylarda rapora otomatik getirilecek.`,
      );
      setFixedModalOpen(false);
      setTemplate(emptyTemplate());
      await load();
    } catch (error) {
      setFixedError(error?.message || "Sabit gider kaydedilemedi.");
    } finally {
      setFixedSaving(false);
    }
  };

  const generate = async (row) => {
    const month = filters.startDate.slice(0, 7);
    try {
      const response = await apiPost(
        `/muhasebe/accounting/fixed-expenses/${row.id}/generate`,
        { ...params, month },
      );
      setNotice(
        response?.alreadyGenerated
          ? "Bu gider seçilen ay için daha önce oluşturulmuş."
          : "Aylık gider oluşturuldu ve rapora eklendi.",
      );
      await load();
    } catch (error) {
      setNotice(error?.message || "Aylık gider oluşturulamadı.");
    }
  };

  const generateMonth = async () => {
    try {
      const result = unwrap(
        await apiPost("/muhasebe/accounting/fixed-expenses-generate-month", {
          ...params,
          month: filters.startDate.slice(0, 7),
        }),
      );
      setNotice(
        `${result.created || 0} aylık gider oluşturuldu, ${result.existing || 0} kayıt zaten vardı.`,
      );
      await load();
    } catch (error) {
      setNotice(error?.message || "Ay giderleri oluşturulamadı.");
    }
  };

  const passive = async (row) => {
    await apiDelete(`/muhasebe/accounting/fixed-expenses/${row.id}`, params);
    setNotice("Şablon pasife alındı; geçmiş giderler korundu.");
    await load();
  };

  const copyNext = async (row) => {
    const current = new Date(`${filters.startDate.slice(0, 7)}-01T00:00:00`);
    current.setMonth(current.getMonth() + 1);
    await apiPost(`/muhasebe/accounting/fixed-expenses/${row.id}/copy`, {
      ...params,
      targetMonth: iso(current).slice(0, 7),
    });
    setNotice("Şablon gelecek aya kopyalandı.");
    await load();
  };

  return (
    <div className="plw">
      <section className="plw-head">
        <div>
          <h2>Gelir / Gider</h2>
          <p>Firma ve kategori bazlı dönem görünümü</p>
        </div>
        <div className="plw-actions">
          <button onClick={() => quick("current")}>Bu Ay</button>
          <button onClick={() => quick("previous")}>Geçen Ay</button>
          <button onClick={() => quick("dates")}>Tarih Aralığı</button>
          <button onClick={() => goTab?.("muhasebe-raporlari")}>Detay Rapor</button>
        </div>
      </section>

      {panel === "dates" ? (
        <section className="plw-panel plw-dates">
          <Field label="Başlangıç">
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => setFilters({ ...filters, startDate: event.target.value })}
            />
          </Field>
          <Field label="Bitiş">
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) => setFilters({ ...filters, endDate: event.target.value })}
            />
          </Field>
          <button className="primary" onClick={() => load()}>
            Dönemi Getir
          </button>
        </section>
      ) : null}

      {notice ? (
        <div className="plw-notice">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      ) : null}

      <section className="plw-metrics">
        {[
          ["Toplam Gelir", summary.totalIncome, "green"],
          ["Toplam Gider", summary.totalExpense, "red"],
          ["Gelen KDV", summary.incomingVat, "blue"],
          ["Giden KDV", summary.outgoingVat, "orange"],
          ["Net Sonuç", summary.netResult, summary.netResult >= 0 ? "green" : "red"],
        ].map(([label, value, tone]) => (
          <div className={tone} key={label}>
            <span>{label}</span>
            <strong>{money(value)}</strong>
          </div>
        ))}
      </section>

      <div className="plw-tools">
        <button
          onClick={() => {
            setEntry(emptyEntry("GIDER"));
            setPanel(panel === "expense" ? "" : "expense");
          }}
        >
          Gider Ekle
        </button>
        <button
          onClick={() => {
            setEntry(emptyEntry("GELIR"));
            setPanel(panel === "income" ? "" : "income");
          }}
        >
          Gelir Ekle
        </button>
        <button className="primary" onClick={openNewTemplate}>
          + Sabit Gider Ekle
        </button>
        <button onClick={() => setPanel(panel === "fixed" ? "" : "fixed")}>
          Sabit Gider Listesi ({templates.length})
        </button>
      </div>

      {panel === "expense" || panel === "income" ? (
        <EntryPanel
          entry={entry}
          update={updateEntry}
          companies={companies}
          categories={categories}
          save={saveEntry}
          close={() => setPanel("")}
        />
      ) : null}

      {panel === "fixed" ? (
        <FixedList
          rows={templates}
          companies={companies}
          categories={categories}
          edit={editTemplate}
          generate={generate}
          passive={passive}
          copyNext={copyNext}
          month={filters.startDate.slice(0, 7)}
          generateMonth={generateMonth}
          add={openNewTemplate}
        />
      ) : null}

      {loading ? (
        <div className="plw-state">Dönem hesaplanıyor…</div>
      ) : (
        <>
          <div className="plw-two">
            <FirmGroups
              title="Gelir / Müşteriler"
              rows={incomeGroups}
              kind="GELIR"
              open={openFirm}
              setOpen={setOpenFirm}
            />
            <FirmGroups
              title="Gider / Tedarikçiler"
              rows={expenseGroups}
              kind="GIDER"
              open={openFirm}
              setOpen={setOpenFirm}
            />
          </div>
          <section className="plw-panel">
            <button
              className="plw-collapse"
              onClick={() => setCategoryOpen((value) => !value)}
            >
              <span>Gider Dağılımı</span>
              <b>{categoryGroups.length} kategori</b>
            </button>
            <div className="plw-category-summary">
              {categoryGroups.map((row) => (
                <button key={row.id} onClick={() => setCategoryOpen(true)}>
                  <span>{row.name}</span>
                  <strong>{money(row.total)}</strong>
                  <em>
                    Toplam gelirin %
                    {summary.totalIncome
                      ? ((row.total / summary.totalIncome) * 100).toFixed(1)
                      : "0.0"}
                  </em>
                </button>
              ))}
            </div>
            {categoryOpen ? (
              <div className="plw-detail-list">
                {categoryGroups.flatMap((group) => group.rows).map((row) => (
                  <div key={`${row.sourceType}-${row.sourceId}`}>
                    <span>{row.companyName}</span>
                    <b>{row.category}</b>
                    <strong>{money(row.reportAmount)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="plw-panel-actions">
              <button onClick={() => goTab?.("gider-kategorileri")}>
                Kategorileri Yönet
              </button>
            </div>
          </section>
        </>
      )}

      {fixedModalOpen ? (
        <FixedExpenseModal
          draft={template}
          setDraft={setTemplate}
          companies={companies}
          categories={categories}
          error={fixedError}
          saving={fixedSaving}
          save={saveTemplate}
          close={() => {
            if (!fixedSaving) setFixedModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="plw-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function FirmGroups({ title, rows, kind, open, setOpen }) {
  return (
    <section className="plw-panel">
      <div className="plw-panel-head">
        <h3>{title}</h3>
        <span>{rows.length} firma</span>
      </div>
      <div className="plw-firms">
        {rows.map((group) => {
          const allRows = group.records.filter((row) => row.transactionType === kind);
          const relevant = allRows.filter(
            (row) =>
              row.reportIncluded === true &&
              (kind === "GELIR" || row.expenseStatus === "GENEL_GIDER"),
          );
          const base = relevant.reduce((sum, row) => sum + Number(row.baseAmount || 0), 0);
          const vat = relevant.reduce(
            (sum, row) => sum + Number(row.reportVatAmount || 0),
            0,
          );
          const total = relevant.reduce(
            (sum, row) => sum + Number(row.reportAmount || 0),
            0,
          );
          const key = `${kind}-${group.companyId || group.companyName}`;
          return (
            <div key={key}>
              <button
                className="plw-firm-row"
                onClick={() => setOpen(open === key ? "" : key)}
              >
                <strong>{group.companyName}</strong>
                <span>{allRows.length} kayıt</span>
                <span>{money(base)}</span>
                <span>{money(vat)}</span>
                <b>{money(total)}</b>
                <em>
                  {kind === "GIDER"
                    ? group.expenseEffect?.replaceAll("_", " ")
                    : "Gelir"}
                </em>
              </button>
              {open === key ? (
                <div className="plw-firm-detail">
                  {allRows.map((row) => (
                    <div key={`${row.sourceType}-${row.sourceId}`}>
                      <span>{row.date}</span>
                      <span>{row.documentNo || "-"}</span>
                      <span>
                        {row.category} · {row.reportStatus?.replaceAll("_", " ")}
                      </span>
                      <strong>
                        {row.reportIncluded === true &&
                        (kind === "GELIR" || row.expenseStatus === "GENEL_GIDER")
                          ? money(row.reportAmount)
                          : "Dahil değil"}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EntryPanel({ entry, update, companies, categories, save, close }) {
  return (
    <section className="plw-panel">
      <div className="plw-panel-head">
        <h3>{entry.transactionType === "GELIR" ? "Gelir Ekle" : "Gider Ekle"}</h3>
        <button onClick={close}>×</button>
      </div>
      <div className="plw-entry-grid">
        <Field label="Tarih">
          <input type="date" value={entry.date} onChange={(e) => update("date", e.target.value)} />
        </Field>
        <Field label="Firma">
          <select value={entry.companyId} onChange={(e) => update("companyId", e.target.value)}>
            <option value="">Firma yok</option>
            {companies.map((row) => (
              <option key={row.id} value={row.id}>
                {row.firmaAdi || row.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Firma yoksa gider adı">
          <input value={entry.noCompany} onChange={(e) => update("noCompany", e.target.value)} />
        </Field>
        <Field label="Kategori">
          <select value={entry.categoryId} onChange={(e) => update("categoryId", e.target.value)}>
            <option value="">Seçin</option>
            {categories.map((row) => (
              <option key={row.id} value={row.id}>
                {row.ad}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Resmi / Gayri">
          <select value={entry.officialType} onChange={(e) => update("officialType", e.target.value)}>
            <option value="RESMI">Resmi</option>
            <option value="GAYRI_RESMI">Gayri Resmi</option>
          </select>
        </Field>
        <Field label="Matrah">
          <input inputMode="decimal" value={entry.baseAmount} onChange={(e) => update("baseAmount", e.target.value)} />
        </Field>
        <Field label="KDV oranı">
          <select value={entry.vatRate} onChange={(e) => update("vatRate", e.target.value)} disabled={entry.officialType !== "RESMI"}>
            <option value="0">%0</option>
            <option value="1">%1</option>
            <option value="10">%10</option>
            <option value="20">%20</option>
          </select>
        </Field>
        <Field label="KDV">
          <input inputMode="decimal" value={entry.vat} onChange={(e) => update("vat", e.target.value)} />
        </Field>
        <Field label="Genel toplam">
          <input value={parseAmount(entry.baseAmount) + parseAmount(entry.vat)} disabled />
        </Field>
        <Field label="Belge no">
          <input value={entry.documentNo} onChange={(e) => update("documentNo", e.target.value)} />
        </Field>
        <Field label="Açıklama">
          <input value={entry.description} onChange={(e) => update("description", e.target.value)} />
        </Field>
        <label className="plw-check">
          <input type="checkbox" checked={entry.addToCurrentAccount} onChange={(e) => update("addToCurrentAccount", e.target.checked)} />
          Firma carisine işle
        </label>
        <label className="plw-check">
          <input type="checkbox" checked={entry.reportIncluded} onChange={(e) => update("reportIncluded", e.target.checked)} />
          Muhasebe raporuna dahil et
        </label>
      </div>
      <div className="plw-panel-actions">
        <button onClick={close}>Vazgeç</button>
        <button onClick={() => save(true)}>Kaydet ve Yeni</button>
        <button className="primary" onClick={() => save(false)}>
          Kaydet
        </button>
      </div>
    </section>
  );
}

function FixedList({
  rows,
  companies,
  categories,
  edit,
  generate,
  passive,
  copyNext,
  month,
  generateMonth,
  add,
}) {
  const companyName = (id) =>
    companies.find((row) => row.id === id)?.firmaAdi ||
    companies.find((row) => row.id === id)?.name ||
    "Genel / firmasız";
  return (
    <section className="plw-panel">
      <div className="plw-panel-head plw-fixed-head">
        <div>
          <h3>Sabit Gider Planı</h3>
          <p>{month} dönemi; aynı gider aynı ay ikinci kez oluşmaz.</p>
        </div>
        <div className="plw-actions">
          <button onClick={generateMonth}>Bu Ayın Sabit Giderlerini Getir</button>
          <button className="primary" onClick={add}>
            + Yeni Sabit Gider
          </button>
        </div>
      </div>
      <div className="plw-fixed-table">
        <table>
          <thead>
            <tr>
              {["Gider", "Kategori", "Firma", "Aylık Tutar", "Ay Aralığı", "Tekrar", "Bu Ay", "İşlem"].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.ad}</b>
                    <small>
                      {!row.gecerliMi
                        ? "Eksik bilgi: düzenleme gerekli"
                        : row.aktifMi
                          ? "Aktif"
                          : "Pasif"}
                    </small>
                  </td>
                  <td>{categories.find((item) => item.id === row.kategoriId)?.ad || "Kategorisiz"}</td>
                  <td>{companyName(row.firmaId)}</td>
                  <td><b>{money(row.tutar)}</b></td>
                  <td>{row.baslangicAyi} → {row.bitisAyi || "Süresiz"}</td>
                  <td>{row.herAyOtomatik ? "Her ay otomatik" : "Elle oluştur"}</td>
                  <td>
                    <span className={row.buAyOlusturuldu ? "plw-badge done" : "plw-badge waiting"}>
                      {!row.gecerliMi ? "Tutar / kategori eksik" : row.buAyOlusturuldu ? "Raporda" : "Bekliyor"}
                    </span>
                  </td>
                  <td>
                    <div className="plw-actions">
                      <button onClick={() => edit(row)}>Düzenle</button>
                      <button disabled={!row.gecerliMi || row.buAyOlusturuldu || !row.aktifMi} onClick={() => generate(row)}>
                        Bu Aya Ekle
                      </button>
                      <button onClick={() => copyNext(row)}>Gelecek Aya Kopyala</button>
                      <button onClick={() => passive(row)}>Pasife Al</button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="plw-empty">
                  Henüz sabit gider yok. “Yeni Sabit Gider” ile başlayın.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FixedExpenseModal({
  draft,
  setDraft,
  companies,
  categories,
  error,
  saving,
  save,
  close,
}) {
  const update = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  const selectedCategory = categories.find((row) => row.id === draft.categoryId)?.ad;
  const selectedCompany = companies.find((row) => row.id === draft.companyId);
  return (
    <div className="plw-modal-backdrop" role="presentation" onMouseDown={close}>
      <section className="plw-modal" role="dialog" aria-modal="true" aria-label="Sabit gider ekle" onMouseDown={(event) => event.stopPropagation()}>
        <header className="plw-modal-head">
          <div>
            <span className="plw-eyebrow">SABİT GİDER PLANI</span>
            <h3>{draft.id ? "Sabit Gideri Düzenle" : "Yeni Sabit Gider Ekle"}</h3>
            <p>Gideri, kategorisini ve hangi aylarda rapora geleceğini belirleyin.</p>
          </div>
          <button aria-label="Kapat" onClick={close}>×</button>
        </header>

        <div className="plw-modal-body">
          {error ? <div className="plw-modal-error">{error}</div> : null}
          <div className="plw-form-section">
            <h4>1. Gider bilgisi</h4>
            <div className="plw-modal-grid">
              <Field label="Gider adı *" hint="Örnek: Kira, Personel Aylık, İnternet">
                <input autoFocus value={draft.name} onChange={(e) => update("name", e.target.value)} placeholder="Gider adını yazın" />
              </Field>
              <Field label="Kategori *">
                <select value={draft.categoryId} onChange={(e) => update("categoryId", e.target.value)}>
                  <option value="">Kategori seçin</option>
                  {categories.map((row) => (
                    <option key={row.id} value={row.id}>{row.ad}</option>
                  ))}
                </select>
              </Field>
              <Field label="Firma" hint="Firma yoksa genel gider olarak kalır">
                <select value={draft.companyId} onChange={(e) => update("companyId", e.target.value)}>
                  <option value="">Genel / firmasız gider</option>
                  {companies.map((row) => (
                    <option key={row.id} value={row.id}>{row.firmaAdi || row.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Aylık tutar *" hint="1.250,50 biçiminde yazabilirsiniz">
                <div className="plw-money-input"><span>₺</span><input inputMode="decimal" value={draft.amount} onChange={(e) => update("amount", e.target.value)} placeholder="0,00" /></div>
              </Field>
            </div>
          </div>

          <div className="plw-form-section">
            <h4>2. Ay planı</h4>
            <div className="plw-modal-grid schedule">
              <Field label="Başlangıç ayı *">
                <input type="month" value={draft.startMonth} onChange={(e) => update("startMonth", e.target.value)} />
              </Field>
              <Field label="Bitiş ayı" hint="Boş bırakırsanız süresiz devam eder">
                <input type="month" value={draft.endMonth} min={draft.startMonth} onChange={(e) => update("endMonth", e.target.value)} />
              </Field>
              <label className="plw-option-card">
                <input type="checkbox" checked={draft.autoMonthly} onChange={(e) => update("autoMonthly", e.target.checked)} />
                <span><b>Her ay otomatik rapora getir</b><small>Seçilen ay aralığında her ay bir kez oluşur.</small></span>
              </label>
              <label className="plw-option-card">
                <input type="checkbox" checked={draft.active} onChange={(e) => update("active", e.target.checked)} />
                <span><b>Plan aktif</b><small>Pasif planlardan yeni gider oluşmaz.</small></span>
              </label>
            </div>
          </div>

          <div className="plw-form-section">
            <h4>3. Muhasebe bilgisi</h4>
            <div className="plw-modal-grid accounting">
              <Field label="Resmi / Gayri">
                <select value={draft.officialType} onChange={(e) => update("officialType", e.target.value)}>
                  <option value="GAYRI_RESMI">Gayri Resmi</option>
                  <option value="RESMI">Resmi</option>
                </select>
              </Field>
              <Field label="KDV oranı">
                <select value={draft.vatRate} onChange={(e) => update("vatRate", e.target.value)} disabled={draft.officialType !== "RESMI"}>
                  <option value="0">%0</option>
                  <option value="1">%1</option>
                  <option value="10">%10</option>
                  <option value="20">%20</option>
                </select>
              </Field>
              <Field label="Açıklama">
                <input value={draft.description} onChange={(e) => update("description", e.target.value)} placeholder="İsteğe bağlı not" />
              </Field>
              <label className="plw-option-card danger">
                <input type="checkbox" checked={draft.addToCurrentAccount} onChange={(e) => update("addToCurrentAccount", e.target.checked)} disabled={!draft.companyId} />
                <span><b>Firma carisine de işle</b><small>Yalnızca gerçek cari borç oluşacaksa açın.</small></span>
              </label>
            </div>
          </div>

          <div className="plw-plan-preview">
            <span>PLAN ÖZETİ</span>
            <strong>{draft.name || "Gider adı"} · {selectedCategory || "Kategori seçilmedi"} · {money(parseAmount(draft.amount))}</strong>
            <small>{selectedCompany?.firmaAdi || selectedCompany?.name || "Genel gider"} — {draft.startMonth || "Başlangıç"} → {draft.endMonth || "Süresiz"} {draft.autoMonthly ? "· Her ay otomatik" : "· Elle oluşturulacak"}</small>
          </div>
        </div>

        <footer className="plw-modal-actions">
          <button disabled={saving} onClick={close}>Vazgeç</button>
          <button className="primary" disabled={saving} onClick={save}>
            {saving ? "Kaydediliyor…" : draft.id ? "Değişiklikleri Kaydet" : "Sabit Gideri Kaydet"}
          </button>
        </footer>
      </section>
    </div>
  );
}
