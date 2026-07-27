import { useEffect, useMemo, useState } from "react";
import { useCallback } from "react";
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  downloadFile,
} from "../../../utils/api";
import "./muhasebeReportsWorkspace.css";
import "./muhasebeReportsWorkspaceEnhancements.css";

const TABS = [
  ["companies", "Firma Özeti"],
  ["details", "Firma Detayları"],
  ["expenses", "Genel Giderler"],
  ["incomes", "Gelirler"],
  ["vat-in", "Gelen KDV"],
  ["vat-out", "Giden KDV"],
  ["excel", "Excel Önizleme"],
];
const emptyDraft = {
  sourceType: "MANUEL_GENEL_GIDER",
  date: new Date().toISOString().slice(0, 10),
  companyId: "",
  freeCompany: "",
  officialType: "GAYRI_RESMI",
  expenseStatus: "GENEL_GIDER",
  reportStatus: "DAHIL",
  categoryId: "",
  documentNo: "",
  description: "",
  baseAmount: "",
  vatRate: "0",
  vat: "0",
  grandTotal: "",
  reportAmount: "",
  reportVatAmount: "0",
  paymentType: "",
  reportNote: "",
  addToCurrentAccount: false,
};
const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });
const dateText = (value) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
        "tr-TR",
      )
    : "-";
const unwrap = (payload) =>
  payload?.data?.data || payload?.data || payload || {};

function monthRange(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { startDate: iso(first), endDate: iso(last) };
}

