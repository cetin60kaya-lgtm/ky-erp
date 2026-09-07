import { useMemo, useState } from "react";
import "../../app/pdksModuleRegistryPatch";
import { commitPdksAssistantCommand, previewPdksAssistantCommand, PDKS_ASSISTANT_EXAMPLES } from "../../services/pdksAssistant";
import PdksAiControlCenter from "../pdks/PdksAiControlCenter";
import PdksDeviceCenter from "../pdks/PdksDeviceCenter";
import PdksDefinitionsCenter from "../pdks/PdksDefinitionsCenter";
import PdksLiveHome from "../pdks/PdksLiveHome";
import PdksPersonnelDesk from "../pdks/PdksPersonnelDesk";
import PdksReportCenter from "../pdks/PdksReportCenter";
import PdksTransferCenter from "../pdks/PdksTransferCenter";
import PdksRulesCenter from "../pdks/PdksRulesCenter";
import "./pdks-shell.css";

const NAV_GROUPS = [
  { key: "gunluk", label: "Günlük", hint: "Kart, giriş/çıkış ve puantaj", items: [
    ["ana-ekran", "Canlı"], ["bilgi-aktar", "Kart Aktar"], ["giris-cikislar", "Giriş / Çıkış"], ["puantaj", "Puantaj"], ["puantaj-sonuclari", "Sonuçlar"],
  ]},
  { key: "personel", label: "Personel & İK", hint: "İK ana kaynağı, izin ve çalışma bağlantısı", items: [
    ["personel-bilgileri", "Personel"], ["izinler", "İzinler"], ["calisma-tarihi", "Çalışma Tarihi"],
  ]},
  { key: "tanimlar", label: "Tanımlar", hint: "Vardiya ve çalışma kuralları", items: [
    ["gruplar-vardiyalar", "Vardiyalar"], ["puantaj-kurallari", "Puantaj Kuralları"], ["donemler", "Dönem / Kapanış"], ["servisler", "Servisler"], ["tatiller", "Tatiller"],
  ]},
  { key: "terminal", label: "Terminal & Sistem", hint: "Cihaz, agent ve senkron", items: [
    ["saat-terminal", "Terminal"], ["cihaz-baglantilari", "Cihazlar"], ["senkron", "Senkron"],
  ]},
  { key: "ai", label: "AI & Kontrol", hint: "Canlı analiz, anomali ve kontrollü işlemler", items: [
    ["ai-kontrol", "AI Kontrol"],
  ]},
  { key: "rapor", label: "Rapor & Denetim", hint: "Puantaj raporları ve yıllık denetim", items: [
    ["raporlar", "Raporlar"], ["denetim-yillik-temp", "Yıllık TEMP"],
  ]},
];

const AUDIT_ALLOWED_TABS = new Set(["ana-ekran","giris-cikislar","puantaj","puantaj-sonuclari","calisma-tarihi","ai-kontrol","raporlar","denetim-yillik-temp"]);
const PERSONNEL_DESK_TABS = new Set(["personel-bilgileri","giris-cikislar","puantaj","izinler","calisma-tarihi"]);

function groupForTab(tabKey, groups) {
  return groups.find((group) => group.items.some(([key]) => key === tabKey)) || groups[0];
}

