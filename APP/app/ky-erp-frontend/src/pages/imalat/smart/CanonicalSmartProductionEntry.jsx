import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  ClipboardCheck,
  Eraser,
  History,
  Save,
  ScanText,
  UserRound,
} from "lucide-react";
import {
  bulkCreateProduction,
  getProductionParserDictionaries,
  getRecentProductionEntries,
} from "../../../services/imalatApi";
import { getCanonicalModels } from "../../../services/modelFlowApi";
import {
  operatorForMachine,
  parseProductionEntries,
  validateProductionRows,
} from "./productionEntryParser.js";
import ParsedProductionTable from "./ParsedProductionTable.jsx";
import ProductionEntrySummary from "./ProductionEntrySummary.jsx";

const today = () => new Date().toISOString().slice(0, 10);

function machineId(machine) {
  return String(machine?.id || machine?.machineNo || machine?.no || "");
}

function machineName(machine) {
  return machine?.machineName || machine?.makineAdi || machine?.ad || machine?.machineNo || "";
}

function modelRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

export default function CanonicalSmartProductionEntry({ activeMainCompany, onConfigureMachines }) {
  const storageKey = `kyerp-canonical-production-${activeMainCompany?.slug || activeMainCompany?.id || "default"}`;
  const [dict, setDict] = useState({ models: [], machines: [], operators: [] });
  const [defaults, setDefaults] = useState({
    date: today(),
    shift: "Gündüz",
    machineId: "",
    machineName: "",
    operatorName: "",
  });
  const [text, setText] = useState(() => localStorage.getItem(storageKey) || "");
  const [rows, setRows] = useState([]);
  const [recent, setRecent] = useState([]);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [message, setMessage] = useState("");

  const loadRecent = useCallback(() =>
    getRecentProductionEntries(activeMainCompany, { limit: 20 })
      .then((result) => setRecent(Array.isArray(result) ? result : []))
      .catch((error) => setMessage(error?.message || "Son üretim kayıtları okunamadı.")),
  [activeMainCompany]);

  const loadDictionaries = useCallback(async () => {
    try {
      const [base, canonical] = await Promise.all([
        getProductionParserDictionaries(activeMainCompany),
        getCanonicalModels(activeMainCompany, { limit: 5000 }),
      ]);
      const dictionaries = {
        ...(base || {}),
        models: modelRows(canonical),
        machines: Array.isArray(base?.machines) ? base.machines : [],
        operators: Array.isArray(base?.operators) ? base.operators : [],
      };
      setDict(dictionaries);
      const firstMachine = dictionaries.machines[0];
      if (firstMachine) {
        setDefaults((current) => ({
          ...current,
          machineId: current.machineId || machineId(firstMachine),
          machineName: current.machineName || machineName(firstMachine),
          operatorName: current.operatorName || operatorForMachine(firstMachine, current.shift),
        }));
      }
      setMessage(`${dictionaries.models.length} tek merkez model, ${dictionaries.machines.length} aktif makine hazır.`);
    } catch (error) {
      setMessage(error?.message || "Tek merkez üretim sözlükleri okunamadı.");
    }
  }, [activeMainCompany]);

  useEffect(() => {
    loadDictionaries();
    loadRecent();
  }, [loadDictionaries, loadRecent]);

  useEffect(() => {
    if (text) localStorage.setItem(storageKey, text);
    else localStorage.removeItem(storageKey);
  }, [text, storageKey]);

  const visibleRows = useMemo(
    () => (showIssuesOnly ? rows.filter((row) => !["ready", "context"].includes(row.status)) : rows),
    [rows, showIssuesOnly],
  );

  function updateMachine(nextMachineId) {
    const machine = dict.machines.find((item) => machineId(item) === String(nextMachineId));
    setDefaults((current) => ({
      ...current,
      machineId: nextMachineId,
      machineName: machineName(machine),
      operatorName: operatorForMachine(machine, current.shift),
    }));
  }

  function updateShift(shift) {
    const machine = dict.machines.find((item) => machineId(item) === String(defaults.machineId));
    setDefaults((current) => ({
      ...current,
      shift,
      operatorName: operatorForMachine(machine, shift),
    }));
  }

  function parse() {
    const parsed = parseProductionEntries(text, dict, defaults);
    const productionRows = parsed.filter((row) => row.status !== "context");
    const issueCount = productionRows.filter((row) => row.status !== "ready").length;
    setRows(parsed);
    setShowIssuesOnly(false);
    setMessage(
      issueCount
        ? `${productionRows.length} satır çözümlendi; ${issueCount} satır düzeltilmeden kaydedilemez.`
        : `${productionRows.length} satır tek merkez model kimliğiyle kayda hazır.`,
    );
  }

  function runSerialValidation() {
    const checked = validateProductionRows(rows);
    const activeRows = checked.filter((row) => row.status !== "context");
    const issueCount = activeRows.filter((row) => row.status !== "ready").length;
    setRows(checked);
    setMessage(
      issueCount
        ? `Seri denetim tamamlandı: ${issueCount} sorunlu satır var.`
        : `Seri denetim tamamlandı: ${activeRows.length} satır kayda hazır.`,
    );
  }

  async function saveReadyRows() {
    const checked = validateProductionRows(rows);
    setRows(checked);
    const entries = checked.filter((row) => row.status === "ready");
    if (!entries.length) {
      setMessage("Kaydedilecek hazır satır yok. Önce kırmızı/sarı satırları düzeltin.");
      return;
    }
    if (!window.confirm(`${entries.length} hazır üretim satırı kaydedilsin mi?`)) return;
    const requestId = crypto.randomUUID();
    try {
      const result = await bulkCreateProduction(activeMainCompany, { requestId, entries });
      const successIds = new Set((result?.success || []).map((item) => item.clientId));
      const failures = new Map((result?.failed || []).map((item) => [item.clientId, item.error]));
      setRows((current) =>
        current
          .filter((row) => !successIds.has(row.id))
          .map((row) => failures.has(row.id)
            ? { ...row, status: "error", warnings: [failures.get(row.id)] }
            : row),
      );
      setMessage(`${successIds.size} satır kaydedildi, ${failures.size} satır hata nedeniyle kaldı.`);
      if (!failures.size && successIds.size === entries.length) {
        setText("");
        localStorage.removeItem(storageKey);
      }
      loadRecent();
    } catch (error) {
      setMessage(error?.message || "Toplu üretim kaydı yapılamadı.");
    }
  }

  return (
    <div className="smart-entry">
      <section className="iw-card smart-capture-card">
        <div className="iw-card-head">
          <div><h2><ScanText size={18} /> Akıllı Seri Fiş Girişi</h2><small>Model yalnız Desen merkezindeki tek kayıttan bulunur. “gündüz 1” yazıldığında Makine 1’in kayıtlı makinacısı otomatik atanır.</small></div>
          <span className="smart-shortcut">Ctrl + Enter: çözümle</span>
        </div>
        <div className="iw-card-body">
          <div className="smart-defaults">
            <label>Tarih<input type="date" value={defaults.date} onChange={(event) => setDefaults({ ...defaults, date: event.target.value })} /></label>
            <label>Vardiya<select value={defaults.shift} onChange={(event) => updateShift(event.target.value)}><option>Gündüz</option><option>Gece</option></select></label>
            <label>Makine<select value={defaults.machineId} onChange={(event) => updateMachine(event.target.value)}><option value="">Makine seçin</option>{dict.machines.map((machine) => <option key={machineId(machine)} value={machineId(machine)}>{machine.machineNo || machine.no} - {machineName(machine)}</option>)}</select></label>
            <label>Kayıtlı makinacı<div className="smart-operator-value"><UserRound size={16} /><strong>{defaults.operatorName || "Tanımlı değil"}</strong></div></label>
          </div>
          {!dict.machines.length ? <div className="smart-machine-warning"><div><CircleAlert size={17} /><span><strong>Aktif makine tanımı yok.</strong> Seri kayıt için makine ve vardiya ayarlarını tamamlayın.</span></div><button className="iw-btn" type="button" onClick={onConfigureMachines}>Makine Ayarlarını Aç</button></div> : null}
          <textarea className="smart-textarea" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); parse(); } }} placeholder={"15 windy ekru ön 2500 gündüz 1\n15 mervod polo ön 2500 kol 2400 gece 2\nMurat windy arka 2480"} />
          <div className="seri-actions smart-primary-actions">
            <button className="iw-btn primary" type="button" onClick={parse}><ScanText size={16} /> Çözümle ve Denetle</button>
            <button className="iw-btn" type="button" onClick={() => { setText(""); setRows([]); setMessage(""); }}><Eraser size={16} /> Formu Temizle</button>
            <button className="iw-btn" type="button" onClick={() => { loadDictionaries(); loadRecent(); }}><History size={16} /> Sözlük ve Kayıtları Yenile</button>
          </div>
          {message ? <div className="iw-notice smart-notice"><CircleAlert size={16} /> {message}</div> : null}
        </div>
      </section>

      {rows.length ? <section className="iw-card smart-review-card"><div className="iw-card-head smart-review-head"><div><h2><ClipboardCheck size={18} /> Seri Hata Denetimi</h2><small>Her satır model ID, tarih, adet, baskı bölgesi, makine ve makinacı açısından kontrol edilir.</small></div><div className="seri-actions"><button className="iw-btn" type="button" onClick={runSerialValidation}><ClipboardCheck size={16} /> Yeniden Denetle</button><button className={`iw-btn ${showIssuesOnly ? "active-filter" : ""}`} type="button" onClick={() => setShowIssuesOnly((current) => !current)}><CircleAlert size={16} /> {showIssuesOnly ? "Tüm Satırlar" : "Sorunlular"}</button><button className="iw-btn primary" type="button" onClick={saveReadyRows}><Save size={16} /> Hazırları Kaydet</button></div></div><div className="iw-card-body smart-summary-body"><ProductionEntrySummary rows={rows} /></div><ParsedProductionTable rows={visibleRows} setRows={setRows} dictionaries={dict} /></section> : null}

      <section className="iw-card"><div className="iw-card-head"><h2><History size={18} /> Son 20 Üretim Kaydı</h2></div><div className="iw-table-wrap compact"><table><thead><tr><th>Tarih</th><th>Model</th><th>Görsel</th><th>Bölge</th><th>Adet</th><th>Makine</th><th>Vardiya</th><th>Makinacı</th></tr></thead><tbody>{recent.length ? recent.map((entry) => <tr key={entry.id}><td>{entry.tarih}</td><td>{entry.model}</td><td>{entry.modelImageUrl ? <img className="smart-thumb" src={entry.modelImageUrl} alt={entry.model || "Model"} /> : "-"}</td><td>{entry.baskiBolgesi || "-"}</td><td>{Number(entry.adet || 0).toLocaleString("tr-TR")}</td><td>{[entry.makineNo, entry.makineAdi].filter(Boolean).join(" - ") || "-"}</td><td>{entry.vardiya || "-"}</td><td>{entry.makinaci || "-"}</td></tr>) : <tr><td colSpan={8}>Henüz üretim kaydı bulunamadı.</td></tr>}</tbody></table></div></section>
    </div>
  );
}
