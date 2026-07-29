import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Factory, Plus, Save, Settings, Trash2 } from "lucide-react";
import { getImalatMakineler, saveImalatMakine } from "../../services/imalatApi";
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
    makineNo: row?.makineNo || row?.no || row?.id || "",
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

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    setLoading(true);
    try {
      const result = await getImalatMakineler(activeMainCompany);
      const next = Array.isArray(result) ? result.map(normalize) : [];
      setRows(next.length ? next : [emptyMachine()]);
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "Makine ayarları okunamadı.");
      setRows([emptyMachine()]);
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
    setRows((current) => current.length === 1 ? [emptyMachine()] : current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function saveAll() {
    const prepared = rows.map((row, index) => ({
      ...row,
      makineNo: String(row.makineNo || "").trim(),
      makineAdi: String(row.makineAdi || "").trim(),
      gunduzMakinaci: String(row.gunduzMakinaci || "").trim(),
      geceMakinaci: String(row.geceMakinaci || row.gunduzMakinaci || "").trim(),
      sortOrder: index + 1,
    }));
    const incomplete = prepared.find((row) => !row.makineNo || !row.makineAdi || !row.gunduzMakinaci);
    if (incomplete) {
      setMessage("Makine no, makine adı ve gündüz makinacısı zorunludur.");
      return;
    }
    const unique = new Set(prepared.map((row) => row.makineNo.toLocaleLowerCase("tr-TR")));
    if (unique.size !== prepared.length) {
      setMessage("Aynı makine no birden fazla kez kullanılamaz.");
      return;
    }
    setSaving(true);
    try {
      const saved = [];
      for (const row of prepared) {
        saved.push(await saveImalatMakine(activeMainCompany, row));
      }
      setRows(saved.map((row, index) => normalize(row?.data || row, index)));
      setMessage(`${saved.length} makine ve vardiya ayarı kaydedildi.`);
    } catch (error) {
      setMessage(error?.message || "Makine ayarları kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="production-settings-page">
      <section className="iw-card production-settings-head">
        <div><span className="production-eyebrow">ÜRETİM TANIMLARI</span><h1>Makine · Vardiya · Makinacı</h1><p>Akıllı fişte “gündüz 1” veya “gece 1” yazıldığında doğru makinacı bu kayıttan otomatik atanır.</p></div>
        <button className="iw-btn" type="button" onClick={addRow}><Plus size={16} /> Yeni Makine</button>
      </section>

      {message ? <div className="iw-notice production-notice"><CircleAlert size={16} /> {message}</div> : null}

      <section className="iw-card">
        <div className="iw-card-head"><div><h2><Settings size={18} /> Kayıtlı Makineler</h2><small>Pasif makine yeni üretim girişinde seçilemez; eski kayıtları korunur.</small></div><span className="iw-badge b-blue">{rows.length} makine</span></div>
        <div className="iw-card-body production-settings-list">
          {loading ? <div className="iw-empty">Makine tanımları yükleniyor...</div> : rows.map((row, index) => (
            <article className={`production-machine-row ${row.isActive === false ? "inactive" : ""}`} key={`${row.id || "new"}-${index}`}>
              <div className="production-machine-index"><Factory size={18} /></div>
              <label><span>Makine No *</span><input value={row.makineNo} onChange={(event) => update(index, "makineNo", event.target.value)} placeholder="1" /></label>
              <label><span>Makine Adı *</span><input value={row.makineAdi} onChange={(event) => update(index, "makineAdi", event.target.value)} placeholder="Oval Baskı 1" /></label>
              <label><span>Gündüz Makinacısı *</span><input value={row.gunduzMakinaci} onChange={(event) => update(index, "gunduzMakinaci", event.target.value)} placeholder="Ad soyad" /></label>
              <label><span>Gece Makinacısı</span><input value={row.geceMakinaci} onChange={(event) => update(index, "geceMakinaci", event.target.value)} placeholder="Boşsa gündüz kullanılır" /></label>
              <label><span>Durum</span><select value={row.isActive === false ? "passive" : "active"} onChange={(event) => update(index, "isActive", event.target.value === "active")}><option value="active">Aktif</option><option value="passive">Pasif</option></select></label>
              <button className="iw-btn danger" type="button" onClick={() => removeRow(index)} disabled={Boolean(row.id)} title={row.id ? "Kayıtlı makine silinmez; pasife alınır." : "Satırı kaldır"}><Trash2 size={15} /> Kaldır</button>
            </article>
          ))}
          <div className="production-settings-footer"><span>Değişiklikler toplu kaydedilir. Gece makinacısı boşsa gündüz makinacısı kullanılır.</span><button className="iw-btn primary" type="button" onClick={saveAll} disabled={saving || loading}><Save size={16} /> {saving ? "Kaydediliyor..." : "Tüm Ayarları Kaydet"}</button></div>
        </div>
      </section>
    </div>
  );
}
