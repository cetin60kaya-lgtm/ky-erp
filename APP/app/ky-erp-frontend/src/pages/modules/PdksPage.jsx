import { useMemo, useState } from "react";
import "../../app/pdksModuleRegistryPatch";
import { executePdksAssistantCommand, PDKS_ASSISTANT_EXAMPLES } from "../../services/pdksAssistant";
import PdksDeviceCenter from "../pdks/PdksDeviceCenter";
import PdksLiveHome from "../pdks/PdksLiveHome";
import PdksPersonnelDesk from "../pdks/PdksPersonnelDesk";
import PdksReportCenter from "../pdks/PdksReportCenter";
import PdksRulesCenter from "../pdks/PdksRulesCenter";
import PdksPageV2 from "./PdksPageV2";
import "./pdks-shell.css";

const NAV_GROUPS = [
  { key: "genel", label: "Genel Bakış", hint: "Canlı durum, hızlı işlem ve günlük özet", items: [
    ["ana-ekran", "Genel Bakış"],
  ]},
  { key: "operasyon", label: "Operasyon", hint: "Terminal aktarımı ve günlük giriş-çıkış işlemleri", items: [
    ["bilgi-aktar", "Terminal"], ["giris-cikislar", "Giriş-Çıkış"],
  ]},
  { key: "personel", label: "İnsan Kaynakları", hint: "PDKS SGK personeli, aktif/pasif geçmiş ve izinler", items: [
    ["personel-bilgileri", "Personel"], ["izinler", "İzinler"], ["calisma-tarihi", "Çalışma Tarihi"],
  ]},
  { key: "puantaj", label: "Puantaj ve Bordro", hint: "Puantaj, sonuç ve dönem işlemleri", items: [
    ["puantaj", "Puantaj"], ["puantaj-sonuclari", "Sonuçlar"], ["donemler", "Dönem / Kapanış"],
  ]},
  { key: "rapor", label: "Raporlama ve Denetim", hint: "PDKS raporları ve yıllık denetim", items: [
    ["raporlar", "Raporlar"], ["denetim-yillik-temp", "Yıllık TEMP"],
  ]},
  { key: "sistem", label: "Sistem Yönetimi", hint: "Cihaz, vardiya, servis, tatil ve çift yönlü senkron", items: [
    ["saat-terminal", "Terminal"], ["cihaz-baglantilari", "Cihazlar"], ["senkron", "Senkron"],
    ["gruplar-vardiyalar", "Vardiyalar"], ["puantaj-kurallari", "Puantaj Kuralları"], ["servisler", "Servisler"], ["tatiller", "Tatiller"],
  ]},
];

const AUDIT_ALLOWED_TABS = new Set(["ana-ekran","giris-cikislar","puantaj","puantaj-sonuclari","calisma-tarihi","raporlar","denetim-yillik-temp"]);
const PERSONNEL_DESK_TABS = new Set(["personel-bilgileri","giris-cikislar","puantaj","izinler","calisma-tarihi"]);

function groupForTab(tabKey, groups) {
  return groups.find((group) => group.items.some(([key]) => key === tabKey)) || groups[0];
}

function QuickAssistant({ disabled, mainCompanyId }) {
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const execute = async () => {
    if (disabled || busy || !command.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await executePdksAssistantCommand(command, { mainCompanyId });
      setMessage(result?.message || "İşlem tamamlandı.");
      setCommand("");
    } catch (cause) {
      setError(cause?.message || "Asistan işlemi tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pdks-quick-assistant compact">
      <div className="pdks-assistant-row">
        <div className="pdks-assistant-label"><strong>Hızlı İşlem</strong><small>PDKS personeli + işlemi yaz</small></div>
        <input value={command} disabled={disabled || busy} onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") execute(); }}
          placeholder="Örn: Ali Akkaya bugün gelmedi, yok yaz" />
        <button type="button" onClick={execute} disabled={disabled || busy || !command.trim()}>{busy ? "İşleniyor" : "Uygula"}</button>
      </div>
      {!disabled ? <div className="pdks-assistant-examples">
        {PDKS_ASSISTANT_EXAMPLES.slice(0, 3).map((example) => (
          <button type="button" key={example} disabled={busy} onClick={() => setCommand(example)}>{example}</button>
        ))}
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
  const currentItem = currentGroup?.items.find(([key]) => key === activeTab) || currentGroup?.items[0] || ["ana-ekran", "Genel Bakış"];
  const go = (tabKey) => openModule?.("pdks", { tabKey });
  const mainCompanyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";

  const deviceCenterTab = !isAuditAccount && ["saat-terminal", "cihaz-baglantilari", "senkron"].includes(activeTab);
  const personnelDeskTab = PERSONNEL_DESK_TABS.has(activeTab);
  const rulesCenterTab = !isAuditAccount && activeTab === "puantaj-kurallari";
  const reportCenterTab = ["puantaj-sonuclari", "raporlar"].includes(activeTab);

  return (
    <div className="pdks-module-shell">
      <header className="pdks-context-bar">
        <div className="pdks-context-title">
          <small>KY ERP · PDKS 6.0 / {currentGroup?.label || "Genel Bakış"}</small>
          <strong>{currentItem[1]}</strong>
          <span>{currentGroup?.hint}</span>
        </div>
        <nav className="pdks-context-tabs" aria-label={(currentGroup?.label || "PDKS") + " işlemleri"}>
          {(currentGroup?.items || []).map(([key, label]) => (
            <button type="button" key={key} className={activeTab === key ? "active" : ""} onClick={() => go(key)}>{label}</button>
          ))}
        </nav>
        <span className={"pdks-context-mode " + (isAuditAccount ? "audit" : "full")}>{isAuditAccount ? "DENETİM" : "PDKS 6.0"}</span>
      </header>

      <main className="pdks-module-content">
        {activeTab === "ana-ekran" ? (
          <>
            {!isAuditAccount ? <QuickAssistant disabled={false} mainCompanyId={mainCompanyId} /> : null}
            <PdksLiveHome activeMainCompany={activeMainCompany} openModule={openModule} />
          </>
        ) : deviceCenterTab ? (
          <PdksDeviceCenter activeTab={activeTab} activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : personnelDeskTab ? (
          <PdksPersonnelDesk {...props} />
        ) : rulesCenterTab ? (
          <PdksRulesCenter activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : reportCenterTab ? (
          <PdksReportCenter activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : (
          <>
            {!isAuditAccount && ["bilgi-aktar", "gruplar-vardiyalar", "donemler", "servisler", "tatiller"].includes(activeTab)
              ? <QuickAssistant disabled={false} mainCompanyId={mainCompanyId} /> : null}
            <PdksPageV2 {...props} />
          </>
        )}
      </main>
    </div>
  );
}
