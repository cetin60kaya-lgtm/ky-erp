import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  FolderOpen,
  ImageOff,
  Layers,
  Palette,
  Pencil,
  PlusCircle,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { API_BASE, apiGet } from "../../utils/api";
import {
  bulkDesenHavuzFirmaAta,
  bulkDesenHavuzModelEkle,
  getDesenImportFolderStatus,
  getDesenHavuzStorageDurum,
  getDesenHavuz,
  openDesenImportFolder,
  runDesenHavuzOcrIndex,
  scanDesenImportFolder,
  searchDesenHavuz,
  updateDesenHavuzKaydi,
  uploadDesenHavuzImage,
} from "../../services/desenApi";
import {
  activePrintRegions,
  normalizePrintRegions,
  saveModelPrintRegions,
} from "../../services/modelPrintRegionService";

function toRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload?.rows;
  if (Array.isArray(payload?.items)) return payload?.items;
  if (Array.isArray(payload?.data)) return payload?.data;
  return [];
}

function assetUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^[a-z]:[\\/]/i.test(url) || url.startsWith("\\\\")) return "";
  if (/^(blob:|data:|https:\/\/)/i.test(url)) return url;
  if (/^\/api\//i.test(url)) return `${API_BASE.replace(/\/api$/i, "")}${url}`;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function boolText(value) {
  return value ? "Var" : "Yok";
}

