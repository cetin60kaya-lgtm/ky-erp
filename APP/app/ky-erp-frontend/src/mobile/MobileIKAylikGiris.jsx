import { useState, useEffect, useCallback } from "react";
import MobileShell from "./MobileShell";
import { mobileApiGet, mobileApiPost, normalizeList, getField } from "./mobileApi";

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function MobileIKAylikGiris() {
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mobileApiGet("ik/monthly-employees");
      if (!res.ok) {
        throw new Error(res.message || "Veri alınamadı");
      }
      const rows = normalizeList(res.data);
      setEmployees(rows);

      const init = {};
      rows.forEach(emp => {
        const empId = emp.id || emp.uuid || emp.personelId;
        init[empId] = {
          absenceDays: 0,
          overtimeHours: 0,
          advance: 0,
          bonus: 0,
          expanded: false,
        };
      });
      setRecords(init);
    } catch (err) {
      setMsg({ type: "error", text: "Veri alınamadı: " + err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function updateRecord(empId, field, value) {
    setRecords(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: value },
    }));
  }

  function toggleExpanded(empId) {
    setRecords(prev => ({
      ...prev,
      [empId]: { ...prev[empId], expanded: !prev[empId].expanded },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const payload = employees.map(emp => {
        const empId = emp.id || emp.uuid || emp.personelId;
        const r = records[empId];
        return {
          personelId: empId,
          absenceDays: Number(r.absenceDays || 0),
          overtimeHours: Number(r.overtimeHours || 0),
          advance: Number(r.advance || 0),
          bonus: Number(r.bonus || 0),
        };
      });
      const saveRes = await mobileApiPost("ik/payroll/save", { records: payload });
      if (!saveRes.ok) {
        throw new Error(saveRes.message || "Veri alınamadı");
      }
      setMsg({ type: "success", text: "✅ Aylık maaş hakedişleri kaydedildi." });
    } catch (err) {
      setMsg({ type: "error", text: "❌ Kayıt hatası: " + err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileShell>
      <div className="ky-mobile-page-header">
        <button className="ky-mobile-back-btn" onClick={() => navigate("/mobile/ik/aylik")}>‹</button>
        <div className="ky-mobile-page-title">📄 Aylık Personel Düzenleme</div>
      </div>

      {msg && <div className={`ky-mobile-status ${msg.type}`}>{msg.text}</div>}

      <div className="ky-mobile-card">
        {loading ? (
          <div className="ky-mobile-spinner" />
        ) : employees.length === 0 ? (
          <div className="ky-mobile-status info" style={{ margin: 0 }}>Aylık personel bulunamadı.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {employees.map(emp => {
              const empId = emp.id || emp.uuid || emp.personelId;
              const r = records[empId] || {};
              return (
                <div key={empId} style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 12 }}>
                  <div 
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                    onClick={() => toggleExpanded(empId)}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{getField(emp, ["fullName", "name", "isim", "ad"], "İsimsiz")}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        Maaş: {getField(emp, ["monthlySalary", "aylikMaas", "maas"], 0)} ₺ — {getField(emp, ["qualification", "unvan", "title"], "Görev")}
                      </div>
                    </div>
                    <div style={{ fontSize: 18, color: "#64748b" }}>
                      {r.expanded ? "▴" : "▾"}
                    </div>
                  </div>

                  {r.expanded && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                      <div className="ky-mobile-form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Devamsızlık (Gün)</label>
                        <input type="number" className="ky-mobile-input" style={{ minHeight: 40 }}
                          value={r.absenceDays} min={0}
                          onChange={e => updateRecord(empId, "absenceDays", e.target.value)} />
                      </div>
                      <div className="ky-mobile-form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Mesai (Saat)</label>
                        <input type="number" className="ky-mobile-input" style={{ minHeight: 40 }}
                          value={r.overtimeHours} min={0}
                          onChange={e => updateRecord(empId, "overtimeHours", e.target.value)} />
                      </div>
                      <div className="ky-mobile-form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Avans / Ceza (₺)</label>
                        <input type="number" className="ky-mobile-input" style={{ minHeight: 40 }}
                          value={r.advance} min={0}
                          onChange={e => updateRecord(empId, "advance", e.target.value)} />
                      </div>
                      <div className="ky-mobile-form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Prim (₺)</label>
                        <input type="number" className="ky-mobile-input" style={{ minHeight: 40 }}
                          value={r.bonus} min={0}
                          onChange={e => updateRecord(empId, "bonus", e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        className="ky-mobile-button primary"
        style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
        onClick={handleSave}
        disabled={saving || loading}
      >
        {saving ? "Hesaplanıyor..." : "Aylık Hesapla ve Kaydet"}
      </button>
    </MobileShell>
  );
}
