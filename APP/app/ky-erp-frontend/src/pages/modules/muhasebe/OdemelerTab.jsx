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

export function OdemelerTab({
  activeMainCompany,
  companies,
  activeCompany,
  onCompanySelect,
  recentCompanies,
}) {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [cards, setCards] = useState([]);
  const [checks, setChecks] = useState([]);
  const [filter, setFilter] = useState("");
  const [paymentTypeBusy, setPaymentTypeBusy] = useState(false);
  const [form, setForm] = useState({
    id: "",
    firma: activeCompany || "",
    tarih: new Date().toISOString().slice(0, 10),
    odemeTuru: "",
    tutar: 0,
    aciklama: "",
    resmiDurum: "RESMI",
    cariOnce: 0,
    cariSonra: 0,
    kalanTutar: 0,
    odemeSozuTarihi: "",
    hatirlatmaTarihi: "",
    haftaSonuHatirlat: false,
    cariNot: "",
    relatedCardId: "",
    relatedCheckId: "",
  });
  const [deleteState, setDeleteState] = useState({
    open: false,
    loading: false,
    deleting: false,
    row: null,
    summary: null,
    adminPassword: "",
  });

  async function load() {
    const [payments, paymentTypeRows, cardRows, checkRows] = await Promise.all([
      apiGet("/muhasebe/odemeler", activeMainCompany),
      apiGet("/muhasebe/odeme-turleri", activeMainCompany),
      apiGet("/muhasebe/kredi-kartlari", activeMainCompany),
      apiGet("/muhasebe/cekler", activeMainCompany),
    ]);
    setRows(payments);
    setPaymentTypes(paymentTypeRows);
    setCards(cardRows);
    setChecks(checkRows);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => {
    if (!form.firma && activeCompany)
      setForm((p) => ({ ...p, firma: activeCompany }));
  }, [activeCompany, form.firma]);

  useEffect(() => {
    if (!form.odemeTuru && paymentTypes.length) {
      const first = paymentTypes.find((item) => item?.aktif) || paymentTypes[0];
      if (first.ad) setForm((p) => ({ ...p, odemeTuru: first.ad }));
    }
  }, [form.odemeTuru, paymentTypes]);

  async function savePaymentType(payload) {
    setPaymentTypeBusy(true);
    try {
      await apiPost("/muhasebe/odeme-turleri", payload, activeMainCompany);
      const rows = await apiGet("/muhasebe/odeme-turleri", activeMainCompany);
      setPaymentTypes(rows);
    } finally {
      setPaymentTypeBusy(false);
    }
  }

  const odemeTypeKey = String(form.odemeTuru || "").toLocaleLowerCase("tr-TR");
  const isCreditCardPayment = odemeTypeKey.includes("kredi");
  const isCheckPayment =
    odemeTypeKey.includes("çek") || odemeTypeKey.includes("cek");
  const selectedCompanyCard = companies.find(
    (item) =>
      String(item?.firma || "").localeCompare(String(form.firma || ""), "tr", {
        sensitivity: "base",
      }) === 0,
  );
  const liveCariBefore =
    form.id && Number(form.cariOnce || 0) !== 0
       ? Number(form.cariOnce || 0)
      : Number(
          selectedCompanyCard.mevcutBakiye ?? selectedCompanyCard.bakiye ?? 0,
        );
  const liveCariAfter = Number(
    (liveCariBefore - Number(form.tutar || 0)).toFixed(2),
  );
  const isWeekendPayment = (() => {
    if (!form.tarih) return false;
    const day = new Date(`${form.tarih}T12:00:00`).getDay();
    return day === 0 || day === 6;
  })();

  async function save() {
    if (!form.firma) {
      setMessage("Ödeme kaydı için firma seçimi zorunludur.");
      return;
    }
    const selectedCard = cards.find(
      (item) => String(item?.id) === String(form.relatedCardId || ""),
    );
    const selectedCheck = checks.find(
      (item) => String(item?.id) === String(form.relatedCheckId || ""),
    );
    try {
      await apiPost(
        "/muhasebe/odemeler",
        {
          ...form,
          cariOnce: liveCariBefore,
          cariSonra: liveCariAfter,
          kalanTutar: Math.max(0, liveCariAfter),
          relatedCardName: selectedCard.kartAdi || "",
          relatedCheckNo: selectedCheck.cekNo || "",
        },
        activeMainCompany,
      );
      onCompanySelect(form.firma);
      setMessage(form.id ? "Ödeme güncellendi." : "Ödeme kaydedildi.");
      setForm((p) => ({
        ...p,
        id: "",
        tutar: 0,
        aciklama: "",
        resmiDurum: "RESMI",
        cariOnce: 0,
        cariSonra: 0,
        kalanTutar: 0,
        odemeSozuTarihi: "",
        hatirlatmaTarihi: "",
        haftaSonuHatirlat: false,
        cariNot: "",
        relatedCardId: "",
        relatedCheckId: "",
      }));
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  function editPayment(row) {
    setForm({
      id: row?.id,
      firma: row?.firma || "",
      tarih: row?.tarih || new Date().toISOString().slice(0, 10),
      odemeTuru: row?.odemeTuru || "",
      tutar: Number(row?.tutar || 0),
      aciklama: row?.aciklama || "",
      resmiDurum: row?.resmiDurum || "RESMI",
      cariOnce: Number(row?.cariOnce || 0),
      cariSonra: Number(row?.cariSonra || 0),
      kalanTutar: Number(row?.kalanTutar || 0),
      odemeSozuTarihi: row?.odemeSozuTarihi || "",
      hatirlatmaTarihi: row?.hatirlatmaTarihi || "",
      haftaSonuHatirlat: Boolean(row?.haftaSonuHatirlat),
      cariNot: row?.cariNot || "",
      relatedCardId: row?.relatedCardId ? String(row?.relatedCardId) : "",
      relatedCheckId: row?.relatedCheckId ? String(row?.relatedCheckId) : "",
    });
    setMessage("Ödeme düzenleme formu açıldı.");
  }

  function closeDeletePanel() {
    setDeleteState({
      open: false,
      loading: false,
      deleting: false,
      row: null,
      summary: null,
      adminPassword: "",
    });
  }

  async function openDeletePanel(row) {
    setDeleteState({
      open: true,
      loading: true,
      deleting: false,
      row,
      summary: null,
      adminPassword: "",
    });
    try {
      const summary = await apiGet(
        `/muhasebe/odemeler/${encodeURIComponent(row?.id)}/delete-check`,
        activeMainCompany,
      );
      setDeleteState((prev) => ({ ...prev, loading: false, summary }));
    } catch (e) {
      setDeleteState((prev) => ({ ...prev, loading: false }));
      setMessage(e.message || "Ödeme silme özeti alınamadı.");
    }
  }

  async function deletePayment() {
    if (!deleteState.row.id) {
      setMessage("Silinecek ödeme bulunamadı.");
      return;
    }
    if (!String(deleteState.adminPassword || "").trim()) {
      setMessage("Ödeme silme için admin şifresi zorunludur.");
      return;
    }
    setDeleteState((prev) => ({ ...prev, deleting: true }));
    try {
      const response = await apiPost(
        `/muhasebe/odemeler/${encodeURIComponent(deleteState.row.id)}/delete`,
        { adminPassword: deleteState.adminPassword },
        activeMainCompany,
      );
      await load();
      setMessage(response.message || "Ödeme silindi.");
      closeDeletePanel();
    } catch (e) {
      setDeleteState((prev) => ({ ...prev, deleting: false }));
      setMessage(e.message || "Ödeme silinemedi.");
    }
  }

  const visible = rows.filter((x) => {
    const txt = `${x.firma} ${x.aciklama || ""}`.toLocaleLowerCase("tr-TR");
    const textOk = txt.includes(filter.toLocaleLowerCase("tr-TR"));
    const companyOk = !form.firma || x.firma === form.firma;
    return textOk && companyOk;
  });
  const summary = visible.reduce(
    (acc, item) => {
      acc.total += 1;
      acc.tutar += Number(item?.tutar || 0);
      if (item.tarih === form.tarih) acc.today += Number(item?.tutar || 0);
      return acc;
    },
    { total: 0, tutar: 0, today: 0 },
  );

  return (
    <div className="content-grid muhasebe-page">
      <MuhasebePageHeader
        title={tr.odemeler}
        subtitle="Ödeme kayıtlarını firma ve ödeme türüne göre yönetin; tür yönetimi ve listeyi aynı sayfada takip edin."
      />
      <div className="content-card muhasebe-page-body">
        {message ? <div className="notice-box">{message}</div> : null}
        <div className="info-grid info-grid-4">
          <MetricBox
            icon="belge"
            label="Kayıt"
            value={summary.total}
            subText="Ödeme işlem kaydı"
            tone="blue"
          />
          <MetricBox
            icon="odemeler"
            label="Toplam Tutar"
            value={formatMoney(summary.tutar)}
            subText="Filtre toplamı"
            tone="green"
          />
          <MetricBox
            icon="users"
            label="Kalan Cari"
            value={formatMoney(liveCariAfter)}
            subText="Seçili firma cari"
            tone="orange"
          />
          <MetricBox
            icon="takvim"
            label="Bugün Ödeme"
            value={formatMoney(summary.today)}
            subText={form.tarih || "Bugün"}
            tone="purple"
          />
        </div>

        <div className="split-layout mt-16 muhasebe-top-panels">
          <div className="panel-block">
            <h4>Filtre / Seçim</h4>
            <CompanyQuickPicker
              label="Firma"
              companies={companies}
              value={form.firma}
              recentCompanies={recentCompanies}
              onChange={(name) => {
                setForm((p) => ({ ...p, firma: name }));
                onCompanySelect(name);
              }}
            />
            <Input
              label="Firma Filtresi"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="status-text">
              Liste, seçili firma ve filtre metnine göre daraltılır.
            </div>
          </div>

          <div className="panel-block">
            <h4>{form.id ? "Ödeme Düzenle" : "Ödeme Girişi"}</h4>
            <div className="form-grid form-grid-compact">
              <Input
                label="Tarih"
                type="date"
                value={form.tarih}
                onChange={(e) =>
                  setForm((p) => ({ ...p, tarih: e.target.value }))
                }
              />
              <Select
                label="Ödeme Türü"
                value={form.odemeTuru}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    odemeTuru: e.target.value,
                    relatedCardId: "",
                    relatedCheckId: "",
                  }))
                }
                options={(paymentTypes.length
                   ? paymentTypes.filter((item) => item?.aktif)
                  : [{ id: 0, ad: "Nakit" }]
                ).map((item) => ({ value: item?.ad, label: item?.ad }))}
              />
              <MoneyInput
                label="Ödeme Tutarı"
                value={form.tutar}
                onValueChange={(v) => setForm((p) => ({ ...p, tutar: v }))}
              />
              <Select
                label="Resmi / Gayri Resmi"
                value={form.resmiDurum}
                onChange={(e) =>
                  setForm((p) => ({ ...p, resmiDurum: e.target.value }))
                }
                options={[
                  { value: "RESMI", label: "Resmi" },
                  { value: "GAYRI_RESMI", label: "Gayri resmi" },
                ]}
              />
              <Input
                label="Açıklama"
                value={form.aciklama}
                onChange={(e) =>
                  setForm((p) => ({ ...p, aciklama: e.target.value }))
                }
              />
              <Input
                label="Ödeme Sözü"
                type="date"
                value={form.odemeSozuTarihi}
                onChange={(e) =>
                  setForm((p) => ({ ...p, odemeSozuTarihi: e.target.value }))
                }
              />
              <Input
                label="Hatırlatma"
                type="date"
                value={form.hatirlatmaTarihi}
                onChange={(e) =>
                  setForm((p) => ({ ...p, hatirlatmaTarihi: e.target.value }))
                }
              />
              <Input
                label="Cari Not"
                value={form.cariNot}
                onChange={(e) =>
                  setForm((p) => ({ ...p, cariNot: e.target.value }))
                }
                placeholder="Söz, açıklama veya takip notu"
              />

              {isCreditCardPayment ? (
                <Select
                  label="İlgili Kart"
                  value={form.relatedCardId || ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, relatedCardId: e.target.value }))
                  }
                  options={[
                    { value: "", label: "Kart Seçin" },
                    ...cards
                      .filter((item) => item?.aktif !== false)
                      .map((item) => ({
                        value: String(item?.id),
                        label: `${item?.kartAdi} - ${item?.banka}`,
                      })),
                  ]}
                />
              ) : null}

              {isCheckPayment ? (
                <Select
                  label="İlgili Çek"
                  value={form.relatedCheckId || ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, relatedCheckId: e.target.value }))
                  }
                  options={[
                    { value: "", label: "Çek Seçin" },
                    ...checks.map((item) => ({
                      value: String(item?.id),
                      label: `${item?.cekNo || "Çek"} - ${formatMoney(item?.tutar)}`,
                    })),
                  ]}
                />
              ) : null}
            </div>
            <div className="info-grid info-grid-3 mt-16">
              <div className="info-box">
                <span>Önceki Cari</span>
                <strong>{formatMoney(liveCariBefore)}</strong>
              </div>
              <div className="info-box">
                <span>Ödenen</span>
                <strong>{formatMoney(form.tutar)}</strong>
              </div>
              <div className="info-box">
                <span>Son Cari</span>
                <strong>{formatMoney(liveCariAfter)}</strong>
              </div>
            </div>
            <label className="check-row mt-12">
              <input
                type="checkbox"
                checked={form.haftaSonuHatirlat || isWeekendPayment}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    haftaSonuHatirlat: e.target.checked,
                  }))
                }
              />{" "}
              Hafta sonu / ileri tarih için hatırlat
            </label>
            <ActionBar>
              <button className="primary-btn" onClick={save}>
                <ErpIcon name="kaydet" size={16} />
                {form.id ? "Ödeme Güncelle" : "Ödeme Kaydet"}
              </button>
            </ActionBar>
          </div>
        </div>

        {deleteState.open ? (
          <div className="warning-box mt-16">
            <SectionHeader
              title="Ödeme Sil"
              subtitle="Önce yedek alınır, sonra ödeme ve bağlı hareket kalıcı silinir."
            />
            <div className="status-text">
              Firma: <strong>{deleteState.row.firma || "-"}</strong> | Tutar:{" "}
              {formatMoney(deleteState.row.tutar || 0)}
            </div>
            {deleteState.summary.breakdown ? (
              <div className="status-text mt-8">
                Bağlı hareket:{" "}
                {Number(deleteState.summary.breakdown.linkedMovements || 0)}
              </div>
            ) : null}
            <Input
              label="Admin Şifresi"
              type="password"
              value={deleteState.adminPassword}
              onChange={(e) =>
                setDeleteState((prev) => ({
                  ...prev,
                  adminPassword: e.target.value,
                }))
              }
            />
            <ActionBar>
              <button
                className="soft-btn"
                type="button"
                onClick={closeDeletePanel}
              >
                Vazgeç
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={deletePayment}
                disabled={deleteState.loading || deleteState.deleting}
              >
                Yedek al ve sil
              </button>
            </ActionBar>
          </div>
        ) : null}

        <details className="panel-block mt-16">
          <summary>Ödeme Türü Yönetimi</summary>
          <PaymentTypeManager
            rows={paymentTypes}
            busy={paymentTypeBusy}
            onSave={savePaymentType}
          />
        </details>

        <div className="table-wrap mt-16">
          <table className="table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Firma</th>
                <th>Bağlantı</th>
                <th>Tür</th>
                <th>Resmi</th>
                <th>Kart / Çek</th>
                <th>Tutar</th>
                <th>Cari</th>
                <th>Hatırlatma</th>
                <th>Açıklama</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item?.id}>
                  <td>{item?.tarih}</td>
                  <td>{item?.firma}</td>
                  <td>
                    {item.ownershipStatus === "MISSING_COMPANY_LINK"  (
                      <span className="warn-chip">Eksik firma bağlantısı</span>
                    ) : (
                      <span className="ok-chip">Bağlı</span>
                    )}
                  </td>
                  <td>{item?.odemeTuru}</td>
                  <td>
                    {item.resmiDurum === "GAYRI_RESMI" ? "Gayri" : "Resmi"}
                  </td>
                  <td>{item?.relatedCardName || item?.relatedCheckNo || "-"}</td>
                  <td>{formatMoney(item?.tutar)}</td>
                  <td>
                    {formatMoney(item?.cariOnce || 0)} →{" "}
                    <strong>{formatMoney(item?.cariSonra || 0)}</strong>
                  </td>
                  <td>
                    {item?.hatirlatmaTarihi ||
                      item?.odemeSozuTarihi ||
                      (item?.haftaSonuHatirlat ? "Hafta sonu" : "-")}
                  </td>
                  <td>{item?.aciklama || "-"}</td>
                  <td>
                    <button
                      className="soft-btn tiny-btn"
                      onClick={() => editPayment(item)}
                    >
                      Düzenle
                    </button>
                    <button
                      className="soft-btn tiny-btn"
                      onClick={() => openDeletePanel(item)}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

