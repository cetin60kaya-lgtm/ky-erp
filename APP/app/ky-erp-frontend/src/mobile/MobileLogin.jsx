import { useEffect, useRef, useState } from "react";
import { mobileApiPost, mobileApiGet } from "./mobileApi";
import { API_BASE } from "../utils/api";
import {saveStaffSession} from "./personnelSession";

export default function MobileLogin({ onLogin, personnelOnly = false }) {
  const [username, setUsername] = useState("");
  const [personnelMode, setPersonnelMode] = useState(personnelOnly);
  const [companies, setCompanies] = useState([]);
  const [turnstileConfig,setTurnstileConfig] = useState(null);
  const [turnstileToken,setTurnstileToken] = useState("");
  const turnstileRef=useRef(null);
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mobileApiGet("auth/turnstile-config").then(res => setTurnstileConfig(res.data || null)).catch(() => setTurnstileConfig({required:true}));
    mobileApiGet("employee-portal/companies").then(res => {
      const items = res.data?.data || res.data;
      if (Array.isArray(items)) setCompanies(items);
    }).catch(() => {});
  }, []);

  useEffect(()=>{
    if(!turnstileConfig?.required || !turnstileConfig.siteKey || !turnstileRef.current)return;
    let removed=false;
    const render=()=>{
      if(removed || !turnstileRef.current || !window.turnstile || turnstileRef.current.dataset.rendered)return;
      turnstileRef.current.dataset.rendered="1";
      window.turnstile.render(turnstileRef.current,{sitekey:turnstileConfig.siteKey,callback:setTurnstileToken,"expired-callback":()=>setTurnstileToken(""),"error-callback":()=>setTurnstileToken("")});
    };
    let script=document.querySelector('script[data-kyerp-mobile-turnstile]');
    if(!script){script=document.createElement("script");script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";script.async=true;script.defer=true;script.setAttribute("data-kyerp-mobile-turnstile","1");document.head.appendChild(script);}
    script.addEventListener("load",render);render();
    return ()=>{removed=true;script.removeEventListener("load",render);};
  },[turnstileConfig]);

  async function handleLogin(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim() || (personnelMode && !company)) {
      setError("Kullanıcı adı ve şifre zorunludur.");
      return;
    }
    if(turnstileConfig?.required && !turnstileToken){setError("Bot doğrulamasını tamamlayın.");return;}
    setLoading(true);
    setError("");
    try {
      const identity = personnelMode ? company + "--" + username.trim().toLowerCase() : username.trim();
      const res = await mobileApiPost("auth/login", { username: identity, password, turnstileToken });
      if (!res.ok) throw new Error(res.data?.error?.message || res.message || "Giris reddedildi.");
      
      const payload = res.data || res;
      const token = payload?.token || payload?.access_token || payload?.accessToken || payload?.jwt || payload?.data?.token;
      
      if (!token) throw new Error("Giris icin ilave dogrulama gerekli. Yonetici/muhasebe hesabiyla normal KY ERP MFA ekranindan devam edin.");
      const userObj = payload?.user || payload?.data?.user || { username: identity };
      if (personnelMode && String(userObj.role || "").toUpperCase() !== "PERSONNEL") throw new Error("Bu giriş yalnız personel hesapları içindir.");
      if(personnelMode) saveStaffSession(token,userObj);
      else {
        localStorage.setItem("kyerp_auth_token", token);
        localStorage.setItem("kyerp_auth_user", JSON.stringify(userObj));
        localStorage.setItem("kyerp_mobile_user", JSON.stringify(userObj));
      }
      onLogin({personnel:personnelMode});
    } catch (err) {
      setError("Giriş başarısız: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", minHeight: "100dvh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
      padding: 24, justifyContent: "center", alignItems: "center",
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{
        background: "#fff", width: "100%", maxWidth: 380, borderRadius: 24,
        padding: "36px 28px", boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
        display: "flex", flexDirection: "column", alignItems: "center"
      }}>

        {/* LOGO */}
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", marginBottom: 20, fontSize: 36,
          boxShadow: "0 8px 24px rgba(29,78,216,0.4)"
        }}>
          🏭
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", marginBottom: 4, textAlign: "center" }}>
          KY ERP Mobil
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 8, textAlign: "center" }}>
          {personnelMode ? "Personel Öz Servis" : "Firma Yonetimi"}
        </p>
        <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 28, textAlign: "center" }}>
          {API_BASE}
        </p>

        {error && (
          <div style={{
            width: "100%", padding: "12px 14px", borderRadius: 10, background: "#fef2f2",
            border: "1px solid #fca5a5", color: "#dc2626", fontSize: 13,
            marginBottom: 20, textAlign: "center", fontWeight: 500, lineHeight: 1.5
          }}>
            {error}
          </div>
        )}

        {!personnelOnly ? <div style={{display:"flex",gap:8,width:"100%",marginBottom:16}}>
          <button type="button" onClick={()=>setPersonnelMode(false)} style={{flex:1,padding:10,borderRadius:8,background:!personnelMode?"#1453a3":"#e2e8f0",color:!personnelMode?"white":"#374151",border:0}}>Yönetim / Muhasebe</button>
          <button type="button" onClick={()=>setPersonnelMode(true)} style={{flex:1,padding:10,borderRadius:8,background:personnelMode?"#1453a3":"#e2e8f0",color:personnelMode?"white":"#374151",border:0}}>Personel Girişi</button>
        </div> : <p style={{fontSize:12,color:"#64748b",marginBottom:12}}>Bu personel girişi yöneticinin açık oturumunu değiştirmez.</p>}
        <form onSubmit={handleLogin} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
          {personnelMode ? <label style={{fontSize:13,fontWeight:600,color:"#374151"}}>Firma
            <select value={company} onChange={e=>setCompany(e.target.value)} required style={{display:"block",width:"100%",padding:13,border:"2px solid #e5e7eb",borderRadius:12,marginTop:6}}>
              <option value="">Firma seçiniz</option>
              {companies.map(item=><option key={item.slug} value={item.slug}>{item.name}</option>)}
            </select>
          </label> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Kullanıcı Adı</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              required
              style={{
                padding: "13px 16px", fontSize: 15, border: "2px solid #e5e7eb",
                borderRadius: 12, outline: "none", width: "100%",
                boxSizing: "border-box", background: "#f9fafb", color: "#111827",
                fontFamily: "inherit", transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = "#2563eb"}
              onBlur={e => e.target.style.borderColor = "#e5e7eb"}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Şifre</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              style={{
                padding: "13px 16px", fontSize: 15, border: "2px solid #e5e7eb",
                borderRadius: 12, outline: "none", width: "100%",
                boxSizing: "border-box", background: "#f9fafb", color: "#111827",
                fontFamily: "inherit", transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = "#2563eb"}
              onBlur={e => e.target.style.borderColor = "#e5e7eb"}
            />
          </div>

          {turnstileConfig?.required?<div ref={turnstileRef} style={{minHeight:68}} aria-label="Bot doğrulama"/>:null}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "15px", marginTop: 8,
              background: loading ? "#93c5fd" : "linear-gradient(135deg, #1d4ed8, #7c3aed)",
              color: "#fff", border: "none", borderRadius: 14, fontSize: 16,
              fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 6px 20px rgba(29,78,216,0.35)",
              transition: "all 0.2s", letterSpacing: "0.3px"
            }}
          >
            {loading ? "Giriş Yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
        KY ERP Mobil Uygulama © {new Date().getFullYear()}<br />
        Tüm hakları saklıdır.
      </div>
    </div>
  );
}
