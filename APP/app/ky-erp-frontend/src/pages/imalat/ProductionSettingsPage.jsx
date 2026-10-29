import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, Factory, Plus, Save, Settings, Trash2 } from "lucide-react";
import { getProductionCenterMachines, saveProductionCenterMachine } from "../../services/productionCenterApi";
import "../modules/cleanWorkflow.css";
import "./imalatWorkflow.css";
import "./productionCenter.css";

function emptyMachine(index = 0) {
  return {
    id: "",
    makineNo: "",
    makineAdi: "",
    gunduzMakinaci: "",
    geceMakinaci: "",
    isActive: true,
    sortOrder: index + 1,
  };
}

function normalize(row, index) {
  return {
    id: row?.id || row?.makineNo || "",
    makineNo: row?.machineNo || row?.makineNo || row?.no || row?.id || "",
    makineAdi: row?.makineAdi || row?.machineName || row?.ad || row?.name || "",
    gunduzMakinaci: row?.gunduzMakinaci || row?.dayOperator || row?.operator || row?.makinaci || "",
    geceMakinaci: row?.geceMakinaci || row?.nightOperator || row?.operator || row?.makinaci || "",
    isActive: row?.isActive !== false && row?.durum !== "Pasif",
    sortOrder: Number(row?.sortOrder || index + 1),
  };
}

