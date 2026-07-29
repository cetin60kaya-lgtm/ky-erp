import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  Factory,
  PackageCheck,
  Plus,
  RefreshCcw,
  Save,
  Search,
  TriangleAlert,
} from "lucide-react";
import { getDesignCompanies } from "../../services/desenWorkflowApi";
import {
  addUretimGirisi,
  getProductionParserDictionaries,
} from "../../services/imalatApi";
import {
  getProductionReconciliation,
  quickCreateCanonicalModel,
} from "../../services/modelFlowApi";
import "../modules/cleanWorkflow.css";
import "./imalatWorkflow.css";
import "./productionCenter.css";

const today = () => new Date().toISOString().slice(0, 10);

const emptyEntry = {
  tarih: today(),
  vardiya: "Gündüz",
  makineNo: "",
  makinaci: "",
  adet: "",
  baskiHatasiAdet: "",
  kumasHatasiAdet: "",
  not: "",
};

const emptyManual = {
  modelName: "",
  companyId: "",
  dispatchNo: "",
  expectedQty: "",
  printArea: "Ön",
};

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function qty(value) {
  return number(value).toLocaleString("tr-TR");
}

function machineId(row) {
  return String(row?.id || row?.machineNo || row?.makineNo || row?.no || "");
}

function machineName(row) {
  return row?.machineName || row?.makineAdi || row?.ad || row?.name || row?.machineNo || "";
}

function operatorFor(row, shift) {
  if (!row) return "";
  return String(shift || "").toLocaleLowerCase("tr-TR").includes("gece")
    ? row.nightOperator || row.geceMakinaci || row.operator || row.makinaci || ""
    : row.dayOperator || row.gunduzMakinaci || row.operator || row.makinaci || "";
}

function flattenRows(rows = []) {
  return rows.flatMap((row) => {
    const operations = Array.isArray(row.operationRows) && row.operationRows.length
      ? row.operationRows
      : [{ region: "Ön", producedQty: row.completedGrossQty || 0, missingQty: row.remainingQty || 0 }];
    return operations.map((operation) => ({
      id: `${row.modelId}|${row.dispatchNo}|${operation.region}`,
      modelId: row.modelId,
      modelName: row.modelName,
      companyName: row.companyName,
      dispatchNo: row.dispatchNo,
      orderNo: row.orderNo,
      expectedQty: row.expectedQty,
      printArea: operation.region,
      producedQty: operation.producedQty,
      remainingQty: Math.max(0, number(row.expectedQty) - number(operation.producedQty)),
      overQty: Math.max(0, number(operation.producedQty) - number(row.expectedQty)),
      status: operation.missingQty > 0
        ? "EKSİK"
        : number(operation.producedQty) > number(row.expectedQty)
          ? "FAZLA"
          : "TAMAM",
    }));
  });
}

function statusTone(status) {
  if (status === "FAZLA") return "red";
  if (status === "EKSİK") return "yellow";
  return "green";
}

