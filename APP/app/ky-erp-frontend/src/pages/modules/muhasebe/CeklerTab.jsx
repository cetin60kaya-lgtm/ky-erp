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

const CHECK_MONTH_COLORS = [
  { tint: "#eff6ff", border: "#2563eb", text: "#1d4ed8" },
  { tint: "#f0fdf4", border: "#16a34a", text: "#166534" },
  { tint: "#fff7ed", border: "#ea580c", text: "#c2410c" },
  { tint: "#fdf2f8", border: "#db2777", text: "#be185d" },
  { tint: "#faf5ff", border: "#9333ea", text: "#7e22ce" },
  { tint: "#ecfeff", border: "#0891b2", text: "#0f766e" },
  { tint: "#fefce8", border: "#ca8a04", text: "#a16207" },
  { tint: "#fef2f2", border: "#dc2626", text: "#b91c1c" },
];

function getMonthKey(value) {
  return String(value || "").slice(0, 7);
}

function getMonthStyle(monthKey = "") {
  if (!monthKey) {
    return { tint: "#f8fafc", border: "#94a3b8", text: "#475569" };
  }
  let index = 0;
  for (const char of monthKey) index += char.charCodeAt(0);
  return CHECK_MONTH_COLORS[index % CHECK_MONTH_COLORS.length];
}

