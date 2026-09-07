import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Send, ShieldCheck, Sparkles, WifiOff, X } from "lucide-react";
import { getAiStatus, sendAiMessage } from "../../services/aiApi";
import { getPdksLiveDashboard } from "../../services/pdksApi";
import { commitPdksAssistantCommand, previewPdksAssistantCommand } from "../../services/pdksAssistant";
import "./PdksAiControlCenter.css";

const QUICK = [
  "Bugün kim gelmedi? Vardiyası başlamamış olanları gelmeyen sayma.",
  "Bugün yıllık izinde, raporlu veya diğer izinli personeli ayrı ayrı özetle.",
  "Bugün çıkış basmayı unutmuş veya eksik basımı olanları göster.",
  "Geç gelenleri ve kaçta geldiklerini özetle.",
  "Şu an içeride olan personeli bölüm bazında özetle.",
  "Terminal ve cihaz sağlığını kontrol et; çevrimdışı olanları belirt.",
  "Bugünkü PDKS risklerini önem sırasına göre çıkar.",
];

function compactSnapshot(data) {
  const roster = Array.isArray(data?.roster) ? data.roster : [];
  return {
    date: data?.date,
    generatedAt: data?.generatedAt,
    holiday: data?.holiday || null,
    metrics: data?.metrics || {},
    roster: roster.slice(0, 120).map((row) => ({
      personnelCode: row.personnelCode,
      fullName: row.fullName,
      department: row.department,
      status: row.status,
      statusLabel: row.statusLabel,
      firstTime: row.firstTime,
      lastTime: row.lastTime,
      eventCount: row.eventCount,
      late: row.late,
      schedule: row.schedule ? {
        groupName: row.schedule.groupName,
        entryTime: row.schedule.entryTime,
        exitTime: row.schedule.exitTime,
      } : null,
    })),
    devices: (Array.isArray(data?.devices) ? data.devices : []).map((row) => ({
      deviceLabel: row.deviceLabel,
      machineName: row.machineName,
      active: row.active,
      lastSeenAt: row.lastSeenAt,
      lastSyncAt: row.lastSyncAt,
      lastSyncCount: row.lastSyncCount,
    })),
  };
}