export default function ProductionWorkPoolPage({ activeMainCompany }) {
  const [jobs, setJobs] = useState([]);
  const [machines, setMachines] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [entry, setEntry] = useState(emptyEntry);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState(emptyManual);

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    setLoading(true);
    try {
      const [balance, dictionaries, companyRows] = await Promise.all([
        getProductionReconciliation(activeMainCompany),
        getProductionParserDictionaries(activeMainCompany),
        getDesignCompanies(activeMainCompany).catch(() => []),
      ]);
      const nextJobs = flattenRows(balance?.rows || []);
      const nextMachines = Array.isArray(dictionaries?.machines) ? dictionaries.machines : [];
      setJobs(nextJobs);
      setMachines(nextMachines);
      setCompanies(Array.isArray(companyRows) ? companyRows : []);
      setSelectedId((current) => nextJobs.some((row) => row.id === current) ? current : nextJobs[0]?.id || "");
      const firstMachine = nextMachines[0];
      if (firstMachine) {
        setEntry((current) => ({
          ...current,
          makineNo: current.makineNo || machineId(firstMachine),
          makinaci: current.makinaci || operatorFor(firstMachine, current.vardiya),
        }));
      }
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "Üretim iş havuzu okunamadı.");
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    if (!query) return jobs;
    return jobs.filter((row) => `${row.modelName} ${row.companyName} ${row.dispatchNo} ${row.printArea}`.toLocaleLowerCase("tr-TR").includes(query));
  }, [jobs, search]);

  const selected = filtered.find((row) => row.id === selectedId) || filtered[0] || null;
  const selectedMachine = machines.find((row) => machineId(row) === entry.makineNo);
  const totalDefect = number(entry.baskiHatasiAdet) + number(entry.kumasHatasiAdet);
  const netEntry = Math.max(0, number(entry.adet) - totalDefect);

  function setMachine(value) {
    const machine = machines.find((row) => machineId(row) === value);
    setEntry((current) => ({
      ...current,
      makineNo: value,
      makinaci: operatorFor(machine, current.vardiya),
    }));
  }

  function setShift(value) {
    setEntry((current) => ({
      ...current,
      vardiya: value,
      makinaci: operatorFor(selectedMachine, value) || current.makinaci,
    }));
  }

  async function saveEntry() {
    if (!selected) return;
    if (!entry.tarih || !entry.makineNo || !entry.makinaci || number(entry.adet) <= 0) {
      setMessage("Tarih, makine, makinacı ve brüt üretim adedi zorunludur.");
      return;
    }
    if (totalDefect > number(entry.adet)) {
      setMessage("Toplam sakat adedi brüt üretim adedini aşamaz.");
      return;
    }
    setSaving(true);
    try {
      await addUretimGirisi(activeMainCompany, "", {
        modelId: selected.modelId,
        modelKaydiId: selected.modelId,
        model: selected.modelName,
        firma: selected.companyName || "Firma Seçilmedi",
        irsaliyeNo: selected.dispatchNo,
        siparisNo: selected.orderNo || selected.dispatchNo,
        baskiBolgesi: selected.printArea,
        tarih: entry.tarih,
        vardiya: entry.vardiya,
        makineNo: entry.makineNo,
        makineAdi: machineName(selectedMachine),
        makinaci: entry.makinaci,
        adet: number(entry.adet),
        baskiHatasiAdet: number(entry.baskiHatasiAdet),
        kumasHatasiAdet: number(entry.kumasHatasiAdet),
        hataliAdet: totalDefect,
        not: entry.not,
      });
      setMessage(`${selected.modelName} · ${selected.printArea}: ${qty(entry.adet)} brüt, ${qty(netEntry)} net sağlam kaydedildi.`);
      setEntry((current) => ({ ...current, adet: "", baskiHatasiAdet: "", kumasHatasiAdet: "", not: "" }));
      await load();
    } catch (error) {
      setMessage(error?.message || "Üretim kaydı oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function createManualJob() {
    if (!manual.modelName.trim() || !manual.companyId || number(manual.expectedQty) <= 0) {
      setMessage("İrsaliyesiz iş için model, kayıtlı müşteri ve beklenen adet zorunludur.");
      return;
    }
    const company = companies.find((row) => row.id === manual.companyId);
    setSaving(true);
    try {
      await quickCreateCanonicalModel(activeMainCompany, {
        modelName: manual.modelName.trim(),
        companyId: manual.companyId,
        firmaId: manual.companyId,
        firmaAdi: company?.name || "",
        companyName: company?.name || "",
        dispatchNo: manual.dispatchNo.trim() || `MANUEL-${Date.now()}`,
        expectedQty: number(manual.expectedQty),
        printRegions: manual.printArea,
        baskiBolgesi: manual.printArea,
        sourceModule: "IMALAT",
      });
      setManualOpen(false);
      setManual(emptyManual);
      setMessage("İrsaliyesiz iş Desen merkezinde açıldı ve üretim havuzuna eklendi.");
      await load();
    } catch (error) {
      setMessage(error?.message || "İrsaliyesiz iş açılamadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="production-work-pool">
      <section className="iw-card production-work-toolbar">
        <div className="production-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Model, firma, irsaliye veya baskı bölgesi ara" /></div>
        <span className="production-page-intro-badge"><PackageCheck size={15} /> {filtered.length} operasyon</span>
        <button className="iw-btn" type="button" onClick={load} disabled={loading}><RefreshCcw size={15} /> Yenile</button>
        <button className="iw-btn primary" type="button" onClick={() => setManualOpen(true)}><Plus size={15} /> İrsaliyesiz İş Aç</button>
      </section>

      {message ? <div className="iw-notice production-notice"><CircleAlert size={16} /> {message}</div> : null}

      <div className="production-work-layout">
        <section className="iw-card production-job-list-card">
          <div className="iw-card-head"><div><h2><Factory size={18} /> Açık Operasyonlar</h2><small>Her baskı bölgesi ayrı kayıt alır; model toplamı ortak operasyon adediyle hesaplanır.</small></div></div>
          <div className="production-job-list">
            {filtered.length ? filtered.map((job) => (
              <button type="button" key={job.id} className={`production-job-item ${selected?.id === job.id ? "active" : ""}`} onClick={() => setSelectedId(job.id)}>
                <span><strong>{job.modelName}</strong><small>{job.companyName || "Firma Seçilmedi"} · {job.dispatchNo || "İrsaliye yok"}</small></span>
                <span><b>{job.printArea}</b><small>{qty(job.producedQty)} / {qty(job.expectedQty)}</small></span>
                <em className={statusTone(job.status)}>{job.status}</em>
              </button>
            )) : <div className="iw-empty">{loading ? "İş havuzu hazırlanıyor..." : "Açık üretim operasyonu yok."}</div>}
          </div>
        </section>

        <section className="iw-card production-entry-card">
          {selected ? <>
            <div className="iw-card-head"><div><h2>{selected.modelName} · {selected.printArea}</h2><small>{selected.companyName || "Firma Seçilmedi"} · {selected.dispatchNo || "İrsaliye yok"}</small></div><span className={`production-status ${statusTone(selected.status)}`}>{selected.status}</span></div>
            <div className="production-selected-metrics"><span>Gelen <b>{qty(selected.expectedQty)}</b></span><span>Üretilen <b>{qty(selected.producedQty)}</b></span><span>Kalan <b>{qty(selected.remainingQty)}</b></span><span>Fazla <b>{qty(selected.overQty)}</b></span></div>
            <div className="iw-card-body production-entry-grid">
              <label><span>Tarih *</span><input type="date" value={entry.tarih} onChange={(event) => setEntry({ ...entry, tarih: event.target.value })} /></label>
              <label><span>Vardiya *</span><select value={entry.vardiya} onChange={(event) => setShift(event.target.value)}><option>Gündüz</option><option>Gece</option></select></label>
              <label><span>Makine *</span><select value={entry.makineNo} onChange={(event) => setMachine(event.target.value)}><option value="">Makine seçin</option>{machines.map((machine) => <option key={machineId(machine)} value={machineId(machine)}>{machine.machineNo || machine.makineNo || machine.no} - {machineName(machine)}</option>)}</select></label>
              <label><span>Makinacı *</span><input value={entry.makinaci} onChange={(event) => setEntry({ ...entry, makinaci: event.target.value })} /></label>
              <label><span>Brüt Üretim *</span><input type="number" min="0" value={entry.adet} onChange={(event) => setEntry({ ...entry, adet: event.target.value })} /></label>
              <label className="defect"><span>Baskı Sakatı</span><input type="number" min="0" value={entry.baskiHatasiAdet} onChange={(event) => setEntry({ ...entry, baskiHatasiAdet: event.target.value })} /></label>
              <label className="defect"><span>Kumaş Sakatı</span><input type="number" min="0" value={entry.kumasHatasiAdet} onChange={(event) => setEntry({ ...entry, kumasHatasiAdet: event.target.value })} /></label>
              <label><span>Net Sağlam</span><input value={qty(netEntry)} disabled /></label>
              <label className="span-2"><span>Not</span><textarea value={entry.not} onChange={(event) => setEntry({ ...entry, not: event.target.value })} /></label>
            </div>
            <footer className="production-entry-footer"><span><TriangleAlert size={15} /> Sakatlar brüt adetten düşülür; irsaliye farkı denge ekranına yansır.</span><button className="iw-btn primary" type="button" onClick={saveEntry} disabled={saving}><Save size={16} />{saving ? "Kaydediliyor..." : "Üretimi Kaydet"}</button></footer>
          </> : <div className="iw-empty">Kayıt için soldan operasyon seçin.</div>}
        </section>
      </div>

      {manualOpen ? <div className="iw-modal-backdrop"><section className="iw-modal-box production-create-modal"><div className="iw-card-head"><div><h2><Plus size={18} /> İrsaliyesiz Üretim İşi Aç</h2><small>Model Desen merkezinde tek kayıt olarak açılır. Firma serbest yazılmaz; gerçek müşteri kartı seçilir.</small></div><button className="iw-btn" type="button" onClick={() => setManualOpen(false)}>Kapat</button></div><div className="iw-card-body production-create-grid"><label><span>Model adı *</span><input autoFocus value={manual.modelName} onChange={(event) => setManual({ ...manual, modelName: event.target.value })} /></label><label><span>Müşteri firma *</span><select value={manual.companyId} onChange={(event) => setManual({ ...manual, companyId: event.target.value })}><option value="">Firma seçin</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label><span>Referans / Sipariş no</span><input value={manual.dispatchNo} onChange={(event) => setManual({ ...manual, dispatchNo: event.target.value })} /></label><label><span>Beklenen adet *</span><input type="number" min="0" value={manual.expectedQty} onChange={(event) => setManual({ ...manual, expectedQty: event.target.value })} /></label><label><span>Baskı bölgesi</span><select value={manual.printArea} onChange={(event) => setManual({ ...manual, printArea: event.target.value })}><option>Ön</option><option>Arka</option><option>Kol</option><option>Ense</option><option>Paça</option></select></label></div><footer className="production-modal-footer"><button className="iw-btn" type="button" onClick={() => setManualOpen(false)}>Vazgeç</button><button className="iw-btn primary" type="button" onClick={createManualJob} disabled={saving}>{saving ? "Açılıyor..." : "İşi Aç"}</button></footer></section></div> : null}
    </div>
  );
}
