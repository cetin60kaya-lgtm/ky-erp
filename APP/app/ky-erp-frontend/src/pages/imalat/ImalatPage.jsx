import { useEffect, useMemo, useState } from "react";
import "../modules/cleanWorkflow.css";
import "./imalatWorkflow.css";
import { API_BASE } from "../../utils/api";
import {
  closeUretimSeriWork,
  createUretimSeriEntry,
  createUretimSeriWorkCard,
  getUretimSeriEntries,
  getUretimSeriIncomingDispatches,
  getUretimSeriMachines,
  getUretimSeriReport,
  getUretimSeriSummary,
  getUretimSeriWorkCards,
  linkUretimSeriInvoice,
  linkUretimSeriModel,
  saveUretimSeriMachine,
  searchUretimSeriModels,
  setUretimSeriPrice,
} from "../../services/uretimSeriApi";

const STATUS_CLASSES = {
  "Model Bağlanmadı": "b-yellow",
  "İrsaliye Var İmalat Yok": "b-yellow",
  "İmalat Var İrsaliye Yok": "b-yellow",
  "Fiyat Yok": "b-red",
  "Fatura Bekliyor": "b-blue",
  "Fatura Kesilebilir": "b-green",
  "Faturası Kesildi İmalat Devam": "b-blue",
  "Kısmi Kesildi": "b-blue",
  "Numune/Fark Var": "b-blue",
  Tamamlandı: "b-green",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? "").replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const index = Math.max(lastComma, lastDot);
    raw = `${raw.slice(0, index).replace(/[,.]/g, "")}.${raw
      .slice(index + 1)
      .replace(/[,.]/g, "")}`;
  } else if (lastComma >= 0) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0 && raw.slice(lastDot + 1).length === 3) {
    raw = raw.replace(/\./g, "");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function qty(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(
    parseNumber(value),
  );
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(parseNumber(value));
}

function assetUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^data:|^https:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function blankEntryForm() {
  return {
    tarih: todayIso(),
    makineNo: "",
    modelId: "",
    model: "",
    adet: "",
    vardiya: "Gündüz",
    makinaci: "",
    siparisNo: "",
    irsaliyeNo: "",
    birimFiyat: "",
    not: "",
  };
}

function blankMachineForm() {
  return {
    id: "",
    makineNo: "",
    makineAdi: "",
    vardiya: "Gündüz",
    makinaci: "",
    durum: "Aktif",
  };
}

function Badge({ value }) {
  return (
    <span className={`iw-badge ${STATUS_CLASSES[value] || "b-gray"}`}>
      {value || "-"}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="iw-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function exportRows(fileName, headers, rows) {
  const body = rows.map((row) => headers.map((item) => row[item?.key] ?? "").join("\t"));
  const blob = new Blob([[headers.map((item) => item?.label).join("\t"), ...body].join("\n")], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link?.click();
  URL.revokeObjectURL(url);
}

export default function ImalatPage({
  activeTab = "uretim-girisi",
  activeMainCompany,
  openModule,
}) {
  const initialMachineModal = ["makine-tanimlari", "makinalar", "makine-vardiya-takibi"].includes(activeTab);
  const section =
    activeTab === "imalat-denetim" || activeTab === "imalat-yonetim-ozeti"
       ? "denetim"
      : activeTab === "uretim-raporu" || activeTab === "imalat-raporlari"
         ? "rapor"
        : "giris";
  const [entryForm, setEntryForm] = useState(blankEntryForm);
  const [machineForm, setMachineForm] = useState(blankMachineForm);
  const [modelQuery, setModelQuery] = useState("");
  const [modelOptions, setModelOptions] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [machineModalOpen, setMachineModalOpen] = useState(initialMachineModal);
  const [linkModalRow, setLinkModalRow] = useState(null);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState({});
  const [workCards, setWorkCards] = useState([]);
  const [entries, setEntries] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [machines, setMachines] = useState([]);
  const [filters, setFilters] = useState({ q: "", durum: "", firma: "", tarih: "" });
  const [reportFilter, setReportFilter] = useState({
    baslangic: "",
    bitis: "",
    firma: "",
    model: "",
    siparisNo: "",
    makine: "",
    makinaci: "",
    vardiya: "",
    durum: "",
  });
  const [reportRows, setReportRows] = useState([]);
  const [newModel, setNewModel] = useState({
    model: "",
    firma: "",
    siparisNo: "",
    gorsel: "",
    aciklama: "",
  });

  async function loadBase(nextFilters = filters) {
    try {
      const [summaryRows, cards, entryRows, dispatchRows, machineRows] = await Promise.all([
        getUretimSeriSummary(activeMainCompany, nextFilters),
        getUretimSeriWorkCards(activeMainCompany, nextFilters),
        getUretimSeriEntries(activeMainCompany),
        getUretimSeriIncomingDispatches(activeMainCompany),
        getUretimSeriMachines(activeMainCompany),
      ]);
      setSummary(summaryRows || {});
      setWorkCards(Array.isArray(cards) ? cards : []);
      setEntries(Array.isArray(entryRows) ? entryRows : []);
      setDispatches(Array.isArray(dispatchRows) ? dispatchRows : []);
      setMachines(Array.isArray(machineRows) ? machineRows : []);
    } catch (error) {
      setMessage(error?.message || "İmalat verisi okunamadı.");
    }
  }

  useEffect(() => {
    loadBase();
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  useEffect(() => {
    if (initialMachineModal) setMachineModalOpen(true);
  }, [activeTab]);

  const selectedCard = useMemo(() => {
    if (selectedModel) {
      return (
        workCards.find((card) => card.modelId && card.modelId === selectedModel?.id) ||
        workCards.find((card) => card.modelId && card.modelId === selectedModel?.modelId) ||
        workCards.find((card) => card.model === selectedModel?.model) ||
        selectedModel
      );
    }
    if (entryForm.model) {
      return workCards.find((card) => card.model === entryForm.model) || null;
    }
    return workCards[0] || null;
  }, [selectedModel, workCards, entryForm.model]);

  async function searchModels(q) {
    setModelQuery(q);
    setEntryForm((current) => ({ ...current, model: q, modelId: "" }));
    setSelectedModel(null);
    if (String(q || "").trim().length < 2) {
      setModelOptions([]);
      return;
    }
    try {
      const rows = await searchUretimSeriModels(activeMainCompany, q);
      setModelOptions(Array.isArray(rows) ? rows : []);
      if (Array.isArray(rows) && rows.length === 0) setModelModalOpen(true);
    } catch (error) {
      setMessage(error?.message || "Model araması yapılamadı.");
    }
  }

  function chooseModel(model) {
    setSelectedModel(model);
    setModelQuery(model?.model || model?.modelAdi || "");
    setModelOptions([]);
    setEntryForm((current) => ({
      ...current,
      modelId: model?.id || model?.modelId,
      model: model?.model || model?.modelAdi,
      siparisNo: current?.siparisNo || model?.siparisNo || "",
      birimFiyat: current?.birimFiyat || model?.birimFiyat || "",
    }));
  }

  function selectMachine(machineNo) {
    const machine = machines.find((item) => String(item?.makineNo) === String(machineNo));
    setEntryForm((current) => ({
      ...current,
      makineNo: machineNo,
      makinaci: machine.makinaci || current?.makinaci,
      vardiya: machine.vardiya || current?.vardiya,
    }));
  }

  async function saveEntry() {
    const payload = { ...entryForm, adet: parseNumber(entryForm.adet) };
    if (!payload?.modelId && payload?.model) {
      setModelModalOpen(true);
      setMessage("Model kaydı bulunamadı. Yeni Model + Görsel penceresinden modeli kaydedin.");
      return;
    }
    if (!payload?.tarih || !payload?.makineNo || !payload?.modelId || !payload?.adet || !payload?.vardiya || !payload?.makinaci) {
      setMessage("Tarih, Makine No, Model Ara / Seç, Adet, Vardiya ve Makinacı zorunludur.");
      return;
    }
    try {
      await createUretimSeriEntry(activeMainCompany, payload);
      setMessage(payload?.irsaliyeNo ? "İmalat girişi kaydedildi. Durum: İrsaliye Eşleşti." : "İmalat girişi kaydedildi. Durum: İmalat Var İrsaliye Yok.");
      setEntryForm(blankEntryForm());
      setModelQuery("");
      setSelectedModel(null);
      await loadBase();
    } catch (error) {
      setMessage(error?.message || "İmalat girişi kaydedilemedi.");
    }
  }

  async function saveNewModel() {
    if (!newModel.model.trim()) {
      setMessage("Yeni model için model adı zorunludur.");
      return;
    }
    try {
      const saved = await createUretimSeriWorkCard(activeMainCompany, newModel);
      chooseModel({
        id: saved?.modelId || saved?.id,
        modelId: saved?.modelId || saved?.id,
        model: saved?.model,
        firma: saved?.firma,
        gorsel: saved?.gorsel,
        siparisNo: saved?.siparisNo,
      });
      setNewModel({ model: "", firma: "", siparisNo: "", gorsel: "", aciklama: "" });
      setModelModalOpen(false);
      setMessage("Yeni model iş kartı açıldı.");
      await loadBase();
    } catch (error) {
      setMessage(error?.message || "Yeni model kaydedilemedi.");
    }
  }

  async function bindModel(row, model) {
    if (!window.confirm(`${row?.irsaliyeNo || "İrsaliye"} bu modele bağlansın mı`)) return;
    try {
      await linkUretimSeriModel(activeMainCompany, {
        modelId: model?.id || model?.modelId,
        modelAdi: model?.model || model?.modelAdi,
        irsaliyeNo: row?.irsaliyeNo,
        siparisNo: row?.siparisNo,
        tarih: row?.tarih,
        adet: row?.irsaliyeAdedi,
        birimFiyat: row?.birimFiyat,
      });
      setLinkModalRow(null);
      setMessage("İrsaliye modele bağlandı.");
      await loadBase();
    } catch (error) {
      setMessage(error?.message || "Model bağlanamadı.");
    }
  }

  async function setPrice(row) {
    const value = window.prompt("Birim fiyat", row?.birimFiyat || "");
    if (value === null) return;
    if (!window.confirm("Birim fiyat kaydedilsin mi")) return;
    try {
      await setUretimSeriPrice(activeMainCompany, {
        modelId: row?.modelId,
        modelAdi: row?.model,
        irsaliyeNo: row?.irsaliyeNo,
        siparisNo: row?.siparisNo,
        adet: row?.gelenIrsaliye,
        birimFiyat: value,
      });
      setMessage("Birim fiyat kaydedildi.");
      await loadBase();
    } catch (error) {
      setMessage(error?.message || "Birim fiyat kaydedilemedi.");
    }
  }

  async function linkInvoice(row) {
    const faturaNo = window.prompt("Fatura No", row?.faturaNo || "");
    if (faturaNo === null) return;
    const adet = window.prompt("Fatura adedi", row?.kalanAdet || row?.imalat || "");
    if (adet === null) return;
    const fiyat = window.prompt("Birim fiyat", row?.birimFiyat || "");
    if (fiyat === null) return;
    if (!window.confirm("Fatura bu iş kartına bağlansın mı")) return;
    try {
      await linkUretimSeriInvoice(activeMainCompany, {
        workCardId: row?.id,
        modelId: row?.modelId,
        model: row?.model,
        firma: row?.firma,
        siparisNo: row?.siparisNo,
        irsaliyeNo: row?.irsaliyeNo,
        faturaNo,
        faturaAdedi: adet,
        birimFiyat: fiyat,
      });
      setMessage("Fatura iş kartına bağlandı.");
      await loadBase();
    } catch (error) {
      setMessage(error?.message || "Fatura bağlanamadı.");
    }
  }

  async function closeWork(row) {
    if (!window.confirm(`${row?.model} işi tamamlandı olarak kapatılsın mı`)) return;
    try {
      await closeUretimSeriWork(activeMainCompany, {
        id: row?.id,
        modelId: row?.modelId,
        model: row?.model,
      });
      setMessage("İş kapatıldı.");
      await loadBase();
    } catch (error) {
      setMessage(error?.message || "İş kapatılamadı.");
    }
  }

  async function applyFilters() {
    await loadBase(filters);
  }

  async function saveMachine() {
    if (!machineForm.makineNo || !machineForm.makineAdi) {
      setMessage("Makine No ve Makine Adı zorunludur.");
      return;
    }
    if (!window.confirm("Makine ayarı kaydedilsin mi")) return;
    try {
      await saveUretimSeriMachine(activeMainCompany, machineForm);
      setMachineForm(blankMachineForm());
      setMessage("Makine ayarı kaydedildi.");
      await loadBase();
    } catch (error) {
      setMessage(error?.message || "Makine ayarı kaydedilemedi.");
    }
  }

  async function loadReport() {
    try {
      const rows = await getUretimSeriReport(activeMainCompany, reportFilter);
      setReportRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setMessage(error?.message || "Rapor alınamadı.");
    }
  }

  function openTab(tabKey) {
    openModule?.("uretim", { tabKey });
  }

  return (
    <div className="clean-workflow-page iw-page seri-page">
      <section className="cw-screen">
        <header className="cw-card iw-header seri-header">
          <div>
            <h1>{section === "giris" ? "Üretim Girişi" : section === "denetim" ? "İmalat Denetim" : "Üretim Raporu"}</h1>
            <p>Seri üretim, irsaliye, fatura ve kalan iş tek denetim havuzunda izlenir.</p>
          </div>
          <div className="iw-tabs">
            <button type="button" className={section === "giris" ? "active" : ""} onClick={() => openTab("uretim-girisi")}>Üretim Girişi</button>
            <button type="button" className={section === "denetim" ? "active" : ""} onClick={() => openTab("imalat-denetim")}>İmalat Denetim</button>
            <button type="button" className={section === "rapor" ? "active" : ""} onClick={() => openTab("uretim-raporu")}>Üretim Raporu</button>
          </div>
        </header>

        {message ? <div className="iw-notice">{message}</div> : null}

        {section === "giris" ? (
          <ProductionEntryScreen
            entryForm={entryForm}
            setEntryForm={setEntryForm}
            modelQuery={modelQuery}
            modelOptions={modelOptions}
            selectedCard={selectedCard}
            entries={entries}
            dispatches={dispatches}
            workCards={workCards}
            machines={machines}
            searchModels={searchModels}
            chooseModel={chooseModel}
            selectMachine={selectMachine}
            saveEntry={saveEntry}
            setModelModalOpen={setModelModalOpen}
            setMachineModalOpen={setMachineModalOpen}
            setLinkModalRow={setLinkModalRow}
            openDenetim={() => openTab("imalat-denetim")}
          />
        ) : null}

        {section === "denetim" ? (
          <AuditScreen
            filters={filters}
            setFilters={setFilters}
            summary={summary}
            workCards={workCards}
            dispatches={dispatches}
            applyFilters={applyFilters}
            setLinkModalRow={setLinkModalRow}
            setPrice={setPrice}
            linkInvoice={linkInvoice}
            closeWork={closeWork}
          />
        ) : null}

        {section === "rapor" ? (
          <ReportScreen
            reportFilter={reportFilter}
            setReportFilter={setReportFilter}
            reportRows={reportRows}
            loadReport={loadReport}
          />
        ) : null}
      </section>

      {machineModalOpen ? (
        <MachineModal
          machineForm={machineForm}
          setMachineForm={setMachineForm}
          machines={machines}
          saveMachine={saveMachine}
          close={() => setMachineModalOpen(false)}
        />
      ) : null}

      {modelModalOpen ? (
        <NewModelModal
          newModel={newModel}
          setNewModel={setNewModel}
          saveNewModel={saveNewModel}
          close={() => setModelModalOpen(false)}
        />
      ) : null}

      {linkModalRow ? (
        <LinkModelModal
          row={linkModalRow}
          activeMainCompany={activeMainCompany}
          bindModel={bindModel}
          close={() => setLinkModalRow(null)}
        />
      ) : null}
    </div>
  );
}

function ProductionEntryScreen(props) {
  const {
    entryForm,
    setEntryForm,
    modelQuery,
    modelOptions,
    selectedCard,
    entries,
    dispatches,
    workCards,
    machines,
    searchModels,
    chooseModel,
    selectMachine,
    saveEntry,
    setModelModalOpen,
    setMachineModalOpen,
    setLinkModalRow,
    openDenetim,
  } = props;
  const invoiceReady = workCards.filter((row) => ["Fatura Kesilebilir", "Faturası Kesildi İmalat Devam", "Numune/Fark Var"].includes(row?.durum));
  return (
    <div className="simple-production-layout uretim-final-layout">
      <main className="simple-production-main">
        <div className="iw-card">
          <div className="iw-card-head">
            <h2>Hızlı İmalat Girişi</h2>
            <div className="row-actions">
              <button className="iw-btn" type="button" onClick={() => setModelModalOpen(true)}>Yeni Model + Görsel</button>
              <button className="iw-btn" type="button" onClick={() => setMachineModalOpen(true)}>Makine Ayarları</button>
              <button className="iw-btn primary" type="button" onClick={saveEntry}>Kaydet</button>
            </div>
          </div>
          <div className="iw-card-body">
            <div className="simple-form required uretim-entry-grid">
              <Field label="Tarih"><input type="date" value={entryForm.tarih} onChange={(event) => setEntryForm({ ...entryForm, tarih: event?.target.value })} /></Field>
              <Field label="Makine No">
                <input list="machine-list" value={entryForm.makineNo} onChange={(event) => selectMachine(event?.target.value)} />
                <datalist id="machine-list">{machines.map((item) => <option key={item?.makineNo} value={item?.makineNo}>{item?.makineAdi}</option>)}</datalist>
              </Field>
              <Field label="Model Ara / Seç">
                <div className="model-autocomplete">
                  <input value={modelQuery} onChange={(event) => searchModels(event?.target.value)} placeholder="L CARS, PLUME, MINNO..." />
                  {modelOptions.length ? (
                    <div className="model-options">
                      {modelOptions.map((model) => (
                        <button key={model?.id || model?.modelId || model?.model} type="button" onClick={() => chooseModel(model)}>
                          <strong>{model?.model || model?.modelAdi}</strong>
                          <span>{model?.firma || "Firma yok"}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Field>
              <Field label="Adet"><input value={entryForm.adet} onChange={(event) => setEntryForm({ ...entryForm, adet: event?.target.value })} /></Field>
              <Field label="Vardiya"><select value={entryForm.vardiya} onChange={(event) => setEntryForm({ ...entryForm, vardiya: event?.target.value })}><option>Gündüz</option><option>Gece</option></select></Field>
              <Field label="Makinacı"><input value={entryForm.makinaci} onChange={(event) => setEntryForm({ ...entryForm, makinaci: event?.target.value })} /></Field>
            </div>
            <div className="simple-form optional uretim-entry-optional">
              <Field label="Sipariş No"><input value={entryForm.siparisNo} onChange={(event) => setEntryForm({ ...entryForm, siparisNo: event?.target.value })} /></Field>
              <Field label="İrsaliye No"><input value={entryForm.irsaliyeNo} onChange={(event) => setEntryForm({ ...entryForm, irsaliyeNo: event?.target.value })} /></Field>
              <Field label="Birim Fiyat"><input value={entryForm.birimFiyat} onChange={(event) => setEntryForm({ ...entryForm, birimFiyat: event?.target.value })} /></Field>
              <Field label="Not"><input value={entryForm.not} onChange={(event) => setEntryForm({ ...entryForm, not: event?.target.value })} /></Field>
            </div>
          </div>
        </div>

        <div className="iw-card">
          <div className="iw-card-head">
            <h2>Bugünkü / Son İmalat Girişleri</h2>
            <button className="iw-btn" type="button" onClick={openDenetim}>Denetime Git</button>
          </div>
          <div className="iw-table-wrap compact">
            <table>
              <thead><tr><th>Tarih</th><th>Model</th><th>Adet</th><th>Makine</th><th>Vardiya</th><th>Makinacı</th><th>İrsaliye</th><th>Durum</th></tr></thead>
              <tbody>{entries.slice(0, 12).map((row) => <tr key={row?.id}><td>{row?.tarih}</td><td>{row?.model}</td><td>{qty(row?.adet)}</td><td>{row?.makineNo}</td><td>{row?.vardiya}</td><td>{row?.makinaci}</td><td>{row?.irsaliyeNo || "-"}</td><td><Badge value={row?.durum || (row?.irsaliyeNo ? "İrsaliye Eşleşti" : "İmalat Var İrsaliye Yok")} /></td></tr>)}</tbody>
            </table>
          </div>
        </div>

        <div className="split uretim-entry-bottom">
          <SmallDispatchTable rows={dispatches.slice(0, 8)} setLinkModalRow={setLinkModalRow} />
          <SmallInvoiceReadyTable rows={invoiceReady.slice(0, 8)} openDenetim={openDenetim} />
        </div>
      </main>
      <ModelCard card={selectedCard} openDenetim={openDenetim} />
    </div>
  );
}

function ModelCard({ card, openDenetim }) {
  return (
    <aside className="iw-card simple-model-card uretim-model-card">
      <div className="iw-card-head"><h2>Model Kartı</h2></div>
      <div className="iw-card-body">
        <div className="seri-imgbox">
          {card.gorsel ? <img src={assetUrl(card.gorsel)} alt={card.model} /> : <span>Model görseli</span>}
        </div>
        <Info label="Model adı" value={card.model || "-"} />
        <Info label="Firma" value={card.firma || "-"} />
        <Info label="Sipariş" value={card.siparisNo || "-"} />
        <Info label="Gelen irsaliye" value={qty(card.gelenIrsaliye)} />
        <Info label="İmalat toplamı" value={qty(card.imalat)} />
        <Info label="Fatura kesilen" value={qty(card.fatura)} />
        <Info label="Kalan" value={qty(card.kalanAdet)} danger={parseNumber(card.kalanAdet) > 0} />
        <Info label="Birim fiyat" value={card.birimFiyat ? money(card.birimFiyat) : "Fiyat yok"} danger={!card.birimFiyat} />
        <div className="iw-info-line"><span>Durum</span><strong><Badge value={card.durum || "-"} /></strong></div>
        <button className="iw-btn primary full" type="button" onClick={openDenetim}>İşi Denetimde Aç</button>
      </div>
    </aside>
  );
}

function Info({ label, value, danger = false }) {
  return <div className="iw-info-line"><span>{label}</span><strong className={danger ? "seri-danger" : ""}>{value}</strong></div>;
}

function SmallDispatchTable({ rows, setLinkModalRow }) {
  return (
    <div className="iw-card">
      <div className="iw-card-head"><h2>İrsaliye Gelenler - Hızlı Görünüm</h2></div>
      <div className="iw-table-wrap compact">
        <table>
          <thead><tr><th>Firma</th><th>İrsaliye</th><th>Model Yazısı</th><th>Adet</th><th>Durum</th><th>İşlem</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row?.id}><td>{row?.firma}</td><td>{row?.irsaliyeNo}</td><td>{row?.modelAdi || "-"}</td><td>{qty(row?.irsaliyeAdedi)}</td><td><Badge value={row?.durum} /></td><td><button type="button" onClick={() => setLinkModalRow(row)}>Model Bağla</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function SmallInvoiceReadyTable({ rows, openDenetim }) {
  return (
    <div className="iw-card">
      <div className="iw-card-head"><h2>Fatura Kesilebilir / Devam Eden</h2></div>
      <div className="iw-table-wrap compact">
        <table>
          <thead><tr><th>Model</th><th>İmalat</th><th>Fatura</th><th>Kalan</th><th>Durum</th><th>İşlem</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row?.id}><td>{row?.model}</td><td>{qty(row?.imalat)}</td><td>{qty(row?.fatura)}</td><td>{qty(row?.kalanAdet)}</td><td><Badge value={row?.durum} /></td><td><button type="button" onClick={openDenetim}>Aç</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function AuditScreen(props) {
  const { filters, setFilters, summary, workCards, dispatches, applyFilters, setLinkModalRow, setPrice, linkInvoice, closeWork } = props;
  return (
    <>
      <div className="iw-card">
        <div className="iw-card-body">
          <div className="toolbar uretim-filterbar">
            <Field label="Genel arama"><input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event?.target.value })} placeholder="Model, firma, sipariş, irsaliye, fatura" /></Field>
            <Field label="Durum"><select value={filters.durum} onChange={(event) => setFilters({ ...filters, durum: event?.target.value })}><option value="">Tüm işler</option>{Object.keys(STATUS_CLASSES).map((status) => <option key={status}>{status}</option>)}</select></Field>
            <Field label="Firma"><input value={filters.firma} onChange={(event) => setFilters({ ...filters, firma: event?.target.value })} /></Field>
            <Field label="Tarih"><input type="date" value={filters.tarih} onChange={(event) => setFilters({ ...filters, tarih: event?.target.value })} /></Field>
            <button className="iw-btn primary" type="button" onClick={applyFilters}>Filtrele</button>
            <button className="iw-btn" type="button" onClick={() => exportRows(`imalat-denetim-${todayIso()}.xls`, auditHeaders(), workCards)}>Excel</button>
          </div>
          <div className="summary uretim-summary">
            <Stat label="İrsaliye Gelen" value={qty(summary.irsaliyeGelen)} />
            <Stat label="Fatura Kesilebilir" value={summary.faturaKesilebilir || 0} tone="green" />
            <Stat label="Kısmi / Devam" value={summary.kismiDevam || 0} tone="yellow" />
            <Stat label="Model Bağlanmadı" value={summary.modelBaglanmadi || 0} tone="red" />
            <Stat label="Toplam Kalan Tutar" value={money(summary.toplamKalanTutar)} />
            <Stat label="Açık İş" value={summary.acikIs || 0} />
          </div>
        </div>
      </div>
      <div className="iw-card">
        <div className="iw-card-head"><h2>İş Denetim Havuzu</h2></div>
        <div className="iw-table-wrap">
          <table>
            <thead><tr><th>Firma</th><th>Model</th><th>Sipariş</th><th>Gelen İrsaliye</th><th>İmalat</th><th>Bizim Sevk</th><th>Fatura</th><th>Birim Fiyat</th><th>Kalan Adet</th><th>Kalan Tutar</th><th>Durum</th><th>İşlem</th></tr></thead>
            <tbody>{workCards.map((row) => <tr key={row?.id}><td>{row?.firma}</td><td>{row?.model}</td><td>{row?.siparisNo || "-"}</td><td>{qty(row?.gelenIrsaliye)}</td><td>{qty(row?.imalat)}</td><td>{qty(row?.bizimSevk)}</td><td>{qty(row?.fatura)}</td><td>{row?.birimFiyat ? money(row?.birimFiyat) : "Fiyat yok"}</td><td>{qty(row?.kalanAdet)}</td><td>{money(row?.kalanTutar)}</td><td><Badge value={row?.durum} /></td><td><div className="row-actions"><button type="button" onClick={() => setPrice(row)}>Fiyat Gir</button><button type="button" onClick={() => linkInvoice(row)}>Fatura Bağla</button><button type="button" onClick={() => closeWork(row)}>Kapat</button></div></td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="split uretim-entry-bottom">
        <SmallDispatchTable rows={dispatches} setLinkModalRow={setLinkModalRow} />
        <div className="iw-card">
          <div className="iw-card-head"><h2>Faturası Kesilen / İmalatı Devam Eden</h2></div>
          <div className="iw-table-wrap compact">
            <table>
              <thead><tr><th>Model</th><th>İmalat</th><th>Fatura</th><th>Kalan</th><th>Fiyat</th><th>Durum</th><th>İşlem</th></tr></thead>
              <tbody>{workCards.filter((row) => parseNumber(row?.fatura) > 0 || row.durum === "Fiyat Yok").map((row) => <tr key={row?.id}><td>{row?.model}</td><td>{qty(row?.imalat)}</td><td>{qty(row?.fatura)}</td><td>{qty(row?.kalanAdet)}</td><td>{row?.birimFiyat ? money(row?.birimFiyat) : "-"}</td><td><Badge value={row?.durum} /></td><td><button type="button" onClick={() => setPrice(row)}>Fiyat Gir</button></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone = "" }) {
  return <div className={`stat ${tone}`}><span>{label}</span><b>{value}</b></div>;
}

function auditHeaders() {
  return [
    { key: "firma", label: "Firma" },
    { key: "model", label: "Model" },
    { key: "siparisNo", label: "Sipariş" },
    { key: "gelenIrsaliye", label: "Gelen İrsaliye" },
    { key: "imalat", label: "İmalat" },
    { key: "bizimSevk", label: "Bizim Sevk" },
    { key: "fatura", label: "Fatura" },
    { key: "birimFiyat", label: "Birim Fiyat" },
    { key: "kalanAdet", label: "Kalan Adet" },
    { key: "kalanTutar", label: "Kalan Tutar" },
    { key: "durum", label: "Durum" },
  ];
}

function ReportScreen({ reportFilter, setReportFilter, reportRows, loadReport }) {
  const totals = reportRows.reduce((acc, row) => ({
    imalat: acc.imalat + parseNumber(row?.imalat),
    fatura: acc.fatura + parseNumber(row?.faturaKesilen),
    kalan: acc.kalan + parseNumber(row?.kalan),
    tutar: acc.tutar + parseNumber(row?.tutar),
    fiyatEksik: acc.fiyatEksik + (parseNumber(row?.birimFiyat) ? 0 : 1),
  }), { imalat: 0, fatura: 0, kalan: 0, tutar: 0, fiyatEksik: 0 });
  return (
    <>
      <div className="iw-card">
        <div className="iw-card-body">
          <div className="simple-form optional report-filter-grid">
            {[
              ["baslangic", "Tarih başlangıç", "date"],
              ["bitis", "Tarih bitiş", "date"],
              ["firma", "Firma", "text"],
              ["model", "Model", "text"],
              ["siparisNo", "Sipariş No", "text"],
              ["makine", "Makine", "text"],
              ["makinaci", "Makinacı", "text"],
            ].map(([key, label, type]) => <Field key={key} label={label}><input type={type} value={reportFilter[key]} onChange={(event) => setReportFilter({ ...reportFilter, [key]: event?.target.value })} /></Field>)}
            <Field label="Vardiya"><select value={reportFilter.vardiya} onChange={(event) => setReportFilter({ ...reportFilter, vardiya: event?.target.value })}><option value="">Tümü</option><option>Gündüz</option><option>Gece</option></select></Field>
            <Field label="Durum"><select value={reportFilter.durum} onChange={(event) => setReportFilter({ ...reportFilter, durum: event?.target.value })}><option value="">Tümü</option>{Object.keys(STATUS_CLASSES).map((status) => <option key={status}>{status}</option>)}</select></Field>
            <button className="iw-btn primary" type="button" onClick={loadReport}>Raporla</button>
            <button className="iw-btn" type="button" onClick={() => exportRows(`uretim-raporu-${todayIso()}.xls`, reportHeaders(), reportRows)}>Excel</button>
          </div>
        </div>
      </div>
      <div className="summary uretim-summary">
        <Stat label="Toplam imalat" value={qty(totals.imalat)} />
        <Stat label="Fatura kesilen" value={qty(totals.fatura)} tone="green" />
        <Stat label="Kalan" value={qty(totals.kalan)} tone="yellow" />
        <Stat label="Toplam tutar" value={money(totals.tutar)} />
        <Stat label="Fiyat eksik" value={totals.fiyatEksik} tone="red" />
        <Stat label="İş sayısı" value={reportRows.length} />
      </div>
      <div className="iw-card">
        <div className="iw-card-head"><h2>Üretim Rapor Listesi</h2></div>
        <div className="iw-table-wrap">
          <table>
            <thead><tr><th>Tarih</th><th>Firma</th><th>Model</th><th>Sipariş</th><th>İrsaliye</th><th>Fatura</th><th>Makine</th><th>Vardiya</th><th>Makinacı</th><th>İmalat</th><th>Fatura Kesilen</th><th>Kalan</th><th>Birim Fiyat</th><th>Tutar</th><th>Durum</th></tr></thead>
            <tbody>{reportRows.map((row, index) => <tr key={`${row?.model}-${row?.irsaliye}-${index}`}><td>{row?.tarih}</td><td>{row?.firma}</td><td>{row?.model}</td><td>{row?.siparis || "-"}</td><td>{row?.irsaliye || "-"}</td><td>{row?.fatura || "-"}</td><td>{row?.makine || "-"}</td><td>{row?.vardiya || "-"}</td><td>{row?.makinaci || "-"}</td><td>{qty(row?.imalat)}</td><td>{qty(row?.faturaKesilen)}</td><td>{qty(row?.kalan)}</td><td>{row?.birimFiyat ? money(row?.birimFiyat) : "-"}</td><td>{money(row?.tutar)}</td><td><Badge value={row?.durum} /></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function reportHeaders() {
  return [
    { key: "tarih", label: "Tarih" },
    { key: "firma", label: "Firma" },
    { key: "model", label: "Model" },
    { key: "siparis", label: "Sipariş" },
    { key: "irsaliye", label: "İrsaliye" },
    { key: "fatura", label: "Fatura" },
    { key: "makine", label: "Makine" },
    { key: "vardiya", label: "Vardiya" },
    { key: "makinaci", label: "Makinacı" },
    { key: "imalat", label: "İmalat" },
    { key: "faturaKesilen", label: "Fatura Kesilen" },
    { key: "kalan", label: "Kalan" },
    { key: "birimFiyat", label: "Birim Fiyat" },
    { key: "tutar", label: "Tutar" },
    { key: "durum", label: "Durum" },
  ];
}

function MachineModal({ machineForm, setMachineForm, machines, saveMachine, close }) {
  return (
    <div className="iw-modal-backdrop">
      <div className="iw-modal-box machine-modal">
        <div className="iw-card-head"><h2>Makine Ayarları</h2><button className="iw-btn" type="button" onClick={close}>Kapat</button></div>
        <div className="iw-card-body">
          <div className="simple-form optional">
            <Field label="Makine No"><input value={machineForm.makineNo} onChange={(event) => setMachineForm({ ...machineForm, makineNo: event?.target.value })} /></Field>
            <Field label="Makine Adı"><input value={machineForm.makineAdi} onChange={(event) => setMachineForm({ ...machineForm, makineAdi: event?.target.value })} /></Field>
            <Field label="Vardiya"><select value={machineForm.vardiya} onChange={(event) => setMachineForm({ ...machineForm, vardiya: event?.target.value })}><option>Gündüz</option><option>Gece</option></select></Field>
            <Field label="Varsayılan Makinacı"><input value={machineForm.makinaci} onChange={(event) => setMachineForm({ ...machineForm, makinaci: event?.target.value })} /></Field>
            <Field label="Durum"><select value={machineForm.durum} onChange={(event) => setMachineForm({ ...machineForm, durum: event?.target.value })}><option>Aktif</option><option>Pasif</option></select></Field>
            <button className="iw-btn primary" type="button" onClick={saveMachine}>Kaydet</button>
          </div>
          <div className="iw-table-wrap compact">
            <table>
              <thead><tr><th>No</th><th>Makine</th><th>Vardiya</th><th>Makinacı</th><th>Durum</th><th>İşlem</th></tr></thead>
              <tbody>{machines.map((machine) => <tr key={machine.makineNo}><td>{machine.makineNo}</td><td>{machine.makineAdi}</td><td>{machine.vardiya}</td><td>{machine.makinaci}</td><td>{machine.durum}</td><td><button type="button" onClick={() => setMachineForm({ ...machine, id: machine.id || machine.makineNo })}>Düzelt</button></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewModelModal({ newModel, setNewModel, saveNewModel, close }) {
  function readImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setNewModel({ ...newModel, gorsel: String(reader.result || "") });
    reader.readAsDataURL(file);
  }
  return (
    <div className="iw-modal-backdrop">
      <div className="iw-modal-box">
        <div className="iw-card-head"><h2>Yeni Model + Görsel</h2><button className="iw-btn" type="button" onClick={close}>Kapat</button></div>
        <div className="iw-card-body">
          <div className="simple-form optional">
            <Field label="Model Adı"><input value={newModel.model} onChange={(event) => setNewModel({ ...newModel, model: event?.target.value })} /></Field>
            <Field label="Firma"><input value={newModel.firma} onChange={(event) => setNewModel({ ...newModel, firma: event?.target.value })} /></Field>
            <Field label="Sipariş No"><input value={newModel.siparisNo} onChange={(event) => setNewModel({ ...newModel, siparisNo: event?.target.value })} /></Field>
            <Field label="Görsel"><input type="file" accept="image/*" onChange={(event) => readImage(event?.target.files?.[0])} /></Field>
          </div>
          <Field label="Açıklama / OCR"><textarea value={newModel.aciklama} onChange={(event) => setNewModel({ ...newModel, aciklama: event?.target.value })} /></Field>
          {newModel.gorsel ? <div className="seri-imgbox modal-preview"><img src={newModel.gorsel} alt={newModel.model} /></div> : null}
          <button className="iw-btn primary" type="button" onClick={saveNewModel}>Modeli Kaydet</button>
        </div>
      </div>
    </div>
  );
}

function LinkModelModal({ row, activeMainCompany, bindModel, close }) {
  const [query, setQuery] = useState(row?.modelAdi || "");
  const [rows, setRows] = useState([]);
  async function search(q) {
    setQuery(q);
    if (q.trim().length < 2) {
      setRows([]);
      return;
    }
    const result = await searchUretimSeriModels(activeMainCompany, q);
    setRows(Array.isArray(result) ? result : []);
  }
  useEffect(() => {
    search(query);
  }, []);
  return (
    <div className="iw-modal-backdrop">
      <div className="iw-modal-box">
        <div className="iw-card-head"><h2>İrsaliyeyi Modele Bağla</h2><button className="iw-btn" type="button" onClick={close}>Kapat</button></div>
        <div className="iw-card-body">
          <div className="iw-notice">İrsaliye model bağlı olmasa bile denetimde görünür.</div>
          <Field label="Model Ara"><input value={query} onChange={(event) => search(event?.target.value)} /></Field>
          <div className="iw-table-wrap compact">
            <table>
              <thead><tr><th>Model</th><th>Firma</th><th>Görsel</th><th>İşlem</th></tr></thead>
              <tbody>{rows.map((model) => <tr key={model?.id || model?.modelId || model?.model}><td>{model?.model || model?.modelAdi}</td><td>{model?.firma || "-"}</td><td>{model?.gorsel ? "Var" : "-"}</td><td><button type="button" onClick={() => bindModel(row, model)}>Bu Modele Bağla</button></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
