/* eslint-disable no-unused-vars */
import { normalizeList } from "../../utils/normalizeList";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Boxes,
  CheckCircle2,
  Clock3,
  Factory,
  FileText,
  Filter,
  History,
  Link2,
  PackageOpen,
  ReceiptText,
  Search,
  Send,
  Truck,
  Upload,
} from "lucide-react";
import SummaryCard from "../../components/erp/model-tracking/SummaryCard";
import StatusBadge from "../../components/erp/model-tracking/StatusBadge";
import ModelImagePanel from "../../components/erp/model-tracking/ModelImagePanel";
import ModelListTable from "../../components/erp/model-tracking/ModelListTable";
import DocumentHistoryTable from "../../components/erp/model-tracking/DocumentHistoryTable";
import ErpModuleWorkspace from "../../components/erp/ErpModuleWorkspace";
import ModelPoolScreen, {
  formatDateInput,
  formatModelFolderName,
} from "../../components/erp/model-tracking/ModelPoolScreen";
import {
  fetchSharedModels,
  getIncomingModelDispatches,
  getModelDocuments,
  getModelTrackingItems,
  normalizeModelImages,
  deleteModelTrackingItem,
  updateModelImages,
} from "../../services/modelTrackingService";
import { fetchCompanies } from "../../services/muhasebeService";

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR").format(date);
}

const FILTER_CHIPS = [
  "Tümü",
  "Bekleyen",
  "Üretimde",
  "Kısmi Faturalı",
  "Tamamlandı",
];

function matchFilter(row, filter) {
  if (filter === "Tümü") return true;
  return row.status === filter;
}

function modelSearchValue(row) {
  return [row?.model, row?.customer, row?.lastDispatchNo, row?.floor, row?.status]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
}

function normalizeRemovalKey(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/İ/g, "I")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function modelRemovalKeys(model = {}) {
  const modelName =
    model?.modelName ||
    model?.modelAdi ||
    model?.model ||
    model?.name ||
    model?.displayName;
  const customer =
    model?.customerName || model?.customer || model?.musteri || model?.musteriFirma;
  const belgeNo =
    model?.belgeNo ||
    model?.irsaliyeNo ||
    model?.lastDispatchNo ||
    model?.documentNo;
  return [
    model?.id,
    model?.modelId,
    model?.sourceKey,
    model?.docModelKey,
    belgeNo,
    [modelName, belgeNo].filter(Boolean).join(" "),
    [modelName, customer].filter(Boolean).join(" "),
    [modelName, model?.floor || model?.ground || model?.zemin]
      .filter(Boolean)
      .join(" "),
  ]
    .map(normalizeRemovalKey)
    .filter(Boolean);
}

function modelMergeKey(model = {}) {
  const id = normalizeRemovalKey(
    model?.id || model?.modelId || model?.modelKaydiId,
  );
  if (id) return `id:${id}`;
  const modelName = normalizeRemovalKey(
    model?.modelName || model?.modelAdi || model?.model || model?.name,
  );
  const firma =
    normalizeRemovalKey(
      model?.firmaId || model?.companyId || model?.customerId || "",
    ) ||
    normalizeRemovalKey(
      model?.firmaAdi ||
        model?.firma ||
        model?.customer ||
        model?.musteri ||
        model?.musteriFirma,
    );
  return `model:${modelName}|firma:${firma}`;
}

function modelSortTime(model = {}) {
  const raw =
    model?.createdAt ||
    model?.created_at ||
    model?.updatedAt ||
    model?.updated_at ||
    model?.sonIslemTarihi ||
    model?.lastDispatchDate ||
    model?.date ||
    "";
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function sortModelsNewestFirst(rows = []) {
  return [...rows].sort((a, b) => {
    const diff = modelSortTime(b) - modelSortTime(a);
    if (diff) return diff;
    return String(a.model || a.modelName || a.modelAdi || "").localeCompare(
      String(b.model || b.modelName || b.modelAdi || ""),
      "tr",
      { sensitivity: "base" },
    );
  });
}

function mergeModelRows(previous = {}, row = {}) {
  const newerDate =
    modelSortTime(previous) >= modelSortTime(row) ? previous : row;
  return {
    ...previous,
    ...row,
    createdAt: newerDate.createdAt || previous?.createdAt || row?.createdAt,
    updatedAt: newerDate.updatedAt || row?.updatedAt || previous?.updatedAt,
    imageUrl: row?.imageUrl || previous?.imageUrl,
    images: [
      ...(Array.isArray(row?.images) ? row?.images : []),
      ...(Array.isArray(previous?.images) ? previous?.images : []),
    ],
    files: [
      ...(Array.isArray(row?.files) ? row?.files : []),
      ...(Array.isArray(previous?.files) ? previous?.files : []),
    ],
  };
}

function dedupeModels(rows = []) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = modelMergeKey(row);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, row);
      continue;
    }
    map.set(key, mergeModelRows(previous, row));
  }
  return sortModelsNewestFirst([...map.values()]);
}

