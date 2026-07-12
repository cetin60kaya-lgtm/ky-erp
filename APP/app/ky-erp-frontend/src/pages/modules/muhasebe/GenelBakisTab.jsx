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

export function GenelBakisTab({ activeMainCompany, openModule }) {
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState("");

  function shortDate(value) {
    if (!value) return "-";
    const date = new Date(String(value).slice(0, 10));
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return new Intl.DateTimeFormat("tr-TR").format(date);
  }

  function go(tabKey) {
    if (openModule) openModule("muhasebe", { tabKey });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiGet(
          "/muhasebe/dashboard-summary",
          activeMainCompany,
        );
        if (!cancelled) setSummary(data);
      } catch (endpointError) {
        try {
          const [companies, cari, payments, checks, cards, docs, logs] =
            await Promise.all([
              apiGet("/muhasebe/firma-kartlari", activeMainCompany),
              apiGet("/muhasebe/cari-kasa", activeMainCompany),
              apiGet("/muhasebe/odemeler", activeMainCompany),
              apiGet("/muhasebe/cekler", activeMainCompany),
              apiGet("/muhasebe/kredi-kartlari", activeMainCompany),
              apiGet("/muhasebe/belgeler", activeMainCompany),
              apiGet("/muhasebe/activity-logslimit=8", activeMainCompany),
            ]);
          const now = new Date();
          const month = now.toISOString().slice(0, 7);
          const upcomingChecks = (Array.isArray(checks) ? checks : []).filter(
            (row) => {
              const due = new Date(row?.vadeTarihi);
              if (Number.isNaN(due.getTime())) return false;
              const diff = (due.getTime() - now.getTime()) / 86400000;
              return diff >= 0 && diff <= 15;
            },
          );
          const openDocs = (Array.isArray(docs) ? docs : []).filter(
            (row) =>
              String(row?.status || "").toLocaleUpperCase("tr-TR") !==
              "ONAYLANDI",
          );
          if (!cancelled) {
            setSummary({
              kpis: {
                totalBalance: (Array.isArray(cari) ? cari : []).reduce(
                  (sum, row) => sum + Number(row?.bakiye || 0),
                  0,
                ),
                monthlyPayments: (Array.isArray(payments) ? payments : [])
                  .filter((row) => String(row?.tarih || "").startsWith(month))
                  .reduce((sum, row) => sum + Number(row?.tutar || 0), 0),
                upcomingChecksAmount: upcomingChecks.reduce(
                  (sum, row) => sum + Number(row?.tutar || 0),
                  0,
                ),
                creditCardDebt: (Array.isArray(cards) ? cards : []).reduce(
                  (sum, row) => sum + Number(row?.toplamBorc || 0),
                  0,
                ),
                openDocuments: openDocs.length,
                criticalReminder: upcomingChecks.length,
              },
              companies: Array.isArray(companies) ? companies : [],
              cari: Array.isArray(cari) ? cari : [],
              checks: Array.isArray(checks) ? checks : [],
              creditCards: Array.isArray(cards) ? cards : [],
              documents: Array.isArray(docs) ? docs : [],
              activityLogs: Array.isArray(logs) ? logs : [],
            });
          }
        } catch (fallbackError) {
          if (!cancelled)
            setMessage(fallbackError.message || endpointError.message);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeMainCompany]);

  const kpis = summary.kpis || {};
  const cariRows = (summary.cari || []).slice(0, 5);
  const checkRows = (summary.checks || []).slice(0, 5);
  const docRows = (summary.documents || []).slice(0, 5);
  const logRows = (summary.activityLogs || []).slice(0, 8);

  return (
    <AccountingPageShell
      title={tr.genelBakis}
      subtitle="Yönetici önizleme ve kritik göstergeler."
      breadcrumb={["KY ERP", "Muhasebe", "Genel Bakış"]}
    >
      {message ? <div className="warning-box">{message}</div> : null}
      <div className="kyerp-grid kpi-grid">
        <KpiCard
          icon="cari-kasa"
          label="Toplam Cari Bakiye"
          value={formatMoney(kpis.totalBalance || 0)}
          subText="Güncel bakiye"
          tone="blue"
        />
        <KpiCard
          icon="odemeler"
          label="Bu Ay Ödemeler"
          value={formatMoney(kpis.monthlyPayments || 0)}
          subText="Ay içi işlem toplamı"
          tone="green"
        />
        <KpiCard
          icon="saat"
          label="Yaklaşan Çekler"
          value={formatMoney(kpis.upcomingChecksAmount || 0)}
          subText="15 gün içinde"
          tone="orange"
        />
        <KpiCard
          icon="kredi-kartlari"
          label="Kredi Kartı Borcu"
          value={formatMoney(kpis.creditCardDebt || 0)}
          subText="Aktif kart borçları"
          tone="purple"
        />
        <KpiCard
          icon="belge"
          label="Açık Belgeler"
          value={kpis.openDocuments || 0}
          subText="Taslak / onay bekleyen"
          tone="green"
        />
        <KpiCard
          icon="uyari"
          label="Kritik Hatırlatma"
          value={kpis.criticalReminder || 0}
          subText="Bugün ve yaklaşan"
          tone="red"
        />
      </div>

      <div className="kyerp-dashboard-grid mt-16">
        <SectionCard
          title="Cari Önizleme"
          icon="goruntule"
          actions={
            <IconButton
              icon="goruntule"
              label="Tümünü Gör"
              onClick={() => go("cari-kasa")}
            />
          }
        >
          <div className="compact-list">
            {cariRows.map((row) => (
              <div className="compact-row" key={row?.id || row?.firma}>
                <strong>{row?.firma}</strong>
                <span>{formatMoney(row?.bakiye || 0)}</span>
              </div>
            ))}
            {!cariRows.length ? (
              <EmptyState text="Cari hareket bekleniyor." />
            ) : null}
          </div>
        </SectionCard>
        <SectionCard title="Operasyon Özeti" icon="raporlar">
          <div className="operation-summary">
            <button type="button" onClick={() => go("firma-kartlari")}>
              <strong>
                {summary.companyCount || summary.companies.length || 0}
              </strong>
              <span>Firma</span>
            </button>
            <button type="button" onClick={() => go("urunler")}>
              <strong>{summary.productsCount || 0}</strong>
              <span>Ürün</span>
            </button>
            <button type="button" onClick={() => go("bizim-belgeler")}>
              <strong>
                {summary.documentCount || summary.documents.length || 0}
              </strong>
              <span>Belge</span>
            </button>
            <button type="button" onClick={() => go("odemeler")}>
              <strong>{summary.paymentsCount || 0}</strong>
              <span>Ödeme</span>
            </button>
          </div>
        </SectionCard>
        <SectionCard title="Cari Durumu" icon="cari-kasa">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Firma</th>
                  <th>Bakiye</th>
                  <th>Son İşlem</th>
                </tr>
              </thead>
              <tbody>
                {cariRows.map((row) => (
                  <tr key={row?.id || row?.firma}>
                    <td>{row?.firma}</td>
                    <td>{formatMoney(row?.bakiye || 0)}</td>
                    <td>{shortDate(row?.sonIslem)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
        <SectionCard title="Çek & Kart Takibi" icon="cekler">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tür</th>
                  <th>Açıklama</th>
                  <th>Tutar</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {checkRows.map((row) => (
                  <tr key={row?.id}>
                    <td>Çek</td>
                    <td>{row?.firma || row?.cekNo}</td>
                    <td>{formatMoney(row?.tutar || 0)}</td>
                    <td>
                      <StatusBadge tone="warning">
                        {row?.durum || "Yaklaşan"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
        <SectionCard title="Hatırlatmalar" icon="uyari">
          <div className="compact-list">
            {docRows.map((row) => (
              <div className="compact-row" key={row?.documentId || row?.id}>
                <strong>
                  {row?.header.documentNo || row?.documentId || "Belge"}
                </strong>
                <StatusBadge tone={row?.needsReview ? "warning" : "info"}>
                  {row?.needsReview ? "Kontrol" : row?.status || "Taslak"}
                </StatusBadge>
              </div>
            ))}
            {!docRows.length ? (
              <EmptyState text="Açık belge bulunmadı." />
            ) : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Son Hareketler" icon="saat" className="mt-16">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Modül</th>
                <th>İşlem</th>
                <th>Açıklama</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {logRows.map((row) => (
                <tr key={row?.id || `${row?.createdAt}-${row?.title}`}>
                  <td>{shortDate(row?.createdAt || row?.date)}</td>
                  <td>{row?.source || row?.entityType || "Muhasebe"}</td>
                  <td>{row?.title || row?.actionType || "-"}</td>
                  <td>{row?.description || row?.recordName || "-"}</td>
                  <td>
                    <StatusBadge tone="success">Tamamlandı</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!logRows.length ? <EmptyState text="Henüz hareket yok." /> : null}
        </div>
      </SectionCard>
    </AccountingPageShell>
  );
}

