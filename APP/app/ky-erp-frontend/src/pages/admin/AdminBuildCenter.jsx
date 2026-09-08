import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelBuildJob,
  createBuildJob,
  downloadBuildArtifact,
  downloadBuildLog,
  getBuildCenterStatus,
  rotateBuildAgentToken,
} from "../../services/adminApi";
import "./AdminBuildCenter.css";

const BRANCH = "codex/pdks-desktop-1.8.1-device-final-20260907";
const API = "https://api.kyerp.net";
const REPO = "https://github.com/cetin60kaya-lgtm/ky-erp.git";

function fmt(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}
function tone(status) {
  const s = String(status || "").toUpperCase();
  if (s === "SUCCESS") return "ok";
  if (["FAILED","CANCELLED"].includes(s)) return "bad";
  if (["BUILDING","TESTING","PACKAGING","UPLOADING","CLAIMED"].includes(s)) return "run";
  return "wait";
}
function label(status) {
  return ({
    QUEUED:"Kuyrukta",CLAIMED:"Agent Aldı",BUILDING:"Kaynak / Build",TESTING:"Test",
    PACKAGING:"Paketleniyor",UPLOADING:"R2'ye Yükleniyor",SUCCESS:"Hazır",
    FAILED:"Hata",CANCELLED:"İptal",
  })[String(status || "").toUpperCase()] || String(status || "-");
}
function downloadText(fileName, value) {
  const blob = new Blob([value], { type:"text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminBuildCenter() {
  const [state,setState]=useState({agentConfigured:false,heartbeat:null,jobs:[],storage:""});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [token,setToken]=useState("");

  const load=useCallback(async()=>{
    try{setState(await getBuildCenterStatus()||{});setError("");}
    catch(cause){setError(cause?.message||"Sürüm Merkezi yüklenemedi.");}
  },[]);
  useEffect(()=>{load();const id=window.setInterval(load,10000);return()=>window.clearInterval(id)},[load]);

  const running=useMemo(()=>state.jobs?.find(row=>["CLAIMED","BUILDING","TESTING","PACKAGING","UPLOADING"].includes(String(row.status).toUpperCase())),[state.jobs]);
  const latestReady=useMemo(()=>state.jobs?.find(row=>String(row.status).toUpperCase()==="SUCCESS"),[state.jobs]);

  const makeToken=async()=>{
    setBusy(true);setError("");setMessage("");
    try{
      const result=await rotateBuildAgentToken();
      setToken(result?.token||"");
      setMessage("Yeni Build Agent anahtarı üretildi. Bu anahtar yalnız şimdi gösterilir.");
      await load();
    }catch(cause){setError(cause?.message||"Agent anahtarı üretilemedi.");}
    finally{setBusy(false)}
  };

  const downloadBootstrap=()=>{
    if(!token)return;
    const script = [
      "$ErrorActionPreference='Stop'",
      "$Branch='"+BRANCH+"'",
      "$Repo='"+REPO+"'",
      "$Token='"+token+"'",
      "$Temp=Join-Path $env:TEMP 'KYERP-BUILD-AGENT-SETUP'",
      "if(-not (Get-Command git.exe -ErrorAction SilentlyContinue)){",
      "  if(-not (Get-Command winget.exe -ErrorAction SilentlyContinue)){throw 'Git ve winget bulunamadı.'}",
      "  winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity",
      "  $env:Path += ';C:\\\\Program Files\\\\Git\\\\cmd'",
      "}",
      "if(Test-Path $Temp){Remove-Item $Temp -Recurse -Force}",
      "git -c core.longpaths=true clone --depth 1 --single-branch --branch $Branch $Repo $Temp",
      "if($LASTEXITCODE -ne 0){throw 'GitHub kaynağı alınamadı. Windows GitHub oturumunu kontrol edin.'}",
      "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Temp 'tools\\\\ky-build-agent\\\\setup-build-agent.ps1') -Token $Token -ApiBase '"+API+"' -RepoUrl $Repo",
      "if($LASTEXITCODE -ne 0){throw 'Build Agent hazırlanamadı.'}",
      "Write-Host 'KY Build Agent hazır. Açılan Agent penceresini build süresince kapatmayın.' -ForegroundColor Green",
      "Read-Host 'Kapatmak için ENTER'",
    ].join("\\r\\n");
    downloadText("KY_ERP_BUILD_AGENT_KUR.ps1",script);
  };

  const queuePdks=async()=>{
    setBusy(true);setError("");setMessage("");
    try{
      const job=await createBuildJob({product:"PDKS_PRO",version:"1.9.0",branch:BRANCH});
      setMessage("PDKS 1.9.0 build kuyruğa alındı: "+(job?.id||""));
      await load();
    }catch(cause){setError(cause?.message||"Build kuyruğa alınamadı.");}
    finally{setBusy(false)}
  };

  return <div className="abc-page">
    <header className="abc-head">
      <div><small>PLATFORM YÖNETİMİ / SÜRÜM MERKEZİ</small><h1>Windows Build & Sürüm Merkezi</h1><p>GitHub kaynak → Windows Build Agent → test/publish → Cloudflare R2 → Setup indirme. GitHub Actions minutes bağımlılığı yok.</p></div>
      <button type="button" onClick={load} disabled={busy}>Yenile</button>
    </header>
    {message?<div className="abc-notice">{message}</div>:null}
    {error?<div className="abc-notice bad">{error}</div>:null}

    <section className="abc-stats">
      <div><span>Build Agent</span><b>{state.heartbeat?.lastSeenAt?"Bağlı":state.agentConfigured?"Anahtar Hazır":"Kurulmadı"}</b><small>{state.heartbeat?.agentName||"Windows builder bekleniyor"}</small></div>
      <div><span>Son Heartbeat</span><b>{state.heartbeat?.lastSeenAt?fmt(state.heartbeat.lastSeenAt):"-"}</b><small>{state.storage||"R2 build-center"}</small></div>
      <div><span>Aktif Build</span><b>{running?label(running.status):"Yok"}</b><small>{running?.message||"Kuyruk sakin"}</small></div>
      <div><span>Son Hazır Setup</span><b>{latestReady?.version||"-"}</b><small>{latestReady?.artifactFileName||"Henüz artifact yok"}</small></div>
    </section>

    <div className="abc-grid">
      <section className="abc-card">
        <header><div><small>1 · WINDOWS BUILDER</small><h2>Build Agent Kurulumu</h2></div><span className={state.heartbeat?.lastSeenAt?"badge ok":"badge wait"}>{state.heartbeat?.lastSeenAt?"Çevrimiçi":"Bekleniyor"}</span></header>
        <p>Agent anahtarı R2'de yalnız SHA-256 hash olarak tutulur. Düz anahtar sadece üretildiği anda gösterilir.</p>
        <div className="abc-actions">
          <button type="button" onClick={makeToken} disabled={busy}>{state.agentConfigured?"Anahtarı Yenile":"Agent Anahtarı Üret"}</button>
          <button className="primary" type="button" onClick={downloadBootstrap} disabled={!token}>Agent Kurulum Dosyasını İndir</button>
        </div>
        {token?<div className="abc-token"><small>TEK SEFERLİK ANAHTAR</small><code>{token}</code><button type="button" onClick={()=>navigator.clipboard?.writeText(token)}>Kopyala</button></div>:null}
      </section>

      <section className="abc-card">
        <header><div><small>2 · RELEASE</small><h2>KY PDKS Pro 1.9.0</h2></div><span className="badge">win-x64</span></header>
        <p>Worker unit/typecheck/build, frontend test/lint/build, .NET/xUnit, self-contained publish, WebView2, Inno Setup ve SHA256 zinciri.</p>
        <div className="abc-release"><div><span>Branch</span><code>{BRANCH}</code></div><div><span>Çıktı</span><strong>KY-PDKS-Pro-Setup-1.9.0.exe</strong></div></div>
        <button className="primary wide" type="button" onClick={queuePdks} disabled={busy||Boolean(running)}>PDKS 1.9.0 Build Al</button>
      </section>
    </div>

    <section className="abc-card">
      <header><div><small>BUILD GEÇMİŞİ</small><h2>R2 Artifact Kuyruğu</h2></div><b>{state.jobs?.length||0} kayıt</b></header>
      <div className="abc-table">
        <div className="head"><span>Durum</span><span>Ürün / Sürüm</span><span>Commit</span><span>İlerleme</span><span>Zaman</span><span>Agent</span><span>İşlem</span></div>
        {(state.jobs||[]).map(row=><div className="row" key={row.id}>
          <span><i className={tone(row.status)}>{label(row.status)}</i></span>
          <strong>{row.product}<small>{row.version} · {row.branch}</small></strong>
          <code>{row.commitSha?String(row.commitSha).slice(0,10):"-"}</code>
          <span><b>{Number(row.progress||0)}%</b><small>{row.message||"-"}</small></span>
          <span>{fmt(row.createdAt)}<small>{row.completedAt?"Bitti "+fmt(row.completedAt):""}</small></span>
          <span>{row.agentName||"-"}</span>
          <div className="buttons">
            {row.artifactKey?<button type="button" onClick={()=>downloadBuildArtifact(row.id,row.artifactFileName||"KY-PDKS-Pro-Setup-1.9.0.exe")}>Setup İndir</button>:null}
            {row.logKey?<button type="button" onClick={()=>downloadBuildLog(row.id,"KYERP-build-"+row.id+".log")}>Log</button>:null}
            {["QUEUED","CLAIMED"].includes(String(row.status).toUpperCase())?<button className="danger" type="button" onClick={async()=>{await cancelBuildJob(row.id);await load()}}>İptal</button>:null}
          </div>
        </div>)}
        {!state.jobs?.length?<div className="empty">Henüz build talebi yok.</div>:null}
      </div>
    </section>
  </div>;
}
