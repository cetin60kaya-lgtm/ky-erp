import { useState, useEffect, useCallback } from "react";
import MobileShell from "./MobileShell";
import { mobileApiGet, mobileApiPost, normalizeList } from "./mobileApi";

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const EMPTY_FORM = {
  havuzKaydiId: "",
  uretimAdedi: "",
  hataliAdet: "",
  aciklama: "",
};

export default function MobileImalatGunlukKayit() {
  // Fixed header state
  const [tarih, setTarih]     = useState(new Date().toISOString().substring(0, 10));
  const [vardiya, setVardiya] = useState("Gündüz");
  const [makina, setMakina]   = useState("1");
  const [makinaci, setMakinaci] = useState("");

  // Havuz / form state
  const [havuz, setHavuz]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState(null); // { type: "success"|"error", text }
  const [form, setForm]       = useState(EMPTY_FORM);

  // Last 10 saved records (stored in state)
  const [savedRecords, setSavedRecords] = useState([]);

  const [seriGiris, setSeriGiris] = useState(true);

  const fetchHavuz = useCallback(async () => {
    setLoading(true);
    try {
      let res = await mobileApiGet("imalat/havuz");
      if (!res.ok || res.status === 404) {
        res = await mobileApiGet("uretim/havuz");
      }
      if (!res.ok || res.status === 404) {
        res = await mobileApiGet("imalat/giris-havuzu");
      }
      if (!res.ok) {
        throw new Error(res.message || "Veri alınamadı");
      }
      setHavuz(normalizeList(res.data));
    } catch (err) {
      setMsg({ type: "error", text: "Havuz verisi alınamadı: " + err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHavuz(); }, [fetchHavuz]);

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.havuzKaydiId) {
      setMsg({ type: "error", text: "Lütfen bir model seçin." });
      return;
    }
    if (!form.uretimAdedi || Number(form.uretimAdedi) <= 0) {
      setMsg({ type: "error", text: "Geçerli bir üretim adedi girin." });
      return;
    }

    setSaving(true);
    setMsg(null);

    const payload = {
      tarih,
      vardiya,
      makina,
      makinaci,
      havuzKaydiId: form.havuzKaydiId,
      uretimAdedi: Number(form.uretimAdedi),
      hataliAdet: Number(form.hataliAdet || 0),
      aciklama: form.aciklama || "",
    };

    try {
      let res = await mobileApiPost(`imalat/havuz/${form.havuzKaydiId}/giris`, payload);
      if (!res.ok && res.status === 404) {
        res = await mobileApiPost("imalat/gunluk-kayit", payload);
      }
      if (!res.ok) {
        throw new Error(res.message || "Veri alınamadı");
      }

      // Build display record for saved list
      const selectedJob = havuz.find(j => String(j.id) === String(form.havuzKaydiId));
      const newRecord = {
        id: res.data.id || Date.now(),
        tarih,
        vardiya,
        makina,
        modelName: selectedJob.modelName || selectedJob.modelAdi || form.havuzKaydiId,
        companyName: selectedJob.companyName || selectedJob.firmaAdi || "",
        uretimAdedi: Number(form.uretimAdedi),
        hataliAdet: Number(form.hataliAdet || 0),
        aciklama: form.aciklama,
      };

      setSavedRecords(prev => [newRecord, ...prev].slice(0, 10));
      setMsg({ type: "success", text: `✅ Kaydedildi! ${newRecord.modelName} — ${newRecord.uretimAdedi} adet` });
      
      if (seriGiris) {
        setForm({ ...form, uretimAdedi: "", hataliAdet: "", aciklama: "" });
        setTimeout(() => document.getElementById("imalat-uretim-input").focus(), 100);
      } else {
        setTimeout(() => navigate("/mobile/imalat"), 600);
      }
    } catch (err) {
      setMsg({ type: "error", text: "❌ Kayıt hatası: " + err.message });
    } finally {
      setSaving(false);
    }
  }

  // Currently selected job info
  const selectedJob = havuz.find(j => String(j.id) === String(form.havuzKaydiId));

  return (
    <MobileShell>
      {/* Page header */}
      <div className="ky-mobile-page-header">
        <button className="ky-mobile-back-btn" onClick={() => navigate("/mobile/imalat")} aria-label="Geri">‹</button>
        <div className="ky-mobile-page-title">🏭 İmalat Günlük Kayıt</div>
      </div>

      {/* ─── FIXED HEADER: Tarih / Vardiya / Makine / Makinacı ─── */}
      <div className="ky-mobile-card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 10 }}>📅 Oturum Bilgileri</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="ky-mobile-form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700, display: "block", marginBottom: 5 }}>Tarih</label>
            <input type="date" className="ky-mobile-input" style={{ minHeight: 42 }}
              value={tarih} onChange={e => setTarih(e.target.value)} />
          </div>
          <div className="ky-mobile-form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700, display: "block", marginBottom: 5 }}>Vardiya</label>
            <select className="ky-mobile-input" style={{ minHeight: 42 }}
              value={vardiya} onChange={e => setVardiya(e.target.value)}>
              <option value="Gündüz">☀️ Gündüz</option>
              <option value="Gece">🌙 Gece</option>
            </select>
          </div>
          <div className="ky-mobile-form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700, display: "block", marginBottom: 5 }}>Makine No</label>
            <input type="text" className="ky-mobile-input" style={{ minHeight: 42 }}
              value={makina} onChange={e => setMakina(e.target.value)} placeholder="1, 2, 3..." />
          </div>
          <div className="ky-mobile-form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700, display: "block", marginBottom: 5 }}>Makinacı</label>
            <input type="text" className="ky-mobile-input" style={{ minHeight: 42 }}
              value={makinaci} onChange={e => setMakinaci(e.target.value)} placeholder="Operatör adı" />
          </div>
        </div>
      </div>

      {/* ─── KAYIT FORMU ─── */}
      <div className="ky-mobile-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>📋 Üretim Kaydı</div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#0f172a", cursor: "pointer" }}>
            <span>Seri Giriş Modu</span>
            <input 
              type="checkbox" 
              checked={seriGiris} 
              onChange={e => setSeriGiris(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
          </label>
        </div>

        {msg && (
          <div className={`ky-mobile-status ${msg.type}`} style={{ marginBottom: 12 }}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSave}>
          {/* Model seç */}
          <div className="ky-mobile-form-group">
            <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6 }}>
              🏷️ Model Seç <span style={{ color: "#ef4444" }}>*</span>
            </label>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", color: "#64748b", fontSize: 13 }}>
                <div className="ky-mobile-spinner" style={{ width: 18, height: 18 }} />
                Havuz yükleniyor...
              </div>
            ) : (
              <select
                className="ky-mobile-input"
                value={form.havuzKaydiId}
                onChange={e => setForm({ ...form, havuzKaydiId: e.target.value })}
                required
              >
                <option value="">-- Model / İş Seçin --</option>
                {havuz.map(job => {
                  const model = job.modelName || job.modelAdi || job.model || "—";
                  const firma = job.companyName || job.firmaAdi || job.firma || "";
                  const kalan = typeof job.expectedQty === "number" && typeof job.producedQty === "number"
                     ? ` [Kalan: ${Math.max(0, job.expectedQty - job.producedQty)}]`
                    : "";
                  return (
                    <option key={job.id} value={job.id}>
                      {model}{firma ? ` — ${firma}` : ""}{kalan}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Show selected job info */}
          {selectedJob && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{selectedJob.modelName || selectedJob.modelAdi}</div>
              {selectedJob.companyName && <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{selectedJob.companyName}</div>}
              <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12 }}>
                <span>📦 Beklenen: <strong>{selectedJob.expectedQty ? "—"}</strong></span>
                <span>✅ Üretilen: <strong>{selectedJob.producedQty ? "—"}</strong></span>
                {typeof selectedJob.expectedQty === "number" && typeof selectedJob.producedQty === "number" && (
                  <span style={{ color: "#c2410c" }}>⬜ Kalan: <strong>{Math.max(0, selectedJob.expectedQty - selectedJob.producedQty)}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* Üretilen adet — LARGE */}
          <div className="ky-mobile-form-group">
            <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6 }}>
              🔢 Üretilen Adet <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              id="imalat-uretim-input"
              type="number"
              className="ky-mobile-input"
              style={{ fontSize: 26, fontWeight: 900, textAlign: "center", minHeight: 60, letterSpacing: 1 }}
              value={form.uretimAdedi}
              min={1}
              onChange={e => setForm({ ...form, uretimAdedi: e.target.value })}
              placeholder="0"
              inputMode="numeric"
              required
            />
          </div>

          {/* Fire/Sakat adet */}
          <div className="ky-mobile-form-group">
            <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6 }}>
              🗑️ Fire / Sakat Adet
            </label>
            <input
              type="number"
              className="ky-mobile-input"
              style={{ fontSize: 18, fontWeight: 700 }}
              value={form.hataliAdet}
              min={0}
              onChange={e => setForm({ ...form, hataliAdet: e.target.value })}
              placeholder="0"
              inputMode="numeric"
            />
          </div>

          {/* Açıklama */}
          <div className="ky-mobile-form-group">
            <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6 }}>
              📝 Açıklama
            </label>
            <input
              type="text"
              className="ky-mobile-input"
              value={form.aciklama}
              onChange={e => setForm({ ...form, aciklama: e.target.value })}
              placeholder="İsteğe bağlı not..."
            />
          </div>

          {/* Kaydet butonu */}
          <button
            type="submit"
            className="ky-mobile-button primary"
            style={{ width: "100%", justifyContent: "center", minHeight: 54, fontSize: 16, marginTop: 4 }}
            disabled={saving}
          >
            {saving ? (
              <>
                <div className="ky-mobile-spinner" style={{ width: 20, height: 20, borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.3)" }} />
                Kaydediliyor...
              </>
            ) : "💾 Kaydet"}
          </button>
        </form>
      </div>

      {/* ─── SON 10 KAYIT ─── */}
      {savedRecords.length > 0 && (
        <>
          <div className="ky-mobile-section-title">Bu Oturumdaki Son Kayıtlar</div>
          <div className="ky-mobile-card">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                    <th style={{ textAlign: "left", padding: "8px 6px", color: "#64748b", fontWeight: 700 }}>Model</th>
                    <th style={{ textAlign: "left", padding: "8px 6px", color: "#64748b", fontWeight: 700 }}>Vardiya</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: "#64748b", fontWeight: 700 }}>Üretim</th>
                    <th style={{ textAlign: "center", padding: "8px 6px", color: "#64748b", fontWeight: 700 }}>Fire</th>
                  </tr>
                </thead>
                <tbody>
                  {savedRecords.map((rec, i) => (
                    <tr key={rec.id || i} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "8px 6px" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{rec.modelName}</div>
                        {rec.companyName && <div style={{ fontSize: 11, color: "#64748b" }}>{rec.companyName}</div>}
                      </td>
                      <td style={{ padding: "8px 6px", color: "#475569" }}>
                        <div>{rec.vardiya}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>M:{rec.makina}</div>
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "center", fontWeight: 900, fontSize: 15, color: "#15803d" }}>
                        {rec.uretimAdedi.toLocaleString("tr-TR")}
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "center", color: rec.hataliAdet > 0 ? "#dc2626" : "#94a3b8", fontWeight: rec.hataliAdet > 0 ? 700 : 400 }}>
                        {rec.hataliAdet}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Session total */}
            <div style={{
              marginTop: 12, padding: "10px 14px", background: "#f0fdf4", borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>Oturum Toplamı</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: "#15803d" }}>
                {savedRecords.reduce((s, r) => s + r.uretimAdedi, 0).toLocaleString("tr-TR")} adet
              </span>
            </div>
          </div>
        </>
      )}
    </MobileShell>
  );
}