export default function PdksAiControlCenter({ activeMainCompany, isAuditAccount = false }) {
  const company = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const [snapshot, setSnapshot] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [preview, setPreview] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [live, status] = await Promise.all([
        getPdksLiveDashboard({ mainCompanyId: company }),
        getAiStatus().catch(() => null),
      ]);
      setSnapshot(live || null);
      setAiStatus(status || null);
    } catch (cause) {
      setError(cause?.message || "PDKS canlı bağlamı alınamadı.");
    }
  }, [company]);

  useEffect(() => { refresh(); }, [refresh]);

  const issues = useMemo(() => {
    const m = snapshot?.metrics || {};
    return [
      { label: "Gelmeyen", value: Number(m.noShow || 0), tone: Number(m.noShow || 0) ? "bad" : "ok" },
      { label: "Eksik çıkış", value: Number(m.missingPunch || 0), tone: Number(m.missingPunch || 0) ? "bad" : "ok" },
      { label: "Geç gelen", value: Number(m.late || 0), tone: Number(m.late || 0) ? "warn" : "ok" },
      { label: "Çevrimdışı cihaz", value: Math.max(0, Number(m.deviceCount || 0) - Number(m.onlineDevices || 0)), tone: Number(m.deviceCount || 0) > Number(m.onlineDevices || 0) ? "bad" : "ok" },
    ];
  }, [snapshot]);

  async function ask(textOverride) {
    const raw = String(textOverride ?? question).trim();
    if (!raw || busy || !snapshot) return;
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      const live = compactSnapshot(snapshot);
      const prompt = [
        "Sen KY ERP içindeki PDKS Kontrol Asistanısın.",
        "Aşağıdaki JSON, sunucudan az önce alınmış canlı PDKS durumudur. Sadece bu veriyi esas al.",
        "NO_SHOW gerçekten vardiyası başlamış ve kartı olmayan kişidir; WAITING vardiya saati gelmemiş kişidir.",
        "Finans/bordro alanına girme. Bulguları kısa, operasyonel ve önem sırasıyla ver.",
        "Bir veri değişikliği gerekiyorsa kendin uyguladığını söyleme; hangi kontrollü işlemin onaylanması gerektiğini belirt.",
        `CANLI_PDKS_JSON=${JSON.stringify(live)}`,
        `SORU=${raw}`,
      ].join("\n");
      const response = await sendAiMessage({
        message: prompt,
        mainCompanySlug: company,
        pageContext: { module: "ik", route: "/pdks/ai-kontrol", mainCompanySlug: company, assistantMode: "erp" },
      });
      setAnswer(response?.answer || "AI yanıt üretemedi.");
      setQuestion("");
    } catch (cause) {
      setError(cause?.message || "PDKS AI analizi tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function previewAction() {
    if (isAuditAccount || actionBusy || !command.trim()) return;
    setActionBusy(true);
    setActionMessage("");
    setPreview(null);
    try {
      const result = await previewPdksAssistantCommand(command, { mainCompanyId: company });
      setPreview(result || null);
    } catch (cause) {
      setActionMessage(cause?.message || "İşlem önizlenemedi.");
    } finally {
      setActionBusy(false);
    }
  }

  async function commitAction() {
    if (!preview || actionBusy || isAuditAccount) return;
    setActionBusy(true);
    setActionMessage("");
    try {
      const result = await commitPdksAssistantCommand(command, { mainCompanyId: company });
      setActionMessage(result?.summary || "PDKS işlemi uygulandı.");
      setPreview(null);
      setCommand("");
      await refresh();
    } catch (cause) {
      setActionMessage(cause?.message || "PDKS işlemi uygulanamadı.");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="pai-page">
      <header className="pai-hero">
        <div className="pai-mark"><Bot size={26} /></div>
        <div><small>KY PDKS · YAPAY ZEKA</small><h1>AI Kontrol Merkezi</h1><p>Canlı devam durumunu analiz eder, anormallikleri sıralar ve operasyon işlemlerini önizleme + açık onay ile yürütür.</p></div>
        <span className={aiStatus?.enabled ? "online" : "offline"}>{aiStatus?.enabled ? <Sparkles size={14} /> : <WifiOff size={14} />}{aiStatus?.enabled ? "AI Bağlı" : "AI Yapılandırma Gerekli"}</span>
        <button type="button" onClick={refresh}><RefreshCw size={15} /> Canlı Veriyi Yenile</button>
      </header>

      <section className="pai-riskbar">
        {issues.map((item) => <div key={item.label} className={item.tone}><span>{item.label}</span><strong>{item.value}</strong></div>)}
        <div><span>Canlı veri tarihi</span><strong>{snapshot?.date || "-"}</strong></div>
      </section>

      <div className="pai-grid">
        <section className="pai-panel pai-chat">
          <header><div><small>CANLI ANALİZ</small><h2>PDKS’ye Sor</h2></div><ShieldCheck size={18} /></header>
          <div className="pai-quick">
            {QUICK.map((item) => <button type="button" key={item} disabled={busy || !snapshot} onClick={() => ask(item)}>{item}</button>)}
          </div>
          <div className="pai-answer">
            {busy ? <div className="loading"><LoaderCircle size={18} className="spin" /><span>Canlı PDKS verisi analiz ediliyor…</span></div>
              : answer ? <div className="answer"><Bot size={18} /><p>{answer}</p></div>
              : <div className="empty"><Sparkles size={19} /><span>Bir hızlı kontrol seçin veya kendi sorunuzu yazın.</span></div>}
          </div>
          <div className="pai-composer">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} placeholder="Örn: Bugün 09:00 vardiyasında kimler eksik?" />
            <button type="button" onClick={() => ask()} disabled={busy || !question.trim() || !snapshot}><Send size={16} /> Sor</button>
          </div>
          {error ? <div className="pai-error"><AlertTriangle size={15} /> {error}</div> : null}
        </section>

        <section className="pai-panel pai-action">
          <header><div><small>KONTROLLÜ İŞLEM</small><h2>Doğal Dille PDKS İşlemi</h2></div><CheckCircle2 size={18} /></header>
          <p className="intro">İşlem önce önizlenir. Siz “Onayla ve Uygula” demeden D1’e yazılmaz. Kilitli dönem ve denetim hesabı güvenlik kuralları korunur.</p>
          <textarea value={command} onChange={(e) => { setCommand(e.target.value); setPreview(null); setActionMessage(""); }} disabled={isAuditAccount || actionBusy} placeholder="Örn: Ali Akkaya bugün 08:32 geldi&#10;Örn: Ali Akkaya bugün gelmedi, yok yaz&#10;Örn: Ali Akkaya bugün 18:55 çıkış yaptı" />
          <div className="pai-action-buttons">
            <button type="button" onClick={previewAction} disabled={isAuditAccount || actionBusy || !command.trim()}><Clock3 size={15} /> Önizle</button>
            {preview ? <button type="button" className="commit" onClick={commitAction} disabled={actionBusy}><ShieldCheck size={15} /> Onayla ve Uygula</button> : null}
          </div>
          {preview ? <div className="pai-preview"><small>UYGULANACAK İŞLEM</small><strong>{preview.summary || preview.action}</strong><pre>{JSON.stringify(preview.payload || {}, null, 2)}</pre><button type="button" className="cancel" onClick={() => setPreview(null)}><X size={14} /> İptal</button></div> : null}
          {isAuditAccount ? <div className="pai-note">Denetim hesabı AI analizi yapabilir ancak PDKS kaydı değiştiremez.</div> : null}
          {actionMessage ? <div className="pai-note">{actionMessage}</div> : null}
        </section>
      </div>
    </div>
  );
}
