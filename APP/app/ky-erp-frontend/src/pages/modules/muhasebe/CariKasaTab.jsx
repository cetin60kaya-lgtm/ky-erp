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

export function CariKasaTab({
  activeMainCompany,
  activeCompany,
  onCompanySelect,
  refreshCompanies,
}) {
  const [rows, setRows] = useState([]);
  const [hareketRows, setHareketRows] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
  const [message, setMessage] = useState("");
  const [selectedFirma, setSelectedFirma] = useState(activeCompany || "");
  const [search, setSearch] = useState("");
  const [detailTab, setDetailTab] = useState("ozet");
  const [form, setForm] = useState(() => createCariKasaForm());

  async function load() {
    try {
      const [cari, hareket, logs] = await Promise.all([
        apiGet("/muhasebe/cari-kasa", activeMainCompany),
        apiGet("/muhasebe/cari-hareketler", activeMainCompany),
        apiGet("/muhasebe/activity-logslimit=10", activeMainCompany),
      ]);
      const cariRows = Array.isArray(cari) ? cari : [];
      const hareketList = Array.isArray(hareket) ? hareket : [];
      setRows(cariRows);
      setHareketRows(hareketList);
      setActivityRows(Array.isArray(logs) ? logs.slice(0, 10) : []);
      refreshCompanies();

      const queryFirma =
        new URLSearchParams(window.location.search).get("firma") || "";
      const queryMatch = queryFirma
        ? cariRows.find(
            (item) =>
              String(item?.firma || "").toLocaleLowerCase("tr-TR") ===
              queryFirma.toLocaleLowerCase("tr-TR"),
          ) ||
          cariRows.find((item) =>
            String(item?.firma || "")
              .toLocaleLowerCase("tr-TR")
              .includes(queryFirma.toLocaleLowerCase("tr-TR")),
          )
        : null;
      const fallbackFirma = activeCompany || cariRows[0]?.firma || "";
      if (queryMatch || (!selectedFirma && fallbackFirma)) {
        const next = queryMatch?.firma || fallbackFirma;
        setSelectedFirma(next);
        onCompanySelect(next);
      }
    } catch (e) {
      setMessage(e.message || "Cari / Kasa verileri yüklenemedi.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany?.id, activeMainCompany?.slug, activeCompany]);

  const selectedSummary = useMemo(
    () => rows.find((x) => x.firma === selectedFirma),
    [rows, selectedFirma],
  );

  const filtered = useMemo(
    () =>
      rows.filter((item) =>
        String(item?.firma || "")
          .toLocaleLowerCase("tr-TR")
          .includes(search.toLocaleLowerCase("tr-TR")),
      ),
    [rows, search],
  );

  const selectedHareketRows = useMemo(() => {
    return hareketRows.filter((row) =>
      selectedFirma
         String(row.firma || "").toLocaleLowerCase("tr-TR") ===
          ? selectedFirma.toLocaleLowerCase("tr-TR")
        : true,
    );
  }, [hareketRows, selectedFirma]);

  const selectedInvoiceRows = useMemo(
    () =>
      selectedHareketRows.filter(
        (row) =>
          String(row.sourceType || "").toLocaleLowerCase("tr-TR") ===
          "supplier_invoice",
      ),
    [selectedHareketRows],
  );

  const selectedPaymentRows = useMemo(
    () =>
      selectedHareketRows.filter(
        (row) =>
          row.islemTipi === "ODEME" ||
          String(row.sourceType || "").toLocaleUpperCase("tr-TR") === "ODEME",
      ),
    [selectedHareketRows],
  );

  const compactActivityRows = useMemo(
    () => activityRows.slice(0, 8),
    [activityRows],
  );

  async function saveHareket() {
    if (!selectedFirma) {
      setMessage("Önce firma seçin.");
      return;
    }
    try {
      const typeConfig = getCariKasaTypeConfig(form.hareketTuru);
      await apiPost(
        "/muhasebe/cari-hareketler",
        {
          id: form.id || undefined,
          firma: selectedFirma,
          tarih: form.tarih,
          islemTipi: typeConfig.islemTipi,
          tutar: parseMoney(form.tutar),
          aciklama: form.aciklama,
          sourceType: form.sourceType || typeConfig.sourceType,
          belge: form.belge || "",
          resmiDurum: form.resmiDurum,
          odemeSozuTarihi: form.odemeSozuTarihi,
          hatirlatmaTarihi: form.hatirlatmaTarihi,
          takipNotu: form.takipNotu,
        },
        activeMainCompany,
      );
      setMessage(
        form.id ? "Cari hareket güncellendi." : "Cari hareket kaydedildi.",
      );
      setForm(createCariKasaForm());
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  function openHareket(row) {
    setSelectedFirma(row?.firma);
    onCompanySelect(row?.firma);
    setForm({
      id: String(row?.id),
      tarih: row?.tarih || new Date().toISOString().slice(0, 10),
      hareketTuru: getCariKasaTypeFromRow(row),
      tutar: Number(row?.tutar || 0),
      aciklama: row?.aciklama || "",
      belge: row?.belge || "",
      sourceType: row?.sourceType || "MANUAL",
      resmiDurum: row?.resmiDurum || "RESMI",
      odemeSozuTarihi: row?.odemeSozuTarihi || "",
      hatirlatmaTarihi: row?.hatirlatmaTarihi || "",
      takipNotu: row?.takipNotu || "",
    });
  }

  async function addOrRefreshCari() {
    const firma = String(selectedFirma || search || "").trim();
    if (!firma) {
      setMessage("Cari açmak için firma adı yazın veya seçin.");
      return;
    }
    try {
      await apiPost(
        "/muhasebe/cari-kasa/add",
        { firma, tip: selectedSummary.tip || "SATICI" },
        activeMainCompany,
      );
      setSelectedFirma(firma);
      onCompanySelect(firma);
      setMessage("Cari kart açıldı/güncellendi.");
      await load();
    } catch (e) {
      setMessage(e.message || "Cari kart açılamadı.");
    }
  }

  async function deleteHareket(row) {
    if (!row?.id) {
      setMessage("Silinecek hareket bulunamadı.");
      return;
    }
    const approved = window.confirm(
      `${row?.firma || ""} hareketi kalıcı silinsin mi Önce yedek alınır.`,
    );
    if (!approved) return;
    const adminPassword = window.prompt("Admin şifresini girin:", "") || "";
    if (!String(adminPassword).trim()) {
      setMessage("Cari hareket silmek için admin şifresi zorunludur.");
      return;
    }
    try {
      const response = await apiPost(
        `/muhasebe/cari-hareketler/${encodeURIComponent(row?.id)}/delete`,
        { adminPassword },
        activeMainCompany,
      );
      setMessage(response.message || "Cari hareket silindi.");
      if (String(form.id) === String(row?.id)) {
        setForm(createCariKasaForm());
      }
      await load();
    } catch (e) {
      setMessage(e.message || "Cari hareket silinemedi.");
    }
  }

  return (
    <div className="content-grid muhasebe-page">
      <MuhasebePageHeader
        title={tr.cariKasa}
        subtitle="Seçili firmanın cari hareketlerini tek akışta girin, bakiye özetini ve logları birlikte izleyin."
      />
      <div className="content-card muhasebe-page-body">
        {message ? <div className="notice-box">{message}</div> : null}

        <div className="mt-16" style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "minmax(220px, 320px) minmax(0, 1fr)",
              alignItems: "end",
            }}
          >
            <Input
              label="Firma Ara"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Firma adına göre filtrele"
            />
            <div className="info-box selected-company-card">
              <span className="metric-icon tone-blue">
                <ErpIcon name="firma-kartlari" size={24} />
              </span>
              <div>
                <span>Seçili Firma</span>
                <strong>{selectedSummary.firma || "Firma seçin"}</strong>
                <div className="row-meta">
                  {selectedSummary
                     `${selectedSummary.tip || "-"} • Son işlem: ${
                        selectedSummary.sonIslem || "-"
                      ? }`
                    : "Hareket girişi ve tablo için soldaki listeden firma seçin."}
                </div>
              </div>
              <button
                className="soft-btn tiny-btn mt-8"
                type="button"
                onClick={addOrRefreshCari}
              >
                Cari Aç / Güncelle
              </button>
            </div>
          </div>

          <div className="info-grid info-grid-6">
            <MetricBox
              icon="cari-kasa"
              label="Bakiye"
              value={formatMoney(selectedSummary.bakiye || 0)}
              subText="Güncel bakiye"
              tone="blue"
            />
            <MetricBox
              icon="odemeler"
              label="Ödenen"
              value={formatMoney(selectedSummary.odenenToplam || 0)}
              subText="Toplam tahsilat"
              tone="green"
            />
            <MetricBox
              icon="saat"
              label="Son İşlem"
              value={selectedSummary.sonIslem || "-"}
              subText="Son hareket tarihi"
              tone="blue"
            />
            <MetricBox
              icon="kredi-kartlari"
              label="Ödeme Sözü"
              value={form.odemeSozuTarihi || "-"}
              subText="Ödeme sözü bulunan"
              tone="purple"
            />
            <MetricBox
              icon="bildirim"
              label="Hatırlatma"
              value={form.hatirlatmaTarihi || "-"}
              subText="Hatırlatma bilgisi"
              tone="orange"
            />
            <MetricBox
              icon="belge"
              label="Kayıt Tipi"
              value={
                form.resmiDurum === "GAYRI_RESMI" ? "Gayri resmi" : "Resmi"
              }
              subText="Cari kayıt tipi"
              tone="blue"
            />
          </div>
        </div>

        <div className="split-layout mt-16 muhasebe-top-panels">
          <div className="panel-block">
            <h4>Firma Listesi</h4>
            <div className="list-table">
              {filtered.map((item) => (
                <button
                  key={item?.id}
                  className={`list-row list-row-button ${item.firma === selectedFirma ? "active" : ""}`}
                  onClick={() => {
                    setSelectedFirma(item?.firma);
                    onCompanySelect(item?.firma);
                  }}
                >
                  <div>
                    <strong>{item?.firma}</strong>
                    <span className="row-meta">{item?.tip || "Firma"}</span>
                  </div>
                  <div className="row-right">
                    <strong>{formatMoney(item?.bakiye)}</strong>
                    <span className="row-meta">
                      {item?.bakiyeYonu || item?.balanceDirection || "Bakiye"}
                    </span>
                  </div>
                </button>
              ))}
              {!filtered.length ? (
                <div className="list-row">
                  <div>
                    <strong>Firma bulunamadı</strong>
                    <span className="row-meta">
                      Arama filtresini değiştirip tekrar deneyin.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel-block">
            <div className="section-heading-inline">
              <div>
                <h4>Firma Ön İzleme</h4>
                <div className="row-meta">
                  {selectedSummary.firma
                     ? `${selectedSummary.firma} için fatura, ödeme ve hareketleri izleyin.`
                    : "Önce soldaki listeden firma seçin."}
                </div>
              </div>
              <button
                className="soft-btn tiny-btn"
                type="button"
                onClick={() => setDetailTab("manuel")}
              >
                Manuel Hareket
              </button>
            </div>
            <div className="muhasebe-inline-tabs">
              {[
                ["ozet", "Özet"],
                ["hareketler", "Hareketler"],
                ["faturalar", "Faturalar"],
                ["odemeler", "Ödemeler"],
                ["manuel", "Manuel Hareket"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={detailTab === value ? "active" : ""}
                  onClick={() => setDetailTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {detailTab !== "manuel"  (
              <CariPreviewPanel
                tab={detailTab}
                hareketRows={selectedHareketRows}
                invoiceRows={selectedInvoiceRows}
                paymentRows={selectedPaymentRows}
                onOpen={(row) => {
                  setDetailTab("manuel");
                  openHareket(row);
                }}
              />
            ) : (
              <>
                <div className="row-meta" style={{ marginBottom: 12 }}>
                  {selectedSummary.firma
                     ? `${selectedSummary.firma} için manuel hareket ekleyin veya alttaki kaydı düzenleyin.`
                    : "Önce soldaki listeden firma seçin."}
                </div>
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
                    label="İşlem Tipi"
                    value={form.hareketTuru}
                    onChange={(e) => {
                      const nextConfig = getCariKasaTypeConfig(e.target.value);
                      const currentConfig = getCariKasaTypeConfig(
                        form.hareketTuru,
                      );
                      setForm((p) => ({
                        ...p,
                        hareketTuru: nextConfig.value,
                        sourceType:
                          p.sourceType === currentConfig.sourceType
                             ? nextConfig.sourceType
                            : p.sourceType,
                      }));
                    }}
                    options={CARI_KASA_TYPE_OPTIONS.map((item) => ({
                      value: item?.value,
                      label: item?.label,
                    }))}
                  />
                  <MoneyInput
                    label="Tutar"
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
                </div>
                <Textarea
                  label="Açıklama"
                  value={form.aciklama}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, aciklama: e.target.value }))
                  }
                />
                <div className="form-grid form-grid-compact">
                  <Input
                    label="Belge No"
                    value={form.belge}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, belge: e.target.value }))
                    }
                  />
                  <Input
                    label="Kaynak"
                    value={form.sourceType}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, sourceType: e.target.value }))
                    }
                  />
                  <Input
                    label="Ödeme Sözü"
                    type="date"
                    value={form.odemeSozuTarihi}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        odemeSozuTarihi: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Hatırlatma"
                    type="date"
                    value={form.hatirlatmaTarihi}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        hatirlatmaTarihi: e.target.value,
                      }))
                    }
                  />
                </div>
                <Input
                  label="Takip Notu"
                  value={form.takipNotu}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, takipNotu: e.target.value }))
                  }
                  placeholder="Ödeme sözü, arama notu veya takip bilgisi"
                />
                <ActionBar>
                  <button
                    className="primary-btn"
                    onClick={saveHareket}
                    disabled={!selectedFirma}
                  >
                    Kaydet
                  </button>
                  {form.id ? (
                    <button
                      className="soft-btn"
                      onClick={() => {
                        setForm(createCariKasaForm());
                      }}
                    >
                      Yeni Giriş
                    </button>
                  ) : null}
                </ActionBar>
              </>
            )}
          </div>
        </div>

        <div className="mt-16">
          <SectionHeader
            title="Hareketler"
            subtitle={
              selectedSummary.firma
                 ? `${selectedSummary.firma} hareket geçmişi`
                : "Seçili firma hareketleri burada görünür."
            }
          />
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Tür</th>
                <th>Açıklama</th>
                <th>Belge</th>
                <th>Tutar</th>
                <th>Etki</th>
                <th>Bakiye</th>
                <th>Takip</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {selectedHareketRows.map((row) => (
                <tr key={row?.id}>
                  <td>{row?.tarih}</td>
                  <td>{getCariKasaTypeLabel(row)}</td>
                  <td>{row?.aciklama || "-"}</td>
                  <td>{row?.belge || "-"}</td>
                  <td>{formatMoney(row?.tutar)}</td>
                  <td>{formatMoney(row?.etkisi)}</td>
                  <td>{formatMoney(row?.bakiye)}</td>
                  <td>
                    {row?.hatirlatmaTarihi || row?.odemeSozuTarihi || "-"}
                    <div className="row-meta">
                      {row.resmiDurum === "GAYRI_RESMI" ? "Gayri" : "Resmi"}
                    </div>
                  </td>
                  <td>
                    <button
                      className="soft-btn tiny-btn"
                      onClick={() => openHareket(row)}
                    >
                      <ErpIcon name="duzenle" size={15} />
                      Düzenle
                    </button>
                    <button
                      className="soft-btn tiny-btn"
                      onClick={() => deleteHareket(row)}
                    >
                      <ErpIcon name="sil" size={15} />
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
              {!selectedHareketRows.length ? (
                <tr>
                  <td colSpan={9}>Seçili firma için hareket bulunamadı.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <details className="panel-block mt-16">
          <summary>Son Aktivite Logları</summary>
          <div className="row-meta" style={{ marginBottom: 12 }}>
            Teknik kayıtlar ihtiyaç halinde açılır.
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {compactActivityRows.map((log) => (
              <div
                key={log.id}
                style={{
                  display: "grid",
                  gap: 4,
                  padding: "10px 12px",
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                  borderRadius: 12,
                  background: "rgba(255, 255, 255, 0.72)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ fontSize: 13 }}>
                    {log.title || log.actionType}
                  </strong>
                  <span className="row-meta">
                    {log.createdAt
                       ? new Date(log.createdAt).toLocaleString("tr-TR")
                      : "-"}
                  </span>
                </div>
                <div className="row-meta">
                  {log.entityType} / {log.entityId}
                </div>
                <div style={{ fontSize: 13 }}>{log.description || "-"}</div>
              </div>
            ))}
            {!compactActivityRows.length ? (
              <div className="row-meta">Log kaydı yok.</div>
            ) : null}
          </div>
        </details>
      </div>
    </div>
  );
}

function CariPreviewPanel({
  tab,
  hareketRows,
  invoiceRows,
  paymentRows,
  onOpen,
}) {
  const rows =
    tab === "faturalar"
       ? invoiceRows
      : tab === "odemeler"
         ? paymentRows
        : tab === "ozet"
           ? hareketRows.slice(0, 5)
          : hareketRows;
  const title =
    tab === "faturalar"
       ? "İşlenen Faturalar"
      : tab === "odemeler"
         ? "Ödeme Geçmişi"
        : tab === "ozet"
           ? "Son 5 Hareket"
          : "Hareketler";
  return (
    <div className="muhasebe-cari-preview">
      <div className="muhasebe-preview-summary">
        <div>
          <span>Fatura</span>
          <strong>{invoiceRows.length}</strong>
        </div>
        <div>
          <span>Ödeme</span>
          <strong>{paymentRows.length}</strong>
        </div>
        <div>
          <span>Hareket</span>
          <strong>{hareketRows.length}</strong>
        </div>
      </div>
      <h5>{title}</h5>
      <div className="table-wrap compact-table">
        <table className="table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>İşlem Türü</th>
              <th>Belge No</th>
              <th>Açıklama</th>
              <th>Tutar</th>
              <th>Etki</th>
              <th>Bakiye</th>
              <th>Kaynak</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row?.id}>
                <td>{row?.tarih || "-"}</td>
                <td>{getCariKasaTypeLabel(row)}</td>
                <td>{row?.belge || "-"}</td>
                <td>{row?.aciklama || "-"}</td>
                <td>{formatMoney(row?.tutar)}</td>
                <td>{formatMoney(row?.etkisi)}</td>
                <td>{formatMoney(row?.bakiye)}</td>
                <td>{row?.sourceType || "-"}</td>
                <td>
                  <button
                    className="soft-btn tiny-btn"
                    type="button"
                    onClick={() => onOpen(row)}
                  >
                    Aç
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={9}>Bu sekmede gösterilecek kayıt yok.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
