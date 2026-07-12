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

export function KrediKartlariTab({
  activeMainCompany,
  companies,
  activeCompany,
  onCompanySelect,
  recentCompanies,
}) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    id: "",
    firma: activeCompany || "",
    kartAdi: "",
    banka: "",
    kartSahibi: "",
    son4Hane: "",
    hesapNo: "",
    aciklama: "",
    not: "",
    sonOdemeTarihi: "",
    toplamBorc: 0,
    asgariOdeme: 0,
    kullanimAmaci: "",
    donem: "",
    aktif: true,
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
    setRows(await apiGet("/muhasebe/kredi-kartlari", activeMainCompany));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  async function save() {
    if (!form.firma.trim()) {
      setMessage("Kredi kartı kaydı için firma seçimi zorunludur.");
      return;
    }
    try {
      await apiPost("/muhasebe/kredi-kartlari", form, activeMainCompany);
      onCompanySelect(form.firma);
      setMessage(
        form.id ? "Kredi kartı güncellendi." : "Kredi kartı kaydedildi.",
      );
      setForm((p) => ({
        ...p,
        id: "",
        kartAdi: "",
        banka: "",
        kartSahibi: "",
        son4Hane: "",
        hesapNo: "",
        aciklama: "",
        not: "",
        sonOdemeTarihi: "",
        toplamBorc: 0,
        asgariOdeme: 0,
        kullanimAmaci: "",
        donem: "",
      }));
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  function editCard(row) {
    setForm({
      id: row?.id,
      firma: row?.firma || "",
      kartAdi: row?.kartAdi || "",
      banka: row?.banka || "",
      kartSahibi: row?.kartSahibi || "",
      son4Hane: row?.son4Hane || "",
      hesapNo: row?.hesapNo || "",
      aciklama: row?.aciklama || "",
      not: row?.not || "",
      sonOdemeTarihi: row?.sonOdemeTarihi || "",
      toplamBorc: Number(row?.toplamBorc || 0),
      asgariOdeme: Number(row?.asgariOdeme || 0),
      kullanimAmaci: row?.kullanimAmaci || "",
      donem: row?.donem || "",
      aktif: row?.aktif !== false,
    });
    setMessage("Kredi kartı düzenleme formu açıldı.");
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
        `/muhasebe/kredi-kartlari/${encodeURIComponent(row?.id)}/delete-check`,
        activeMainCompany,
      );
      setDeleteState((prev) => ({ ...prev, loading: false, summary }));
    } catch (e) {
      setDeleteState((prev) => ({ ...prev, loading: false }));
      setMessage(e.message || "Kredi kartı silme özeti alınamadı.");
    }
  }

  async function deleteCard() {
    if (!deleteState.row.id) {
      setMessage("Silinecek kredi kartı bulunamadı.");
      return;
    }
    if (!String(deleteState.adminPassword || "").trim()) {
      setMessage("Kredi kartı silme için admin şifresi zorunludur.");
      return;
    }
    setDeleteState((prev) => ({ ...prev, deleting: true }));
    try {
      const response = await apiPost(
        `/muhasebe/kredi-kartlari/${encodeURIComponent(deleteState.row.id)}/delete`,
        { adminPassword: deleteState.adminPassword },
        activeMainCompany,
      );
      await load();
      setMessage(response.message || "Kredi kartı silindi.");
      closeDeletePanel();
    } catch (e) {
      setDeleteState((prev) => ({ ...prev, deleting: false }));
      setMessage(e.message || "Kredi kartı silinemedi.");
    }
  }

  const visible = rows.filter((x) => {
    const txt =
      `${x.kartAdi} ${x.banka} ${x.son4Hane} ${x.aciklama || ""}`.toLocaleLowerCase(
        "tr-TR",
      );
    return txt.includes(filter.toLocaleLowerCase("tr-TR"));
  });
  const summary = rows.reduce(
    (acc, item) => {
      acc.total += 1;
      acc.toplamBorc += Number(item?.toplamBorc || 0);
      acc.asgari += Number(item?.asgariOdeme || 0);
      if (item.sonOdemeTarihi) acc.sonOdeme += 1;
      return acc;
    },
    { total: 0, toplamBorc: 0, asgari: 0, sonOdeme: 0 },
  );

  return (
    <div className="content-grid muhasebe-page">
      <MuhasebePageHeader
        title={tr.krediKartlari}
        subtitle="Kart tanımı, borç/asgari takibi ve kayıt listesi aynı düzen içinde firma bağlantısıyla yönetilir."
      />
      <div className="content-card muhasebe-page-body">
        {message ? <div className="notice-box">{message}</div> : null}
        <div className="info-grid info-grid-4">
          <MetricBox
            icon="kredi-kartlari"
            label="Kart"
            value={summary.total}
            subText="Aktif kart sayısı"
            tone="blue"
          />
          <MetricBox
            icon="cari-kasa"
            label="Toplam Borç"
            value={formatMoney(summary.toplamBorc)}
            subText="Kart borcu toplamı"
            tone="green"
          />
          <MetricBox
            icon="kdv"
            label="Asgari"
            value={formatMoney(summary.asgari)}
            subText="Asgari ödeme"
            tone="orange"
          />
          <MetricBox
            icon="takvim"
            label="Son Ödeme Yaklaşan"
            value={summary.sonOdeme}
            subText="Takipteki kart"
            tone="red"
          />
        </div>

        <div className="panel-block mt-16">
          <h4>Kredi Kartı Giriş / Düzenleme</h4>
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
            <Input
              label="Kart Adı"
              value={form.kartAdi}
              onChange={(e) =>
                setForm((p) => ({ ...p, kartAdi: e.target.value }))
              }
            />
            <Input
              label="Banka"
              value={form.banka}
              onChange={(e) =>
                setForm((p) => ({ ...p, banka: e.target.value }))
              }
            />
            <Input
              label="Kart Üzerindeki İsim Soyisim"
              value={form.kartSahibi}
              onChange={(e) =>
                setForm((p) => ({ ...p, kartSahibi: e.target.value }))
              }
            />
            <Input
              label="Son 4 Hane"
              value={form.son4Hane}
              onChange={(e) =>
                setForm((p) => ({ ...p, son4Hane: e.target.value }))
              }
            />
            <Input
              label="Hesap No / Kart No Referansı"
              value={form.hesapNo}
              onChange={(e) =>
                setForm((p) => ({ ...p, hesapNo: e.target.value }))
              }
            />
            <Input
              label="Son Ödeme Tarihi"
              type="date"
              value={form.sonOdemeTarihi}
              onChange={(e) =>
                setForm((p) => ({ ...p, sonOdemeTarihi: e.target.value }))
              }
            />
            <MoneyInput
              label="Toplam Borç"
              value={form.toplamBorc}
              onValueChange={(v) => setForm((p) => ({ ...p, toplamBorc: v }))}
            />
            <MoneyInput
              label="Asgari"
              value={form.asgariOdeme}
              onValueChange={(v) => setForm((p) => ({ ...p, asgariOdeme: v }))}
            />
            <Input
              label="Dönem"
              value={form.donem}
              onChange={(e) =>
                setForm((p) => ({ ...p, donem: e.target.value }))
              }
            />
            <Input
              label="Kullanım Amacı"
              value={form.kullanimAmaci}
              onChange={(e) =>
                setForm((p) => ({ ...p, kullanimAmaci: e.target.value }))
              }
            />
            <Input
              label="Açıklama"
              value={form.aciklama}
              onChange={(e) =>
                setForm((p) => ({ ...p, aciklama: e.target.value }))
              }
            />

            <Input
              label="Not"
              value={form.not}
              onChange={(e) => setForm((p) => ({ ...p, not: e.target.value }))}
            />
            <Input
              label="Kart Filtresi"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
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
              <ErpIcon name="kaydet" size={16} />
              Kredi Kartı Kaydet
            </button>
          </ActionBar>
        </div>

        {deleteState.open ? (
          <div className="warning-box mt-16">
            <SectionHeader
              title="Kredi Kartı Sil"
              subtitle="Önce yedek alınır, sonra kart ve bağlı ödemeler kalıcı silinir."
            />
            <div className="status-text">
              Kart: <strong>{deleteState.row.kartAdi || "-"}</strong> | Son 4:{" "}
              {deleteState.row.son4Hane || "-"}
            </div>
            <div className="status-text">
              Firma: {deleteState.row.firma || "-"} | Toplam borç:{" "}
              {formatMoney(deleteState.row.toplamBorc || 0)}
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
                onClick={deleteCard}
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
                <th>Kart Adı</th>
                <th>İsim Soyisim</th>
                <th>Son 4</th>
                <th>Hesap No</th>
                <th>Toplam Borç</th>
                <th>Asgari</th>
                <th>Son Ödeme Tarihi</th>
                <th>Dönem</th>
                <th>Bağlantı</th>
                <th>Kullanım</th>
                <th>Aktif/Pasif</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item?.id}>
                  <td>{item?.firma || "-"}</td>
                  <td>{item?.banka}</td>
                  <td>{item?.kartAdi}</td>
                  <td>{item?.kartSahibi || "-"}</td>
                  <td>{item?.son4Hane || "-"}</td>
                  <td>{item?.hesapNo || "-"}</td>
                  <td>{formatMoney(item?.toplamBorc || 0)}</td>
                  <td>{formatMoney(item?.asgariOdeme || 0)}</td>
                  <td>{item?.sonOdemeTarihi || "-"}</td>
                  <td>{item?.donem || "-"}</td>
                  <td>
                    {item.ownershipStatus === "MISSING_COMPANY_LINK"  (
                      <span className="warn-chip">Eksik firma bağlantısı</span>
                    ) : (
                      <span className="ok-chip">Bağlı</span>
                    )}
                  </td>
                  <td>{item?.kullanimAmaci || item?.aciklama || "-"}</td>
                  <td>{item?.aktif !== false ? "Aktif" : "Pasif"}</td>
                  <td>
                    <button
                      className="soft-btn tiny-btn"
                      onClick={() => editCard(item)}
                    >
                      <ErpIcon name="duzenle" size={15} />
                      Düzenle
                    </button>
                    <button
                      className="soft-btn tiny-btn"
                      onClick={() => openDeletePanel(item)}
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
      </div>
    </div>
  );
}

