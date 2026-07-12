import { useState, useEffect, useRef } from "react";
import MobileShell from "./MobileShell";
import { mobileApiGet, unwrapList, MOBILE_API_BASE } from "./mobileApi";

const QUICK_LINKS = [
  { path: "/mobile/muhasebe/cari", label: "Firma / Cari", icon: "🏢" },
  { path: "/mobile/muhasebe/cek", label: "Çekler", icon: "💳" },
  { path: "/mobile/ik/gunluk/giris", label: "Günlük Puantaj", icon: "👷" },
  { path: "/mobile/imalat/gunluk", label: "Üretim Kaydı", icon: "🏭" },
  { path: "/mobile/desen", label: "Desen Havuzu", icon: "🎨" },
  { path: "/mobile/admin", label: "Kullanıcılar", icon: "⚙️" },
];

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function MobileAsistan() {
  const [voiceText, setVoiceText] = useState("");
  const [listening, setListening] = useState(false);
  const [stats, setStats] = useState(null);
  const [ocrMsg, setOcrMsg] = useState("");
  const recRef = useRef(null);

  useEffect(() => {
    async function loadStats() {
      try {
        const [firms, checks, daily] = await Promise.allSettled([
          mobileApiGet("/firms"),
          mobileApiGet("/check-payments"),
          mobileApiGet("/ik/daily-employees"),
        ]);
        setStats({
          firms: firms.status === "fulfilled" ? unwrapList(firms.value).length : "",
          checks: checks.status === "fulfilled" ? unwrapList(checks.value).length : "",
          daily: daily.status === "fulfilled" ? unwrapList(daily.value).length : "",
        });
      } catch {
        setStats(null);
      }
    }
    loadStats();
  }, []);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "tr-TR";
    rec.interimResults = true;
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setVoiceText(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => {
      try { rec.stop(); } catch {}
    };
  }, []);

  function toggleListen() {
    const rec = recRef.current;
    if (!rec) {
      alert("Bu cihazda ses tanıma desteklenmiyor. Metni klavye ile girebilirsiniz.");
      return;
    }
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      setVoiceText("");
      rec.start();
      setListening(true);
    }
  }

  function copyVoice() {
    if (!voiceText) return;
    navigator.clipboard.writeText(voiceText).then(() => alert("Panoya kopyalandı."));
  }

  async function triggerDesenOcr() {
    setOcrMsg("OCR indeksleme başlatılıyor...");
    try {
      await mobileApiGet("/desen/havuzsyncWatchFolder=true&limit=1");
      setOcrMsg("Havuz senkronize edildi. Desen ekranından görselleri kontrol edin.");
    } catch (e) {
      setOcrMsg("OCR/sync: " + e.message);
    }
  }

  return (
    <MobileShell>
      <div className="ky-mobile-page-header">
        <button className="ky-mobile-back-btn" onClick={() => navigate("/mobile")}>‹</button>
        <div className="ky-mobile-page-title">🤖 Mobil Asistan</div>
      </div>

      <div className="ky-mobile-card" style={{ marginBottom: 14 }}>
        <div className="ky-mobile-section-title" style={{ marginTop: 0 }}>Canlı Özet</div>
        {stats ? (
          <div className="ky-mobile-grid-2">
            <div style={{ textAlign: "center", padding: 10, background: "#eff6ff", borderRadius: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#1d4ed8" }}>{stats.firms}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Firma</div>
            </div>
            <div style={{ textAlign: "center", padding: 10, background: "#fff7ed", borderRadius: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#c2410c" }}>{stats.checks}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Çek</div>
            </div>
            <div style={{ textAlign: "center", padding: 10, background: "#f0fdf4", borderRadius: 12, gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#15803d" }}>{stats.daily}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Günlük Personel</div>
            </div>
          </div>
        ) : (
          <div className="ky-mobile-status info" style={{ margin: 0 }}>Özet yükleniyor...</div>
        )}
      </div>

      <div className="ky-mobile-card" style={{ marginBottom: 14 }}>
        <div className="ky-mobile-section-title" style={{ marginTop: 0 }}>🎤 Sesle Not (TR)</div>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px" }}>
          Açıklama alanlarına yapıştırmak için konuşun; Android mikrofon izni gerekebilir.
        </p>
        <button
          type="button"
          className={`ky-mobile-button ${listening ? "danger" : "primary"}`}
          style={{ justifyContent: "center", marginBottom: 10 }}
          onClick={toggleListen}
        >
          {listening ? "⏹ Durdur" : "🎤 Dinlemeye Başla"}
        </button>
        <textarea
          className="ky-mobile-input"
          style={{ minHeight: 88, resize: "vertical" }}
          value={voiceText}
          onChange={(e) => setVoiceText(e.target.value)}
          placeholder="Sesli metin burada görünür..."
        />
        <button type="button" className="ky-mobile-button secondary compact" style={{ marginTop: 8, justifyContent: "center" }} onClick={copyVoice} disabled={!voiceText}>
          📋 Panoya Kopyala
        </button>
      </div>

      <div className="ky-mobile-card" style={{ marginBottom: 14 }}>
        <div className="ky-mobile-section-title" style={{ marginTop: 0 }}>🎨 Desen OCR / Senkron</div>
        <button type="button" className="ky-mobile-button primary" style={{ justifyContent: "center" }} onClick={triggerDesenOcr}>
          Havuzu Yenile & İndeksle
        </button>
        {ocrMsg && <div className="ky-mobile-status info" style={{ marginTop: 10, marginBottom: 0 }}>{ocrMsg}</div>}
      </div>

      <div className="ky-mobile-section-title">Hızlı Veri Girişi</div>
      <div className="ky-mobile-grid-2">
        {QUICK_LINKS.map((l) => (
          <button
            key={l.path}
            type="button"
            className="ky-mobile-button"
            style={{ flexDirection: "column", alignItems: "center", textAlign: "center", minHeight: 72 }}
            onClick={() => navigate(l.path)}
          >
            <span style={{ fontSize: 24 }}>{l.icon}</span>
            <span style={{ fontSize: 12 }}>{l.label}</span>
          </button>
        ))}
      </div>

      <div className="ky-mobile-status info" style={{ marginTop: 16 }}>
        API: {MOBILE_API_BASE} — Bundle mod, canlı veri.
      </div>
    </MobileShell>
  );
}