function getMonthLabel(value) {
  const monthKey = getMonthKey(value);
  if (!monthKey) return "Vadesiz";
  const date = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return monthKey;
  return new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function CeklerTab({
  activeMainCompany,
  companies,
  activeCompany,
  onCompanySelect,
  recentCompanies,
}) {
  const [rows, setRows] = useState([]);
  const [selectedCheckId, setSelectedCheckId] = useState("");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState({
    bugun: 0,
    yaklasan: 0,
    geciken: 0,
  });
  const [payments, setPayments] = useState([]);
  const [sortDir, setSortDir] = useState("asc");
  const [filter, setFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState("ALL");
  const [previewImage, setPreviewImage] = useState(null);
  const [form, setForm] = useState({
    id: "",
    firma: activeCompany || "",
    yon: "Alındı",
    banka: "",
    cekNo: "",
    kesideTarihi: new Date().toISOString().slice(0, 10),
    vadeTarihi: "",
    tutar: 0,
    aciklama: "",
    durum: "Portföyde",
    hesapNo: "",
    karsilikDurumu: "KONTROL",
    karsilikTutar: 0,
    odemeBaglantisi: "",
    relatedPaymentId: "",
    relatedPaymentNote: "",
    hatirlatmaTarihi: "",
    applyCari: false,
    onFoto: "",
    arkaFoto: "",
  });
  const [deleteState, setDeleteState] = useState({
    open: false,
    loading: false,
    deleting: false,
    row: null,
    summary: null,
    adminPassword: "",
  });
  const todayText = new Date().toISOString().slice(0, 10);

  async function load() {
    const cekler = await apiGet("/muhasebe/cekler", activeMainCompany);
    const nextRows = Array.isArray(cekler) ? cekler : [];
    setRows(nextRows);
    setSelectedCheckId((current) => {
      if (nextRows.some((item) => String(item?.id) === String(current))) {
        return current;
      }
      return nextRows[0].id ? String(nextRows[0].id) : "";
    });

    Promise.allSettled([
      apiGet("/muhasebe/cek-ozet", activeMainCompany),
      apiGet("/muhasebe/odemeler", activeMainCompany),
    ]).then(([ozetResult, odemelerResult]) => {
      if (ozetResult.status === "fulfilled") {
        setSummary(ozetResult.value || {});
      }
      if (odemelerResult.status === "fulfilled") {
        setPayments(
          Array.isArray(odemelerResult.value) ? odemelerResult.value : [],
        );
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => {
    if (!form.firma && activeCompany) {
      setForm((prev) => ({ ...prev, firma: activeCompany }));
    }
  }, [activeCompany, form.firma]);

  function resetForm(nextFirma = activeCompany || "") {
    setForm({
      id: "",
      firma: nextFirma,
      yon: "Alındı",
      banka: "",
      cekNo: "",
      kesideTarihi: new Date().toISOString().slice(0, 10),
      vadeTarihi: "",
      tutar: 0,
      aciklama: "",
      durum: "Portföyde",
      hesapNo: "",
      karsilikDurumu: "KONTROL",
      karsilikTutar: 0,
      odemeBaglantisi: "",
      relatedPaymentId: "",
      relatedPaymentNote: "",
      hatirlatmaTarihi: "",
      applyCari: false,
      onFoto: "",
      arkaFoto: "",
    });
    setSelectedCheckId("");
  }

  async function save() {
    if (!form.firma.trim()) {
      setMessage("Çek kaydı için firma seçimi zorunludur.");
      return;
    }
    if (!form.cekNo.trim()) {
      setMessage("Çek numarası zorunludur.");
      return;
    }
    const selectedPayment = payments.find(
      (item) => String(item?.id) === String(form.relatedPaymentId || ""),
    );
    try {
      const payload = {
        ...form,
        applyCari: Boolean(form.applyCari),
        cariyeIsle: Boolean(form.applyCari),
        odemeBaglantisi:
          form.odemeBaglantisi ||
          (selectedPayment
             `${selectedPayment.tarih || ""} ${selectedPayment.odemeTuru || ""} ${formatMoney(
                selectedPayment.tutar || 0,
              ? )}`.trim()
            : ""),
      };
      if (form.id) {
        await apiPatch(
          `/muhasebe/cekler/${encodeURIComponent(form.id)}`,
          payload,
          activeMainCompany,
        );
      } else {
        await apiPost("/muhasebe/cekler", payload, activeMainCompany);
      }
      onCompanySelect(form.firma);
      setMessage(form.id ? "Çek güncellendi." : "Çek kaydedildi.");
      resetForm(form.firma);
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  function editCheck(row) {
    setSelectedCheckId(String(row?.id || ""));
    setForm({
      id: row?.id,
      firma: row?.firma || "",
      yon: row?.yon || "Alındı",
      banka: row?.banka || "",
      cekNo: row?.cekNo || "",
      kesideTarihi: row?.kesideTarihi || new Date().toISOString().slice(0, 10),
      vadeTarihi: row?.vadeTarihi || "",
      tutar: Number(row?.tutar || 0),
      aciklama: row?.aciklama || "",
      durum: row?.durum || "Portföyde",
      hesapNo: row?.hesapNo || "",
      karsilikDurumu: row?.karsilikDurumu || "KONTROL",
      karsilikTutar: Number(row?.karsilikTutar || 0),
      odemeBaglantisi: row?.odemeBaglantisi || "",
      relatedPaymentId: row?.relatedPaymentId
         ? String(row?.relatedPaymentId)
        : "",
      relatedPaymentNote: row?.relatedPaymentNote || "",
      hatirlatmaTarihi: row?.hatirlatmaTarihi || "",
      applyCari: row?.applyCari !== false,
      onFoto: row?.onFoto || "",
      arkaFoto: row?.arkaFoto || "",
    });
    setMessage("Çek düzenleme formu açıldı.");
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
        `/muhasebe/cekler/${encodeURIComponent(row?.id)}/delete-check`,
        activeMainCompany,
      );
      setDeleteState((prev) => ({ ...prev, loading: false, summary }));
    } catch (e) {
      setDeleteState((prev) => ({ ...prev, loading: false }));
      setMessage(e.message || "Çek silme özeti alınamadı.");
    }
  }

  async function deleteCheck() {
    if (!deleteState.row.id) {
      setMessage("Silinecek çek bulunamadı.");
      return;
    }
    if (!String(deleteState.adminPassword || "").trim()) {
      setMessage("Çek silme için admin şifresi zorunludur.");
      return;
    }
    setDeleteState((prev) => ({ ...prev, deleting: true }));
    try {
      const response = await apiPost(
        `/muhasebe/cekler/${encodeURIComponent(deleteState.row.id)}/delete`,
        { adminPassword: deleteState.adminPassword },
        activeMainCompany,
      );
      await load();
      setMessage(response.message || "Çek silindi.");
      closeDeletePanel();
    } catch (e) {
      setDeleteState((prev) => ({ ...prev, deleting: false }));
      setMessage(e.message || "Çek silinemedi.");
    }
  }

  function getCheckQuickFilter(row) {
    const due = String(row?.vadeTarihi || "").slice(0, 10);
    const status = String(row?.durum || "").toLocaleLowerCase("tr-TR");
    const diffText = due ? due : "";
    const isClosed = ["kapandı", "tahsil", "ödendi"].includes(status);
    const dayDiff = due
       Math.floor(
          (new Date(`${due}T00:00:00`).getTime() -
            new Date(`${todayText}T00:00:00`).getTime()) /
            86400000,
        ? )
      : Number.POSITIVE_INFINITY;

    return {
      isToday: due === todayText,
      isUpcoming: !isClosed && dayDiff >= 0 && dayDiff <= 15,
      isUpcoming7: !isClosed && dayDiff >= 0 && dayDiff <= 7,
      isOverdue: !isClosed && due && due < todayText,
      isPortfolio: status === "portföyde",
      dueText: diffText,
    };
  }

  const visible = useMemo(() => {
    const filtered = rows.filter((x) => {
      const text =
        `${x.firma || ""} ${x.cekNo} ${x.banka} ${x.aciklama || ""} ${
          x.odemeBaglantisi || ""
        }`.toLocaleLowerCase("tr-TR");
      if (!text.includes(filter.toLocaleLowerCase("tr-TR"))) return false;

      const quick = getCheckQuickFilter(x);
      if (quickFilter === "TODAY") return quick.isToday;
      if (quickFilter === "UPCOMING") return quick.isUpcoming;
      if (quickFilter === "OVERDUE") return quick.isOverdue;
      if (quickFilter === "PORTFOLIO") return quick.isPortfolio;
      if (quickFilter === "UPCOMING7") return quick.isUpcoming7;
      return true;
    });
    return filtered.sort((a, b) =>
      sortDir === "asc"
         ? a.vadeTarihi.localeCompare(b.vadeTarihi)
        : b.vadeTarihi.localeCompare(a.vadeTarihi),
    );
  }, [rows, filter, sortDir, quickFilter]);
  const totalTutar = visible.reduce(
    (sum, item) => sum + Number(item?.tutar || 0),
    0,
  );
  const selectedRow = visible.find(
    (item) => String(item?.id) === String(selectedCheckId),
  );
  const karsilikToplam = visible.reduce(
    (sum, item) => sum + Number(item?.karsilikTutar || 0),
    0,
  );
  const upcomingChecks = visible.filter(
    (item) =>
      item?.vadeTarihi &&
      item?.vadeTarihi >= todayText &&
      item?.durum !== "Kapandı",
  );
  const hasQuickFilter = quickFilter !== "ALL";
  const monthlyBuckets = useMemo(() => {
    const bucketMap = new Map();
    visible.forEach((item) => {
      const monthKey = getMonthKey(item?.vadeTarihi);
      const current = bucketMap.get(monthKey) || {
        monthKey,
        label: getMonthLabel(item?.vadeTarihi),
        count: 0,
        total: 0,
      };
      current.count += 1;
      current.total += Number(item?.tutar || 0);
      bucketMap.set(monthKey, current);
    });
    return [...bucketMap.values()].sort((left, right) =>
      String(left.monthKey || "9999-99").localeCompare(
        String(right.monthKey || "9999-99"),
        "tr",
      ),
    );
  }, [visible]);

  function toggleQuickFilter(nextFilter) {
    setQuickFilter((current) => (current === nextFilter ? "ALL" : nextFilter));
  }

  function setCheckImage(side, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((p) => ({ ...p, [side]: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  }

  function checkDueText(row) {
    if (!row?.vadeTarihi) return "-";
    if (row?.vadeTarihi < todayText && row?.durum !== "Kapandı")
      return "Gecikmiş";
    if (row.vadeTarihi === todayText) return "Bugün";
    return row?.vadeTarihi;
  }

  const paymentOptionsForCheck = [
    { value: "", label: "Bağlı ödeme seçme" },
    ...payments
      .filter((item) => !form.firma || item.firma === form.firma)
      .slice(0, 200)
      .map((item) => ({
        value: String(item?.id),
        label: `${item?.tarih || "-"} - ${item?.odemeTuru || "Ödeme"} - ${formatMoney(
          item?.tutar || 0,
        )}`,
      })),
  ];

  return (
    <div className="content-grid muhasebe-page">
      <MuhasebePageHeader
        title={tr.cekler}
        subtitle="Alındı/verildi çek kayıtlarını vade özetleriyle birlikte yönetin ve listeyi tek ekranda takip edin."
      />
      <div className="content-card muhasebe-page-body">
        {message ? <div className="notice-box">{message}</div> : null}

        <div className="info-grid info-grid-7">
          <MetricBox
            icon="takvim"
            label="Bugün Vadeli"
            value={summary.bugun || 0}
            subText="Bugün vadesi gelen"
            tone="blue"
            onClick={() => toggleQuickFilter("TODAY")}
            active={quickFilter === "TODAY"}
          />
          <MetricBox
            icon="vade"
            label="Yaklaşan"
            value={summary.yaklasan || 0}
            subText="Vadesi yaklaşan"
            tone="green"
            onClick={() => toggleQuickFilter("UPCOMING")}
            active={quickFilter === "UPCOMING"}
          />
          <MetricBox
            icon="uyari"
            label="Geciken"
            value={summary.geciken || 0}
            subText="Vadesi geçmiş"
            tone="red"
            onClick={() => toggleQuickFilter("OVERDUE")}
            active={quickFilter === "OVERDUE"}
          />
          <MetricBox
            icon="cekler"
            label="Portföy"
            value={rows.length}
            subText="Kayıtlı çek"
            tone="purple"
            onClick={() => toggleQuickFilter("PORTFOLIO")}
            active={quickFilter === "PORTFOLIO"}
          />
          <MetricBox
            icon="saat"
            label="Vadesi Yaklaşan"
            value={upcomingChecks.length}
            subText="7 gün içinde"
            tone="orange"
            onClick={() => toggleQuickFilter("UPCOMING7")}
            active={quickFilter === "UPCOMING7"}
          />
          <MetricBox
            icon="cari-kasa"
            label="Toplam Tutar"
            value={formatMoney(totalTutar)}
            subText="Çek toplamı"
            tone="blue"
          />
          <MetricBox
            icon="onay"
            label="Karşılık"
            value={formatMoney(karsilikToplam)}
            subText="Toplam karşılık"
            tone="green"
          />
        </div>

        <div
          className="panel-block mt-16"
          style={{ padding: 12, background: "#f8fafc" }}
        >
          <div className="status-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
            {monthlyBuckets.length ? (
              monthlyBuckets.map((bucket) => {
                const monthStyle = getMonthStyle(bucket.monthKey);
                return (
                  <button
                    key={bucket.monthKey || "vadesiz"}
                    className="soft-btn tiny-btn"
                    type="button"
                    onClick={() => setFilter(bucket.monthKey || "")}
                    style={{
                      background: monthStyle.tint,
                      borderColor: monthStyle.border,
                      color: monthStyle.text,
                    }}
                  >
                    {bucket.label}: {bucket.count} / {formatMoney(bucket.total)}
                  </button>
                );
              })
            ) : (
              <span className="status-text">
                Ay bazlı çek görünümü için kayıt yok.
              </span>
            )}
          </div>
        </div>

        <div className="panel-block mt-16">
          <h4>{form.id ? "Çek Güncelle" : "Çek Kayıt Kartı"}</h4>
          <div
            className="status-toolbar mt-12"
            style={{ flexWrap: "wrap", gap: 12 }}
          >
            <span className="status-text">
              Seçili çek: {selectedRow.firma || form.firma || "-"} /{" "}
              {selectedRow.cekNo || form.cekNo || "-"}
            </span>
            <span className="status-text">
              Cari işleme: {form.applyCari ? "İşlenecek" : "İşlenmeyecek"}
            </span>
            <span className="status-text">
              Ay grubu:{" "}
              {getMonthLabel(selectedRow.vadeTarihi || form.vadeTarihi)}
            </span>
          </div>
          {hasQuickFilter ? (
            <div className="status-toolbar mt-12">
              <span className="status-text">
                Hızlı filtre aktif:{" "}
                {quickFilter === "TODAY"
                   ? "Bugün vadeli"
                  : quickFilter === "UPCOMING"
                     ? "Vadesi yaklaşan"
                    : quickFilter === "OVERDUE"
                       ? "Geciken"
                      : quickFilter === "PORTFOLIO"
                         ? "Portföy"
                        : "7 gün içinde vadesi yaklaşan"}
              </span>
              <button
                className="soft-btn tiny-btn"
                type="button"
                onClick={() => setQuickFilter("ALL")}
              >
                Filtreyi Temizle
              </button>
            </div>
          ) : null}
          <div className="form-grid mt-12">
            <CompanyQuickPicker
              label="Bağlı Firma"
              companies={companies}
              value={form.firma}
              recentCompanies={recentCompanies}
              onChange={(name) => {
                setForm((p) => ({ ...p, firma: name }));
                onCompanySelect(name);
              }}
            />
            <Select
              label="Yön"
              value={form.yon}
              onChange={(e) => setForm((p) => ({ ...p, yon: e.target.value }))}
              options={["Alındı", "Verildi"]}
            />
            <Input
              label="Banka"
              value={form.banka}
              onChange={(e) =>
                setForm((p) => ({ ...p, banka: e.target.value }))
              }
            />
            <Input
              label="Çek No"
              value={form.cekNo}
              onChange={(e) =>
                setForm((p) => ({ ...p, cekNo: e.target.value }))
              }
            />
            <Input
              label="Keşide Tarihi"
              type="date"
              value={form.kesideTarihi}
              onChange={(e) =>
                setForm((p) => ({ ...p, kesideTarihi: e.target.value }))
              }
            />
            <Input
              label="Vade Tarihi"
              type="date"
              value={form.vadeTarihi}
              onChange={(e) =>
                setForm((p) => ({ ...p, vadeTarihi: e.target.value }))
              }
            />
            <Input
              label="Hesap No"
              value={form.hesapNo}
              onChange={(e) =>
                setForm((p) => ({ ...p, hesapNo: e.target.value }))
              }
            />
            <MoneyInput
              label="Çek Tutarı"
              value={form.tutar}
              onValueChange={(v) => setForm((p) => ({ ...p, tutar: v }))}
            />
            <Select
              label="Durum"
              value={form.durum}
              onChange={(e) =>
                setForm((p) => ({ ...p, durum: e.target.value }))
              }
              options={["Portföyde", "Tahsil", "Ciro", "İade", "Kapandı"]}
            />
            <Select
              label="Karşılık"
              value={form.karsilikDurumu}
              onChange={(e) =>
                setForm((p) => ({ ...p, karsilikDurumu: e.target.value }))
              }
              options={[
                { value: "KONTROL", label: "Kontrol edilecek" },
                { value: "VAR", label: "Karşılığı var" },
                { value: "KISMEN", label: "Kısmen var" },
                { value: "YOK", label: "Karşılığı yok" },
              ]}
            />
            <MoneyInput
              label="Karşılık Tutarı"
              value={form.karsilikTutar}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, karsilikTutar: v }))
              }
            />
            <Select
              label="Bağlı Ödeme"
              value={form.relatedPaymentId}
              onChange={(e) =>
                setForm((p) => ({ ...p, relatedPaymentId: e.target.value }))
              }
              options={paymentOptionsForCheck}
            />
            <Input
              label="Ödeme / Borç Notu"
              value={form.relatedPaymentNote}
              onChange={(e) =>
                setForm((p) => ({ ...p, relatedPaymentNote: e.target.value }))
              }
              placeholder="Hangi ödeme, fatura veya borç için"
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
              label="Liste Filtresi"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <label className="check-row mt-12">
            <input
              type="checkbox"
              checked={Boolean(form.applyCari)}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, applyCari: e.target.checked }))
              }
            />
            <span>
              Bu çeki cariye işle
              <span className="row-meta" style={{ display: "block" }}>
                Kapatılırsa çek sadece portföy/listede kalır, cari hareket
                açılmaz.
              </span>
            </span>
          </label>

          <Textarea
            label="Açıklama (zorunlu)"
            value={form.aciklama}
            onChange={(e) =>
              setForm((p) => ({ ...p, aciklama: e.target.value }))
            }
          />

          <div className="info-grid info-grid-2 mt-16">
            <div className="panel-block">
              <h4>Ön Görsel</h4>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setCheckImage("onFoto", e.target.files?.[0])}
              />
              {form.onFoto ? (
                <img
                  className="muhasebe-check-preview"
                  src={form.onFoto}
                  alt="Çek ön yüz"
                />
              ) : (
                <div className="status-text">Ön yüz görseli eklenmedi.</div>
              )}
            </div>
            <div className="panel-block">
              <h4>Arka Görsel</h4>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setCheckImage("arkaFoto", e.target.files?.[0])}
              />
              {form.arkaFoto ? (
                <img
                  className="muhasebe-check-preview"
                  src={form.arkaFoto}
                  alt="Çek arka yüz"
                />
              ) : (
                <div className="status-text">Arka yüz görseli eklenmedi.</div>
              )}
            </div>
          </div>

          <ActionBar>
            <button
              className="soft-btn"
              onClick={() => setSortDir((x) => (x === "asc" ? "desc" : "asc"))}
            >
              <ErpIcon name="saat" size={16} />
              Vade Sırası: {sortDir === "asc" ? "Artan" : "Azalan"}
            </button>
            <button
              className="soft-btn"
              type="button"
              onClick={() => resetForm(form.firma)}
            >
              <ErpIcon name="artı" size={16} />
              Yeni Kayıt
            </button>
            <button className="primary-btn" onClick={save}>
              <ErpIcon name="kaydet" size={16} />
              {form.id ? "Çek Güncelle" : "Çek Kaydet"}
            </button>
          </ActionBar>
        </div>

        {deleteState.open ? (
          <div className="warning-box mt-16">
            <SectionHeader
              title="Çek Sil"
              subtitle="Önce yedek alınır, sonra çek ve bağlı hareketler kalıcı silinir."
            />
            <div className="status-text">
              Çek No: <strong>{deleteState.row.cekNo || "-"}</strong> | Firma:{" "}
              {deleteState.row.firma || "-"}
            </div>
            <div className="status-text">
              Vade: {deleteState.row.vadeTarihi || "-"} | Tutar:{" "}
              {formatMoney(deleteState.row.tutar || 0)}
            </div>
            {deleteState.summary.breakdown ? (
              <div className="status-text mt-8">
                Bağlı ödeme:{" "}
                {Number(deleteState.summary.breakdown.linkedPayments || 0)}
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
                onClick={deleteCheck}
                disabled={deleteState.loading || deleteState.deleting}
              >
                Yedek al ve sil
              </button>
            </ActionBar>
          </div>
        ) : null}

        <div className="table-wrap mt-16">
          <table className="table">
            <thead>
              <tr>
                <th>Firma</th>
                <th>Banka</th>
                <th>Çek No</th>
                <th>Hesap</th>
                <th>Vade</th>
                <th>Tutar</th>
                <th>Karşılık</th>
                <th>Bağlantı</th>
                <th>Durum</th>
                <th>Görsel</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr
                  key={item?.id}
                  onClick={() => editCheck(item)}
                  style={(() => {
                    const isSelected =
                      String(item.id) === String(selectedCheckId);
                    const monthStyle = getMonthStyle(
                      getMonthKey(item?.vadeTarihi),
                    );
                    return {
                      cursor: "pointer",
                      background: isSelected ? monthStyle.tint : "#fff",
                      boxShadow: isSelected
                         ? `inset 4px 0 0 ${monthStyle.border}`
                        : "inset 0 0 0 transparent",
                    };
                  })()}
                >
                  <td>{item?.firma || "-"}</td>
                  <td>{item?.banka}</td>
                  <td>{item?.cekNo}</td>
                  <td>{item?.hesapNo || "-"}</td>
                  <td>
                    <div
                      className="warn-chip"
                      style={{
                        display: "inline-flex",
                        marginBottom: 6,
                        background: getMonthStyle(getMonthKey(item?.vadeTarihi))
                          .tint,
                        color: getMonthStyle(getMonthKey(item?.vadeTarihi)).text,
                        borderColor: getMonthStyle(getMonthKey(item?.vadeTarihi))
                          .border,
                      }}
                    >
                      {getMonthLabel(item?.vadeTarihi)}
                    </div>
                    <strong>{checkDueText(item)}</strong>
                    <div className="row-meta">{item?.vadeTarihi || "-"}</div>
                  </td>
                  <td>{formatMoney(item?.tutar)}</td>
                  <td>
                    {item?.karsilikDurumu || "KONTROL"}
                    <div className="row-meta">
                      {formatMoney(item?.karsilikTutar || 0)}
                    </div>
                  </td>
                  <td>
                    {item.ownershipStatus === "MISSING_COMPANY_LINK"  (
                      <span className="warn-chip">Eksik firma bağlantısı</span>
                    ) : (
                      <span className="ok-chip">Bağlı</span>
                    )}
                    <div className="row-meta">
                      {item.applyCari === false
                         ? "Cari işlenmez"
                        : "Cariye işlenir"}
                    </div>
                    <div className="row-meta">
                      {item?.odemeBaglantisi ||
                        item?.relatedPaymentNote ||
                        item?.relatedPaymentId ||
                        "-"}
                    </div>
                  </td>
                  <td>{item?.durum}</td>
                  <td>
                    <div className="check-image-cell">
                      {item?.onFoto ? (
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          onClick={(event) => {
                            event?.stopPropagation();
                            setPreviewImage({
                              src: item?.onFoto,
                              alt: `${item?.firma || "Çek"} ön yüz`,
                              title: `${item?.cekNo || "Çek"} - Ön yüz`,
                            });
                          }}
                        >
                          Ön
                        </button>
                      ) : null}
                      {item?.arkaFoto ? (
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          onClick={(event) => {
                            event?.stopPropagation();
                            setPreviewImage({
                              src: item?.arkaFoto,
                              alt: `${item?.firma || "Çek"} arka yüz`,
                              title: `${item?.cekNo || "Çek"} - Arka yüz`,
                            });
                          }}
                        >
                          Arka
                        </button>
                      ) : null}
                      {!item?.onFoto && !item?.arkaFoto ? <span>-</span> : null}
                    </div>
                  </td>
                  <td>
                    <button
                      className="soft-btn tiny-btn"
                      onClick={(event) => {
                        event?.stopPropagation();
                        editCheck(item);
                      }}
                    >
                      <ErpIcon name="duzenle" size={15} />
                      {item?.yon} / Düzenle
                    </button>
                    <button
                      className="soft-btn tiny-btn"
                      onClick={(event) => {
                        event?.stopPropagation();
                        openDeletePanel(item);
                      }}
                    >
                      <ErpIcon name="sil" size={15} />
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {previewImage.src ? (
          <div className="panel-block mt-16">
            <SectionHeader
              title={previewImage.title || "Çek Görseli"}
              subtitle="Seçilen çek görsel önizlemesi"
              right={
                <button
                  className="soft-btn tiny-btn"
                  type="button"
                  onClick={() => setPreviewImage(null)}
                >
                  Kapat
                </button>
              }
            />
            <img
              className="muhasebe-check-preview muhasebe-check-preview-large"
              src={previewImage.src}
              alt={previewImage.alt || "Çek görseli"}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