function QuickAssistant({ disabled, mainCompanyId }) {
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clearFeedback = () => { setPreview(null); setMessage(""); setError(""); };

  const runPreview = async () => {
    if (disabled || busy || !command.trim()) return;
    setBusy(true); setError(""); setMessage(""); setPreview(null);
    try {
      setPreview(await previewPdksAssistantCommand(command, { mainCompanyId }));
    } catch (cause) {
      setError(cause?.message || "İşlem önizlenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (disabled || busy || !preview || !command.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await commitPdksAssistantCommand(command, { mainCompanyId });
      setMessage(result?.summary || "PDKS işlemi uygulandı.");
      setCommand("");
      setPreview(null);
    } catch (cause) {
      setError(cause?.message || "PDKS işlemi uygulanamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pdks-quick-assistant compact">
      <div className="pdks-assistant-row">
        <div className="pdks-assistant-label"><strong>Hızlı İşlem</strong><small>Önce önizle, sonra onayla</small></div>
        <input value={command} disabled={disabled || busy} onChange={(event) => { setCommand(event.target.value); clearFeedback(); }}
          onKeyDown={(event) => { if (event.key === "Enter") runPreview(); }}
          placeholder="Örn: Ali Akkaya bugün gelmedi, yok yaz" />
        <button type="button" onClick={runPreview} disabled={disabled || busy || !command.trim()}>{busy ? "Kontrol..." : "Önizle"}</button>
      </div>
      {!disabled ? <div className="pdks-assistant-examples">
        {PDKS_ASSISTANT_EXAMPLES.slice(0, 3).map((example) => (
          <button type="button" key={example} disabled={busy} onClick={() => { setCommand(example); clearFeedback(); }}>{example}</button>
        ))}
      </div> : null}
      {preview ? <div className="pdks-assistant-preview">
        <div><small>UYGULANACAK İŞLEM</small><strong>{preview?.summary || preview?.action || "PDKS işlemi"}</strong></div>
        <div className="pdks-assistant-preview-actions">
          <button type="button" onClick={() => setPreview(null)} disabled={busy}>İptal</button>
          <button type="button" className="commit" onClick={commit} disabled={busy}>Onayla ve Uygula</button>
        </div>
      </div> : null}
      {disabled ? <div className="pdks-assistant-success">Denetim hesabı · salt okunur</div> : null}
      {message ? <div className="pdks-assistant-success">{message}</div> : null}
      {error ? <div className="pdks-assistant-error">{error}</div> : null}
    </section>
  );
}

export default function PdksPage(props) {
  const { activeTab = "ana-ekran", isAuditAccount = false, openModule, activeMainCompany } = props;
  const groups = useMemo(() => NAV_GROUPS
    .map((group) => ({ ...group, items: isAuditAccount ? group.items.filter(([key]) => AUDIT_ALLOWED_TABS.has(key)) : group.items }))
    .filter((group) => group.items.length), [isAuditAccount]);

  const currentGroup = groupForTab(activeTab, groups);
  const currentItem = currentGroup?.items.find(([key]) => key === activeTab) || currentGroup?.items[0] || ["ana-ekran", "Canlı"];
  const go = (tabKey) => openModule?.("pdks", { tabKey });
  const mainCompanyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";

  const deviceCenterTab = !isAuditAccount && ["saat-terminal", "cihaz-baglantilari", "senkron"].includes(activeTab);
  const personnelDeskTab = PERSONNEL_DESK_TABS.has(activeTab);
  const rulesCenterTab = !isAuditAccount && activeTab === "puantaj-kurallari";
  const reportCenterTab = ["puantaj-sonuclari", "raporlar", "denetim-yillik-temp"].includes(activeTab);
  const definitionsCenterTab = ["gruplar-vardiyalar", "donemler", "servisler", "tatiller"].includes(activeTab);

  return (
    <div className="pdks-module-shell">
      <header className="pdks-context-bar">
        <div className="pdks-context-title">
          <small>PDKS / {currentGroup?.label || "Günlük"}</small>
          <strong>{currentItem[1]}</strong>
          <span>{currentGroup?.hint}</span>
        </div>
        <nav className="pdks-context-tabs" aria-label={(currentGroup?.label || "PDKS") + " hızlı işlemleri"}>
          {(currentGroup?.items || []).map(([key, label]) => (
            <button type="button" key={key} className={activeTab === key ? "active" : ""} onClick={() => go(key)}>{label}</button>
          ))}
        </nav>
        <span className={"pdks-context-mode " + (isAuditAccount ? "audit" : "full")}>{isAuditAccount ? "DENETİM" : "CANLI"}</span>
      </header>

      <main className="pdks-module-content">
        {activeTab === "ana-ekran" ? (
          <>
            {!isAuditAccount ? <QuickAssistant disabled={false} mainCompanyId={mainCompanyId} /> : null}
            <PdksLiveHome activeMainCompany={activeMainCompany} openModule={openModule} />
          </>
        ) : activeTab === "ai-kontrol" ? (
          <PdksAiControlCenter activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : activeTab === "bilgi-aktar" ? (
          <PdksTransferCenter activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : deviceCenterTab ? (
          <PdksDeviceCenter activeTab={activeTab} activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : personnelDeskTab ? (
          <PdksPersonnelDesk {...props} />
        ) : rulesCenterTab ? (
          <PdksRulesCenter activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : definitionsCenterTab ? (
          <PdksDefinitionsCenter activeTab={activeTab} activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : reportCenterTab ? (
          <PdksReportCenter activeTab={activeTab} activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : (
          <PdksLiveHome activeMainCompany={activeMainCompany} openModule={openModule} />
        )}
      </main>
    </div>
  );
}
