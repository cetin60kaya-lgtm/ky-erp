import "../modules/cleanWorkflow.css";
import "./imalatWorkflow.css";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  Factory,
  Pencil,
  Printer,
  Settings,
  Trash2,
} from "lucide-react";
import { fetchMuhasebeModels } from "../../services/muhasebeService";
import { getDesenHavuz } from "../../services/desenApi";
import {
  addUretimGirisi,
  createManuelIs,
  deleteModelKaydiImalat,
  deleteUretimGirisi,
  getImalatGirisHavuzu,
  saveImalatMakine,
  getMakineVardiya,
  updateUretimGirisi,
} from "../../services/imalatApi";
import { getUretimSeriMachines } from "../../services/uretimSeriApi";
import { API_BASE } from "../../utils/api";
import {
  activePrintRegions,
  normalizePrintRegions,
  saveModelPrintRegions,
  fetchModelPrintRegions,
} from "../../services/modelPrintRegionService";
import { calcProduction, formatQty, toneForStatus } from "./imalatData";
import { Field, InfoLine, Status, VisualBox } from "./ImalatShared";
import SmartProductionEntry from "./smart/SmartProductionEntry";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function assetUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^[a-z]:[\\/]/i.test(url) || url.startsWith("\\\\")) return "";
  if (/^(blob:|data:|https:\/\/)/i.test(url)) return url;
  if (/^\/api\//i.test(url)) return `${API_BASE.replace(/\/api$/i, "")}${url}`;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function parseQty(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? "").replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalIndex = Math.max(lastComma, lastDot);
    raw = `${raw.slice(0, decimalIndex).replace(/[,.]/g, "")}.${raw
      .slice(decimalIndex + 1)
      .replace(/[,.]/g, "")}`;
  } else if (lastComma >= 0) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    const after = raw.slice(lastDot + 1);
    const dotCount = (raw.match(/\./g) || []).length;
    if (dotCount > 1 || after.length === 3) raw = raw.replace(/\./g, "");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function modelSortTime(row = {}) {
  const raw =
    row?.createdAt ||
    row?.created_at ||
    row?.updatedAt ||
    row?.updated_at ||
    row?.sonIslemTarihi ||
    row?.date ||
    "";
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function sortJobsNewestFirst(rows = []) {
  return [...rows].sort((a, b) => {
    const diff = modelSortTime(b) - modelSortTime(a);
    if (diff) return diff;
    return String(a.model || "").localeCompare(String(b.model || ""), "tr", {
      sensitivity: "base",
    });
  });
}

export function DetailedProductionEntry({ activeMainCompany, initialMachineSettingsOpen = false }) {
  const [jobs, setJobs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [machines, setMachines] = useState([]);
  const [editingEntry, setEditingEntry] = useState(null);
  const [draft, setDraft] = useState({
    tarih: todayIso(),
    vardiya: "Gündüz",
    makineNo: "GENEL",
    makinaci: "",
    partiNo: "",
    baskiBolgesi: "Ön",
    adet: 0,
    baskiHatasiAdet: 0,
    kumasHatasiAdet: 0,
    not: "",
  });
  const [manualJob, setManualJob] = useState({
    firma: "",
    model: "",
    siparisNo: "",
    beklenenAdet: 0,
    baskiBolgesi: "Ön",
    tarih: todayIso(),
  });
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [newRegionName, setNewRegionName] = useState("");
  const [newRegionType, setNewRegionType] = useState("");
  const [showRegionsEditor, setShowRegionsEditor] = useState(false);
  const [editingRegions, setEditingRegions] = useState([]);
  const [showMachineSettings, setShowMachineSettings] = useState(initialMachineSettingsOpen);
  const [machineDrafts, setMachineDrafts] = useState([]);
  const [machineSettingsMessage, setMachineSettingsMessage] = useState("");

  const STANDARD_REGIONS = [
    "Ön",
    "Arka",
    "Ense",
    "Ense Etiket",
    "Yaka",
    "Dikili Ön",
    "Ön Etek",
    "Arka Etek",
    "Sol Kol",
    "Sağ Kol",
    "Sol Paça",
    "Sağ Paça",
    "Cep",
    "Kapüşon",
    "Şerit",
    "Yan Panel",
    "Özel Bölge",
  ];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [rows, machineRows, modelRows, desenRows] = await Promise.all([
          getImalatGirisHavuzu(activeMainCompany),
          getMakineVardiya(activeMainCompany),
          fetchMuhasebeModels(activeMainCompany),
          getDesenHavuz(activeMainCompany, { limit: 5000, pageSize: 5000 }),
        ]);
        if (cancelled) return;
        const queueRows = Array.isArray(rows) ? rows.map(normalizeJob) : [];
        const modelJobs = Array.isArray(modelRows)
           ? modelRows.map(normalizeModelJob)
          : [];
        const desenJobs = Array.isArray(desenRows.rows)
           ? desenRows.rows.map(normalizeModelJob)
          : Array.isArray(desenRows)
             ? desenRows.map(normalizeModelJob)
            : [];
        const byId = new Map();
        [...desenJobs, ...modelJobs, ...queueRows].forEach((job) => {
          if (!job.id || !job.model) return;
          const key = String(job.modelId || job.id);
          const current = byId.get(key);
          byId.set(
            key,
            current
              ? {
                  ...current,
                  ...job,
                  imageUrl: job.imageUrl || current?.imageUrl,
                  printRegions: job.printRegions.length
                     ? job.printRegions
                    : current?.printRegions,
                  baskiBolgesi: job.baskiBolgesi || current?.baskiBolgesi,
                  beklenenAdet: job.beklenenAdet || current?.beklenenAdet,
                  createdAt: current?.createdAt || job.createdAt,
                  updatedAt: current?.updatedAt || job.updatedAt,
                }
              : job,
          );
        });
        const normalized = sortJobsNewestFirst(Array.from(byId.values()));
        // machines may come from two different endpoints with different schemas.
        // prefer seri machines (uretimSeri), fallback to imalat machines (makine vardiya)
        let machinesData = [];
        try {
          const seriRows = await getUretimSeriMachines(activeMainCompany);
          if (Array.isArray(seriRows) && seriRows.length) {
            machinesData = seriRows
              .map((m) => ({
                id: m.id || m.makineNo || m.no || m.kod || "",
                no: m.makineNo || m.no || m.kod || m.id || "",
                ad: m.makineAdi || m.ad || m.name || m.description || "",
                operator: m.operator || m.makinaci || "",
                dayOperator: m.gunduzMakinaci || m.dayOperator || m.dayMachinist || m.operator || m.makinaci || "",
                nightOperator: m.geceMakinaci || m.nightOperator || m.nightMachinist || m.operator || m.makinaci || "",
                isActive: m.isActive !== false && m.durum !== "Pasif",
              }))
              .filter((m) => (m.no || m.ad) && m.isActive !== false);
          }
        } catch {
          // ignore and fallback
        }
        if (!machinesData.length && Array.isArray(machineRows)) {
          machinesData = machineRows
            .map((m) => ({
              id: m.id,
              no:
                m.id ||
                m.kod ||
                m.makineNo ||
                m.makinaNo ||
                m.makine ||
                m.ad ||
                m.name ||
                "",
              ad:
                m.ad ||
                m.name ||
                m.makineAdi ||
                m.makinaAdi ||
                m.makine ||
                "",
              operator: m.operator || m.makinaci || "",
              dayOperator: m.dayOperator || m.gunduzMakinaci || m.operator || m.makinaci || "",
              nightOperator: m.nightOperator || m.geceMakinaci || m.operator || m.makinaci || "",
            }))
            .filter((m) => m.no || m.ad);
        }
        setMachines(machinesData);
        if (initialMachineSettingsOpen) {
          setMachineDrafts(
            machinesData.length
              ? machinesData.map((machine, index) => ({
                  id: machine.id || machine.no,
                  makineNo: machine.no || machine.id || "",
                  makineAdi: machine.ad || "",
                  gunduzMakinaci: machine.dayOperator || machine.operator || "",
                  geceMakinaci: machine.nightOperator || machine.operator || "",
                  isActive: machine.isActive !== false,
                  sortOrder: machine.sortOrder || index + 1,
                }))
              : [{ id: "", makineNo: "", makineAdi: "", gunduzMakinaci: "", geceMakinaci: "", isActive: true, sortOrder: 1 }],
          );
        }
        setJobs(normalized);
        const firstMachine = machinesData[0];
        const firstRegion = activePrintRegions(normalized[0])[0]?.regionName || normalized[0]?.baskiBolgesi || "Ön";
        setDraft((current) => ({
          ...current,
          makineNo: firstMachine?.no || firstMachine?.id || firstMachine?.ad || current.makineNo,
          makinaci: firstMachine?.dayOperator || firstMachine?.operator || current.makinaci,
          baskiBolgesi: firstRegion,
        }));
        setSelectedId((current) =>
          normalized.some((job) => job.id === current)
             ? current
            : normalized[0].id || "",
        );
      } catch (error) {
        setMessage(error?.message || "Üretim giriş havuzu okunamadı.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeMainCompany, initialMachineSettingsOpen]);

  const filteredJobs = useMemo(() => {
    const q = String(search || "").toLocaleLowerCase("tr-TR").trim();
    if (!q) return jobs;
    return jobs.filter((job) =>
      `${job.model} ${job.firma} ${job.siparisNo} ${job.irsaliyeNo}`
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [jobs, search]);
  const selected = useMemo(
    () => {
      const q = String(search || "").trim();
      if (q && !filteredJobs.length) return null;
      return (
        filteredJobs.find((job) => job.id === selectedId) ||
        filteredJobs[0] ||
        jobs.find((job) => job.id === selectedId) ||
        jobs[0] ||
        null
      );
    },
    [filteredJobs, jobs, selectedId, search],
  );
  const calc = useMemo(() => calcProduction(selected), [selected]);
  const selectedRegions = useMemo(() => activePrintRegions(selected), [selected]);
  const selectedView = selected || {};

  const getMachineName = (machineNo) => {
    const machine = machines.find((m) =>
      (m.no && String(m.no) === String(machineNo)) ||
      (m.id && String(m.id) === String(machineNo)) ||
      (m.ad && String(m.ad) === String(machineNo)),
    );
    return machine ? machine.ad || machine.name || String(machineNo) : machineNo || "-";
  };

  const getMachine = (machineNo) =>
    machines.find((m) =>
      (m.no && String(m.no) === String(machineNo)) ||
      (m.id && String(m.id) === String(machineNo)) ||
      (m.ad && String(m.ad) === String(machineNo)),
    );

  const getMachineOperator = (machineNo, vardiya) => {
    const machine = getMachine(machineNo);
    if (!machine) return "";
    const shift = String(vardiya || "").toLocaleLowerCase("tr-TR");
    if (shift.includes("gece")) {
      return machine.nightOperator || machine.operator || "";
    }
    return machine.dayOperator || machine.operator || "";
  };

  const updateMachineNo = (machineNo) => {
    setDraft((prev) => ({
      ...prev,
      makineNo: machineNo,
      makinaci: getMachineOperator(machineNo, prev?.vardiya) || prev?.makinaci,
    }));
  };

  const updateShift = (vardiya) => {
    setDraft((prev) => ({
      ...prev,
      vardiya,
      makinaci: getMachineOperator(prev?.makineNo, vardiya) || prev?.makinaci,
    }));
  };

  const validateEntryDraft = () => {
    const errors = [];
    if (!draft.tarih) errors.push("Tarih seçilmelidir.");
    if (!draft.vardiya) errors.push("Vardiya seçilmelidir.");
    if (!draft.makineNo || draft.makineNo === "GENEL") errors.push("Kayıtlı makine seçilmelidir.");
    if (!String(draft.makinaci || "").trim()) errors.push("Makinacı seçilmelidir.");
    if (!parseQty(draft.adet)) errors.push("Üretilen adet 0'dan büyük olmalıdır.");
    if (!String(draft.baskiBolgesi || "").trim()) errors.push("Baskı bölgesi seçilmelidir.");
    return errors;
  };

  const addManualJob = async () => {
    if (!manualJob.model.trim()) {
      setMessage("Manuel iş için model adı girin.");
      return;
    }
    if (!parseQty(manualJob.beklenenAdet)) {
      setMessage("Manuel iş için beklenen adet girin.");
      return;
    }
    if (!window.confirm(`${manualJob.model.trim()} modeli için manuel üretim işi oluşturulsun mu?`)) return;
    try {
      const saved = await createManuelIs(activeMainCompany, manualJob);
      const normalized = normalizeJob(saved?.data || saved);
      const next = normalized.id
         ? normalized
        : {
            id: `manual-${Date.now()}`,
            modelId: `manual-${Date.now()}`,
            model: manualJob.model,
            irsaliyeSatiri: manualJob.model,
            firma: manualJob.firma,
            kaynak: "Manuel",
            irsaliyeNo: manualJob.siparisNo,
            siparisNo: manualJob.siparisNo,
            beklenenAdet: parseQty(manualJob.beklenenAdet),
            baskiBolgesi: manualJob.baskiBolgesi || "Ön",
            printRegions: normalizePrintRegions(manualJob.baskiBolgesi || "Ön"),
            imageUrl: "",
            durum: "İşlem Bekliyor",
            entries: [],
          };
      setJobs((current) => [next, ...current]);
      setSelectedId(next.id);
      setManualJob({
        firma: "",
        model: "",
        siparisNo: "",
        beklenenAdet: 0,
        baskiBolgesi: "Ön",
        tarih: todayIso(),
      });
      setMessage("Manuel üretim işi havuza eklendi.");
    } catch (error) {
      setMessage(error?.message || "Manuel üretim işi eklenemedi.");
    }
  };

  const addEntry = async () => {
    if (!selected) {
      setMessage("Üretim girişi için havuzda iş seçin.");
      return;
    }
    // require model to have at least one active print region
    if (!selectedRegions || !selectedRegions.length) {
      setMessage("Bu model için aktif baskı bölgesi tanımlanmamış. Baskı bölgelerini düzenleyerek devam edin.");
      return;
    }
    const validationErrors = validateEntryDraft();
    if (validationErrors.length) {
      setMessage(`Kayıt denetimi: ${validationErrors.join(" ")}`);
      return;
    }
    const qty = parseQty(draft.adet);
    const baskiHatasiAdet = parseQty(draft.baskiHatasiAdet);
    const kumasHatasiAdet = parseQty(draft.kumasHatasiAdet);
    const hataliAdet = baskiHatasiAdet + kumasHatasiAdet;
    const effectiveRegion =
      draft.baskiBolgesi ||
      selectedRegions[0].regionName ||
      selected.baskiBolgesi ||
      "Ön";
    if (!window.confirm(`${selected.model} için ${qty.toLocaleString("tr-TR")} adet üretim girişi kaydedilsin mi?`)) return;
    try {
      const saved = await addUretimGirisi(activeMainCompany, selected.id, {
        tarih: draft.tarih,
        vardiya: draft.vardiya,
        partiNo: draft.partiNo,
        makineNo: draft.makineNo,
        makineAdi: getMachineName(draft.makineNo),
        makinaci: draft.makinaci,
        adet: qty,
        baskiHatasiAdet,
        kumasHatasiAdet,
        hataliAdet,
        modelKaydiId: selected.modelId || selected.id,
        firma: selected.firma,
        model: selected.model,
        siparisNo: selected.siparisNo || selected.irsaliyeNo,
        irsaliyeNo: selected.siparisNo || selected.irsaliyeNo,
        baskiBolgesi: effectiveRegion,
        not: draft.not,
      });
      const nextEntry = {
        id: saved?.kayit?.id || saved?.id || `temp-${Date.now()}`,
        no: (selected.entries || []).length + 1,
        tarih: draft.tarih,
        vardiya: draft.vardiya,
        partiNo: draft.partiNo,
        makineNo: draft.makineNo,
        makineAdi: getMachineName(draft.makineNo),
        makinaci: draft.makinaci,
        baskiBolgesi: effectiveRegion,
        adet: qty,
        baskiHatasiAdet,
        kumasHatasiAdet,
        hataliAdet,
        not: draft.not || `${(selected.entries || []).length + 1}. giriş`,
      };
      setJobs((prev) =>
        prev.map((job) =>
          job.id === selected.id
             ? { ...job, entries: [...(job.entries || []), nextEntry] }
            : job,
        ),
      );
      setMessage("Giriş satırı kaydedildi.");
      setDraft({
        ...draft,
        partiNo: "",
        baskiBolgesi: selectedRegions[0].regionName || selected.baskiBolgesi || "Ön",
        adet: 0,
        baskiHatasiAdet: 0,
        kumasHatasiAdet: 0,
        not: "",
      });
    } catch (error) {
      setMessage(error?.message || "Giriş satırı kaydedilemedi.");
    }
  };

  const startEdit = (entry) => {
      setEditingEntry({ ...entry });
    setDraft({
      tarih: entry.tarih || todayIso(),
      vardiya: entry.vardiya || "Gündüz",
      makineNo: entry.makineNo || "GENEL",
      makinaci: entry.makinaci || "",
      partiNo: entry.partiNo || "",
      baskiBolgesi: entry.baskiBolgesi || selected.baskiBolgesi || "Ön",
      adet: entry.adet || 0,
      baskiHatasiAdet: entry.baskiHatasiAdet || 0,
      kumasHatasiAdet: entry.kumasHatasiAdet || 0,
      not: entry.not || "",
    });
  };

  const saveEdit = async () => {
    if (!editingEntry.id) return;
    const validationErrors = validateEntryDraft();
    if (validationErrors.length) {
      setMessage(`Güncelleme denetimi: ${validationErrors.join(" ")}`);
      return;
    }
    const effectiveRegion =
      draft.baskiBolgesi ||
      selectedRegions[0].regionName ||
      selected.baskiBolgesi ||
      "Ön";
    if (!window.confirm(`${editingEntry.no || "Seçili"}. üretim satırı güncellensin mi?`)) return;
    try {
      const baskiHatasiAdet = parseQty(draft.baskiHatasiAdet);
      const kumasHatasiAdet = parseQty(draft.kumasHatasiAdet);
      const hataliAdet = baskiHatasiAdet + kumasHatasiAdet;
      await updateUretimGirisi(activeMainCompany, editingEntry.id, {
        tarih: draft.tarih,
        vardiya: draft.vardiya,
        makineNo: draft.makineNo,
        makineAdi: getMachineName(draft.makineNo),
        makinaci: draft.makinaci,
        partiNo: draft.partiNo,
        baskiBolgesi: effectiveRegion,
        adet: parseQty(draft.adet),
        baskiHatasiAdet,
        kumasHatasiAdet,
        hataliAdet,
        not: draft.not,
      });
      setJobs((prev) =>
        prev.map((job) =>
          job.id === selected.id
            ? {
                ...job,
                entries: job.entries.map((e) =>
                  e.id === editingEntry.id
                    ? {
                        ...e,
                        tarih: draft.tarih,
                        vardiya: draft.vardiya,
                        makineNo: draft.makineNo,
                        makineAdi: getMachineName(draft.makineNo),
                        makinaci: draft.makinaci,
                        partiNo: draft.partiNo,
                        baskiBolgesi: effectiveRegion,
                        adet: parseQty(draft.adet),
                        baskiHatasiAdet,
                        kumasHatasiAdet,
                        hataliAdet,
                        not: draft.not,
                      }
                    : e,
                ),
              }
            : job,
        ),
      );
      setMessage("Giriş güncellendi.");
      setEditingEntry(null);
      setDraft({
        tarih: todayIso(),
        vardiya: "Gündüz",
        makineNo: "GENEL",
        makinaci: "",
        adet: 0,
        baskiHatasiAdet: 0,
        kumasHatasiAdet: 0,
        not: "",
      });
    } catch (error) {
      setMessage(error?.message || "Giriş güncellenemedi.");
    }
  };

  const cancelEdit = () => {
    setEditingEntry(null);
    setDraft({
      tarih: todayIso(),
      vardiya: "Gündüz",
      makineNo: "GENEL",
      makinaci: "",
      adet: 0,
      baskiHatasiAdet: 0,
      kumasHatasiAdet: 0,
      not: "",
    });
  };

  const deleteSelectedModelKaydi = async () => {
    if (!selected.modelId) {
      setMessage("Silinecek model kaydı bulunamadı.");
      return;
    }
    const confirmed = confirm(
      `${selected.model} model kaydı silinsin mi Bu işlem sadece bağlı üretim/giden belge yoksa yapılır.`,
    );
    if (!confirmed) return;
    try {
      await deleteModelKaydiImalat(activeMainCompany, selected.modelId);
      setJobs((prev) => prev?.filter((job) => job.id !== selected.id));
      setMessage("Model kaydı silindi.");
    } catch (error) {
      setMessage(
        error?.message ||
          "Model kaydı silinemedi. Kayıt bağlı üretim veya belge içeriyor olabilir.",
      );
    }
  };

  const deleteEntry = async (entry) => {
    if (!entry.id || !confirm(`${entry.no}. giriş satırı silinsin mi`))
      return;
    try {
      await deleteUretimGirisi(activeMainCompany, entry.id);
      setJobs((prev) =>
        prev.map((job) =>
          job.id === selected.id
            ? {
                ...job,
                entries: job.entries.filter((e) => e.id !== entry.id),
              }
            : job,
        ),
      );
      setMessage("Giriş silindi.");
    } catch (error) {
      setMessage(error?.message || "Giriş silinemedi.");
    }
  };

  const addRegionToSelected = async () => {
    let name = (newRegionName || "").trim();
    if (!selected) return;
    if (!name && newRegionType && newRegionType !== "__CUSTOM__") name = newRegionType;
    if (!name) return;
    const nextRegions = normalizePrintRegions([...selectedRegions, name]);
    const targetId = selected.modelId || selected.id;
    try {
      if (targetId && !String(targetId).startsWith("manual-")) {
        await saveModelPrintRegions(activeMainCompany, targetId, nextRegions);
      }
      setJobs((prev) =>
        prev.map((job) =>
          job.id === selected.id || String(job.modelId || "") === String(targetId)
            ? {
                ...job,
                printRegions: nextRegions,
                baskiBolgeleri: nextRegions,
                baskiBolgesi: nextRegions
                  .filter((region) => region.isActive !== false)
                  .map((region) => region.regionName)
                  .join(" + "),
              }
            : job,
        ),
      );
      setDraft((prev) => ({ ...prev, baskiBolgesi: name }));
      setNewRegionName("");
      setNewRegionType("");
      setMessage(`${name} baski bolgesi modele eklendi.`);
    } catch (error) {
      setMessage(error?.message || "Baski bolgesi kaydedilemedi.");
    }
  };

  const openRegionsEditor = async () => {
    if (!selected) return;
    const targetId = selected.modelId || selected.id;
    try {
      const regions = targetId && !String(targetId).startsWith("manual-")
         ? await fetchModelPrintRegions(activeMainCompany, targetId)
        : activePrintRegions(selected);
      setEditingRegions(regions || activePrintRegions(selected));
      setShowRegionsEditor(true);
    } catch (e) {
      setMessage(e.message || "Baskı bölgeleri yüklenemedi.");
    }
  };

  const saveRegionsEditor = async () => {
    if (!selected) return;
    const targetId = selected.modelId || selected.id;
    const activeCount = (editingRegions || []).filter((region) => region.isActive !== false).length;
    if (!activeCount) {
      setMessage("Modelde en az bir aktif baskı bölgesi kalmalı.");
      return;
    }
    if (!window.confirm(`${selected?.model || "Seçili model"} baskı bölgeleri güncellensin mi?`)) return;
    try {
      if (targetId && !String(targetId).startsWith("manual-")) {
        await saveModelPrintRegions(activeMainCompany, targetId, editingRegions);
      }
      // update local jobs list
      setJobs((prev) =>
        prev.map((job) =>
          job.id === selected.id
             ? { ...job, printRegions: editingRegions, baskiBolgesi: editingRegions[0].regionName }
            : job,
        ),
      );
      setShowRegionsEditor(false);
      setMessage("Baskı bölgeleri kaydedildi.");
    } catch (e) {
      setMessage(e.message || "Baskı bölgeleri kaydedilemedi.");
    }
  };

  const toggleRegionActive = (regionId) => {
    setEditingRegions((prev) =>
      prev.map((r) => (r.id === regionId ? { ...r, isActive: !r.isActive } : r)),
    );
  };

  const addRegionToEditor = (name) => {
    const next = normalizePrintRegions([...(editingRegions || []).map(r => r.regionName), name]);
    setEditingRegions(next);
    setNewRegionName("");
    setNewRegionType("");
  };

  const makeDefault = (regionId) => {
    setEditingRegions((prev) => {
      const idx = prev?.findIndex((r) => r.id === regionId);
      if (idx <= 0) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.unshift(item);
      return copy.map((r, i) => ({ ...r, sortOrder: i + 1 }));
    });
  };

  const openMachineSettings = () => {
    setMachineSettingsMessage("");
    setMachineDrafts(
      machines.length
        ? machines.map((machine, index) => ({
            id: machine.id || machine.no,
            makineNo: machine.no || machine.id || "",
            makineAdi: machine.ad || "",
            gunduzMakinaci: machine.dayOperator || machine.operator || "",
            geceMakinaci: machine.nightOperator || machine.operator || "",
            isActive: machine.isActive !== false,
            sortOrder: machine.sortOrder || index + 1,
          }))
        : [
            {
              id: "",
              makineNo: "",
              makineAdi: "",
              gunduzMakinaci: "",
              geceMakinaci: "",
              isActive: true,
              sortOrder: 1,
            },
          ],
    );
    setShowMachineSettings(true);
  };

  const updateMachineDraft = (index, field, value) => {
    setMachineDrafts((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  };

  const addMachineDraft = () => {
    setMachineDrafts((prev) => [
      ...prev,
      {
        id: "",
        makineNo: "",
        makineAdi: "",
        gunduzMakinaci: "",
        geceMakinaci: "",
        isActive: true,
        sortOrder: prev?.length + 1,
      },
    ]);
  };

  const removeMachineDraft = (index) => {
    setMachineDrafts((current) => current.filter((_, rowIndex) => rowIndex !== index));
  };

  const saveMachineSettings = async () => {
    const preparedRows = machineDrafts
      .map((row, index) => ({
        ...row,
        makineNo: String(row?.makineNo || "").trim(),
        makineAdi: String(row?.makineAdi || "").trim(),
        gunduzMakinaci: String(row?.gunduzMakinaci || "").trim(),
        geceMakinaci: String(row?.geceMakinaci || row?.gunduzMakinaci || "").trim(),
        sortOrder: index + 1,
      }));
    if (!preparedRows.length) {
      setMachineSettingsMessage("Kaydedilecek makine bulunamadı.");
      return;
    }
    const incompleteRow = preparedRows.find((row) => !row.makineNo || !row.makineAdi || !row.gunduzMakinaci);
    if (incompleteRow) {
      setMachineSettingsMessage("Her makine için makine no, makine adı ve gündüz makinacısı zorunludur.");
      return;
    }
    const uniqueMachineNos = new Set(preparedRows.map((row) => row.makineNo.toLocaleLowerCase("tr-TR")));
    if (uniqueMachineNos.size !== preparedRows.length) {
      setMachineSettingsMessage("Aynı makine no birden fazla kez kullanılamaz.");
      return;
    }
    const validRows = preparedRows;
    if (!window.confirm(`${validRows.length} makine ve vardiya/makinacı ayarı kaydedilsin mi?`)) return;
    try {
      const savedRows = [];
      for (const row of validRows) {
        const saved = await saveImalatMakine(activeMainCompany, row);
        savedRows.push(saved?.data || saved);
      }
      const nextMachines = savedRows.map((m, index) => ({
        id: m.id || m.makineNo,
        no: m.makineNo || m.id,
        ad: m.makineAdi || m.ad,
        operator: m.gunduzMakinaci || m.makinaci || m.operator || "",
        dayOperator: m.gunduzMakinaci || m.dayOperator || m.operator || "",
        nightOperator: m.geceMakinaci || m.nightOperator || m.operator || "",
        isActive: m.isActive !== false,
        sortOrder: m.sortOrder || index + 1,
      }));
      setMachines(nextMachines.filter((machine) => machine.isActive !== false));
      setShowMachineSettings(false);
      setMachineSettingsMessage("");
      setMessage("Makine ayarları kaydedildi.");
    } catch (error) {
      setMachineSettingsMessage(error?.message || "Makine ayarları kaydedilemedi.");
    }
  };

  return (
    <div className="iw-grid-3">
      <aside className="iw-card">
        <div className="iw-card-head">
          <h2><Factory size={18} /> Üretim İş Kuyruğu</h2>
        </div>
        <div className="iw-card-body iw-list-search">
          <input
            className="iw-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Model, firma, siparis veya irsaliye ara..."
          />
        </div>
        <div className="iw-card-body iw-list">
          {filteredJobs.length ? (
            filteredJobs.map((job) => {
              const itemCalc = calcProduction(job);
              return (
                <button
                  key={job.id}
                  className={job.id === selectedId ? "active" : ""}
                  onClick={() => {
                    setSelectedId(job.id);
                    setDraft((current) => ({
                      ...current,
                      baskiBolgesi: activePrintRegions(job)[0]?.regionName || job.baskiBolgesi || "Ön",
                    }));
                  }}
                >
                  <div className="iw-list-thumb">
                    {job.imageUrl ? (
                      <img src={job.imageUrl} alt={job.model || "Model görseli"} />
                    ) : (
                      <Factory size={22} />
                    )}
                  </div>
                  <div className="iw-list-main">
                    <strong>{job.model}</strong>
                    <div className="iw-list-title-row">
                      <span className="iw-list-company" title={job.firma || ""}>
                        {job.firma || "Firma belirtilmemiş"}
                      </span>
                      <Status tone={toneForStatus(itemCalc.durum)}>
                        {itemCalc.durum}
                      </Status>
                    </div>
                    <div className="iw-list-metrics">
                      <span>
                        <small>Beklenen</small>
                        <b>{formatQty(job.beklenenAdet)}</b>
                      </span>
                      <span>
                        <small>Üretilen</small>
                        <b>{formatQty(itemCalc.toplamUretilen)}</b>
                      </span>
                    </div>
                    <div className="iw-list-regions" title={job.baskiBolgesi || ""}>
                      {job.baskiBolgesi || "Baskı bölgesi tanımlanacak"}
                    </div>
                    <span>
                      {job.firma ? <>{job.firma} • </> : null}
                      Sipariş: {job.siparisNo || job.irsaliyeNo || '-'}
                      <br />
                      Beklenen: {formatQty(job.beklenenAdet)}
                      <br />
                      Baskı: {job.baskiBolgesi || "Model kartından seçilecek"}
                    </span>
                    <Status tone={toneForStatus(itemCalc.durum)}>
                      {itemCalc.durum}
                    </Status>
                    <div className="iw-progress">
                      <span style={{ width: `${itemCalc.progress}%` }} />
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="iw-empty">
              Model bulunamadi. Aramayi temizleyebilir veya manuel is ekleyebilirsiniz.
            </div>
          )}
        </div>
      </aside>

      <main className="iw-card">
        <div className="iw-card-head">
          <div>
            <h2><ClipboardList size={18} /> Hızlı Üretim Girişi</h2>
            <small>Modeli seçin, baskı bölgesini belirleyin, makine ve vardiyayı seçin. Makine adı ile varsayılan makinacı otomatik gelir.</small>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="iw-btn" type="button" onClick={openMachineSettings}>
              <Settings size={16} /> Makine Ayarları
            </button>
            <Status tone={toneForStatus(calc.durum)}>{calc.durum}</Status>
          </div>
        </div>
        <div className="iw-card-body">
          {!jobs.length ? (
            <div className="iw-manual-job">
              <h3>Manuel Üretim İşi Ekle</h3>
              <div className="iw-form-grid">
                <Field label="Firma">
                  <input
                    value={manualJob.firma}
                    onChange={(e) =>
                      setManualJob({ ...manualJob, firma: e.target.value })
                    }
                  />
                </Field>
                <Field label="Model">
                  <input
                    value={manualJob.model}
                    onChange={(e) =>
                      setManualJob({ ...manualJob, model: e.target.value })
                    }
                  />
                </Field>
                <Field label="Sipariş No">
                  <input
                    value={manualJob.siparisNo}
                    onChange={(e) =>
                      setManualJob({ ...manualJob, siparisNo: e.target.value })
                    }
                  />
                </Field>
                <Field label="Beklenen Adet">
                  <input
                    type="number"
                    value={manualJob.beklenenAdet}
                    onChange={(e) =>
                      setManualJob({ ...manualJob, beklenenAdet: e.target.value })
                    }
                  />
                </Field>
                <Field label="Baskı Bölgesi">
                  <select
                    value={manualJob.baskiBolgesi}
                    onChange={(e) =>
                      setManualJob({ ...manualJob, baskiBolgesi: e.target.value })
                    }
                  >
                    <option value="">Seçiniz</option>
                    <option value="Ön">Ön</option>
                    <option value="Arka">Arka</option>
                    <option value="Ense">Ense</option>
                    <option value="Ense Etiket">Ense Etiket</option>
                    <option value="Yaka">Yaka</option>
                    <option value="Sol Kol">Sol Kol</option>
                    <option value="Sağ Kol">Sağ Kol</option>
                    <option value="Özel Bölge">Özel Bölge</option>
                  </select>
                </Field>
                <Field label="Tarih">
                  <input
                    type="date"
                    value={manualJob.tarih}
                    onChange={(e) =>
                      setManualJob({ ...manualJob, tarih: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="iw-actions">
                <button type="button" onClick={addManualJob}>
                  + Manuel İş Ekle
                </button>
              </div>
            </div>
          ) : null}
          <div className="iw-model-card">
            <VisualBox src={selectedView.imageUrl} />
            <div>
              <h3>{selectedView.model || "-"}</h3>
              <InfoLine label="Firma" value={selectedView.firma || "-"} />
              {/* teknik bilgi gizlendi */}
              <InfoLine
                label="Baski bolgeleri"
                value={
                  selectedRegions.length
                     ? selectedRegions.map((region) => region.regionName).join(", ")
                    : "Tanimli degil"
                }
              />
              <div style={{ marginTop: 8 }}>
                <button type="button" className="iw-btn" onClick={openRegionsEditor}>
                  <Factory size={14} /> Baskı Bölgelerini Düzenle
                </button>
              </div>
            </div>
          </div>

          {showRegionsEditor ? (
            <div className="iw-drawer">
              <h4>Baskı Bölgelerini Düzenle</h4>
              <div className="iw-region-chips">
                {(editingRegions || []).map((r) => (
                  <div key={r.id} className={`chip ${r.isActive ? '' : 'muted'}`} style={{display:'inline-flex',alignItems:'center',margin:4}}>
                    <span style={{marginRight:8}}>{r.regionName}</span>
                    <button onClick={() => toggleRegionActive(r.id)} title="Pasife al" className="iw-btn small">{r.isActive ? 'Pasife Al' : 'Aktif Yap'}</button>
                    <button onClick={() => makeDefault(r.id)} title="Varsayılan yap" className="iw-btn small">Varsayılan</button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <select value={newRegionType} onChange={(e)=>setNewRegionType(e.target.value)}>
                  <option value="">Standart bölge seçin...</option>
                  {STANDARD_REGIONS.map(r=> <option key={r} value={r}>{r}</option>)}
                </select>
                <input placeholder="Özel bölge adı" value={newRegionName} onChange={(e)=>setNewRegionName(e.target.value)} />
                <button onClick={()=> addRegionToEditor(newRegionType || newRegionName)} className="iw-btn">+ Bölge Ekle</button>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={saveRegionsEditor} className="iw-btn primary">Kaydet</button>
                <button onClick={()=>setShowRegionsEditor(false)} className="iw-btn">İptal</button>
              </div>
            </div>
          ) : null}

          {showMachineSettings ? (
            <div className="iw-modal-backdrop">
              <div className="iw-modal-box machine-modal machine-registry-modal">
                <div className="iw-card-head">
                  <div>
                    <h2>
                      <Settings size={18} /> Makine ve Makinacı Kayıtları
                    </h2>
                    <small>Her makine için gündüz ve gece vardiyasına atanacak makinacıyı belirleyin.</small>
                  </div>
                  <button className="iw-btn" type="button" onClick={() => setShowMachineSettings(false)}>
                    Kapat
                  </button>
                </div>
                <div className="iw-card-body machine-registry-body">
                  <div className="machine-registry-guide">
                    <Factory size={20} />
                    <div><strong>Otomatik atama kuralı</strong><span>Fişte “gündüz 1” yazılırsa Makine 1'in gündüz makinacısı; “gece 1” yazılırsa gece makinacısı otomatik gelir.</span></div>
                  </div>

                  <div className="machine-registry-list">
                    {machineDrafts.map((row, index) => (
                      <section className={`machine-registry-row ${row?.isActive === false ? "inactive" : ""}`} key={`${row?.id || "new"}-${index}`}>
                        <div className="machine-registry-index"><span>{index + 1}</span><small>Makine</small></div>
                        <Field label="Makine No *"><input value={row?.makineNo} placeholder="Örn. 1" onChange={(event) => updateMachineDraft(index, "makineNo", event.target.value)} /></Field>
                        <Field label="Makine Adı *"><input value={row?.makineAdi} placeholder="Örn. Oval Baskı 1" onChange={(event) => updateMachineDraft(index, "makineAdi", event.target.value)} /></Field>
                        <Field label="Gündüz Makinacısı *"><input value={row?.gunduzMakinaci} placeholder="Ad soyad" onChange={(event) => updateMachineDraft(index, "gunduzMakinaci", event.target.value)} /></Field>
                        <Field label="Gece Makinacısı"><input value={row?.geceMakinaci} placeholder="Boşsa gündüz kullanılır" onChange={(event) => updateMachineDraft(index, "geceMakinaci", event.target.value)} /></Field>
                        <div className="machine-registry-row-actions">
                          <label className="machine-active-switch"><input type="checkbox" checked={row?.isActive !== false} onChange={(event) => updateMachineDraft(index, "isActive", event.target.checked)} /><span>{row?.isActive === false ? "Pasif" : "Aktif"}</span></label>
                          {!row?.id ? <button className="iw-btn danger" type="button" onClick={() => removeMachineDraft(index)}>Kaldır</button> : null}
                        </div>
                      </section>
                    ))}
                  </div>

                  {machineSettingsMessage ? <div className="iw-notice red"><span>{machineSettingsMessage}</span></div> : null}

                  <div className="machine-registry-footer">
                    <button className="iw-btn" type="button" onClick={addMachineDraft}>+ Yeni Makine</button>
                    <div><span>{machineDrafts.length} makine kaydı</span><button className="iw-btn primary" type="button" onClick={saveMachineSettings}>Tüm Ayarları Kaydet</button></div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="iw-kpi-grid">
            <Kpi
              label="Planlanan adet"
              value={formatQty(selectedView.beklenenAdet)}
            />
            <Kpi
              label="Toplam üretilen"
              value={formatQty(calc.toplamUretilen)}
              tone="green"
            />
            <Kpi
              label="Kalan adet"
              value={formatQty(Math.max(calc.kalan, 0))}
              tone={
                calc.kalan === 0 ? "green" : calc.kalan < 0 ? "red" : "orange"
              }
            />
            <Kpi
              label="Durum"
              value={calc.durum}
              tone={toneForStatus(calc.durum)}
            />
          </div>

          <div className="iw-form-grid">
            <Field label="Yeni giriş tarihi">
              <input
                type="date"
                value={draft.tarih}
                onChange={(e) => setDraft({ ...draft, tarih: e.target.value })}
              />
            </Field>
            <Field label="Vardiya">
              <select
                value={draft.vardiya}
                onChange={(e) => updateShift(e.target.value)}
              >
                <option>Gündüz</option>
                <option>Gece</option>
              </select>
            </Field>
            <Field label="Makine no">
              <select
                value={draft.makineNo}
                onChange={(e) => updateMachineNo(e.target.value)}
              >
                <option value="GENEL">GENEL</option>
                {machines.map((machine) => (
                  <option
                    key={`${machine.no}-${machine.ad}`}
                    value={machine.no}
                  >
                    {machine.no}{" "}
                    {machine.ad && machine.ad !== machine.no
                       ? `- ${machine.ad}`
                      : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Makine adı">
              <input value={getMachineName(draft.makineNo)} readOnly />
            </Field>
            <Field label="Makinacı">
              <input
                value={draft.makinaci}
                onChange={(e) =>
                  setDraft({ ...draft, makinaci: e.target.value })
                }
              />
            </Field>
            <Field label="Üretilen adet">
              <input
                value={draft.adet}
                onChange={(e) => setDraft({ ...draft, adet: e.target.value })}
              />
            </Field>
            <Field label="Baski bolgesi">
              <select
                value={draft.baskiBolgesi}
                onChange={(e) =>
                  setDraft({ ...draft, baskiBolgesi: e.target.value })
                }
              >
                {selectedRegions.map((region) => (
                  <option key={region.id || region.regionCode} value={region.regionName}>
                    {region.regionName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Yeni baski bolgesi">
              <div className="iw-inline-add">
                <select
                  value={newRegionType}
                  onChange={(e) => setNewRegionType(e.target.value)}
                >
                  <option value="">Standart bölge seçin...</option>
                  <option value="Ön">Ön</option>
                  <option value="Arka">Arka</option>
                  <option value="Ense">Ense</option>
                  <option value="Ense Etiket">Ense Etiket</option>
                  <option value="Yaka">Yaka</option>
                  <option value="Dikili Ön">Dikili Ön</option>
                  <option value="Ön Etek">Ön Etek</option>
                  <option value="Arka Etek">Arka Etek</option>
                  <option value="Sol Kol">Sol Kol</option>
                  <option value="Sağ Kol">Sağ Kol</option>
                  <option value="Sol Paça">Sol Paça</option>
                  <option value="Sağ Paça">Sağ Paça</option>
                  <option value="Cep">Cep</option>
                  <option value="Kapüşon">Kapüşon</option>
                  <option value="Şerit">Şerit</option>
                  <option value="Yan Panel">Yan Panel</option>
                  <option value="Özel Bölge">__CUSTOM__</option>
                </select>
                {newRegionType === "__CUSTOM__" ? (
                  <input
                    value={newRegionName}
                    onChange={(e) => setNewRegionName(e.target.value)}
                    placeholder="Özel bölge adı girin..."
                  />
                ) : null}
                <button className="iw-btn" type="button" onClick={addRegionToSelected}>
                  Ekle
                </button>
              </div>
            </Field>
            <Field label="Baskı hatası (sakat)">
              <input
                value={draft.baskiHatasiAdet}
                onChange={(e) =>
                  setDraft({ ...draft, baskiHatasiAdet: e.target.value })
                }
              />
            </Field>
            <Field label="Kumaş hatası (sakat)">
              <input
                value={draft.kumasHatasiAdet}
                onChange={(e) =>
                  setDraft({ ...draft, kumasHatasiAdet: e.target.value })
                }
              />
            </Field>
            <Field label="Not">
              <input
                value={draft.not}
                onChange={(e) => setDraft({ ...draft, not: e.target.value })}
              />
            </Field>
            <div style={{ display: "flex", gap: "8px" }}>
              {editingEntry ? (
                <>
                  <button
                    className="iw-btn primary"
                    type="button"
                    onClick={saveEdit}
                  >
                    <Pencil size={16} />
                    Güncelle
                  </button>
                  <button className="iw-btn" type="button" onClick={cancelEdit}>
                    İptal
                  </button>
                </>
              ) : (
                <button
                  className="iw-btn primary"
                  type="button"
                  onClick={addEntry}
                >
                  <Factory size={16} />
                  + Giriş Satırı Ekle
                </button>
              )}
            </div>
          </div>

          <div className="iw-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Giriş no</th>
                  <th>Tarih</th>
                  <th>Vardiya</th>
                  <th>Makine no</th>
                  <th>Makine adı</th>
                  <th>Makinacı</th>
                  <th>Firma</th>
                  <th>Model</th>
                  <th>Baskı bölgesi</th>
                  <th>Giriş adedi</th>
                  <th>Baskı sakatı</th>
                  <th>Kumaş sakatı</th>
                  <th>Kümülatif üretim</th>
                  <th>Kalan</th>
                  <th>Durum</th>
                  <th>Not</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {calc.entries.map((entry) => (
                  <tr
                    key={`${entry.id || entry.no}-${entry.tarih}`}
                    className={editingEntry.id === entry.id ? "editing" : ""}
                  >
                    <td>{entry.no}</td>
                    <td>{entry.tarih}</td>
                    <td>{entry.vardiya}</td>
                    <td>{entry.makineNo}</td>
                    <td>{getMachineName(entry.makineNo)}</td>
                    <td>{entry.makinaci}</td>
                    <td>{selectedView.firma}</td>
                    <td>{selectedView.model}</td>
                    <td>{entry.baskiBolgesi || "-"}</td>
                    <td>{formatQty(entry.adet)}</td>
                    <td>{formatQty(entry.baskiHatasiAdet)}</td>
                    <td>{formatQty(entry.kumasHatasiAdet)}</td>
                    <td>{formatQty(entry.kume)}</td>
                    <td>{formatQty(Math.max(entry.kalan, 0))}</td>
                    <td>
                      <Status tone={toneForStatus(entry.durum)}>
                        {entry.durum}
                      </Status>
                    </td>
                    <td>{entry.not}</td>
                    <td>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          className="iw-btn-icon"
                          onClick={() => startEdit(entry)}
                          title="Düzenle"
                        >
                          <Pencil size={14} />
                          Düzenle
                        </button>
                        <button
                          className="iw-btn-icon"
                          onClick={() => deleteEntry(entry)}
                          title="Sil"
                        >
                          <Trash2 size={14} />
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {message ? <div className="iw-notice">{message}</div> : null}
        </div>
      </main>

      <aside className="iw-card iw-right">
        <div className="iw-card-head">
          <h2><ClipboardList size={18} /> Anlık İmalat Kontrol</h2>
        </div>
        <div className="iw-card-body">
          <VisualBox src={selectedView.imageUrl} />
          <InfoLine label="Kaynak" value={selectedView.kaynak || "-"} />
          <InfoLine
            label="Sipariş no"
            value={selectedView.siparisNo || selectedView.irsaliyeNo || "-"}
          />
          <InfoLine
            label="Beklenen"
            value={formatQty(selectedView.beklenenAdet)}
          />
          <InfoLine
            label="Toplam üretilen"
            value={formatQty(calc.toplamUretilen)}
          />
          <InfoLine
            label="Toplam baskı sakatı"
            value={formatQty(calc.toplamBaskiSakati)}
          />
          <InfoLine
            label="Toplam kumaş sakatı"
            value={formatQty(calc.toplamKumasSakati)}
          />
          <InfoLine label="Kalan" value={formatQty(Math.max(calc.kalan, 0))} />
          <InfoLine label="Giriş sayısı" value={calc.entries.length} />
          <InfoLine label="Havuz durumu" value={calc.durum} />
          <div className={`iw-notice ${toneForStatus(calc.durum)}`}>
            {calc.durum === "Fazla"
               ? "İrsaliye adedinden fazla üretim girildi."
              : calc.durum === "Tamamlandı"
                 ? "Kalan 0. İş havuzdan gizlenebilir, raporda kalır."
                : "İş henüz tamamlanmadı."}
          </div>
          <div className="iw-action-stack">
            <button className="iw-btn"><ClipboardList size={16} /> Model Kartı Detayı</button>
            <button className="iw-btn"><Factory size={16} /> Operasyon Geçmişi</button>
            <button className="iw-btn"><Printer size={16} /> Giriş Geçmişi Yazdır</button>
            <button className="iw-btn" onClick={deleteSelectedModelKaydi}>
              <Trash2 size={16} />
              Model Kaydını Sil
            </button>
            <button className="iw-btn primary"><BarChart3 size={16} /> Üretim Raporu</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function UretimGirisHavuzu({ activeMainCompany }) {
  const [smartEntryOpen, setSmartEntryOpen] = useState(false);
  const [openMachineSettingsOnLoad, setOpenMachineSettingsOnLoad] = useState(false);
  const [detailedInstance, setDetailedInstance] = useState(0);

  const openMachineSettingsFromSmart = () => {
    setSmartEntryOpen(false);
    setOpenMachineSettingsOnLoad(true);
    setDetailedInstance((current) => current + 1);
  };

  return (
    <div className="imalat-entry-page">
      <section className="iw-card imalat-entry-head">
        <div>
          <h2><ClipboardList size={18} /> Üretim Girişi</h2>
          <small>İş kuyruğundan ayrıntılı kayıt oluşturun veya seri fişleri tek açılır çalışma ekranında işleyin.</small>
        </div>
        <button className="iw-btn primary imalat-smart-open-button" type="button" onClick={() => setSmartEntryOpen(true)}>
          <ClipboardList size={16} /> Akıllı Seri Üretimi Aç
        </button>
      </section>
      <DetailedProductionEntry
        key={detailedInstance}
        activeMainCompany={activeMainCompany}
        initialMachineSettingsOpen={openMachineSettingsOnLoad}
      />

      {smartEntryOpen ? (
        <div className="iw-modal-backdrop smart-production-backdrop">
          <section className="smart-production-modal">
            <header className="smart-production-modal-head">
              <div><h2><ClipboardList size={19} /> Akıllı Seri Üretim</h2><p>Fişi çözümleyin, sorunlu satırları düzeltin ve yalnız denetimden geçen kayıtları kaydedin.</p></div>
              <button className="iw-btn" type="button" onClick={() => setSmartEntryOpen(false)}>Kapat</button>
            </header>
            <div className="smart-production-modal-body">
              <SmartProductionEntry activeMainCompany={activeMainCompany} onConfigureMachines={openMachineSettingsFromSmart} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function normalizeJob(row = {}) {
  const raw = row?.raw || {};
  const producedQty = parseQty(row?.producedQty || raw.uretimAdedi || 0);
  const printRegions = activePrintRegions({
    printRegions: row?.printRegions || raw.printRegions || raw.baskiBolgeleri,
    baskiBolgesi: row?.printArea || raw.grup || raw.baskiBolgesi,
  });
  return {
    id: String(row?.id || raw.id || ""),
    modelId: raw.modelKaydiId || raw.modelId || row?.modelId || row?.id,
    model: row?.modelName || raw.linkedVisualModelName || raw.modelAdi || "",
    irsaliyeSatiri:
      row?.productionModelName ||
      raw.productionModelName ||
      raw.modelAdi ||
      row?.modelName ||
      "",
    firma: row?.companyName || raw.firma || "",
    kaynak: raw.kaynak || "SQL",
    irsaliyeNo:
      row?.sourceDispatchNo || row?.orderNo || raw.musteriIrsaliyeNo || "",
    siparisNo:
      row?.orderNo || row?.sourceDispatchNo || raw.musteriIrsaliyeNo || "",
    beklenenAdet: parseQty(
      row?.expectedQty || raw.gelenAdet || raw.uretimAdedi || producedQty || 0,
    ),
    baskiBolgesi: row?.printArea || raw.grup || raw.baskiBolgesi || printRegions[0].regionName || "Ön",
    printRegions,
    imageUrl: assetUrl(
      row?.modelImageUrl ||
        raw.desenImageThumb ||
        raw.imageUrl ||
        raw.thumbnail ||
        raw.desenGorseli,
    ),
    durum: row?.status || raw.durum || "Bekliyor",
    createdAt: raw.createdAt || row?.createdAt || row?.date || "",
    updatedAt: raw.updatedAt || row?.updatedAt || "",
    entries:
      producedQty > 0
        ? [
            {
              id: String(row?.id || ""),
              no: 1,
              tarih: raw.tarih || row?.date || "",
              vardiya: row?.shift || raw.vardiya || "",
              makineNo: row?.machineNo || raw.makina || "",
              makineAdi: row?.machineName || raw.makinaAdi || "",
              makinaci: row?.operatorName || raw.sorumluPersonel || "",
              partiNo: raw.partiNo || raw.batchNo || raw.seriNo || "",
              baskiBolgesi: row?.printArea || raw.grup || raw.baskiBolgesi || printRegions[0].regionName || "Ön",
              adet: producedQty,
              baskiHatasiAdet: parseQty(
                row?.printDefectQty ||
                  raw.printDefectQty ||
                  raw.baskiHatasiAdet ||
                  0,
              ),
              kumasHatasiAdet: parseQty(
                row?.fabricDefectQty ||
                  raw.fabricDefectQty ||
                  raw.kumasHatasiAdet ||
                  0,
              ),
              hataliAdet: parseQty(row?.wasteQty || raw.hataliAdet || 0),
              not: row?.note || raw.not || "",
            },
          ]
        : [],
  };
}

function firstText(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[key] ?? row?.raw?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return fallback;
}

function numberFrom(row, keys, fallback = 0) {
  for (const key of keys) {
    const value = row?.[key] ?? row?.raw?.[key];
    const parsed = parseQty(value);
    if (parsed) return parsed;
  }
  return fallback;
}

function normalizeModelJob(row = {}) {
  const raw = row?.raw || {};
  const id = String(
    row?.id ||
      raw.id ||
      row?.modelId ||
      raw.modelId ||
      row?.modelKaydiId ||
      raw.modelKaydiId ||
      "",
  );
  const model = firstText(
    row,
    ["modelAdi", "modelName", "name", "urunAdi", "linkedVisualModelName"],
    "Model",
  );
  const printRegions = activePrintRegions({
    ...row,
    printRegions: row?.printRegions || raw.printRegions || raw.baskiBolgeleri,
    baskiBolgesi:
      row?.printArea || row?.baskiBolgesi || raw.grup || raw.baskiBolgesi,
  });
  return {
    id,
    modelId: id,
    model,
    irsaliyeSatiri: firstText(
      row,
      ["productionModelName", "modelAdi", "modelName"],
      model,
    ),
    firma: firstText(
      row,
      ["musteriFirma", "firma", "firmaAdi", "firmName", "companyName", "customer"],
      "Firma Seçilmedi",
    ),
    kaynak: "Model Karti",
    irsaliyeNo: firstText(
      row,
      ["musteriIrsaliyeNo", "irsaliyeNo", "dispatchNo", "orderNo"],
      "",
    ),
    siparisNo: firstText(row, ["siparisNo", "orderNo", "musteriIrsaliyeNo"], ""),
    beklenenAdet: numberFrom(
      row,
      [
        "gelenAdet",
        "dispatchQty",
        "plannedQty",
        "plannedQuantity",
        "quantity",
        "adet",
      ],
      0,
    ),
    baskiBolgesi:
      printRegions[0].regionName ||
      firstText(row, ["printArea", "baskiBolgesi", "grup"], ""),
    printRegions,
    imageUrl: assetUrl(
      row?.modelImageUrl ||
        row?.imageUrl ||
        row?.thumbUrl ||
        row?.thumbnailUrl ||
        row?.thumbnail ||
        row?.thumbnailPath ||
        row?.desenImageThumb ||
        raw.desenImageThumb ||
        raw.imageUrl ||
        raw.desenGorseli,
    ),
    durum:
      numberFrom(row, ["gelenAdet", "quantity", "plannedQty"], 0) ||
      numberFrom(row, ["productionQty", "toplamUretim", "uretimAdedi"], 0)
         ? firstText(row, ["durum", "status"], "Model Karti")
        : "Yeni Model",
    createdAt: firstText(row, ["createdAt", "created_at", "tarih"], ""),
    updatedAt: firstText(row, ["updatedAt", "updated_at"], ""),
    entries: [],
  };
}

function Kpi({ label, value, tone = "" }) {
  return (
    <div className={`iw-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
