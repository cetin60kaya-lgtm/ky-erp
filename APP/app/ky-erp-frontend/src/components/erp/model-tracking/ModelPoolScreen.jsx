import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  Factory,
  FileText,
  FolderTree,
  ImagePlus,
  PlusCircle,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import SummaryCard from "./SummaryCard";
import StatusBadge from "./StatusBadge";
import {
  createModel,
  normalizeModelImages,
  updateModel,
  updateModelImages,
  uploadModelFiles,
} from "../../../services/modelTrackingService";

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(Number(value || 0));
}

export function formatDateInput(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLogDate(value) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value ? new Date(value) : new Date());
}

export function extractModelNameFromFile(fileName) {
  return String(fileName || "")
    .replace(/\?.[^/.]+$/, "")
    .trim();
}

export function slugifyModelName(modelName) {
  return String(modelName || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatDateForFolder(date = new Date()) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

export function formatModelFolderName(date, modelName) {
  return `${formatDateForFolder(date)} ${slugifyModelName(modelName)}`;
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    model?.sourceKey,
    model?.docModelKey,
    modelName,
    model?.name,
    model?.displayName,
    model?.cardTitle,
    belgeNo,
    customer,
    [modelName, belgeNo].filter(Boolean).join(" "),
    [modelName, customer].filter(Boolean).join(" "),
    [modelName, model?.floor || model?.ground || model?.zemin]
      .filter(Boolean)
      .join(" "),
  ]
    .map(normalizeRemovalKey)
    .filter(Boolean);
}

function filterRemovedItems(items, model, result = {}) {
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
  return (Array.isArray(items) ? items : []).filter((item) => {
    const keys = modelRemovalKeys(item);
    return !keys.some((key) => removedKeys.has(key));
  });
}

export function createLogEntry({
  action,
  modelName,
  detail,
  status = "Tamamlandı",
}) {
  return {
    id: `${action}-${modelName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: formatLogDate(),
    action,
    model: modelName,
    user: "Mecit Hakan",
    detail,
    status,
  };
}

export function buildFolderTree(folderName) {
  const safeName = String(folderName || "model").trim();
  return [`MODEL_FILE_ROOT\\${safeName}\\`];
}

export function inferFileCategory(file) {
  const extension = String(file?.name || "")
    .split(".")
    .pop()
    .toLowerCase();
  if (["jpg", "jpeg", "png", "webp"].includes(extension)) return "ana-gorsel";
  if (["psd", "ai"].includes(extension)) return "desen";
  return "belgeler";
}

export async function createStoredFile(file, modelName, date, category) {
  const extension = String(file?.name || "").includes(".")
     ? String(file?.name).split(".").pop().toUpperCase()
    : "DOSYA";
  const folderName = formatModelFolderName(date, modelName);
  const nextCategory = category || inferFileCategory(file);
  const previewUrl = file?.type.startsWith("image/")
     ? URL.createObjectURL(file)
    : "";

  return {
    id: `${folderName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file?.name,
    extension,
    category: nextCategory,
    size: file?.size,
    uploadedAt: new Date().toISOString(),
    previewUrl,
    path: `models/${folderName}/${nextCategory}/${file?.name}`,
  };
}

function companyName(company) {
  if (!company || typeof company !== "object") return "";
  return String(
    company?.firma ||
      company?.name ||
      company?.firmaAdi ||
      company?.companyName ||
      company?.unvan ||
      "",
  ).trim();
}

function isCustomerCompany(company) {
  if (!company || typeof company !== "object") return false;
  const type = String(
    company?.tip ||
      company?.type ||
      company?.companyType ||
      company?.kartTipi ||
      company?.firmaTipi ||
      company?.cariTipi ||
      "",
  ).toLocaleLowerCase("tr-TR");
  if (!type) return false;
  return (
    type.includes("müşteri") ||
    type.includes("musteri") ||
    type.includes("must") ||
    type.includes("customer") ||
    type.includes("alıcı") ||
    type.includes("alici")
  );
}

function findDefaultFirma(companies = []) {
  const firmalar = companies.filter((company) => companyName(company));
  return (
    firmalar.find((company) =>
      companyName(company).toLocaleLowerCase("tr-TR").includes("taha"),
    ) ||
    firmalar[0] ||
    null
  );
}

function findCompanyByName(companies = [], name = "") {
  const target = String(name || "").trim().toLocaleLowerCase("tr-TR");
  if (!target) return null;
  return (
    companies.find(
      (company) => companyName(company).toLocaleLowerCase("tr-TR") === target,
    ) || null
  );
}

export function createEmptyForm(defaultFirma = "") {
  return {
    modelName: "",
    date: formatDateInput(new Date()),
    customer: defaultFirma,
    department: "",
    ground: "",
    givenQty: "",
    assignedTo: "",
    status: "Aktif",
  };
}

function ModelPoolCard({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`model-pool-card ${selected ? "is-active" : ""}`}
      onClick={() => onSelect(item?.id)}
    >
      <div className="model-pool-card-image">
        {item?.imageUrl ? (
          <img src={item?.imageUrl} alt={item?.modelName} />
        ) : (
          <div className="model-pool-card-image-fallback">
            <strong>{item?.modelName.slice(0, 2)}</strong>
          </div>
        )}
      </div>

      <div className="model-pool-card-title-row">
        <strong>{item?.modelName}</strong>
        <StatusBadge status={item?.status} small />
      </div>

      <div className="model-pool-card-mini-meta">
        <span>{item?.customer || "-"}</span>
        <span>Zemin: {item?.ground || "-"}</span>
        <span>Verilen: {formatNumber(item?.givenQty)}</span>
        <span>Durum: {item?.status}</span>
      </div>
    </button>
  );
}

function BulkDraftTable({ rows, onChangeName, onRemove, onCommit }) {
  return (
    <section className="content-card model-pool-draft-card">
      <div className="model-track-subhead">
        <h4>Ön İzleme Havuzu</h4>
        <button type="button" className="primary-btn" onClick={onCommit}>
          Tamam / Model Aç
        </button>
      </div>

      <div className="table-wrap model-track-table-card">
        <table className="table model-track-table">
          <thead>
            <tr>
              <th>Dosya Adı</th>
              <th>Model Adı</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row?.id}>
                <td>{row?.fileName}</td>
                <td>
                  <input
                    className="model-pool-draft-input"
                    value={row?.modelName}
                    onChange={(event) =>
                      onChangeName(row?.id, event?.target.value)
                    }
                  />
                </td>
                <td>{row?.status}</td>
                <td>
                  <button
                    type="button"
                    className="soft-btn model-pool-row-action"
                    onClick={() => onRemove(row?.id)}
                  >
                    <X size={14} />
                    Kaldır
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ModelPoolScreen({
  items: controlledItems,
  selectedModel: controlledSelectedModel,
  onSelectModel,
  onModelsChange,
  onDeleteModel,
  onMessage,
  activeMainCompany,
  onRefresh,
  companyOptions = [],
}) {
  const [localItems, setLocalItems] = useState([]);
  const [localSelectedId, setLocalSelectedId] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    customer: "Tümü",
    department: "Tümü",
    status: "Tümü",
    ground: "Tümü",
    date: "",
  });
  const [editorMode, setEditorMode] = useState("edit");
  const [form, setForm] = useState(createEmptyForm());
  const [bulkDrafts, setBulkDrafts] = useState([]);
  const [fullscreenImage, setFullscreenImage] = useState("");
  const [visibleCount, setVisibleCount] = useState(120);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const bulkInputRef = useRef(null);

  const items = controlledItems || localItems;
  const firmaOptions = useMemo(
    () => companyOptions.filter((company) => isCustomerCompany(company) && companyName(company)),
    [companyOptions],
  );
  const defaultFirma = useMemo(
    () => companyName(findDefaultFirma(firmaOptions)),
    [firmaOptions],
  );

  const selectedModel = useMemo(() => {
    if (controlledSelectedModel.id) {
      return (
        items.find((item) => item.id === controlledSelectedModel.id) ||
        controlledSelectedModel
      );
    }
    return (
      items.find((item) => item.id === localSelectedId) || items[0] || null
    );
  }, [controlledSelectedModel, items, localSelectedId]);

  function commitItems(updater) {
    const nextItems = typeof updater === "function" ? updater(items) : updater;
    onModelsChange?.(nextItems);
    if (!onModelsChange) {
      setLocalItems(nextItems);
    }
    return nextItems;
  }

  function selectModel(nextModel) {
    onSelectModel?.(nextModel);
    if (!onSelectModel) {
      setLocalSelectedId(nextModel.id || "");
    }
  }

  useEffect(() => {
    if (selectedModel || !items.length) return;
    selectModel(items[0]);
  }, [items, selectedModel]);

  useEffect(() => {
    if (editorMode === "create") return;
    if (!selectedModel) {
      setForm(createEmptyForm(defaultFirma));
      return;
    }
    setForm({
      modelName: selectedModel?.modelName || "",
      date: formatDateInput(selectedModel?.date),
      customer: selectedModel?.customer || defaultFirma,
      department: selectedModel?.department || "",
      ground: selectedModel?.ground || "",
      givenQty: String(selectedModel?.givenQty || ""),
      assignedTo: selectedModel?.assignedTo || "",
      status: selectedModel?.status || "Aktif",
    });
  }, [defaultFirma, editorMode, selectedModel]);

  useEffect(() => {
    if (!defaultFirma) return;
    setForm((prev) => {
      if (prev?.customer) return prev;
      return { ...prev, customer: defaultFirma };
    });
  }, [defaultFirma]);

  const customerOptions = useMemo(
    () => [
      "Tümü",
      ...new Set(items.map((item) => item?.customer).filter(Boolean)),
    ],
    [items],
  );
  const departmentOptions = useMemo(
    () => [
      "Tümü",
      ...new Set(items.map((item) => item?.department).filter(Boolean)),
    ],
    [items],
  );
  const statusOptions = useMemo(
    () => [
      "Tümü",
      ...new Set(items.map((item) => item?.status).filter(Boolean)),
    ],
    [items],
  );
  const groundOptions = useMemo(
    () => [
      "Tümü",
      ...new Set(items.map((item) => item?.ground).filter(Boolean)),
    ],
    [items],
  );

  const filteredItems = useMemo(() => {
    const searchValue = filters.search.trim().toLocaleLowerCase("tr-TR");
    return items.filter((item) => {
      if (filters.customer !== "Tümü" && item?.customer !== filters.customer) {
        return false;
      }
      if (
        filters.department !== "Tümü" &&
        item?.department !== filters.department
      ) {
        return false;
      }
      if (filters.status !== "Tümü" && item?.status !== filters.status) {
        return false;
      }
      if (filters.ground !== "Tümü" && item?.ground !== filters.ground) {
        return false;
      }
      if (filters.date && formatDateInput(item?.date) !== filters.date) {
        return false;
      }
      if (!searchValue) return true;
      return [item?.modelName, item?.customer, item?.ground, item?.status]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(searchValue);
    });
  }, [filters, items]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  );

  useEffect(() => {
    setVisibleCount(120);
  }, [
    filters.search,
    filters.customer,
    filters.department,
    filters.status,
    filters.ground,
    filters.date,
    items.length,
  ]);

  const summary = useMemo(
    () => ({
      total: items.length,
      active: items.filter((item) => item.status === "Aktif").length,
      boya: items.filter((item) => item.status === "Boyahanede").length,
      imalat: items.filter((item) => item.status === "İmalatta").length,
      completed: items.filter((item) => item.status === "Tamamlandı").length,
    }),
    [items],
  );

  const selectedImageList = useMemo(() => {
    if (!selectedModel) return [];
    const imageFiles = (selectedModel?.files || [])
      .filter((file) => file?.previewUrl)
      .map((file) => ({
        id: file?.id,
        url: file?.previewUrl,
        name: file?.name,
      }));
    const modelImages = normalizeModelImages(
      selectedModel?.images,
      selectedModel?.imageUrl,
    );
    return [...modelImages, ...imageFiles].slice(0, 6);
  }, [selectedModel]);

  const selectedFolderTree = useMemo(() => {
    if (selectedModel?.modelFolderPath) return [selectedModel?.modelFolderPath];
    if (!selectedModel) return buildFolderTree("model");
    return buildFolderTree(selectedModel?.folderName || selectedModel?.modelName);
  }, [selectedModel]);

  const allLogs = useMemo(
    () =>
      items
        .flatMap((item) => item?.logs || [])
        .sort((left, right) => right.id.localeCompare(left.id)),
    [items],
  );

  function updateFilter(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleNewRecord() {
    setEditorMode("create");
    setForm(createEmptyForm(defaultFirma));
  }

  function buildModelPayload(modelName, overrides = {}) {
    const firma = String(overrides.firma ?? form.customer ?? defaultFirma).trim();
    const selectedCompany = findCompanyByName(firmaOptions, firma);
    return {
      modelName,
      modelAdi: modelName,
      musteri: firma,
      musteriFirma: firma,
      customer: firma,
      firma,
      firmaAdi: firma,
      firmaId: selectedCompany?.id || overrides.firmaId || "",
      companyId: selectedCompany?.id || overrides.firmaId || "",
      zemin: String(overrides.zemin ? form.ground ?? "").trim(),
      groundColor: String(overrides.zemin ? form.ground ?? "").trim(),
      department: String(overrides.department ? form.department ?? "").trim(),
      quantity: toNumber(overrides.quantity ? form.givenQty),
      assignedTo: String(overrides.assignedTo ? form.assignedTo ?? "").trim(),
      date: form.date || formatDateInput(new Date()),
      orderNo: overrides.orderNo ? (form.givenQty ? String(form.givenQty) : ""),
      status: overrides.status || form.status || "Aktif",
      not: overrides.not || "",
    };
  }

  function handleSave() {
    if (!form.modelName.trim()) {
      onMessage?.("Model adı zorunlu.");
      return;
    }
    const selectedCompany = findCompanyByName(firmaOptions, form.customer);
    if (!selectedCompany) {
      onMessage?.(
        firmaOptions.length
           ? "Model kaydı için müşteri firma seçmelisiniz."
          : "Müşteri tipinde firma bulunamadı. Önce Firma Kartları'ndan müşteri firma açın.",
      );
      return;
    }

    const nextModelName = form.modelName.trim();
    const nextDate = form.date || formatDateInput(new Date());
    const nextFolderName = formatModelFolderName(nextDate, nextModelName);
    const payload = buildModelPayload(nextModelName);

    if (activeMainCompany) {
      createModel(activeMainCompany, payload)
        .then((saved) => {
          onMessage?.("Yeni model kaydedildi.");
          if (onRefresh) {
            onRefresh(saved).then.((rows) => {
              const refreshedHasModel = rows.some?.(
                (row) => String(row?.id) === String(saved?.id),
              );
              if (refreshedHasModel) return;
              const nextItem = {
                ...saved,
                id: saved?.id,
                modelName: saved?.modelName || nextModelName,
                date: nextDate,
                customer: companyName(selectedCompany),
                department: form.department.trim(),
                ground: form.ground.trim(),
                givenQty: toNumber(form.givenQty),
                assignedTo: form.assignedTo.trim(),
                status: form.status,
                imageUrl: saved?.imageUrl || "",
                images: normalizeModelImages(saved?.images, saved?.imageUrl),
                folderName: nextFolderName,
                files: [],
                logs: [],
              };
              const nextItems = commitItems((prev) => [nextItem, ...prev]);
              selectModel(nextItems[0]);
              setEditorMode("edit");
            });
          } else {
            const nextItem = {
              ...saved,
              id: saved?.id,
              modelName: nextModelName,
              date: nextDate,
              customer: companyName(selectedCompany),
              department: form.department.trim(),
              ground: form.ground.trim(),
              givenQty: toNumber(form.givenQty),
              assignedTo: form.assignedTo.trim(),
              status: form.status,
              imageUrl: "",
              folderName: nextFolderName,
              files: [],
              logs: [],
            };
            commitItems((prev) => [nextItem, ...prev]);
            selectModel(nextItem);
            setEditorMode("edit");
          }
        })
        .catch((err) => {
          onMessage?.(err.message || "Model kaydedilemedi.");
        });
    } else {
      // activeMainCompany yoksa sadece local state güncelle (eski davranış)
      const nextItem = {
        id: `pool-${slugifyModelName(nextModelName)}-${Date.now()}`,
        modelName: nextModelName,
        date: nextDate,
        customer: companyName(selectedCompany),
        department: form.department.trim(),
        ground: form.ground.trim(),
        givenQty: toNumber(form.givenQty),
        assignedTo: form.assignedTo.trim(),
        status: form.status,
        imageUrl: "",
        folderName: nextFolderName,
        files: [],
        logs: [],
      };
      commitItems((prev) => [nextItem, ...prev]);
      selectModel(nextItem);
      setEditorMode("edit");
      onMessage?.("Yeni model kartı oluşturuldu.");
    }
  }

  function handleUpdate() {
    if (!selectedModel) return;
    if (!form.modelName.trim()) {
      onMessage?.("Model adı zorunlu.");
      return;
    }
    const selectedCompany = findCompanyByName(firmaOptions, form.customer);
    if (!selectedCompany) {
      onMessage?.("Model kaydı için müşteri firma seçmelisiniz.");
      return;
    }

    const nextModelName = form.modelName.trim();
    const nextDate = form.date || formatDateInput(new Date());
    const nextFolderName = formatModelFolderName(nextDate, nextModelName);
    const payload = buildModelPayload(nextModelName, {
      firmaId: selectedModel?.firmaId || "",
      status: form.status || selectedModel?.status || "Aktif",
    });

    if (
      activeMainCompany &&
      selectedModel?.id &&
      !String(selectedModel?.id).startsWith("pool-")
    ) {
      updateModel(activeMainCompany, selectedModel?.id, payload)
        .then((updated) => {
          onMessage?.("Model güncellendi.");
          if (onRefresh) {
            onRefresh(updated);
          } else {
            const nextItems = commitItems((prev) =>
              prev.map((item) => {
                if (item?.id !== selectedModel?.id) return item;
                return {
                  ...item,
                  ...updated,
                  folderName: nextFolderName,
                  files: item?.files || [],
                  logs: [
                    createLogEntry({
                      action: "Model güncellendi",
                      modelName: nextModelName,
                      detail: `${nextModelName} bilgileri güncellendi`,
                    }),
                    ...(item?.logs || []),
                  ],
                };
              }),
            );
            selectModel(
              nextItems.find((item) => item.id === selectedModel?.id) || null,
            );
            setEditorMode("edit");
          }
        })
        .catch((err) => {
          onMessage?.(err.message || "Model güncellenemedi.");
        });
    } else {
      // local-only model veya activeMainCompany yoksa local güncelle
      const nextItems = commitItems((prev) =>
        prev.map((item) => {
          if (item?.id !== selectedModel?.id) return item;
          const nextFiles = (item?.files || []).map((file) => ({
            ...file,
            path: `MODEL_FILE_ROOT\\${nextFolderName}\\${file?.name}`,
          }));
          return {
            ...item,
            modelName: nextModelName,
            date: nextDate,
            customer: companyName(selectedCompany),
            department: form.department.trim(),
            ground: form.ground.trim(),
            givenQty: toNumber(form.givenQty),
            assignedTo: form.assignedTo.trim(),
            status: form.status,
            folderName: nextFolderName,
            files: nextFiles,
            logs: [
              createLogEntry({
                action: "Model güncellendi",
                modelName: nextModelName,
                detail: `${nextModelName} bilgileri güncellendi`,
              }),
              ...(item?.logs || []),
            ],
          };
        }),
      );
      selectModel(
        nextItems.find((item) => item.id === selectedModel?.id) || null,
      );
      setEditorMode("edit");
      onMessage?.("Model bilgileri güncellendi.");
    }
  }

  async function handleDelete() {
    if (!selectedModel) return;
    const confirmed = window.confirm(
      `${selectedModel?.modelName} model kartı arşive alınsın mı Listeye geri dönmemesi için işlem backend'e kaydedilir.`,
    );
    if (!confirmed) return;

    try {
      let deleteResult = null;
      let nextItems = filterRemovedItems(items, selectedModel);
      if (onDeleteModel) {
        const refreshedItems = await onDeleteModel(selectedModel);
        if (Array.isArray(refreshedItems)) {
          nextItems = refreshedItems;
        } else if (refreshedItems && typeof refreshedItems === "object") {
          deleteResult = refreshedItems;
          nextItems = filterRemovedItems(
            nextItems,
            selectedModel,
            deleteResult,
          );
        }
      }
      nextItems = filterRemovedItems(
        nextItems,
        selectedModel,
        deleteResult || {},
      );
      commitItems(nextItems);
      selectModel(nextItems[0] || null);
      setEditorMode("edit");
      setForm(createEmptyForm(defaultFirma));
      onMessage?.(`${selectedModel?.modelName} kartı arşive alındı.`);
    } catch (error) {
      onMessage?.(
        error?.message ||
          "Model arşive alınamadı. API bağlantısını kontrol edin.",
      );
    }
  }

  async function handleImageUpload(fileList) {
    const file = Array.from(fileList || [])[0];
    if (!file || !selectedModel) return;

    let storedFile = await createStoredFile(
      file,
      selectedModel?.modelName,
      selectedModel?.date,
      "ana-gorsel",
    );

    if (
      activeMainCompany &&
      selectedModel?.id &&
      !String(selectedModel?.id).startsWith("pool-")
    ) {
      try {
        const result = await updateModelImages(
          selectedModel?.id,
          [file],
          activeMainCompany,
        );
        const savedImage = result?.images?.[0];
        if (savedImage.url) {
          storedFile = {
            ...storedFile,
            id: savedImage.id || storedFile.id,
            name: savedImage.name || storedFile.name,
            previewUrl: savedImage.url,
            path: savedImage.path || savedImage.url,
          };
        }
      } catch (error) {
        onMessage?.(
          error?.message ||
            "Model görseli backend'e kaydedilemedi. Geçici önizleme eklendi.",
        );
      }
    }

    const nextItems = commitItems((prev) =>
      prev.map((item) => {
        if (item?.id !== selectedModel?.id) return item;
        return {
          ...item,
          imageUrl: storedFile.previewUrl || item?.imageUrl,
          files: [storedFile, ...(item?.files || [])],
          logs: [
            createLogEntry({
              action: "Görsel yüklendi",
              modelName: item?.modelName,
              detail: `${storedFile.name} ana-gorsel klasorune yuklendi`,
            }),
            ...(item?.logs || []),
          ],
        };
      }),
    );

    selectModel(nextItems.find((item) => item.id === selectedModel?.id) || null);

    onMessage?.("Model görseli yüklendi.");
  }

  async function handleFileUpload(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || !selectedModel) return;

    let storedFiles = await Promise.all(
      files.map((file) =>
        createStoredFile(file, selectedModel?.modelName, selectedModel?.date),
      ),
    );

    if (
      activeMainCompany &&
      selectedModel?.id &&
      !String(selectedModel?.id).startsWith("pool-")
    ) {
      try {
        const result = await uploadModelFiles(
          selectedModel?.id,
          files,
          activeMainCompany,
        );
        if (result?.files.length) {
          storedFiles = result?.files.map((file) => ({
            id: file?.id,
            name: file?.originalFileName || file?.name,
            category: "model-dosyasi",
            path: file?.relativePath || file?.filePath || file?.path,
            previewUrl: "",
          }));
        }
      } catch (error) {
        onMessage?.(
          error?.message ||
            "Dosyalar backend'e kaydedilemedi. Geçici listeye eklendi.",
        );
      }
    }

    const nextItems = commitItems((prev) =>
      prev.map((item) => {
        if (item?.id !== selectedModel?.id) return item;
        return {
          ...item,
          files: [...storedFiles, ...(item?.files || [])],
          logs: [
            createLogEntry({
              action: "Dosya yüklendi",
              modelName: item?.modelName,
              detail: `${storedFiles.length} dosya secili model klasorune yuklendi`,
            }),
            ...(item?.logs || []),
          ],
        };
      }),
    );

    selectModel(nextItems.find((item) => item.id === selectedModel?.id) || null);

    onMessage?.("Dosyalar seçili model klasörüne eklendi.");
  }

  function handleBulkFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const nextDrafts = files.map((file) => ({
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      fileName: file?.name,
      modelName: extractModelNameFromFile(file?.name),
      status: "Taslak",
    }));

    setBulkDrafts((prev) => [...nextDrafts, ...prev]);
    onMessage?.(`${files.length} dosya ön izleme havuzuna alındı.`);
  }

  function handleBulkDraftNameChange(id, value) {
    setBulkDrafts((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, modelName: value, status: "Hazır" } : row,
      ),
    );
  }

  function handleBulkDraftRemove(id) {
    setBulkDrafts((prev) => prev?.filter((row) => row?.id !== id));
  }

  async function handleCommitBulkDrafts() {
    if (!bulkDrafts.length) return;
    const bulkFirma = form.customer || defaultFirma;
    const selectedCompany = findCompanyByName(firmaOptions, bulkFirma);
    if (!selectedCompany) {
      onMessage?.("Toplu model açmak için müşteri firma seçmelisiniz.");
      return;
    }

    const validDrafts = bulkDrafts.filter((row) => row?.modelName.trim());
    const createdItems = await Promise.all(
      validDrafts.map(async (row) => {
        const modelName = row?.modelName.trim();
        const date = new Date();
        const folderName = formatModelFolderName(date, modelName);
        const storedFile = await createStoredFile(row?.file, modelName, date);
        let savedModel = null;
        let savedImage = null;

        if (activeMainCompany) {
          savedModel = await createModel(
            activeMainCompany,
            buildModelPayload(modelName, {
              firma: companyName(selectedCompany),
              firmaId: selectedCompany?.id,
              status: "Aktif",
            }),
          );
          if (row?.file.type.startsWith("image/")) {
            const result = await updateModelImages(
              savedModel.id,
              [row?.file],
              activeMainCompany,
            );
            savedImage = result?.images?.[0] || null;
          }
        }

        const imageUrl = savedImage.url || storedFile.previewUrl || "";
        const modelId =
          savedModel.id ||
          `pool-${slugifyModelName(modelName)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const firma =
          savedModel.customer ||
          savedModel.firmaAdi ||
          companyName(selectedCompany);
        const imageList = normalizeModelImages(
          savedImage ? [savedImage] : [],
          imageUrl,
        );

        return {
          ...(savedModel || {}),
          id: modelId,
          modelName,
          date: formatDateInput(date),
          customer: firma,
          firma,
          department: "",
          ground: "",
          givenQty: 0,
          assignedTo: "",
          status: "Aktif",
          imageUrl,
          images: imageList,
          folderName,
          files: [
            {
              ...storedFile,
              id: savedImage.id || storedFile.id,
              previewUrl: imageUrl,
              path: savedImage.path || savedImage.url || storedFile.path,
            },
          ],
          logs: [
            createLogEntry({
              action: "Model açıldı",
              modelName,
              detail: `${row?.fileName} dosyasından model oluşturuldu`,
            }),
            createLogEntry({
              action: "Dosya klasörü oluşturuldu",
              modelName,
              detail: `${folderName} klasörü oluşturuldu`,
            }),
          ],
        };
      }),
    );

    if (!createdItems.length) {
      onMessage?.("Taslak havuzunda model adı boş olan kayıtlar açılamadı.");
      return;
    }

    commitItems((prev) => [...createdItems, ...prev]);
    selectModel(createdItems[0]);
    setBulkDrafts([]);
    setEditorMode("edit");
    if (onRefresh && activeMainCompany) onRefresh(createdItems[0]);
    onMessage?.(`${createdItems.length} model kartı taslaktan açıldı.`);
  }

  return (
    <div className="model-pool-screen">
      <section className="model-pool-main">
        <div className="section-header">
          <div>
            <h3>Model Havuzu</h3>
            <p>
              KY ERP mevcut tasarımını koruyarak modeli solda düzenleyin, ortada
              havuzdan seçin, sağda görsel ve dosya klasörünü yönetin.
            </p>
          </div>
        </div>

        <div className="model-track-summary-grid">
          <SummaryCard
            icon={<Boxes size={20} />}
            label="Toplam Model"
            value={formatNumber(summary.total)}
            helper="Havuzdaki toplam kart"
          />
          <SummaryCard
            icon={<PlusCircle size={20} />}
            label="Aktif Model"
            value={formatNumber(summary.active)}
            helper="Açık kartlar"
          />
          <SummaryCard
            icon={<Factory size={20} />}
            label="Boyahanede"
            value={formatNumber(summary.boya)}
            helper="Boya sürecindekiler"
          />
          <SummaryCard
            icon={<FileText size={20} />}
            label="İmalatta"
            value={formatNumber(summary.imalat)}
            helper="İmalat aşaması"
          />
          <SummaryCard
            icon={<CheckCircle2 size={20} />}
            label="Tamamlanan"
            value={formatNumber(summary.completed)}
            helper="Kapanan kartlar"
          />
        </div>

        <section className="content-card model-pool-toolbar">
          <div className="model-pool-filter-grid">
            <label className="model-pool-filter-field model-pool-filter-search">
              <span>Model adı arama</span>
              <div className="model-track-search-field compact">
                <Search size={15} />
                <input
                  value={filters.search}
                  onChange={(event) =>
                    updateFilter("search", event?.target.value)
                  }
                  placeholder="Model adı, müşteri veya zemin ara..."
                />
              </div>
            </label>

            <label className="model-pool-filter-field">
              <span>Firma</span>
              <select
                value={filters.customer}
                onChange={(event) =>
                  updateFilter("customer", event?.target.value)
                }
              >
                {customerOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="model-pool-filter-field">
              <span>Departman</span>
              <select
                value={filters.department}
                onChange={(event) =>
                  updateFilter("department", event?.target.value)
                }
              >
                {departmentOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="model-pool-filter-field">
              <span>Durum</span>
              <select
                value={filters.status}
                onChange={(event) => updateFilter("status", event?.target.value)}
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="model-pool-filter-field">
              <span>Zemin</span>
              <select
                value={filters.ground}
                onChange={(event) => updateFilter("ground", event?.target.value)}
              >
                {groundOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="model-pool-filter-field">
              <span>Tarih</span>
              <input
                type="date"
                value={filters.date}
                onChange={(event) => updateFilter("date", event?.target.value)}
              />
            </label>

            <button
              type="button"
              className="soft-btn model-pool-bulk-btn"
              onClick={() => bulkInputRef.current.click()}
            >
              <Upload size={16} />
              Toplu Model Aç
            </button>
          </div>

          <input
            ref={bulkInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,.psd,.ai"
            multiple
            hidden
            onChange={(event) => {
              handleBulkFiles(event?.target.files);
              event.target.value = "";
            }}
          />

          <div className="model-pool-bulk-strip">
            <div>
              <strong>Toplu Model Açma</strong>
              <span>
                JPG, PNG, PDF, PSD ve AI dosyaları önce taslak havuza düşer.
              </span>
            </div>
            <span>Model adı dosya adından otomatik alınır.</span>
          </div>
        </section>

        {bulkDrafts.length ? (
          <BulkDraftTable
            rows={bulkDrafts}
            onChangeName={handleBulkDraftNameChange}
            onRemove={handleBulkDraftRemove}
            onCommit={handleCommitBulkDrafts}
          />
        ) : null}

        <div className="model-pool-body model-pool-body-3col">
          <aside className="content-card model-pool-editor-panel">
            <div className="model-track-subhead">
              <h4>Sol Düzenleme Paneli</h4>
              <StatusBadge
                status={editorMode === "create" ? "Aktif" : form.status}
                small
              />
            </div>

            <div className="form-grid model-pool-editor-grid">
              <label className="field">
                <span>Model adı</span>
                <input
                  value={form.modelName}
                  onChange={(event) =>
                    updateForm("modelName", event?.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Tarih</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => updateForm("date", event?.target.value)}
                />
              </label>
              <label className="field">
                <span>Firma *</span>
                <select
                  value={form.customer}
                  onChange={(event) =>
                    updateForm("customer", event?.target.value)
                  }
                >
                  <option value="">
                    {firmaOptions.length
                       ? "Müşteri firma seçin"
                      : "Müşteri tipinde firma yok"}
                  </option>
                  {firmaOptions.map((company) => (
                    <option
                      key={company?.id || companyName(company)}
                      value={companyName(company)}
                    >
                      {companyName(company)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Departman</span>
                <input
                  value={form.department}
                  onChange={(event) =>
                    updateForm("department", event?.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Zemin</span>
                <input
                  value={form.ground}
                  onChange={(event) => updateForm("ground", event?.target.value)}
                />
              </label>
              <label className="field">
                <span>Verilen adet</span>
                <input
                  type="number"
                  min="0"
                  value={form.givenQty}
                  onChange={(event) =>
                    updateForm("givenQty", event?.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Atanan kişi</span>
                <input
                  value={form.assignedTo}
                  onChange={(event) =>
                    updateForm("assignedTo", event?.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Durum</span>
                <select
                  value={form.status}
                  onChange={(event) => updateForm("status", event?.target.value)}
                >
                  {["Aktif", "Boyahanede", "İmalatta", "Tamamlandı"].map(
                    (option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            <div className="model-pool-form-actions model-pool-form-actions-stack">
              <button
                type="button"
                className="soft-btn"
                onClick={handleNewRecord}
              >
                Yeni Kayıt
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleSave}
                disabled={!form.customer || !firmaOptions.length}
              >
                Kaydet
              </button>
              <button type="button" className="soft-btn" onClick={handleUpdate}>
                Güncelle
              </button>
              <button
                type="button"
                className="soft-btn danger"
                onClick={handleDelete}
              >
                <Trash2 size={14} />
                Sil
              </button>
            </div>
          </aside>

          <section className="content-card model-pool-grid-card">
            <div className="model-track-subhead">
              <h4>Model Kart Havuzu</h4>
              <span className="model-pool-helper-text">
                {formatNumber(visibleItems.length)} /{" "}
                {formatNumber(filteredItems.length)} kart görüntüleniyor
              </span>
            </div>

            <div className="model-pool-card-grid">
              {visibleItems.map((item) => (
                <ModelPoolCard
                  key={item?.id}
                  item={item}
                  selected={selectedModel.id === item?.id}
                  onSelect={() => {
                    selectModel(item);
                    setEditorMode("edit");
                  }}
                />
              ))}
            </div>

            {filteredItems.length > visibleItems.length ? (
              <div className="model-pool-more-row">
                <button
                  type="button"
                  className="soft-btn"
                  onClick={() =>
                    setVisibleCount((prev) =>
                      Math.min(filteredItems.length, prev + 180),
                    )
                  }
                >
                  Daha fazla yükle (
                  {formatNumber(filteredItems.length - visibleItems.length)})
                </button>
              </div>
            ) : null}

            {!filteredItems.length ? (
              <div className="model-pool-empty-state">
                <h4>Kayıt bulunamadı</h4>
                <p>Filtreleri temizleyin veya yeni kayıt açın.</p>
              </div>
            ) : null}
          </section>

          <aside className="model-pool-detail-panel">
            <section className="content-card model-pool-preview-card">
              <div className="model-track-subhead">
                <h4>Seçili Model Görseli</h4>
                <button
                  type="button"
                  className="soft-btn"
                  onClick={() => imageInputRef.current.click()}
                >
                  <ImagePlus size={14} />
                  Görsel Yükle
                </button>
              </div>

              <button
                type="button"
                className="model-pool-preview-stage"
                onClick={() =>
                  setFullscreenImage(
                    selectedImageList[0].url || selectedModel?.imageUrl || "",
                  )
                }
              >
                {selectedImageList[0].url || selectedModel?.imageUrl ? (
                  <img
                    src={selectedImageList[0].url || selectedModel?.imageUrl}
                    alt={selectedModel?.modelName || "Seçili model"}
                  />
                ) : (
                  <div className="model-pool-preview-fallback">
                    <strong>
                      {selectedModel?.modelName.slice(0, 2) || "MD"}
                    </strong>
                    <span>Tam ekran için tıklayın</span>
                  </div>
                )}
              </button>

              <div className="model-pool-preview-thumbs">
                {selectedImageList.slice(0, 4).map((image) => (
                  <button
                    key={image?.id}
                    type="button"
                    className="model-pool-preview-thumb"
                    onClick={() => setFullscreenImage(image?.url)}
                  >
                    <img src={image?.url} alt={image?.name} />
                  </button>
                ))}
              </div>

              <div className="model-pool-upload-actions">
                <button
                  type="button"
                  className="soft-btn"
                  onClick={() => imageInputRef.current.click()}
                >
                  <Upload size={14} />
                  Görsel Yükle
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => fileInputRef.current.click()}
                >
                  <Upload size={14} />
                  Dosya Yükle
                </button>
              </div>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  handleImageUpload(event?.target.files);
                  event.target.value = "";
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,.psd,.ai"
                multiple
                hidden
                onChange={(event) => {
                  handleFileUpload(event?.target.files);
                  event.target.value = "";
                }}
              />
            </section>

            <section className="content-card model-pool-file-center compact">
              <div className="model-track-subhead">
                <h4>Dosya Listesi</h4>
                <span className="model-pool-helper-text">
                  {(selectedModel?.files || []).length} dosya
                </span>
              </div>
              <div className="model-pool-file-list compact">
                {(selectedModel.files || []).map((file) => (
                  <div key={file?.id} className="model-pool-file-row">
                    <strong>{file?.name}</strong>
                    <small>{file?.category}</small>
                    <span>{file?.path}</span>
                  </div>
                ))}
                {!selectedModel?.files.length ? (
                  <div className="model-pool-file-row is-empty">
                    <strong>Dosya yok</strong>
                    <small>Seçili modele henüz dosya yüklenmedi.</small>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="content-card model-pool-file-center compact">
              <div className="model-track-subhead">
                <h4>Klasör Yolu</h4>
                <FolderTree size={15} />
              </div>
              <div className="model-pool-folder-tree">
                {selectedFolderTree.map((entry, index) => (
                  <div key={`${entry}-${index}`}>
                    <span>{entry}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <section className="content-card model-pool-log-card">
          <div className="model-track-subhead">
            <h4>Kesin İşlem Logu</h4>
            <span className="model-pool-helper-text">
              Tüm model işlemleri tek akışta gösterilir
            </span>
          </div>

          <div className="table-wrap model-track-table-card">
            <table className="table model-track-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>İşlem</th>
                  <th>Model</th>
                  <th>Kullanıcı</th>
                  <th>Açıklama</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {allLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.date}</td>
                    <td>{log.action}</td>
                    <td>{log.model}</td>
                    <td>{log.user}</td>
                    <td>{log.detail}</td>
                    <td>
                      <StatusBadge status={log.status} small />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {fullscreenImage ? (
        <div
          className="model-image-modal"
          onClick={() => setFullscreenImage("")}
        >
          <div className="model-image-modal-body">
            <img src={fullscreenImage} alt="Model görseli" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