function filterRemovedModels(rows, model, result = {}) {
  const removedKeys = new Set(
    [
      ...modelRemovalKeys(model),
      ...modelRemovalKeys(result),
      ...(Array.isArray(result?.removedKeys) ? result?.removedKeys : []),
      ...(Array.isArray(result?.hiddenKeys) ? result?.hiddenKeys : []),
    ]
      .map(normalizeRemovalKey)
      .filter(Boolean),
  );
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const keys = modelRemovalKeys(row);
    return !keys.some((key) => removedKeys.has(key));
  });
}

function rowToDocHistory(row, label) {
  return {
    id: row?.id,
    type: label,
    no: row?.no || row?.documentNo || row?.dispatchNo || "-",
    date: row?.date || row?.documentDate || row?.tarih || "",
    status: row?.status || "Tamamlandı",
  };
}

function getStatusBucket(status) {
  const raw = String(status || "").toLocaleLowerCase("tr-TR");
  if (raw.includes("tamam")) return "completed";
  if (raw.includes("kısmi") && raw.includes("fatura")) return "partial";
  if (
    raw.includes("üret") ||
    raw.includes("uret") ||
    raw.includes("imalat") ||
    raw.includes("boya")
  ) {
    return "production";
  }
  if (raw.includes("aktif") || raw.includes("bek")) return "waiting";
  return "waiting";
}

function matchTrackingFilter(status, filter) {
  if (filter === "Tümü") return true;
  if (filter === "Bekleyen") return getStatusBucket(status) === "waiting";
  if (filter === "Üretimde") return getStatusBucket(status) === "production";
  if (filter === "Kısmi Faturalı") return getStatusBucket(status) === "partial";
  if (filter === "Tamamlandı") return getStatusBucket(status) === "completed";
  return String(status || "") === filter;
}

function hydrateTrackingModel(row, source = "backend") {
  const modelName = row?.modelName || row?.modelAdi || row?.model || "-";
  const floor = row?.floor || row?.ground || "-";
  const images = normalizeModelImages(row?.images, row?.imageUrl);
  const imageUrl = images[0].url || "";
  const incomingQty = Number(row?.incomingQty ?? row?.givenQty ?? 0) || 0;
  const productionQty = Number(row?.productionQty ?? row?.producedQty ?? 0) || 0;
  const invoicedQty = Number(row?.invoicedQty ?? 0) || 0;
  const remainingQty =
    row.remainingQty == null
       ? Math.max(incomingQty - invoicedQty, 0)
      : Number(row?.remainingQty) || 0;
  const date =
    row?.createdAt ||
    row?.date ||
    row?.lastDispatchDate ||
    row?.closingDate ||
    row?.updatedAt ||
    "";
  const folderName =
    row?.folderName ||
    formatModelFolderName(date, modelName || row?.model || "model");

  return {
    ...row,
    source: row?.source || source,
    model: modelName,
    modelName,
    customer:
      row?.customer ||
      row?.firmaAdi ||
      row?.firma ||
      row?.musteriFirma ||
      "Firma Seçilmedi",
    floor,
    ground: row?.ground || floor,
    incomingQty,
    givenQty: Number(row?.givenQty ? incomingQty) || 0,
    productionQty,
    invoicedQty,
    remainingQty,
    department: row?.department || "",
    assignedTo: row?.assignedTo || "",
    date: formatDateInput(date),
    folderName,
    imageUrl,
    images,
    files: Array.isArray(row?.files) ? row?.files : [],
    logs: Array.isArray(row?.logs) ? row?.logs : [],
    lastDispatchNo: row?.lastDispatchNo || row?.documentNo || "-",
    lastDispatchDate: row?.lastDispatchDate || row?.date || "",
    lastInvoiceNo: row?.lastInvoiceNo || "-",
    closingDate:
      row?.closingDate ||
      (getStatusBucket(row.status) === "completed" ? row?.date : ""),
  };
}

function summarizeTrackingModels(models) {
  return models.reduce(
    (acc, item) => {
      const bucket = getStatusBucket(item?.status);
      acc.totalModel += 1;
      if (bucket === "waiting") acc.waiting += 1;
      if (bucket === "production") acc.inProduction += 1;
      if (bucket === "partial") acc.partialInvoiced += 1;
      if (bucket === "completed") acc.completed += 1;
      acc.totalIncoming += Number(item?.incomingQty || 0);
      acc.totalProduction += Number(item?.productionQty || 0);
      acc.totalInvoiced += Number(item?.invoicedQty || 0);
      acc.totalRemaining += Number(item?.remainingQty || 0);
      return acc;
    },
    {
      totalModel: 0,
      waiting: 0,
      inProduction: 0,
      partialInvoiced: 0,
      completed: 0,
      totalIncoming: 0,
      totalProduction: 0,
      totalInvoiced: 0,
      totalRemaining: 0,
    },
  );
}