export default function MuhasebeReportsWorkspace({ activeMainCompany, goTab }) {
  const initialRange = useMemo(() => monthRange(0), []);
  const [filters, setFilters] = useState({
    ...initialRange,
    firmId: "",
    companyBehavior: "",
    officialType: "",
    categoryId: "",
    sourceType: "",
    reportStatus: "",
    search: "",
  });
  const [activeTab, setActiveTab] = useState("companies");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [state, setState] = useState({ loading: true, error: "", data: {} });
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [companyDetail, setCompanyDetail] = useState("");
  const [companyViewFilter, setCompanyViewFilter] = useState("");
  const params = useMemo(() => ({
    ...filters,
    mainCompanySlug: activeMainCompany?.slug,
    mainCompanyId: activeMainCompany?.id,
  }), [activeMainCompany?.id, activeMainCompany?.slug, filters]);

  const load = useCallback(async (filterOverrides = {}) => {
    const nextFilters = { ...filters, ...filterOverrides };
    if (Object.keys(filterOverrides).length) setFilters(nextFilters);
    setState((old) => ({ ...old, loading: true, error: "" }));
    try {
      const [reportPayload, companyPayload] = await Promise.all([
        apiGet("/muhasebe/accounting/reports/records", {
          ...params,
          ...nextFilters,
          _ts: Date.now(),
        }),
        apiGet("/muhasebe/firmalar", { limit: 1000, _ts: Date.now() }),
      ]);
      setState({ loading: false, error: "", data: unwrap(reportPayload) });
      const companyData = unwrap(companyPayload);
      setCompanies(
        Array.isArray(companyData) ? companyData : companyData?.rows || [],
      );
      setSelected([]);
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Rapor verileri alınamadı.",
        data: {},
      });
    }
  }, [filters, params]);
  useEffect(() => {
    load();
  }, [activeMainCompany?.slug, activeMainCompany?.id, load]);

  const data = state.data || {};
  const records = Array.isArray(data.records) ? data.records : [];
  const categories = Array.isArray(data.categories)
    ? data.categories.filter((row) => row.aktifMi !== false)
    : [];
  const summary = data.summary || {};
  const setFilter = (key, value) =>
    setFilters((old) => ({ ...old, [key]: value }));
  const quickRange = (type) => {
    if (type === "this-month") load(monthRange(0));
    if (type === "last-month") load(monthRange(-1));
    if (type === "year")
      load({
        startDate: `${new Date().getFullYear()}-01-01`,
        endDate: `${new Date().getFullYear()}-12-31`,
      });
    if (type === "all")
      load({
        startDate: "2000-01-01",
        endDate: new Date().toISOString().slice(0, 10),
      });
  };
  const toggle = (row) =>
    setSelected((old) =>
      old.some(
        (item) =>
          item.sourceType === row.sourceType && item.sourceId === row.sourceId,
      )
        ? old.filter(
            (item) =>
              !(
                item.sourceType === row.sourceType &&
                item.sourceId === row.sourceId
              ),
          )
        : [...old, { sourceType: row.sourceType, sourceId: row.sourceId }],
    );
  const edit = (row) => {
    setDraft({
      ...emptyDraft,
      ...row,
      reportStatus: row.reportStatus,
      reportAmount: row.reportAmount,
      reportVatAmount: row.reportVatAmount,
      reportNote: row.reportNote || "",
    });
    setModal("edit");
  };
  const openManual = () => {
    setDraft({ ...emptyDraft, date: filters.startDate });
    setModal("manual");
  };
  const save = async () => {
    setBusy(true);
    setNotice("");
    try {
      if (modal === "manual") {
        await apiPost("/muhasebe/accounting/reports/manual-expense", {
          ...params,
          ad: draft.freeCompany || draft.description || "Genel Gider",
          tarih: draft.date,
          firmaId: draft.companyId || undefined,
          resmiTip: draft.officialType,
          kategoriId: draft.categoryId,
          belgeNo: draft.documentNo,
          aciklama: draft.description,
          tutar: Number(draft.baseAmount || 0),
          kdvOrani: Number(draft.vatRate || 0),
          kdv: Number(draft.vat || 0),
          raporaDahil: draft.reportStatus === "DAHIL",
          odemeSekli: draft.paymentType,
          not: draft.reportNote,
          cariyeEkle: draft.addToCurrentAccount,
        });
      } else if (draft.sourceType === "MANUEL_GENEL_GIDER") {
        await apiPut(
          `/muhasebe/accounting/reports/manual-expense/${encodeURIComponent(draft.sourceId)}`,
          {
            ...params,
            ad: draft.companyName || draft.description,
            tarih: draft.date,
            firmaId: draft.companyId || undefined,
            resmiTip: draft.officialType,
            kategoriId: draft.categoryId,
            belgeNo: draft.documentNo,
            aciklama: draft.reportDescription,
            tutar: Number(draft.baseAmount || 0),
            kdvOrani: Number(draft.vatRate || 0),
            kdv: Number(draft.reportVatAmount || 0),
            raporaDahil: draft.reportStatus === "DAHIL",
            not: draft.reportNote,
          },
        );
      } else {
        await apiPut(
          `/muhasebe/accounting/reports/record/${encodeURIComponent(draft.sourceType)}/${encodeURIComponent(draft.sourceId)}`,
          {
            ...params,
            reportIncluded:
              draft.reportStatus === "KONTROL_BEKLIYOR"
                ? null
                : draft.reportStatus === "DAHIL",
            reportCategoryId: draft.categoryId,
            reportAmount: Number(draft.reportAmount || 0),
            reportVatAmount: Number(draft.reportVatAmount || 0),
            reportOfficialType: draft.officialType,
            reportExpenseStatus: draft.expenseStatus,
            reportDescription: draft.reportDescription,
            reportNote: draft.reportNote,
            reportVatIncluded:
              draft.officialType === "RESMI" &&
              draft.reportVatIncluded !== false,
          },
        );
      }
      setModal(null);
      setNotice("Rapor kaydı kaydedildi.");
      await load();
    } catch (error) {
      setNotice(error?.message || "Kayıt yapılamadı.");
    } finally {
      setBusy(false);
    }
  };
  const removeManual = async (row) => {
    if (
      !window.confirm(
        "Yalnızca bu manuel rapor gideri silinecek. Devam edilsin mi?",
      )
    )
      return;
    await apiDelete(
      `/muhasebe/accounting/reports/manual-expense/${encodeURIComponent(row.sourceId)}`,
      params,
    );
    setNotice("Manuel gider silindi.");
    await load();
  };
  const directDecision = async (row, values) => {
    setBusy(true);
    try {
      await apiPut(
        `/muhasebe/accounting/reports/record/${encodeURIComponent(row.sourceType)}/${encodeURIComponent(row.sourceId)}`,
        { ...params, ...values },
      );
      await load();
    } catch (error) {
      setNotice(error?.message || "Kayıt güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };
  const companyDecision = async (group, values) => {
    setBusy(true);
    try {
      await Promise.all(
        (group.records || []).map((row) =>
          apiPut(
            `/muhasebe/accounting/reports/record/${encodeURIComponent(row.sourceType)}/${encodeURIComponent(row.sourceId)}`,
            { ...params, ...values },
          ),
        ),
      );
      setNotice(
        `${group.companyName} için ${group.records?.length || 0} kayıt güncellendi.`,
      );
      await load();
    } catch (error) {
      setNotice(error?.message || "Firma rapor kararı güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };
  const downloadExcel = () =>
    downloadFile(
      "/muhasebe/accounting/reports/export",
      params,
      `KY_ERP_Muhasebe_Raporu_${filters.startDate.slice(0, 7).replace("-", "_")}.xlsx`,
    );

  return (
    <div className="mrw">
      <section className="mrw-head">
        <div>
          <h2>Muhasebe Raporları</h2>
          <p>
            Kaynak muhasebe kayıtlarını değiştirmeden rapor kapsamını
            hazırlayın.
          </p>
        </div>
        <div className="mrw-actions">
          <button onClick={openManual}>Yeni Genel Gider Ekle</button>
          <button className="primary" onClick={downloadExcel}>
            Excel İndir
          </button>
        </div>
      </section>
      <nav className="mrw-tabs">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={activeTab === key ? "active" : ""}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="mrw-filter">
        <div className="mrw-quick">
          <button onClick={() => quickRange("this-month")}>Bu Ay</button>
          <button onClick={() => quickRange("last-month")}>Geçen Ay</button>
          <button onClick={() => quickRange("year")}>Bu Yıl</button>
          <button onClick={() => quickRange("all")}>Tümünü Getir</button>
        </div>
        <div className="mrw-filter-grid">
          <Field label="Başlangıç">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilter("startDate", e.target.value)}
            />
          </Field>
          <Field label="Bitiş">
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilter("endDate", e.target.value)}
            />
          </Field>
          <Field label="Firma">
            <select
              value={filters.firmId}
              onChange={(e) => setFilter("firmId", e.target.value)}
            >
              <option value="">Tüm firmalar</option>
              {companies.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.firmaAdi || row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Firma davranışı">
            <select
              value={filters.companyBehavior}
              onChange={(e) => setFilter("companyBehavior", e.target.value)}
            >
              <option value="">Tümü</option>
              <option value="OFFICIAL_CARI">KDV + Cari</option>
              <option value="OFFICIAL_CASH_VAT">Peşin Alış / KDV</option>
              <option value="OFFICIAL_VAT_ONLY">Sadece KDV / Gider Dışı</option>
              <option value="UNOFFICIAL_EXPENSE">Gayri Gider</option>
            </select>
          </Field>
          <Field label="Resmi / Gayri">
            <select
              value={filters.officialType}
              onChange={(e) => setFilter("officialType", e.target.value)}
            >
              <option value="">Tümü</option>
              <option value="RESMI">Resmi</option>
              <option value="GAYRI_RESMI">Gayri Resmi</option>
            </select>
          </Field>
          <Field label="Kategori">
            <select
              value={filters.categoryId}
              onChange={(e) => setFilter("categoryId", e.target.value)}
            >
              <option value="">Tüm kategoriler</option>
              {categories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.ad}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rapor durumu">
            <select
              value={filters.reportStatus}
              onChange={(e) => setFilter("reportStatus", e.target.value)}
            >
              <option value="">Tümü</option>
              <option value="DAHIL">Dahil</option>
              <option value="HARIC">Hariç</option>
              <option value="KONTROL_BEKLIYOR">Kontrol Bekliyor</option>
            </select>
          </Field>
          <Field label="Arama">
            <input
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder="Firma, belge, kategori, tutar"
            />
          </Field>
          <button className="primary update" onClick={() => load()}>
            Raporu Güncelle
          </button>
        </div>
        <div className="mrw-bulk">
          <button onClick={() => setAdvancedOpen((value) => !value)}>
            Gelişmiş Filtreler
          </button>
          {advancedOpen ? (
            <Field label="İşlem türü">
              <select
                value={filters.sourceType}
                onChange={(e) => setFilter("sourceType", e.target.value)}
              >
                <option value="">Tümü</option>
                <option value="DOCUMENT">Faturalar</option>
                <option value="CURRENT_ACCOUNT">Cari Hareket</option>
                <option value="MANUEL_GENEL_GIDER">Manuel Genel Gider</option>
              </select>
            </Field>
          ) : null}
          <button onClick={() => goTab?.("gider-kategorileri")}>
            Kategorileri Yönet
          </button>
        </div>
      </section>
      {notice ? (
        <div className="mrw-notice">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      ) : null}
      {state.error ? <div className="mrw-error">{state.error}</div> : null}
      <section className="mrw-metrics">
        {[
          ["Toplam Gelir", summary.totalIncome, "income", ""],
          ["Toplam Gider", summary.totalExpense, "expense", ""],
          ["Net Sonuç", summary.netResult, "net", ""],
          ["Gelen KDV", summary.incomingVat, "vat-in", ""],
          ["Giden KDV", summary.outgoingVat, "vat-out", ""],
          ["Devreden KDV", summary.carryVat, "carry", ""],
          [
            "Genel Gidere Dahil Firma",
            summary.includedExpenseCompanies,
            "included",
            "EXPENSE_COMPANY",
          ],
          [
            "Kontrol Bekleyen Firma",
            summary.pendingCompanies,
            "pending",
            "PENDING_COMPANY",
          ],
        ].map(([label, value, tone, status]) => (
          <button
            key={label}
            className={tone}
            onClick={() => {
              if (status) {
                setCompanyViewFilter((old) => (old === status ? "" : status));
                setActiveTab("companies");
              }
            }}
          >
            <span>{label}</span>
            <strong>
              {typeof value === "number" &&
              !["included", "excluded", "pending"].includes(tone)
                ? money(value)
                : value || 0}
            </strong>
          </button>
        ))}
      </section>
      {state.loading ? (
        <div className="mrw-state">Rapor hazırlanıyor…</div>
      ) : null}
      {!state.loading && activeTab === "companies" ? (
        <CompanyReport
          rows={(data.companySummary || []).filter((row) =>
            companyViewFilter === "PENDING_COMPANY"
              ? row.pendingCount > 0
              : companyViewFilter === "EXPENSE_COMPANY"
                ? row.generalExpenseTotal > 0
                : true,
          )}
          open={companyDetail}
          setOpen={setCompanyDetail}
          decide={companyDecision}
          showDetails={(key) => {
            setCompanyDetail(key);
            setActiveTab("details");
          }}
        />
      ) : null}
      {!state.loading && activeTab === "details" ? (
        companyDetail ? (
          <CompanyDetail
            group={(data.companySummary || []).find(
              (row) => (row.companyId || row.companyName) === companyDetail,
            )}
            selected={selected}
            toggle={toggle}
            edit={edit}
            directDecision={directDecision}
            removeManual={removeManual}
            openCompanyCard={() => goTab?.("firma-kartlari")}
          />
        ) : (
          <div className="mrw-state">
            Firma Özeti sekmesinden bir firma seçin.
          </div>
        )
      ) : null}
      {!state.loading && activeTab === "expenses" ? (
        <SimpleReport
          title="Genel Giderler"
          rows={data.generalExpenses || []}
        />
      ) : null}
      {!state.loading && activeTab === "incomes" ? (
        <SimpleReport
          title="Gelirler"
          rows={records.filter(
            (row) =>
              row.transactionType === "GELIR" && row.reportIncluded === true,
          )}
        />
      ) : null}
      {!state.loading && activeTab === "vat-in" ? (
        <VatReport title="Gelen KDV" rows={data.vatIn || []} />
      ) : null}
      {!state.loading && activeTab === "vat-out" ? (
        <VatReport title="Giden KDV" rows={data.vatOut || []} />
      ) : null}
      {!state.loading && activeTab === "excel" ? (
        <ExcelPreview data={data} download={downloadExcel} />
      ) : null}
      {modal ? (
        <EditModal
          mode={modal}
          draft={draft}
          setDraft={setDraft}
          companies={companies}
          categories={categories}
          busy={busy}
          save={save}
          close={() => setModal(null)}
          openSource={() => {
            setModal(null);
            goTab?.(draft.originalRoute || "cari-hareketler");
          }}
        />
      ) : null}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="mrw-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Badge({ value }) {
  const cls =
    value === "DAHIL" || value === "GENEL_GIDER" || value === "RESMI"
      ? "good"
      : value === "HARIC" || value === "GENEL_GIDER_DEGIL"
        ? "bad"
        : "wait";
  return (
    <span className={`mrw-badge ${cls}`}>
      {String(value || "-").replaceAll("_", " ")}
    </span>
  );
}
function ReportTable({
  rows,
  selected,
  toggle,
  edit,
  directDecision,
  removeManual,
}) {
  return (
    <section className="mrw-panel">
      <div className="mrw-panel-head">
        <h3>Rapor Kontrol Tablosu</h3>
        <span>{rows.length} kayıt</span>
      </div>
      <div className="mrw-table">
        <table>
          <thead>
            <tr>
              {[
                "Seç",
                "Tarih",
                "Firma Adı",
                "İşlem Türü",
                "Kaynak",
                "Resmi / Gayri",
                "Gider Durumu",
                "Kategori",
                "Belge / Fatura No",
                "Açıklama",
                "Matrah",
                "KDV",
                "Genel Toplam",
                "Rapora Giren",
                "Rapor Durumu",
                "İşlem",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checked = selected.some(
                (x) =>
                  x.sourceType === row.sourceType &&
                  x.sourceId === row.sourceId,
              );
              return (
                <tr
                  key={`${row.sourceType}-${row.sourceId}`}
                  className={`status-${row.reportStatus?.toLowerCase()}`}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(row)}
                    />
                  </td>
                  <td>{dateText(row.date)}</td>
                  <td className="wrap">{row.companyName}</td>
                  <td>{row.transactionType}</td>
                  <td>{row.sourceLabel}</td>
                  <td>
                    <Badge value={row.officialType} />
                  </td>
                  <td>
                    <Badge value={row.expenseStatus} />
                  </td>
                  <td>{row.category}</td>
                  <td>{row.documentNo || "-"}</td>
                  <td className="wrap">
                    {row.reportDescription || row.description || "-"}
                  </td>
                  <td className="money">{money(row.baseAmount)}</td>
                  <td className="money">{money(row.vat)}</td>
                  <td className="money">{money(row.grandTotal)}</td>
                  <td className="money strong">{money(row.reportAmount)}</td>
                  <td>
                    <Badge value={row.reportStatus} />
                  </td>
                  <td>
                    <div className="mrw-row-actions">
                      <button onClick={() => edit(row)}>Detay / Düzenle</button>
                      {row.reportStatus !== "DAHIL" ? (
                        <button
                          onClick={() =>
                            directDecision(row, { reportIncluded: true })
                          }
                        >
                          Dahil Et
                        </button>
                      ) : null}
                      {row.reportStatus !== "HARIC" ? (
                        <button
                          onClick={() =>
                            directDecision(row, { reportIncluded: false })
                          }
                        >
                          Hariç Tut
                        </button>
                      ) : null}
                      {row.transactionType === "GIDER" ? (
                        <button
                          onClick={() =>
                            directDecision(row, {
                              reportExpenseStatus:
                                row.expenseStatus === "GENEL_GIDER"
                                  ? "GENEL_GIDER_DEGIL"
                                  : "GENEL_GIDER",
                            })
                          }
                        >
                          {row.expenseStatus === "GENEL_GIDER"
                            ? "Giderden Çıkar"
                            : "Genel Gider Yap"}
                        </button>
                      ) : null}
                      {row.manual ? (
                        <button
                          className="danger"
                          onClick={() => removeManual(row)}
                        >
                          Sil
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function CompanyReport({ rows, decide, showDetails }) {
  return (
    <section className="mrw-panel">
      <div className="mrw-panel-head">
        <div>
          <h3>Firma Özeti</h3>
          <p>Faturalar firma detayına girildiğinde gösterilir.</p>
        </div>
        <span>{rows.length} firma</span>
      </div>
      <div className="mrw-table">
        <table>
          <thead>
            <tr>
              {[
                "Firma Adı",
                "Firma Tipi",
                "Firma Davranışı",
                "Kategori",
                "Resmi / Gayri",
                "Fatura",
                "İlk Tarih",
                "Son Tarih",
                "Matrah",
                "KDV",
                "Genel Toplam",
                "Gider Etkisi",
                "Rapor Durumu",
                "İşlem",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className="click"
                key={row.companyId || row.companyName}
                onDoubleClick={() =>
                  showDetails(row.companyId || row.companyName)
                }
              >
                <td className="wrap">
                  <strong>{row.companyName}</strong>
                </td>
                <td>{row.companyType}</td>
                <td>
                  <Badge value={row.companyBehavior} />
                </td>
                <td>{row.category || "Kategorisiz"}</td>
                <td>
                  <Badge value={row.officialType} />
                </td>
                <td>{row.invoiceCount}</td>
                <td>{dateText(row.firstDate)}</td>
                <td>{dateText(row.lastDate)}</td>
                <td className="money">{money(row.baseAmount)}</td>
                <td className="money">{money(row.vat)}</td>
                <td className="money">{money(row.grandTotal)}</td>
                <td>
                  <Badge value={row.expenseEffect} />
                </td>
                <td>
                  <Badge value={row.reportStatus} />
                </td>
                <td>
                  <div className="mrw-row-actions">
                    <button
                      onClick={() =>
                        showDetails(row.companyId || row.companyName)
                      }
                    >
                      Detay
                    </button>
                    <button
                      onClick={() => decide(row, { reportIncluded: true })}
                    >
                      Rapora Dahil Et
                    </button>
                    <button
                      onClick={() => decide(row, { reportIncluded: false })}
                    >
                      Rapordan Çıkar
                    </button>
                    <button
                      onClick={() =>
                        decide(row, { reportExpenseStatus: "GENEL_GIDER" })
                      }
                    >
                      Genel Gider Yap
                    </button>
                    <button
                      onClick={() =>
                        decide(row, {
                          reportExpenseStatus: "GENEL_GIDER_DEGIL",
                        })
                      }
                    >
                      Gider Dışı Yap
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function CompanyDetail({ group, openCompanyCard, ...tableProps }) {
  if (!group) return <div className="mrw-state">Firma bulunamadı.</div>;
  return (
    <div className="mrw-detail-stack">
      <section className="mrw-panel">
        <div className="mrw-panel-head">
          <div>
            <h3>{group.companyName}</h3>
            <p>
              {group.companyBehavior} · {group.officialType}
            </p>
          </div>
          <div className="mrw-row-actions">
            {group.companyId ? (
              <button onClick={openCompanyCard}>Firma Kartını Aç</button>
            ) : null}
          </div>
        </div>
        <div className="mrw-state">
          Bu firmanın kategori ve rapor davranışı Firma Kartı ayarlarından
          uygulanmaktadır.
        </div>
        <div className="mrw-detail-summary">
          {[
            ["Firma davranışı", group.companyBehavior],
            ["Kategori", group.category || "Kategorisiz"],
            ["Rapor durumu", group.reportStatus],
            ["Gider etkisi", group.expenseEffect],
            ["Fatura sayısı", group.invoiceCount],
            ["Toplam matrah", money(group.baseAmount)],
            ["Toplam KDV", money(group.vat)],
            ["Genel toplam", money(group.grandTotal)],
            ["Gidere dahil", money(group.generalExpenseTotal)],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>
      <ReportTable rows={group.records || []} {...tableProps} />
    </div>
  );
}
function SimpleReport({ title, rows }) {
  return (
    <section className="mrw-panel inner">
      <div className="mrw-panel-head">
        <h3>{title}</h3>
        <span>{rows.length} kayıt</span>
      </div>
      <div className="mrw-table">
        <table>
          <thead>
            <tr>
              {[
                "Tarih",
                "Firma",
                "Belge No",
                "Kaynak",
                "Resmi / Gayri",
                "Kategori",
                "Matrah",
                "KDV",
                "Genel Toplam",
                "Rapora Giren",
                "Açıklama",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.sourceType}-${row.sourceId}`}>
                <td>{dateText(row.date)}</td>
                <td>{row.companyName}</td>
                <td>{row.documentNo || "-"}</td>
                <td>{row.sourceLabel}</td>
                <td>
                  <Badge value={row.officialType} />
                </td>
                <td>{row.category}</td>
                <td className="money">{money(row.baseAmount)}</td>
                <td className="money">{money(row.reportVatAmount)}</td>
                <td className="money">{money(row.grandTotal)}</td>
                <td className="money">{money(row.reportAmount)}</td>
                <td>{row.reportDescription}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function VatReport({ title, rows }) {
  const total = (key) =>
    rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
  return (
    <>
      <SimpleReport title={title} rows={rows} />
      <div className="mrw-totals">
        <div>
          <span>Toplam Matrah</span>
          <strong>{money(total("baseAmount"))}</strong>
        </div>
        <div>
          <span>Toplam KDV</span>
          <strong>{money(total("reportVatAmount"))}</strong>
        </div>
        <div>
          <span>Toplam Genel Tutar</span>
          <strong>{money(total("grandTotal"))}</strong>
        </div>
      </div>
    </>
  );
}
function ExcelPreview({ data, download }) {
  const expenseRows = data.generalExpenses || [];
  const expenseFirmCount = new Set(
    expenseRows.map((row) => row.companyId || row.companyName || "Genel / firmasız"),
  ).size;
  const expenseCategoryCount = new Set(
    expenseRows.map((row) => row.categoryId || row.category || "Kategorisiz"),
  ).size;
  const sheets = [
    ["Gider - Firma Bazlı", expenseFirmCount],
    ["Gider - Kategori Bazlı", expenseCategoryCount],
    ["Genel Özet", 1],
    ["Firma Bazlı Rapor", data.companySummary?.length || 0],
    ["Firma Fatura Detayları", data.records?.length || 0],
    ["Genel Giderler", data.generalExpenses?.length || 0],
    [
      "Gelirler",
      data.records?.filter(
        (row) => row.transactionType === "GELIR" && row.reportIncluded === true,
      ).length || 0,
    ],
    ["Gelen KDV", data.vatIn?.length || 0],
    ["Giden KDV", data.vatOut?.length || 0],
  ];
  return (
    <section className="mrw-panel">
      <div className="mrw-panel-head">
        <div>
          <h3>Excel Önizleme</h3>
          <p>Giderler firma ve kategori bazında iki ayrı çalışma sayfasında hazırlanır.</p>
        </div>
        <button className="primary" onClick={download}>
          Excel İndir
        </button>
      </div>
      <div className="mrw-sheet-grid">
        {sheets.map(([name, count], index) => (
          <div key={name}>
            <b>
              {index + 1}. {name}
            </b>
            <span>{count} satır</span>
          </div>
        ))}
      </div>
    </section>
  );
}
function EditModal({
  mode,
  draft,
  setDraft,
  companies,
  categories,
  busy,
  save,
  close,
  openSource,
}) {
  const update = (key, value) =>
    setDraft((old) => {
      const next = { ...old, [key]: value };
      if (
        (key === "baseAmount" || key === "vatRate") &&
        mode === "manual" &&
        next.officialType === "RESMI"
      ) {
        next.vat = (
          (Number(next.baseAmount || 0) * Number(next.vatRate || 0)) /
          100
        ).toFixed(2);
        next.grandTotal = (
          Number(next.baseAmount || 0) + Number(next.vat || 0)
        ).toFixed(2);
      }
      if (key === "officialType" && value === "GAYRI_RESMI") {
        next.vatRate = "0";
        next.vat = "0";
      }
      return next;
    });
  return (
    <div
      className="mrw-modal-bg"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="mrw-modal">
        <div className="mrw-modal-head">
          <div>
            <h3>
              {mode === "manual"
                ? "Yeni Genel Gider Ekle"
                : "Rapor Kaydını Düzenle"}
            </h3>
            <p>Orijinal muhasebe kaydı değiştirilmez.</p>
          </div>
          <button onClick={close}>×</button>
        </div>
        <div className="mrw-modal-grid">
          <Field label="Firma">
            <select
              value={draft.companyId || ""}
              onChange={(e) => update("companyId", e.target.value)}
              disabled={mode !== "manual"}
            >
              <option value="">Firma bilgisi yok</option>
              {companies.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.firmaAdi || row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Firma yoksa açıklama">
            <input
              value={draft.freeCompany || ""}
              onChange={(e) => update("freeCompany", e.target.value)}
              disabled={mode !== "manual"}
            />
          </Field>
          <Field label="Tarih">
            <input
              type="date"
              value={draft.date || ""}
              onChange={(e) => update("date", e.target.value)}
              disabled={mode !== "manual"}
            />
          </Field>
          <Field label="Kaynak türü">
            <input value={draft.sourceLabel || "Manuel Genel Gider"} disabled />
          </Field>
          <Field label="Belge no">
            <input
              value={draft.documentNo || ""}
              onChange={(e) => update("documentNo", e.target.value)}
              disabled={
                mode !== "manual" && draft.sourceType !== "MANUEL_GENEL_GIDER"
              }
            />
          </Field>
          <Field label="Resmi / Gayri">
            <select
              value={draft.officialType || "GAYRI_RESMI"}
              onChange={(e) => update("officialType", e.target.value)}
            >
              <option value="RESMI">Resmi</option>
              <option value="GAYRI_RESMI">Gayri Resmi</option>
            </select>
          </Field>
          <Field label="Genel gider durumu">
            <select
              value={draft.expenseStatus || "KONTROL_BEKLIYOR"}
              onChange={(e) => update("expenseStatus", e.target.value)}
            >
              <option value="KONTROL_BEKLIYOR">Kontrol Bekliyor</option>
              <option value="GENEL_GIDER">Genel Gider</option>
              <option value="GENEL_GIDER_DEGIL">Genel Gider Değil</option>
            </select>
          </Field>
          <Field label="Rapor durumu">
            <select
              value={draft.reportStatus || "KONTROL_BEKLIYOR"}
              onChange={(e) => update("reportStatus", e.target.value)}
            >
              <option value="KONTROL_BEKLIYOR">Kontrol Bekliyor</option>
              <option value="DAHIL">Dahil</option>
              <option value="HARIC">Hariç</option>
            </select>
          </Field>
          <Field label="Kategori">
            <select
              value={draft.categoryId || ""}
              onChange={(e) => update("categoryId", e.target.value)}
            >
              <option value="">Kategori seçin</option>
              {categories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.ad}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orijinal matrah">
            <input
              value={draft.baseAmount ?? ""}
              onChange={(e) => update("baseAmount", e.target.value)}
              disabled={
                mode !== "manual" && draft.sourceType !== "MANUEL_GENEL_GIDER"
              }
            />
          </Field>
          <Field label="KDV oranı">
            <select
              value={draft.vatRate ?? 0}
              onChange={(e) => update("vatRate", e.target.value)}
              disabled={draft.officialType !== "RESMI"}
            >
              <option value="0">%0</option>
              <option value="1">%1</option>
              <option value="10">%10</option>
              <option value="20">%20</option>
            </select>
          </Field>
          <Field label="Orijinal KDV">
            <input value={draft.vat ?? 0} disabled />
          </Field>
          <Field label="Orijinal genel toplam">
            <input value={draft.grandTotal ?? ""} disabled />
          </Field>
          <Field label="Rapora girecek tutar">
            <input
              value={draft.reportAmount ?? draft.grandTotal ?? ""}
              onChange={(e) => update("reportAmount", e.target.value)}
            />
          </Field>
          <Field label="Rapora girecek KDV">
            <input
              value={
                mode === "manual" ? draft.vat : (draft.reportVatAmount ?? "")
              }
              onChange={(e) =>
                update(
                  mode === "manual" ? "vat" : "reportVatAmount",
                  e.target.value,
                )
              }
              disabled={draft.officialType !== "RESMI"}
            />
          </Field>
          <Field label="Ödeme şekli">
            <input
              value={draft.paymentType || ""}
              onChange={(e) => update("paymentType", e.target.value)}
            />
          </Field>
          <Field label="Rapor açıklaması">
            <input
              value={draft.reportDescription || draft.description || ""}
              onChange={(e) =>
                update(
                  mode === "manual" ? "description" : "reportDescription",
                  e.target.value,
                )
              }
            />
          </Field>
          <Field label="Not">
            <textarea
              value={draft.reportNote || ""}
              onChange={(e) => update("reportNote", e.target.value)}
            />
          </Field>
          {mode !== "manual" && draft.officialType === "RESMI" ? (
            <label className="mrw-check">
              <input
                type="checkbox"
                checked={draft.reportVatIncluded !== false}
                onChange={(e) => update("reportVatIncluded", e.target.checked)}
              />{" "}
              KDV hesabına dahil et
            </label>
          ) : null}
          {mode === "manual" ? (
            <label className="mrw-check">
              <input
                type="checkbox"
                checked={draft.addToCurrentAccount}
                onChange={(e) =>
                  update("addToCurrentAccount", e.target.checked)
                }
              />{" "}
              Firma carisine de işlem olarak ekle
            </label>
          ) : null}
        </div>
        <div className="mrw-modal-actions">
          <button onClick={close}>Vazgeç</button>
          {mode !== "manual" ? (
            <button onClick={openSource}>Ana Kaydı Aç</button>
          ) : null}
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