function dateTimeText(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("tr-TR");
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DESEN_GELEN_KLASORU = "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\desen\\gelen";

export default function DesenModeller({ activeMainCompany }) {
  const [rows, setRows] = useState([]);
  const [firms, setFirms] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [firmaAtamaId, setFirmaAtamaId] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Desenler yükleniyor...");
  const [loading, setLoading] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState("");
  const [regionEditorOpen, setRegionEditorOpen] = useState(false);
  const [regionDraft, setRegionDraft] = useState([]);
  const [newRegionName, setNewRegionName] = useState("");
  const [renderLimit, setRenderLimit] = useState(240);
  const [newModelMode, setNewModelMode] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [newlyAddedIds, setNewlyAddedIds] = useState([]);
  const [folderStatus, setFolderStatus] = useState({
    connected: false,
    folderPath: DESEN_GELEN_KLASORU,
    pendingFileCount: 0,
    lastScanAt: "",
    scanRunning: false,
    lastScanNewModels: 0,
    alreadyProcessedCount: 0,
    failedCount: 0,
    processedFileCount: 0,
    defaultFirmName: "",
  });
  const uploadImageRef = useRef(null);
  const autoScanRef = useRef("");
  const [detailForm, setDetailForm] = useState({
    modelName: "",
    firmId: "",
    renkSayisi: "",
    tagsText: "",
    aciklama: "",
  });
  const [filters, setFilters] = useState({
    firmId: "",
    hasVisual: "",
    isActive: "",
    inGlobalPool: "",
    pendingFirm: "",
    sortBy: "date",
  });

  const companyParams = useMemo(
    () => ({
      mainCompanyId: activeMainCompany?.id || "",
      mainCompanySlug: activeMainCompany?.slug || "",
    }),
    [activeMainCompany],
  );

  const firmMap = useMemo(() => {
    const map = new Map();
    firms.forEach((firm) => map.set(String(firm.id), firm));
    return map;
  }, [firms]);

  const decoratedRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        thumbUrl: assetUrl(
          row?.desenImageThumb || row?.imageUrl || row?.thumbnailUrl,
        ),
        originalUrl: assetUrl(
          row?.desenImageOriginal || row?.imageUrl || row?.desenImageThumb,
        ),
      })),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const q = normalizeSearchText(search);
    return decoratedRows.filter((row) => {
      if (!q) return true;
      return normalizeSearchText([
        row?.modelName,
        row?.modelAdi,
        row?.firmName,
        row?.originalFileName,
        row?.tagsText,
        row?.ocrText,
        row?.aciklama,
        ...(Array.isArray(row?.fileNames) ? row?.fileNames : []),
        ...(Array.isArray(row?.searchKeywords) ? row?.searchKeywords : []),
      ].join(" ")).includes(q);
    });
  }, [decoratedRows, search]);

  const activeRow = useMemo(() => {
    if (activeId) {
      const found = visibleRows.find((row) => row.id === activeId);
      if (found) return found;
    }
    return visibleRows[0] || {};
  }, [activeId, visibleRows]);
  const activeRegions = useMemo(() => activePrintRegions(activeRow), [activeRow]);

  const renderedRows = useMemo(
    () => visibleRows.slice(0, renderLimit),
    [renderLimit, visibleRows],
  );

  const selectedVisibleCount = useMemo(() => {
    if (!selectedIds.length || !visibleRows.length) return 0;
    const visibleIdSet = new Set(visibleRows.map((row) => row?.id));
    return selectedIds.filter((id) => visibleIdSet.has(id)).length;
  }, [selectedIds, visibleRows]);

  const defaultFirm = useMemo(() => {
    const explicit = firms.find((firm) => firm.isDefault);
    if (explicit) return explicit;
    const taha = firms.find((firm) =>
      String(firm.name || "").toLocaleUpperCase("tr-TR").includes("TAHA"),
    );
    return taha || firms[0] || null;
  }, [firms]);

  useEffect(() => {
    setRenderLimit(240);
  }, [filters, search]);

  useEffect(() => {
    if (!selectedIds.length) return;
    const visibleIdSet = new Set(visibleRows.map((row) => row?.id));
    setSelectedIds((prev) => prev?.filter((id) => visibleIdSet.has(id)));
  }, [visibleRows]);

  useEffect(() => {
    setDetailForm({
      modelName: activeRow?.modelName || activeRow?.modelAdi || "",
      firmId: activeRow?.firmId || "",
      renkSayisi: activeRow?.renkSayisi || "",
      tagsText: activeRow?.tagsText || "",
      aciklama: activeRow?.aciklama || "",
    });
    setRegionDraft(activePrintRegions(activeRow));
  }, [activeRow]);

  const openRegionEditor = () => {
    setRegionDraft(activePrintRegions(activeRow));
    setNewRegionName("");
    setRegionEditorOpen(true);
  };

  const addRegionDraft = () => {
    const name = newRegionName.trim();
    if (!name) return;
    setRegionDraft((prev) => normalizePrintRegions([...prev, name]));
    setNewRegionName("");
  };

  const toggleRegionActive = (id) => {
    setRegionDraft((prev) =>
      prev.map((region) =>
        String(region.id) === String(id)
           ? { ...region, isActive: region.isActive === false }
          : region,
      ),
    );
  };

  const saveRegions = async () => {
    if (!activeRow.id) return;
    try {
      await saveModelPrintRegions(activeMainCompany, activeRow.id, regionDraft);
      setRows((prev) =>
        prev.map((row) =>
          row.id === activeRow.id
            ? {
                ...row,
                printRegions: normalizePrintRegions(regionDraft),
                baskiBolgeleri: normalizePrintRegions(regionDraft),
              }
            : row,
        ),
      );
      setMessage("Baskı bölgeleri güncellendi.");
      setRegionEditorOpen(false);
    } catch (error) {
      setMessage(`Baskı bölgeleri kaydedilemedi: ${error?.message}`);
    }
  };

  // OCR backend tarafinda tek-seferli otomatik islenir.

  useEffect(() => {
    let alive = true;
    if (!companyParams.mainCompanyId && !companyParams.mainCompanySlug) {
      setRows([]);
      setMessage("Aktif ana firma seçilmedi.");
      return;
    }
    setLoading(true);
    const loader = search.trim()
       ? searchDesenHavuz(activeMainCompany, { ...filters, q: search })
      : getDesenHavuz(activeMainCompany, filters);
    loader
      .then((payload) => {
        if (!alive) return;
        const nextRows = toRows(payload);
        setRows(nextRows);
        setActiveId((prev) => prev || nextRows[0].id || "");
        setMessage(nextRows.length ? "" : "Desen kaydı bulunamadı.");
      })
      .catch((error) => {
        if (!alive) return;
        setRows([]);
        setMessage(`Hata: ${error?.message}`);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activeMainCompany, companyParams, filters, search]);

  useEffect(() => {
    let alive = true;
    if (!companyParams.mainCompanyId && !companyParams.mainCompanySlug) return;
    Promise.all([
      apiGet("/muhasebe/firmalar", companyParams).catch(() => []),
      apiGet("/admin/firma-kartlari", companyParams).catch(() => []),
    ]).then(([muhasebeFirmalar, adminFirmalar]) => {
      if (!alive) return;
      const uniq = new Map();
      [...toRows(muhasebeFirmalar), ...toRows(adminFirmalar)]
        .map((item) => ({
          id: String(item?.id || item?.firmaId || ""),
          name: String(item?.name || item?.firmaAdi || item?.unvan || "").trim(),
          type: String(
            item?.type || item?.firmaTipi || item?.companyType || "",
          ).trim(),
          isDefault:
            String(
              item?.varsayilan ?? item?.isDefault ?? item?.default ?? "",
            )
              .trim()
              .toLocaleLowerCase("tr-TR") === "evet" ||
            String(
              item?.varsayilan ?? item?.isDefault ?? item?.default ?? "",
            )
              .trim()
              .toLocaleLowerCase("tr-TR") === "true" ||
            String(
              item?.varsayilan ?? item?.isDefault ?? item?.default ?? "",
            )
              .trim()
              .toLocaleLowerCase("tr-TR") === "1",
        }))
        .filter((item) => {
          if (!item?.id || !item?.name) return false;
          const type = item?.type.toLocaleUpperCase("tr-TR");
          return !type || type.includes("MUSTERI") || type.includes("CUSTOMER");
        })
        .forEach((item) => uniq.set(item?.id, item));
      setFirms(
        Array.from(uniq.values()).sort((a, b) =>
          a.name.localeCompare(b.name, "tr", { sensitivity: "base" }),
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, [companyParams]);

  useEffect(() => {
    if (!defaultFirm?.id) return;
    setFirmaAtamaId((prev) => prev || defaultFirm?.id);
  }, [defaultFirm]);

  async function refreshRows(options = {}) {
    const payload = await getDesenHavuz(activeMainCompany, filters);
    let nextRows = toRows(payload);
    const prioritized = Array.isArray(options.prioritizedIds)
       ? options.prioritizedIds.filter(Boolean)
      : [];
    if (prioritized.length) {
      const idSet = new Set(prioritized);
      nextRows = [
        ...nextRows.filter((row) => idSet.has(row?.id)),
        ...nextRows.filter((row) => !idSet.has(row?.id)),
      ];
    }
    setRows(nextRows);
    setActiveId((prev) => {
      if (prev && nextRows.some((row) => row.id === prev)) return prev;
      return nextRows[0].id || "";
    });
  }

  async function refreshFolderStatus() {
    const status = await getDesenImportFolderStatus(activeMainCompany, {
      path: DESEN_GELEN_KLASORU,
      defaultFirmId: defaultFirm?.id || "",
      defaultFirmName: defaultFirm?.name || "",
    });
    setFolderStatus((prev) => ({ ...prev, ...(status || {}) }));
    return status || {};
  }

  async function runFolderScan({ automatic = false } = {}) {
    setScanRunning(true);
    setFolderStatus((prev) => ({ ...prev, scanRunning: true }));
    setMessage("Bağlı klasör kontrol ediliyor...");
    try {
      const result = await scanDesenImportFolder(activeMainCompany, {
        path: DESEN_GELEN_KLASORU,
        defaultFirmId: defaultFirm?.id || "",
        defaultFirmName: defaultFirm?.name || "",
      });
      if (result.status === "SCAN_ALREADY_RUNNING") {
        setMessage(result?.message || "Bağlı klasör kontrolü zaten devam ediyor.");
        await refreshFolderStatus();
        return;
      }
      const newIds = Array.isArray(result?.items)
         ? result.items.map((item) => item?.id).filter(Boolean)
        : [];
      await refreshRows({ prioritizedIds: newIds });
      setNewlyAddedIds(newIds);
      const defaultFirmName = result?.defaultFirmName || defaultFirm?.name || "";
      const parts = [
        `${result?.newModels || 0} yeni model eklendi`,
        `${result?.alreadyProcessed || 0} dosya daha önce işlenmiş`,
        `${result?.failed || 0} hata`,
      ];
      if (!defaultFirmName) {
        parts.push("Varsayılan firma seçilmedi (Firma Yok).");
      }
      setMessage(`Bağlı klasör kontrol edildi: ${parts.join(" · ")}`);
      await refreshFolderStatus();
      if (!automatic && !defaultFirmName) {
        setMessage(
          `Bağlı klasör kontrol edildi: ${parts.join(" · ")} Varsayılan firma yok, kayıtlar "Firma Yok" olarak kaldı.`,
        );
      }
    } catch (error) {
      setMessage(`Klasör kontrolü başarısız: ${error?.message}`);
      await refreshFolderStatus().catch(() => undefined);
    } finally {
      setScanRunning(false);
      setFolderStatus((prev) => ({ ...prev, scanRunning: false }));
    }
  }

  useEffect(() => {
    let alive = true;
    const slug = companyParams.mainCompanySlug;
    if (!slug) return () => {};
    if (autoScanRef.current === slug) return () => {};
    autoScanRef.current = slug;
    (async () => {
      try {
        const status = await refreshFolderStatus();
        if (!alive) return;
        if (!status.scanRunning) {
          await runFolderScan({ automatic: true });
        }
      } catch {
        // Otomatik kontrol başarısız olursa normal kullanım devam eder.
      }
    })();
    return () => {
      alive = false;
    };
  }, [companyParams.mainCompanySlug, defaultFirm?.id]);

  useEffect(() => {
    let alive = true;
    if (loading || rows.length) return () => {};
    if (!companyParams.mainCompanyId && !companyParams.mainCompanySlug) {
      return () => {};
    }
    getDesenHavuzStorageDurum(activeMainCompany, {
      path: DESEN_GELEN_KLASORU,
    })
      .then((durum) => {
        if (!alive) return;
        setMessage(
          durum.pathExists
             ? `Gelen klasöründe ${durum.mainImageCount || 0} ana görsel, ${durum.thumbCount || 0} thumb bulundu. SQL kaydı: ${durum.dbRecordCount || 0}. Bağlı Klasörü Yenile ile içeri alın.`
            : `Gelen klasörü bulunamadı: ${durum.storagePath || DESEN_GELEN_KLASORU}`,
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [activeMainCompany, companyParams, loading, rows.length]);

  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function selectAllVisible() {
    setSelectedIds(visibleRows.map((row) => row?.id));
  }

  async function klasorYenile() {
    await runFolderScan({ automatic: false });
  }

  async function tumGorsellereOcrUygula() {
    try {
      setOcrRunning(true);
      setMessage("OCR açıklamaları tüm görseller için hazırlanıyor...");
      const result = await runDesenHavuzOcrIndex(activeMainCompany, {
        applyAll: true,
        force: true,
        limit: 5000,
      });
      setMessage(
        `OCR tamamlandı. İşlenen: ${result?.indexedCount || 0} / Atlanan: ${result?.skippedCount || 0} / Hata: ${result?.errorCount || 0}`,
      );
      const selectedAfterUpload = result?.rowId || result?.model?.id || "";
      await refreshRows({
        prioritizedIds: [selectedAfterUpload, result?.stored?.id].filter(Boolean),
      });
      if (selectedAfterUpload) setActiveId(selectedAfterUpload);
    } catch (error) {
      setMessage(`OCR toplu işlem hatası: ${error?.message}`);
    } finally {
      setOcrRunning(false);
    }
  }

  async function klasoruAc() {
    try {
      await openDesenImportFolder(activeMainCompany, {
        path: DESEN_GELEN_KLASORU,
      });
      setMessage("Bağlı klasör Explorer ile açıldı.");
    } catch (error) {
      setMessage(`Klasör açılamadı: ${error?.message}`);
    }
  }

  async function gorselEkle(event) {
    const file = event?.target.files?.[0];
    if (!file) return;
    const firm = firmMap.get(String(firmaAtamaId || detailForm.firmId));
    const fileModelName = file?.name.replace(/\?.[^.]+$/, "").trim();
    const modelName = newModelMode
       ? fileModelName
      : detailForm.modelName.trim() || fileModelName;
    try {
      setLoading(true);
      const result = await uploadDesenHavuzImage(activeMainCompany, file, {
        firmId: firmaAtamaId || detailForm.firmId || "",
        firmName: firm.name || "",
        modelName,
      });
      await refreshRows();
      setMessage(
        result?.model
           ? `${result?.modelName || modelName} görselden yakalandı, aktif model kaydı açıldı.`
          : `${modelName} havuza alındı. Model kaydı için firma seçip Model Havuzuna Ekle.`,
      );
    } catch (error) {
      setMessage(`Görsel eklenemedi: ${error?.message}`);
    } finally {
      setLoading(false);
      setNewModelMode(false);
      event.target.value = "";
    }
  }

  async function firmaKaydet() {
    if (!selectedIds.length) {
      setMessage("Firma kaydetmek için desen seç.");
      return;
    }
    if (!firmaAtamaId) {
      setMessage("Firma seçmeden kayıt yapılamaz.");
      return;
    }
    const firm = firmMap.get(String(firmaAtamaId));
    try {
      setLoading(true);
      const result = await bulkDesenHavuzFirmaAta(activeMainCompany, {
        ids: selectedIds,
        firmId: firmaAtamaId,
        firmName: firm.name || "",
      });
      setMessage(`Firma kaydedildi. Güncellenen: ${result?.updatedCount || 0}`);
      setSelectedIds([]);
      await refreshRows();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function modelHavuzunaEkle() {
    if (!selectedIds.length) {
      setMessage("Model havuzuna eklemek için desen seç.");
      return;
    }
    const firm = firmMap.get(String(firmaAtamaId));
    try {
      setLoading(true);
      const result = await bulkDesenHavuzModelEkle(activeMainCompany, {
        ids: selectedIds,
        firmId: firmaAtamaId || "",
        firmName: firm.name || "",
      });
      setMessage(
        `Model havuzu tamamlandı. Eklenen: ${result?.createdCount || 0}, atlanan: ${result?.skippedCount || 0}`,
      );
      setSelectedIds([]);
      await refreshRows();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function seciliModelHavuzunaEkle() {
    if (!activeRow.id) return;
    const previous = selectedIds;
    setSelectedIds([activeRow.id]);
    try {
      const firm = firmMap.get(String(firmaAtamaId || detailForm.firmId));
      setLoading(true);
      const result = await bulkDesenHavuzModelEkle(activeMainCompany, {
        ids: [activeRow.id],
        firmId: firmaAtamaId || detailForm.firmId || "",
        firmName: firm.name || activeRow.firmName || "",
      });
      setMessage(
        `Model eklendi. Eklenen: ${result?.createdCount || 0}, atlanan: ${result?.skippedCount || 0}`,
      );
      await refreshRows();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setSelectedIds(previous);
      setLoading(false);
    }
  }

  async function detayGuncelle() {
    if (!activeRow.id) return;
    const firm = firmMap.get(String(detailForm.firmId));
    try {
      setLoading(true);
      await updateDesenHavuzKaydi(activeMainCompany, activeRow.id, {
        modelName: detailForm.modelName,
        firmId: detailForm.firmId,
        firmName: firm.name || activeRow.firmName || "",
        renkSayisi: detailForm.renkSayisi,
        tagsText: detailForm.tagsText,
        aciklama: detailForm.aciklama,
      });
      setMessage("Desen bilgileri güncellendi.");
      await refreshRows();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function seciliPasifeAl() {
    if (!activeRow.id) return;
    try {
      setLoading(true);
      await updateDesenHavuzKaydi(activeMainCompany, activeRow.id, {
        isActive: false,
      });
      setMessage("Desen pasife alındı.");
      await refreshRows();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dw-havuz-shell">
      <section className="dw-havuz-toolbar dw-havuz-toolbar-smart">
        <div className="dw-linked-folder-card">
          <div className="dw-linked-folder-head">
            <strong><FolderOpen size={18} /> Bağlı Klasör</strong>
            <span>{folderStatus.connected ? "Bağlı" : "Erişilemiyor"}</span>
          </div>
          <div className="dw-linked-folder-path">{DESEN_GELEN_KLASORU}</div>
          <div className="dw-linked-folder-stats">
            <span>Son kontrol: {dateTimeText(folderStatus.lastControlAt)}</span>
            <span>Son tarama: {dateTimeText(folderStatus.lastScanAt)}</span>
            <span>Bekleyen: {folderStatus.pendingFileCount || 0}</span>
            <span>Son yeni model: {folderStatus.lastScanNewModels || 0}</span>
            <span>Daha önce işlenen: {folderStatus.alreadyProcessedCount || 0}</span>
            <span>Hatalı: {folderStatus.failedCount || 0}</span>
            <span>
              Varsayılan Firma: {folderStatus.defaultFirmName || defaultFirm?.name || "Firma Yok"}
            </span>
          </div>
          <div className="dw-linked-folder-actions">
            <button type="button" className="dw-btn" onClick={klasoruAc}>
              <FolderOpen size={16} />
              Klasörü Aç
            </button>
            <button
              type="button"
              className="dw-btn"
              onClick={klasorYenile}
              disabled={scanRunning || loading}
            >
              <RefreshCw size={16} />
              {scanRunning ? "Kontrol Ediliyor..." : "Bağlı Klasörü Kontrol Et"}
            </button>
            <button
              type="button"
              className="dw-btn"
              onClick={() =>
                setMessage(
                  `Bağlı klasör ayarı aktif: ${DESEN_GELEN_KLASORU}`,
                )
              }
            >
              Bağlı Klasör Ayarı
            </button>
          </div>
        </div>
        <input
          className="dw-model-search dw-model-search-wide"
          value={search}
          onChange={(event) => setSearch(event?.target.value)}
          placeholder="Akıllı ara: model adı, dosya adı, firma, etiket, renk, baskı, açıklama..."
        />
        <select
          value={filters.firmId}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, firmId: event?.target.value }))
          }
        >
          <option value="">Tüm firmalar</option>
          {firms.map((firm) => (
            <option key={firm.id} value={firm.id}>
              {firm.name}
            </option>
          ))}
        </select>
        <select
          value={filters.hasVisual}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, hasVisual: event?.target.value }))
          }
        >
          <option value="">Tüm kayıtlar</option>
          <option value="true">Görsel olanlar</option>
          <option value="false">Görsel olmayanlar</option>
        </select>
        <select
          value={filters.inGlobalPool}
          onChange={(event) =>
            setFilters((prev) => ({
              ...prev,
              inGlobalPool: event?.target.value,
            }))
          }
        >
          <option value="">Model havuzu</option>
          <option value="true">Eklenenler</option>
          <option value="false">Eklenmeyenler</option>
        </select>
        <select
          value={filters.pendingFirm}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, pendingFirm: event?.target.value }))
          }
        >
          <option value="">Tüm firma durumları</option>
          <option value="false">Firma belli olanlar</option>
          <option value="true">Firma belli olmayanlar</option>
        </select>
        <select
          value={filters.sortBy}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, sortBy: event?.target.value }))
          }
        >
          <option value="date">Tarihe göre yeni</option>
          <option value="name">Ada göre</option>
        </select>
      </section>

      <section className="dw-havuz-actions">
        <input
          ref={uploadImageRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={gorselEkle}
        />
        <button type="button" className="dw-btn" onClick={selectAllVisible}>
          <CheckCircle2 size={16} />
          Görünenleri Seç
        </button>
        <button
          type="button"
          className="dw-btn"
          onClick={() => setSelectedIds([])}
        >
          <RefreshCw size={16} />
          Seçimi Temizle
        </button>
        <select
          value={firmaAtamaId}
          onChange={(event) => setFirmaAtamaId(event?.target.value)}
        >
          <option value="">Firma seç</option>
          {firms.map((firm) => (
            <option key={firm.id} value={firm.id}>
              {firm.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="dw-btn primary"
          onClick={firmaKaydet}
          disabled={loading}
        >
          <CheckCircle2 size={16} />
          Firma Kaydet
        </button>
        <button
          type="button"
          className="dw-btn"
          onClick={klasorYenile}
          disabled={loading || scanRunning}
        >
          <RefreshCw size={16} />
          {scanRunning ? "Bağlı klasör kontrol ediliyor..." : "Bağlı Klasörü Kontrol Et"}
        </button>
        <button
          type="button"
          className="dw-btn"
          onClick={() => {
            setNewModelMode(false);
            uploadImageRef.current.click();
          }}
          disabled={loading}
        >
          <UploadCloud size={16} />
          Görsel Ekle
        </button>
        <button
          type="button"
          className="dw-btn primary"
          onClick={() => {
            setNewModelMode(true);
            uploadImageRef.current.click();
          }}
          disabled={loading}
        >
          <PlusCircle size={16} />
          Yeni Model Ekle
        </button>
        <button
          type="button"
          className="dw-btn"
          onClick={modelHavuzunaEkle}
          disabled={loading}
        >
          <Palette size={16} />
          Model Havuzuna Ekle
        </button>
        <button
          type="button"
          className="dw-btn"
          onClick={tumGorsellereOcrUygula}
          disabled={loading || ocrRunning}
        >
          {ocrRunning ? "OCR Çalışıyor..." : "Tüm Görsellere OCR Uygula"}
        </button>
        <strong>
          {loading
             ? "Yükleniyor..."
            : `Toplam: ${visibleRows.length} / Görünen: ${visibleRows.length} / Gösterilen: ${renderedRows.length} / Seçili: ${selectedVisibleCount}`}
        </strong>
      </section>

      {message ? <div className="dw-notice orange">{message}</div> : null}

      <section className="dw-havuz-workspace">
        <aside className="dw-havuz-name-list">
          <div className="dw-havuz-name-list-head">
            <strong>Model Listesi</strong>
            <span>{visibleRows.length} kayıt</span>
          </div>
          <div className="dw-havuz-name-scroll">
            {visibleRows.map((row) => (
              <button
                type="button"
                key={row?.id}
                className={activeRow.id === row?.id ? "active" : ""}
                onClick={() => setActiveId(row?.id)}
              >
                <strong>{row?.modelName || row?.modelAdi || "-"}</strong>
                {newlyAddedIds.includes(row?.id) ? (
                  <em className="dw-new-badge">Yeni</em>
                ) : null}
                <span>{row?.firmName || "Firma Yok"}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="dw-havuz-scroll-gallery">
          {renderedRows.map((row) => (
            <article
              className={`dw-havuz-design-card ${activeRow.id === row?.id ? "active" : ""}`}
              key={row?.id}
              onClick={() => setActiveId(row?.id)}
            >
              <label
                className="dw-model-tile-check"
                onClick={(event) => event?.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(row?.id)}
                  onChange={() => toggleSelect(row?.id)}
                />
                <span>Seç</span>
              </label>
              <div className="dw-havuz-design-image">
                {row?.thumbUrl ? (
                  <img
                    src={row?.thumbUrl}
                    alt={row?.modelName || "Desen"}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="dw-image-empty"><ImageOff size={22} /> Model gorseli yok</span>
                )}
              </div>
              <div className="dw-havuz-design-info">
                <strong title={row?.modelName}>
                  {row?.modelName || row?.modelAdi || "-"}
                </strong>
                {newlyAddedIds.includes(row?.id) ? (
                  <em className="dw-new-badge">Yeni</em>
                ) : null}
                <span>{row?.firmName || "Firma Yok"}</span>
              </div>
            </article>
          ))}
          {renderedRows.length < visibleRows.length ? (
            <button
              type="button"
              className="dw-havuz-load-more"
              onClick={() => setRenderLimit((prev) => prev + 240)}
            >
              Daha Fazla Göster ({visibleRows.length - renderedRows.length})
            </button>
          ) : null}
        </div>

        <aside className="dw-havuz-selected-card">
          <div className="dw-havuz-selected-image">
            {activeRow.thumbUrl ? (
              <>
                <button
                  type="button"
                  className="dw-selected-zoom"
                  onClick={() =>
                    setFullImageUrl(activeRow.originalUrl || activeRow.thumbUrl)
                  }
                >
                  Zoom
                </button>
                <img
                  src={activeRow.originalUrl || activeRow.thumbUrl}
                  alt={activeRow.modelName || "Desen"}
                  decoding="async"
                  onClick={() =>
                    setFullImageUrl(activeRow.originalUrl || activeRow.thumbUrl)
                  }
                />
              </>
            ) : (
              <span className="dw-image-empty large"><ImageOff size={30} /> Model gorseli yok</span>
            )}
          </div>
          <div className="dw-havuz-selected-info dw-havuz-detail-form">
            <h2>{activeRow.modelName || activeRow.modelAdi || "-"}</h2>
            <div className="dw-havuz-detail-top-fields">
              <label>
                Model adı
                <input
                  value={detailForm.modelName}
                  onChange={(event) =>
                    setDetailForm((prev) => ({
                      ...prev,
                      modelName: event?.target.value,
                    }))
                  }
                  placeholder="Model adı"
                />
              </label>
              <label>
                Firma
                <select
                  value={detailForm.firmId}
                  onChange={(event) =>
                    setDetailForm((prev) => ({
                      ...prev,
                      firmId: event?.target.value,
                    }))
                  }
                >
                  <option value="">Firma Yok</option>
                  {firms.map((firm) => (
                    <option key={firm.id} value={firm.id}>
                      {firm.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Renk
              <input
                value={detailForm.renkSayisi}
                onChange={(event) =>
                  setDetailForm((prev) => ({
                    ...prev,
                    renkSayisi: event?.target.value,
                  }))
                }
                type="number"
                min="0"
              />
            </label>
            <label>
              Arama yazısı / etiket
              <textarea
                value={detailForm.tagsText}
                onChange={(event) =>
                  setDetailForm((prev) => ({
                    ...prev,
                    tagsText: event?.target.value,
                  }))
                }
                placeholder="Örn: love, unicorn, pembe, baskı, kız çocuk..."
              />
            </label>
            <label>
              Açıklama
              <textarea
                value={detailForm.aciklama}
                onChange={(event) =>
                  setDetailForm((prev) => ({
                    ...prev,
                    aciklama: event?.target.value,
                  }))
                }
                placeholder="Görsel içeriği veya not..."
              />
            </label>
            <span>
              Kanal: {boolText(activeRow.hasKanalImage)} / PDF:{" "}
              {boolText(activeRow.hasPdf)}
            </span>
            <span>Dosya: {activeRow.fileNames?.[0] || "-"}</span>
            <div className="dw-print-region-box">
              <strong><Layers size={16} /> Baskı Bölgeleri</strong>
              <div className="dw-print-region-chips">
                {activeRegions.length ? (
                  activeRegions.map((region) => (
                    <span key={region.id || region.regionCode}>{region.regionName}</span>
                  ))
                ) : (
                  <em>Varsayilan Ön Baskı kullanilir; gerekirse buradan ekleyin.</em>
                )}
              </div>
              <button type="button" className="dw-btn" onClick={openRegionEditor}>
                <Layers size={16} />
                Baskı Bölgelerini Düzenle
              </button>
            </div>
            <div className="dw-havuz-detail-actions">
              <button
                type="button"
                className="dw-btn primary"
                onClick={detayGuncelle}
                disabled={loading}
              >
                <Pencil size={16} />
                Güncelle
              </button>
              <button
                type="button"
                className="dw-btn"
                onClick={seciliModelHavuzunaEkle}
                disabled={loading}
              >
                <PlusCircle size={16} />
                Ekle
              </button>
              <button
                type="button"
                className="dw-btn danger"
                onClick={seciliPasifeAl}
                disabled={loading}
              >
                <Trash2 size={16} />
                Sil
              </button>
            </div>
          </div>
        </aside>
      </section>

      {fullImageUrl ? (
        <div
          className="dw-preview-backdrop"
          onClick={() => setFullImageUrl("")}
        >
          <div
            className="dw-preview-modal"
            onClick={(event) => event?.stopPropagation()}
          >
            <button
              type="button"
              className="dw-btn"
              onClick={() => setFullImageUrl("")}
            >
              Kapat
            </button>
            <div className="dw-preview-modal-image-wrap">
              <img
                src={fullImageUrl}
                alt="Desen buyuk onizleme"
                className="dw-preview-modal-image"
              />
            </div>
          </div>
        </div>
      ) : null}

      {regionEditorOpen ? (
        <div className="dw-preview-backdrop" onClick={() => setRegionEditorOpen(false)}>
          <div className="dw-region-modal" onClick={(event) => event?.stopPropagation()}>
            <div className="dw-region-modal-head">
              <strong>Baskı Bölgelerini Düzenle</strong>
              <button type="button" className="dw-btn" onClick={() => setRegionEditorOpen(false)}>
                Kapat
              </button>
            </div>
            <div className="dw-region-list">
              {regionDraft.map((region, index) => (
                <div className="dw-region-row" key={region.id || region.regionCode}>
                  <input
                    value={region.regionName}
                    onChange={(event) =>
                      setRegionDraft((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, regionName: event?.target.value } : item,
                        ),
                      )
                    }
                  />
                  <input
                    type="number"
                    value={region.sortOrder}
                    onChange={(event) =>
                      setRegionDraft((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, sortOrder: event?.target.value } : item,
                        ),
                      )
                    }
                  />
                  <button type="button" className="dw-btn" onClick={() => toggleRegionActive(region.id)}>
                    {region.isActive === false ? "Aktif Yap" : "Pasife Al"}
                  </button>
                  <button
                    type="button"
                    className="dw-btn danger"
                    onClick={() =>
                      setRegionDraft((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, isActive: false } : item,
                        ),
                      )
                    }
                  >
                    Kapat
                  </button>
                </div>
              ))}
              {!regionDraft.length ? (
                <div className="dw-empty">Varsayilan Ön Baskı kullanilir.</div>
              ) : null}
            </div>
            <div className="dw-region-add">
              <input
                value={newRegionName}
                onChange={(event) => setNewRegionName(event?.target.value)}
                placeholder="Yeni bölge: Ön, Ense Etiket, Sol Kol..."
              />
              <button type="button" className="dw-btn" onClick={addRegionDraft}>
                Bölge Ekle
              </button>
            </div>
            <div className="dw-region-modal-foot">
              <button type="button" className="dw-btn primary" onClick={saveRegions}>
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