function SideModelInfo({ model, archiveMode = false }) {
  if (!model) return null;

  return (
    <section className="content-card model-track-side-card">
      <h4>Seçili Model Bilgileri</h4>
      <dl>
        <div>
          <dt>Model</dt>
          <dd>{model?.model}</dd>
        </div>
        <div>
          <dt>Müşteri</dt>
          <dd>{model?.customer}</dd>
        </div>
        {archiveMode ? (
          <div>
            <dt>Kapanış Tarihi</dt>
            <dd>{formatDate(model?.closingDate)}</dd>
          </div>
        ) : (
          <div>
            <dt>Zemin</dt>
            <dd>{model?.floor || "-"}</dd>
          </div>
        )}
        {!archiveMode ? (
          <div>
            <dt>Toplam Gelen</dt>
            <dd>{formatNumber(model?.incomingQty)}</dd>
          </div>
        ) : null}
        {!archiveMode ? (
          <div>
            <dt>Üretim</dt>
            <dd>{formatNumber(model?.productionQty)}</dd>
          </div>
        ) : null}
        {!archiveMode ? (
          <div>
            <dt>Faturalanan</dt>
            <dd>{formatNumber(model?.invoicedQty)}</dd>
          </div>
        ) : null}
        {!archiveMode ? (
          <div>
            <dt>Kalan</dt>
            <dd>{formatNumber(model?.remainingQty)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Durum</dt>
          <dd>
            <StatusBadge status={model?.status} small />
          </dd>
        </div>
      </dl>
    </section>
  );
}

function LinkedDocumentsCard({ documents, onFilter }) {
  const rows = [
    {
      key: "customer",
      label: "Müşteri İrsaliyeleri",
      icon: <Truck size={14} />,
      count: documents?.customerDispatches.length,
    },
    {
      key: "outgoing",
      label: "Giden İrsaliyeler",
      icon: <Send size={14} />,
      count: documents?.outgoingDispatches.length,
    },
    {
      key: "invoice",
      label: "Faturalar",
      icon: <ReceiptText size={14} />,
      count: documents?.invoices.length,
    },
    {
      key: "history",
      label: "Evrak Geçmişi",
      icon: <History size={14} />,
      count: documents?.documentHistory.length,
    },
  ];

  return (
    <section className="content-card model-track-side-card">
      <h4>Bağlı Belgeler</h4>
      <div className="model-track-linked-list">
        {rows.map((row) => (
          <button
            key={row?.key}
            type="button"
            onClick={() => onFilter?.(row?.key)}
          >
            <span>
              {row?.icon}
              {row?.label}
            </span>
            <strong>{row?.count}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function ModelTakipMerkeziScreen({
  models,
  selected,
  summary,
  searchText,
  onSearchText,
  activeFilter,
  onFilter,
  onSelect,
  documents,
  sideImages,
  onUploadImages,
  onUpdateImages,
}) {
  const modelList = useMemo(() => normalizeList(models), [models]);
  const filtered = useMemo(() => {
    const q = searchText.trim().toLocaleLowerCase("tr-TR");
    return modelList.filter((row) => {
      if (!matchTrackingFilter(row?.status, activeFilter)) return false;
      if (!q) return true;
      return modelSearchValue(row).includes(q);
    });
  }, [activeFilter, modelList, searchText]);

  return (
    <div className="model-track-shell">
      <section className="model-track-main">
        <div className="section-header">
          <div>
            <h3>Model Takip Merkezi</h3>
            <p>
              Modellerin üretim, irsaliye ve fatura süreçlerini tek ekrandan
              takip edin.
            </p>
          </div>
        </div>

        <div className="model-track-summary-grid">
          <SummaryCard
            icon={<Boxes size={20} />}
            label="Toplam Model"
            value={formatNumber(summary.totalModel)}
            helper="Tüm kaydedilmiş modeller"
          />
          <SummaryCard
            icon={<Clock3 size={20} />}
            label="Bekleyen"
            value={formatNumber(summary.waiting)}
            helper="Sevk/üretim bekleyen"
          />
          <SummaryCard
            icon={<Factory size={20} />}
            label="Üretimde"
            value={formatNumber(summary.inProduction)}
            helper="Aktif üretim sürecinde"
          />
          <SummaryCard
            icon={<FileText size={20} />}
            label="Faturalanan"
            value={formatNumber(summary.totalInvoiced)}
            helper="Fatura kesilen modeller"
          />
          <SummaryCard
            icon={<PackageOpen size={20} />}
            label="Kalan"
            value={formatNumber(summary.totalRemaining)}
            helper="Açık miktar"
          />
        </div>

        <div className="model-track-filter-row">
          <div className="model-track-chip-group">
            {FILTER_CHIPS.map((chip) => (
              <button
                type="button"
                key={chip}
                className={activeFilter === chip ? "is-active" : ""}
                onClick={() => onFilter(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <label className="model-track-search-field">
            <Search size={16} />
            <input
              value={searchText}
              onChange={(event) => onSearchText(event?.target.value)}
              placeholder="Model, müşteri veya irsaliye no ara..."
            />
          </label>
        </div>

        <ModelListTable
          rows={filtered}
          selectedId={selected.id}
          onSelect={onSelect}
        />

        <div className="model-track-bottom-grid">
          <section className="content-card">
            <div className="model-track-subhead">
              <h4>Son Hareketler</h4>
            </div>
            <div className="table-wrap model-track-table-card">
              <table className="table model-track-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>İşlem</th>
                    <th>Model</th>
                    <th>Kullanıcı</th>
                    <th>Detay</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.logs.length > 0 ? (
                    selected.logs.map((log, i) => (
                      <tr key={log.id || i}>
                        <td>{formatDate(log.date || log.tarih)}</td>
                        <td>{log.action || log.tip || "-"}</td>
                        <td>{selected.model || "-"}</td>
                        <td>{log.user || log.actor || "-"}</td>
                        <td>{log.detail || log.aciklama || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        style={{ textAlign: "center", color: "#888" }}
                      >
                        Kayıt bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="content-card">
            <div className="model-track-subhead">
              <h4>Belge Özeti</h4>
            </div>
            <div className="model-track-doc-summary">
              <div>
                <span>
                  <Truck size={14} /> Müşteri İrsaliyeleri
                </span>
                <strong>{documents?.customerDispatches.length}</strong>
              </div>
              <div>
                <span>
                  <Send size={14} /> Giden İrsaliyeler
                </span>
                <strong>{documents?.outgoingDispatches.length}</strong>
              </div>
              <div>
                <span>
                  <ReceiptText size={14} /> Faturalar
                </span>
                <strong>{documents?.invoices.length}</strong>
              </div>
              <div>
                <span>
                  <Clock3 size={14} /> Onay Bekleyen
                </span>
                <strong>0</strong>
              </div>
              <div>
                <span>
                  <History size={14} /> Evrak Geçmişi
                </span>
                <strong>{documents?.documentHistory.length}</strong>
              </div>
            </div>
          </section>
        </div>
      </section>

      <aside className="model-track-side-panel">
        <ModelImagePanel
          images={sideImages}
          onUpload={onUploadImages}
          onUpdate={onUpdateImages}
        />
        <SideModelInfo model={selected} />
        <LinkedDocumentsCard documents={documents} />
      </aside>
    </div>
  );
}

function GelenModelScreen({
  models,
  selected,
  documents,
  sideImages,
  onSelect,
  onUploadImages,
  onUpdateImages,
}) {
  const [modelSearch, setModelSearch] = useState("");
  const modelList = useMemo(() => normalizeList(models), [models]);

  const modelRows = useMemo(() => {
    const q = modelSearch.trim().toLocaleLowerCase("tr-TR");
    if (!q) return modelList;
    return modelList.filter((item) =>
      [item?.model, item?.customer, item?.floor]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [modelList, modelSearch]);

  const selectedModel = selected || modelRows[0] || null;
  const productionRows = Array.isArray(documents?.productionHistory)
     ? documents?.productionHistory
    : [];
  const accountingInvoiceRows = Array.isArray(documents?.invoices)
     ? documents?.invoices
    : [];
  const outgoingRows = Array.isArray(documents?.outgoingDispatches)
     ? documents?.outgoingDispatches
    : [];

  return (
    <div className="model-track-shell">
      <section className="model-track-main">
        <div className="section-header">
          <div>
            <h3>Model Operasyon Bilgileri</h3>
            <p>
              Gelen irsaliye ve bağlama işlemleri Muhasebe ekranında yürütülür.
              Bu alanda modelin üretim, muhasebe ve desen bilgileri izlenir.
            </p>
          </div>
        </div>

        <div className="model-track-summary-grid model-track-summary-grid-4">
          <SummaryCard
            icon={<Factory size={20} />}
            label="Üretim Kaydı"
            value={formatNumber(productionRows.length)}
            helper="Üretim geçmişi"
          />
          <SummaryCard
            icon={<ReceiptText size={20} />}
            label="Muhasebe Faturası"
            value={formatNumber(accountingInvoiceRows.length)}
            helper="Kesilen faturalar"
          />
          <SummaryCard
            icon={<Truck size={20} />}
            label="Giden İrsaliye"
            value={formatNumber(outgoingRows.length)}
            helper="Sevk kayıtları"
          />
          <SummaryCard
            icon={<Boxes size={20} />}
            label="Seçili Model"
            value={selectedModel?.model || "-"}
            helper={selectedModel?.customer || "Müşteri yok"}
          />
        </div>

        <div className="model-track-incoming-layout">
          <section className="content-card model-track-left-stack">
            <div className="model-track-subhead">
              <h4>Model Listesi</h4>
            </div>
            <label className="model-track-search-field compact">
              <Search size={14} />
              <input
                value={modelSearch}
                onChange={(event) => setModelSearch(event?.target.value)}
                placeholder="Model adı, firma, zemin..."
              />
            </label>
            <div className="model-track-simple-list">
              {modelRows.map((item) => (
                <button
                  key={item?.id}
                  type="button"
                  className={selectedModel.id === item?.id ? "is-active" : ""}
                  onClick={() => onSelect(item)}
                >
                  <span>{item?.model}</span>
                  <small>
                    {item?.customer || "-"} • Kalan{" "}
                    {formatNumber(item?.remainingQty)}
                  </small>
                </button>
              ))}
            </div>
          </section>

          <section className="content-card model-track-incoming-form-card">
            <div className="model-track-subhead">
              <h4>A Modeli Operasyon Özeti</h4>
            </div>

            <div className="form-grid model-track-form-grid">
              <label className="field">
                <span>Model</span>
                <input value={selectedModel?.model || "-"} readOnly />
              </label>
              <label className="field">
                <span>Müşteri</span>
                <input value={selectedModel?.customer || "-"} readOnly />
              </label>
              <label className="field">
                <span>Zemin / Desen</span>
                <input
                  value={selectedModel?.floor || selectedModel?.ground || "-"}
                  readOnly
                />
              </label>
              <label className="field">
                <span>Üretim Durumu</span>
                <input value={selectedModel?.status || "Bekleyen"} readOnly />
              </label>
              <label className="field">
                <span>Toplam Gelen</span>
                <input
                  value={formatNumber(selectedModel?.incomingQty || 0)}
                  readOnly
                />
              </label>
              <label className="field">
                <span>Üretilen</span>
                <input
                  value={formatNumber(selectedModel?.productionQty || 0)}
                  readOnly
                />
              </label>
              <label className="field">
                <span>Faturalanan</span>
                <input
                  value={formatNumber(selectedModel?.invoicedQty || 0)}
                  readOnly
                />
              </label>
              <label className="field">
                <span>Kalan</span>
                <input
                  value={formatNumber(selectedModel?.remainingQty || 0)}
                  readOnly
                />
              </label>
            </div>

            <div className="mfm-note compact mt-10">
              Bu sekme yalnızca izleme amaçlıdır. Gelen irsaliye ve model
              bağlama işlemleri Muhasebe &gt; Belgeler ekranında yapılır.
            </div>
          </section>
        </div>

        <section className="content-card">
          <div className="model-track-subhead">
            <h4>Üretim ve Muhasebe Kayıt Özeti</h4>
          </div>
          <div className="table-wrap model-track-table-card">
            <table className="table model-track-table">
              <thead>
                <tr>
                  <th>Kayıt Tipi</th>
                  <th>Belge / No</th>
                  <th>Tarih</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...productionRows.slice(0, 5).map((row) => ({
                    type: "Üretim",
                    no: row?.productionNo || row?.uretimNo || "-",
                    date: row?.date || row?.tarih,
                    status: row?.status || "Aktif",
                  })),
                  ...outgoingRows.slice(0, 5).map((row) => ({
                    type: "Giden İrsaliye",
                    no: row?.documentNo || row?.dispatchNo || row?.no || "-",
                    date: row?.date || row?.tarih,
                    status: row?.status || "Hazır",
                  })),
                  ...accountingInvoiceRows.slice(0, 5).map((row) => ({
                    type: "Fatura",
                    no: row?.documentNo || row?.invoiceNo || row?.no || "-",
                    date: row?.date || row?.tarih,
                    status: row?.status || "Kesildi",
                  })),
                ].map((row, index) => (
                  <tr key={`${row?.type}-${row?.no}-${index}`}>
                    <td>{row?.type}</td>
                    <td>{row?.no}</td>
                    <td>{formatDate(row?.date)}</td>
                    <td>
                      <StatusBadge status={row?.status} small />
                    </td>
                  </tr>
                ))}
                {!productionRows.length &&
                !outgoingRows.length &&
                !accountingInvoiceRows.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ textAlign: "center", color: "#888" }}
                    >
                      Kayıt bulunamadı.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <aside className="model-track-side-panel">
        <ModelImagePanel
          images={sideImages}
          onUpload={onUploadImages}
          onUpdate={onUpdateImages}
        />
        <SideModelInfo model={selectedModel} />
        <LinkedDocumentsCard documents={documents} />
      </aside>
    </div>
  );
}

function ArsivScreen({
  completedModels,
  selected,
  archiveFilter,
  onArchiveFilter,
  documents,
  sideImages,
  onUploadImages,
  onUpdateImages,
  onSelect,
}) {
  const [search, setSearch] = useState("");
  const completedModelList = useMemo(
    () => normalizeList(completedModels),
    [completedModels],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return completedModelList.filter((item) => {
      if (!q) return true;
      return [
        item?.model,
        item?.customer,
        item?.lastInvoiceNo,
        item?.lastDispatchNo,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q);
    });
  }, [completedModelList, search]);

  const historyRows = useMemo(() => {
    if (archiveFilter === "customer") {
      return documents.customerDispatches.map((item) =>
        rowToDocHistory(item, "Müşteri İrsaliyesi"),
      );
    }
    if (archiveFilter === "outgoing") {
      return documents.outgoingDispatches.map((item) =>
        rowToDocHistory(item, "Giden İrsaliye"),
      );
    }
    if (archiveFilter === "invoice") {
      return documents.invoices.map((item) => rowToDocHistory(item, "Fatura"));
    }
    return documents?.documentHistory;
  }, [archiveFilter, documents]);

  const totalInvoice = completedModelList.reduce(
    (sum, item) => sum + Number(item?.invoicedQty || 0),
    0,
  );
  const archiveTotalCount = completedModelList.length;
  const archiveInvoiceTotal = totalInvoice;
  const archiveHistoryCount = historyRows.length;

  return (
    <div className="model-track-shell">
      <section className="model-track-main">
        <div className="section-header">
          <div>
            <h3>Arşiv / Tamamlanan</h3>
            <p>
              Tamamlanan modellerin arşivini görüntüleyin. Tüm faturalar,
              irsaliyeler, evrak geçmişi ve üretim geçmişine erişin.
            </p>
          </div>
        </div>

        <div className="model-track-summary-grid model-track-summary-grid-4">
          <SummaryCard
            icon={<Archive size={20} />}
            label="Tamamlanan Modeller"
            value={formatNumber(archiveTotalCount)}
            helper="%16 geçen aya göre"
          />
          <SummaryCard
            icon={<CheckCircle2 size={20} />}
            label="Bu Ay Kapanan"
            value="86"
            helper="%22 geçen aya göre"
          />
          <SummaryCard
            icon={<ReceiptText size={20} />}
            label="Toplam Fatura"
            value={`₺${formatNumber(archiveInvoiceTotal)},00`}
            helper="%18 geçen aya göre"
          />
          <SummaryCard
            icon={<History size={20} />}
            label="Evrak Geçmişi"
            value={formatNumber(archiveHistoryCount)}
            helper="%15 geçen aya göre"
          />
        </div>

        <div className="model-track-archive-layout">
          <section className="content-card">
            <div className="model-track-subhead">
              <h4>Tamamlanan Merkezi Modeller</h4>
              <div className="model-track-inline-actions">
                <Search size={15} />
                <Filter size={15} />
              </div>
            </div>
            <label className="model-track-search-field compact">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event?.target.value)}
                placeholder="Model, Müşteri veya Fatura No ara..."
              />
            </label>
            <div className="table-wrap model-track-table-card">
              <table className="table model-track-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Müşteri</th>
                    <th>Kapanış Tarihi</th>
                    <th>Toplam Gelen</th>
                    <th>Faturalanan</th>
                    <th>Kalan</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr
                      key={item?.id}
                      className={
                        selected.id === item?.id
                           ? "model-track-row-selected"
                          : ""
                      }
                      onClick={() => onSelect(item)}
                    >
                      <td>{item?.model}</td>
                      <td>{item?.customer}</td>
                      <td>{formatDate(item?.closingDate)}</td>
                      <td>{formatNumber(item?.incomingQty)}</td>
                      <td>{formatNumber(item?.invoicedQty)}</td>
                      <td>{formatNumber(item?.remainingQty)}</td>
                      <td>
                        <StatusBadge status="Tamamlandı" small />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="content-card">
            <div className="model-track-subhead">
              <h4>Seçili Model Arşivi</h4>
              <StatusBadge status="Tamamlandı" small />
            </div>

            <div className="model-track-archive-meta">
              <div>
                <span>Model</span>
                <strong>{selected.model || "-"}</strong>
              </div>
              <div>
                <span>Müşteri</span>
                <strong>{selected.customer || "-"}</strong>
              </div>
              <div>
                <span>Toplam Gelen</span>
                <strong>{formatNumber(selected.incomingQty || 0)}</strong>
              </div>
              <div>
                <span>Üretim</span>
                <strong>{formatNumber(selected.productionQty || 0)}</strong>
              </div>
              <div>
                <span>Faturalanan</span>
                <strong>{formatNumber(selected.invoicedQty || 0)}</strong>
              </div>
              <div>
                <span>Kapanış Tarihi</span>
                <strong>{formatDate(selected.closingDate || "")}</strong>
              </div>
              <div>
                <span>Son Fatura No</span>
                <strong>{selected.lastInvoiceNo || "-"}</strong>
              </div>
              <div>
                <span>Son İrsaliye No</span>
                <strong>{selected.lastDispatchNo || "-"}</strong>
              </div>
            </div>

            <div className="model-track-subhead mt-12">
              <h4>Belge Geçmişi</h4>
              <button className="model-track-link-btn" type="button">
                Belge geçmişine git
              </button>
            </div>
            <DocumentHistoryTable rows={historyRows} compact />
            <button className="model-track-link-btn" type="button">
              Tüm evrakları görüntüle
            </button>

            <div className="model-track-subhead mt-12">
              <h4>Üretim Geçmişi</h4>
              <button className="model-track-link-btn" type="button">
                Üretim detaylarına git
              </button>
            </div>
            <div className="table-wrap model-track-table-card">
              <table className="table model-track-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Üretim No</th>
                    <th>Açıklama</th>
                    <th>Gelen Adet</th>
                    <th>Üretilen Adet</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.productionHistory.map((item) => (
                    <tr key={item?.id || item?.productionNo}>
                      <td>{formatDate(item?.date || item?.tarih)}</td>
                      <td>{item?.productionNo || item?.uretimNo || "-"}</td>
                      <td>
                        {item?.description || item?.aciklama || "Seri Üretim"}
                      </td>
                      <td>
                        {formatNumber(item?.incomingQty || item?.gelenAdet)}
                      </td>
                      <td>
                        {formatNumber(item?.producedQty || item?.uretilenAdet)}
                      </td>
                      <td>
                        <StatusBadge
                          status={item?.status || "Tamamlandı"}
                          small
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <aside className="model-track-side-panel">
        <ModelImagePanel
          images={sideImages}
          onUpload={onUploadImages}
          onUpdate={onUpdateImages}
        />
        <SideModelInfo model={selected} archiveMode />
        <LinkedDocumentsCard documents={documents} onFilter={onArchiveFilter} />
      </aside>
    </div>
  );
}

export default function ModelTakipPage({ activeTab, activeMainCompany }) {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [models, setModels] = useState([]);
  const [incomingRows, setIncomingRows] = useState([]);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [documents, setDocuments] = useState({
    customerDispatches: [],
    outgoingDispatches: [],
    invoices: [],
    documentHistory: [],
    productionHistory: [],
    images: [],
  });
  const [searchText, setSearchText] = useState("");
  const [activeFilter, setActiveFilter] = useState("Tümü");
  const [archiveDocFilter, setArchiveDocFilter] = useState("history");
  const [localImages, setLocalImages] = useState([]);
  const erpViewMap = {
    "model-yonetim-ozeti": "dashboard",
    "model-havuzu-is-akisi": "quick",
    "model-raporlari": "report",
  };
  const tab = ["gelen", "arsiv", "havuz"].includes(activeTab)
     ? activeTab
    : "merkez";
  const modelList = useMemo(() => normalizeList(models), [models]);
  const summary = useMemo(
    () => summarizeTrackingModels(modelList),
    [modelList],
  );
  const completedModels = useMemo(
    () =>
      modelList.filter((item) => getStatusBucket(item?.status) === "completed"),
    [modelList],
  );

  const loadModelData = useCallback(
    async (preferredModel = null) => {
      if (!activeMainCompany?.slug) {
        setModels([]);
        setIncomingRows([]);
        setSelectedModel(null);
        setMessage("Ana firma seçmeden model takibi görüntülenemez.");
        setLoading(false);
        return [];
      }
      setLoading(true);
      setMessage("");
      try {
        const [trackingModels, sharedModels, nextIncoming, nextCompanies] =
          await Promise.all([
            getModelTrackingItems(activeMainCompany).catch(() => []),
            fetchSharedModels(activeMainCompany).catch(() => []),
            getIncomingModelDispatches(activeMainCompany),
            fetchCompanies(activeMainCompany).catch(() => []),
          ]);

        const byId = new Map();
        [...sharedModels, ...trackingModels].forEach((row) => {
          const key = modelMergeKey(row);
          if (!key) return;
          byId.set(key, mergeModelRows(byId.get(key) || {}, row));
        });
        if (preferredModel.id) {
          const key = modelMergeKey(preferredModel);
          if (!byId.has(key)) byId.set(key, preferredModel);
        }
        const fetchedModels = sortModelsNewestFirst(dedupeModels(
          Array.from(byId.values()).map((row) =>
            hydrateTrackingModel(row, "backend"),
          ),
        ));
        setModels(fetchedModels);
        setIncomingRows(nextIncoming);
        setCompanyOptions(normalizeList(nextCompanies));
        setSelectedModel(
          (current) =>
            fetchedModels.find((row) => row.id === current?.id) ||
            fetchedModels[0] ||
            null,
        );
        return fetchedModels;
      } catch (error) {
        setModels([]);
        setIncomingRows([]);
        setCompanyOptions([]);
        setSelectedModel(null);
        setMessage(
          error?.message ||
            "Model listesi yüklenemedi. API bağlantısını kontrol edin.",
        );
        return [];
      } finally {
        setLoading(false);
      }
    },
    [activeMainCompany],
  );

  useEffect(() => {
    let mounted = true;
    loadModelData().then((rows) => {
      if (!mounted) return;
      return rows;
    });
    return () => {
      mounted = false;
    };
  }, [loadModelData]);

  useEffect(() => {
    if (loading) return;

    if (!modelList.length) {
      if (selectedModel) setSelectedModel(null);
      return;
    }

    if (!selectedModel?.id) {
      setSelectedModel(modelList[0]);
      return;
    }

    const nextSelected = modelList.find((row) => row.id === selectedModel?.id);
    if (!nextSelected) {
      setSelectedModel(modelList[0] || null);
      return;
    }

    if (nextSelected !== selectedModel) {
      setSelectedModel(nextSelected);
    }
  }, [loading, modelList, selectedModel]);

  useEffect(() => {
    let mounted = true;

    async function loadDocs() {
      if (!selectedModel?.id) {
        setDocuments({
          customerDispatches: [],
          outgoingDispatches: [],
          invoices: [],
          documentHistory: [],
          productionHistory: [],
          images: [],
        });
        return;
      }

      try {
        const payload = await getModelDocuments(
          selectedModel?.id,
          activeMainCompany,
        );
        if (!mounted) return;
        setDocuments(payload);
        setLocalImages(
          normalizeModelImages(payload?.images, selectedModel?.imageUrl),
        );
      } catch (error) {
        if (!mounted) return;
        setDocuments({
          customerDispatches: [],
          outgoingDispatches: [],
          invoices: [],
          documentHistory: [],
          productionHistory: [],
          images: [],
        });
        setLocalImages([]);
        setMessage(
          error?.message ||
            "Model detayları yüklenemedi. API bağlantısını kontrol edin.",
        );
      }
    }

    loadDocs();
    return () => {
      mounted = false;
    };
  }, [activeMainCompany, selectedModel?.id]);

  useEffect(() => {
    if (activeTab !== "arsiv") return;
    if (!completedModels.length) return;
    if (completedModels.some((row) => row.id === selectedModel?.id)) return;
    setSelectedModel(completedModels[0]);
  }, [activeTab, completedModels, selectedModel?.id]);

  const archiveSelectedModel =
    tab === "arsiv"
       completedModels.find((row) => row.id === selectedModel?.id) ||
        completedModels[0] ||
        ? selectedModel
      : selectedModel;

  const sideImages = localImages.length
     ? localImages
    : normalizeModelImages(
        archiveSelectedModel.images || selectedModel?.images || [],
        archiveSelectedModel.imageUrl || selectedModel?.imageUrl || "",
      );

  async function handleImageUpload(files) {
    if (!selectedModel?.id) return;

    const firstFile = Array.from(files || [])[0];
    if (!firstFile) return;

    try {
      const result = await updateModelImages(
        selectedModel?.id,
        files,
        activeMainCompany,
      );
      if (result?.images.length) {
        const uploadedImages = normalizeModelImages(result?.images);
        setLocalImages((prev) => [...uploadedImages, ...prev].slice(0, 6));
        setModels((prev) =>
          prev.map((model) => {
            if (model?.id !== selectedModel?.id) return model;
            const nextImages = normalizeModelImages(
              [...uploadedImages, ...(model?.images || [])],
              uploadedImages[0].url || model?.imageUrl,
            );
            return {
              ...model,
              imageUrl: nextImages[0].url || model?.imageUrl,
              images: nextImages,
            };
          }),
        );
        setSelectedModel((prev) => {
          if (!prev || prev?.id !== selectedModel?.id) return prev;
          const nextImages = normalizeModelImages(
            [...uploadedImages, ...(prev?.images || [])],
            uploadedImages[0].url || prev?.imageUrl,
          );
          return {
            ...prev,
            imageUrl: nextImages[0].url || prev?.imageUrl,
            images: nextImages,
          };
        });
        setMessage("Model görselleri backend'e kaydedildi.");
      }
    } catch (error) {
      setMessage(
        error?.message ||
          "Model görseli yüklenemedi. API bağlantısını kontrol edin.",
      );
    }
  }

  function handleImageUpdate() {
    if (!selectedModel?.id) return;
    setMessage(
      "Görsel güncelleme altyapısı hazır. Endpoint bağlandığında doğrudan çalışacaktır.",
    );
  }

  async function handleDeleteModel(model) {
    const result = await deleteModelTrackingItem(
      activeMainCompany,
      model?.id,
      model,
    );
    const refreshedModels = await loadModelData();
    const filteredModels = filterRemovedModels(refreshedModels, model, result);
    setModels(filteredModels);
    setSelectedModel(
      (current) =>
        filteredModels.find((row) => row.id === current?.id) ||
        filteredModels[0] ||
        null,
    );
    return filteredModels;
  }

  if (loading) {
    return (
      <div className="content-card">
        <h3>Model Takip</h3>
        <p>Model takip ekranı hazırlanıyor...</p>
      </div>
    );
  }

  if (erpViewMap[activeTab]) {
    return <ErpModuleWorkspace moduleKey="model" activeView={erpViewMap[activeTab]} />;
  }

  return (
    <div className="content-grid model-track-page">
      {tab === "merkez"  (
        <ModelTakipMerkeziScreen
          models={models}
          selected={selectedModel}
          summary={summary}
          searchText={searchText}
          onSearchText={setSearchText}
          activeFilter={activeFilter}
          onFilter={setActiveFilter}
          onSelect={setSelectedModel}
          documents={documents}
          sideImages={sideImages}
          onUploadImages={handleImageUpload}
          onUpdateImages={handleImageUpdate}
        />
      ) : null}

      {tab === "gelen"  (
        <GelenModelScreen
          models={models}
          selected={selectedModel}
          documents={documents}
          sideImages={sideImages}
          onSelect={setSelectedModel}
          onUploadImages={handleImageUpload}
          onUpdateImages={handleImageUpdate}
        />
      ) : null}

      {tab === "havuz"  (
        <ModelPoolScreen
          items={models}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          onModelsChange={setModels}
          onDeleteModel={handleDeleteModel}
          onMessage={setMessage}
          activeMainCompany={activeMainCompany}
          onRefresh={loadModelData}
          companyOptions={companyOptions}
        />
      ) : null}
      {tab === "arsiv"  (
        <ArsivScreen
          completedModels={completedModels}
          selected={archiveSelectedModel}
          archiveFilter={archiveDocFilter}
          onArchiveFilter={setArchiveDocFilter}
          documents={documents}
          sideImages={sideImages}
          onUploadImages={handleImageUpload}
          onUpdateImages={handleImageUpdate}
          onSelect={setSelectedModel}
        />
      ) : null}

      {message ? <div className="notice-box">{message}</div> : null}
    </div>
  );
}