export default function ProductionSettingsPage({ activeMainCompany }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const saveLock = useRef(false);
  const savedSnapshot = useRef([]);

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) {
      setLoading(false);
      setMessage("Makine ayarlarına başlamadan önce ana firma seçin.");
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const result = await getProductionCenterMachines(activeMainCompany);
      const next = Array.isArray(result) ? result.map(normalize) : [];
      const prepared = next.length ? next : [emptyMachine()];
      setRows(prepared);
      savedSnapshot.current = prepared.map((row) => ({ ...row }));
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "Makine ayarları okunamadı. Yeniden denemeden değişiklikleri kaydetmeyin.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany]);

  useEffect(() => {
    load();
  }, [load]);

  function update(index, key, value) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  }

  function addRow() {
    setRows((current) => [...current, emptyMachine(current.length)]);
  }

  function removeRow(index) {
    const row = rows[index];
    if (!row) return;
    if (row.id) {
      if (!window.confirm((row.makineNo || "Makine") + " pasifleştirilsin mi? Eski üretim fişleri korunur.")) return;
      setRows((current) => current.map((item, rowIndex) =>
        rowIndex === index ? { ...item, isActive: false } : item));
      setMessage("Makine pasif olarak işaretlendi. Kalıcı olması için Değişiklikleri Kaydet'e basın.");
      return;
    }
    setRows((current) => current.length === 1 ? [emptyMachine()] : current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function saveAll() {
    if (saveLock.current || saving || loading || !(activeMainCompany?.slug || activeMainCompany?.id)) return;
    const prepared = rows.map((row, index) => ({
      ...row,
      makineNo: String(row.makineNo || "").trim(),
      makineAdi: String(row.makineAdi || "").trim(),
      gunduzMakinaci: String(row.gunduzMakinaci || "").trim(),
      geceMakinaci: String(row.geceMakinaci || row.gunduzMakinaci || "").trim(),
      sortOrder: index + 1,
    }));
    const incomplete = prepared.find((row) => !row.makineNo || (row.isActive !== false && (!row.makineAdi || !row.gunduzMakinaci)));
    if (incomplete) {
      setMessage("Makine no, makine adı ve gündüz makinacısı zorunludur.");
      return;
    }
    const unique = new Set(prepared.map((row) => row.makineNo.toLocaleLowerCase("tr-TR")));
    if (unique.size !== prepared.length) {
      setMessage("Aynı makine no birden fazla kez kullanılamaz.");
      return;
    }
    saveLock.current = true;
    setSaving(true);
    const saved = [];
    try {
      for (const row of prepared) saved.push(await saveProductionCenterMachine(activeMainCompany, { id: row.id, machineNo: row.makineNo, machineName: row.makineAdi, dayOperator: row.gunduzMakinaci, nightOperator: row.geceMakinaci, isActive: row.isActive, sortOrder: row.sortOrder }));
      const confirmedRows = saved.map((row, index) => normalize(row?.data || row, index));
      setRows(confirmedRows);
      savedSnapshot.current = confirmedRows.map((row) => ({ ...row }));
      setMessage(`${saved.length} makine ve vardiya ayarı kaydedildi.`);
    } catch (error) {
      if (saved.length) {
        const partialRows = prepared.map((row, index) => index < saved.length ? normalize(saved[index]?.data || saved[index], index) : row);
        setRows(partialRows);
        setMessage(`${saved.length}/${prepared.length} makine kaydedildi; ${prepared.length - saved.length} makine kaydedilemedi. Tekrar göndermeden önce kayıtlı makineleri kontrol edin. ${error?.message || ""}`);
      } else {
        setMessage(error?.message || "Hiçbir makine ayarı kaydedilemedi; bağlantı ve kayıtları kontrol edin.");
      }
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="production-settings-page">
      <section className="iw-card production-settings-head">
        <div><span className="production-eyebrow">ÜRETİM TANIMLARI</span><h1>Makine · Vardiya · Makinacı</h1><p>Akıllı fişte “gündüz 1” veya “gece 1” yazıldığında doğru makinacı bu kayıttan otomatik atanır.</p></div>
        <div className="production-settings-actions">
          <button className="iw-btn" type="button" disabled={saving || loading || !(activeMainCompany?.slug || activeMainCompany?.id)} onClick={() => { setRows(savedSnapshot.current.map((row) => ({ ...row }))); setMessage("Kaydedilmemiş değişiklikler geri alındı."); }}>Değişiklikleri Geri Al</button>
          <button className="iw-btn" type="button" disabled={saving || loading || !(activeMainCompany?.slug || activeMainCompany?.id)} onClick={addRow}><Plus size={16} /> Yeni Makine</button>
        </div>
      </section>

      {message ? <div className="iw-notice production-notice"><CircleAlert size={16} /> {message}</div> : null}

      <section className="iw-card">
        <div className="iw-card-head"><div><h2><Settings size={18} /> Kayıtlı Makineler</h2><small>Pasif makine yeni üretim girişinde seçilemez; eski kayıtları korunur.</small></div><span className="iw-badge b-blue">{rows.length} makine</span></div>
        <div className="iw-card-body production-settings-list" aria-busy={saving}>
          {loading ? <div className="iw-empty">Makine tanımları yükleniyor...</div> : rows.map((row, index) => (
            <article className={`production-machine-row ${row.isActive === false ? "inactive" : ""}`} key={`${row.id || "new"}-${index}`}>
              <div className="production-machine-index"><Factory size={18} /></div>
              <label><span>Makine No *</span><input disabled={saving} value={row.makineNo} onChange={(event) => update(index, "makineNo", event.target.value)} placeholder="1" /></label>
              <label><span>Makine Adı *</span><input disabled={saving} value={row.makineAdi} onChange={(event) => update(index, "makineAdi", event.target.value)} placeholder="Oval Baskı 1" /></label>
              <label><span>Gündüz Makinacısı *</span><input disabled={saving} value={row.gunduzMakinaci} onChange={(event) => update(index, "gunduzMakinaci", event.target.value)} placeholder="Ad soyad" /></label>
              <label><span>Gece Makinacısı</span><input disabled={saving} value={row.geceMakinaci} onChange={(event) => update(index, "geceMakinaci", event.target.value)} placeholder="Boşsa gündüz kullanılır" /></label>
              <label><span>Durum</span><select disabled={saving} value={row.isActive === false ? "passive" : "active"} onChange={(event) => update(index, "isActive", event.target.value === "active")}><option value="active">Aktif</option><option value="passive">Pasif</option></select></label>
              <button className="iw-btn danger" type="button" onClick={() => removeRow(index)} disabled={saving || (Boolean(row.id) && row.isActive === false)} title={row.id ? "Kayıtlı makine pasife alınır; eski fişler korunur." : "Yeni satırı kaldır"}><Trash2 size={15} /> {row.id ? "Pasifleştir" : "Kaldır"}</button>
            </article>
          ))}
          <div className="production-settings-footer"><span>Değişiklikler toplu kaydedilir. Gece makinacısı boşsa gündüz makinacısı kullanılır.</span><button className="iw-btn primary" type="button" onClick={saveAll} disabled={saving || loading || !rows.length || !(activeMainCompany?.slug || activeMainCompany?.id)}><Save size={16} /> {saving ? "Kaydediliyor..." : "Tüm Ayarları Kaydet"}</button></div>
        </div>
      </section>
    </div>
  );
}
