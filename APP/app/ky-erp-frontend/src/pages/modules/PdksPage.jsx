import { useEffect, useMemo, useState } from "react";
import { executePdksAssistantCommand, PDKS_ASSISTANT_EXAMPLES } from "../../services/pdksAssistant";
import PdksDeviceCenter from "../pdks/PdksDeviceCenter";
import PdksLiveHome from "../pdks/PdksLiveHome";
import PdksPersonnelDesk from "../pdks/PdksPersonnelDesk";
import PdksReportCenter from "../pdks/PdksReportCenter";
import PdksRulesCenter from "../pdks/PdksRulesCenter";
import PdksPageV2 from "./PdksPageV2";
import "./pdks-shell.css";

const PERSONNEL_DESK_TABS = new Set([
  "personel-bilgileri",
  "giris-cikislar",
  "puantaj",
  "izinler",
  "calisma-tarihi",
]);

const AUDIT_ALLOWED_TABS = new Set([
  "ana-ekran",
  "giris-cikislar",
  "puantaj",
  "puantaj-sonuclari",
  "calisma-tarihi",
  "raporlar",
  "denetim-yillik-temp",
]);

const TITLES = {
  "ana-ekran": ["Ana Ekran", "Canlı kart hareketleri, içeride olanlar ve günlük kontrol."],
  "personel-bilgileri": ["Personel", "İK personel kaynağına bağlı PDKS kart, vardiya ve operasyon görünümü."],
  "giris-cikislar": ["Giriş / Çıkış", "Ham kart hareketleri ve günlük geçiş kontrolü."],
  "puantaj": ["Puantaj", "Günlük durum, eksik basım, geç/erken ve fazla mesai kontrolü."],
  "izinler": ["İzinler", "İK izin kaydının PDKS puantajına yansıyan operasyon görünümü."],
  "puantaj-kurallari": ["Vardiya & Kurallar", "Çalışma günleri, vardiya, mola ve puantaj kuralları."],
  "cihaz-baglantilari": ["Cihaz / Senkron", "Terminal, Agent ve senkronizasyon sağlığı."],
  "raporlar": ["Raporlar", "Puantaj analizi ve kontrol gerektiren kayıtlar."],
  "puantaj-sonuclari": ["Puantaj Sonuçları", "Aylık puantaj sonuçları ve istisnalar."],
  "bilgi-aktar": ["Kart / Terminal Aktarımı", "Dosya ve terminal veri aktarımı."],
  "gruplar-vardiyalar": ["Gruplar / Vardiyalar", "PDKS çalışma grubu tanımları."],
  "donemler": ["Dönemler", "PDKS dönem kontrolü ve kapanışı."],
  "servisler": ["Servisler", "Personel servis atamaları."],
  "tatiller": ["Resmî Tatiller", "PDKS çalışma takviminde kullanılan tatil kayıtları."],
  "saat-terminal": ["Saat / Terminal", "Terminal saat ve bağlantı görünümü."],
  "senkron": ["Senkronizasyon", "Agent ve cihaz senkron durumu."],
  "denetim-yillik-temp": ["Yıllık TEMP / Denetim", "Kart ve puantaj denetim paketi."],
};

function QuickAssistant({ disabled, mainCompanyId }) {
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const execute = async () => {
    if (disabled || busy || !command.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
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
    <section className="pdks-quick-assistant">
      <div className="pdks-quick-assistant-title">
        <div><strong>PDKS Hızlı Asistan</strong><span>Kart ve puantaj işlemleri için kısa komut kullanın.</span></div>
        {disabled ? <em>Denetim: salt okunur</em> : null}
      </div>
      <div className="pdks-assistant-row">
        <input
          value={command}
          disabled={disabled || busy}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") execute(); }}
          placeholder="Örn: Ali Akkaya bugün gelmedi, yok yaz"
        />
        <button type="button" onClick={execute} disabled={disabled || busy || !command.trim()}>{busy ? "İşleniyor..." : "Uygula"}</button>
      </div>
      <div className="pdks-assistant-examples">
        {PDKS_ASSISTANT_EXAMPLES.slice(0, 4).map((example) => (
          <button type="button" key={example} disabled={disabled || busy} onClick={() => setCommand(example)}>{example}</button>
        ))}
      </div>
      {message ? <div className="pdks-assistant-success">{message}</div> : null}
      {error ? <div className="pdks-assistant-error">{error}</div> : null}
    </section>
  );
}

function MovedToIk({ kind, openModule }) {
  const payroll = kind === "bordro";
  return (
    <section className="pdks-moved-card">
      <small>PDKS / İK AYRIMI</small>
      <h2>{payroll ? "Bordro" : "Avans / Kesinti"} artık İK bölümünde</h2>
      <p>PDKS yalnız kart, vardiya, giriş/çıkış ve puantaj üretir. Finansal kayıtlar İK ana kaynağında yönetilir.</p>
      <button type="button" onClick={() => openModule?.("ik", { tabKey: payroll ? "bordro-odeme" : "mesai-avans" })}>
        İK ekranını aç
      </button>
    </section>
  );
}

export default function PdksPage(props) {
  const { activeTab = "ana-ekran", isAuditAccount = false, openModule, activeMainCompany } = props;
  const mainCompanyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const title = TITLES[activeTab] || ["PDKS", "Kart, vardiya ve puantaj işlemleri."];
  const blockedForAudit = isAuditAccount && !AUDIT_ALLOWED_TABS.has(activeTab);
  const deviceCenterTab = !isAuditAccount && ["cihaz-baglantilari", "senkron"].includes(activeTab);
  const personnelDeskTab = PERSONNEL_DESK_TABS.has(activeTab);
  const rulesCenterTab = !isAuditAccount && activeTab === "puantaj-kurallari";
  const reportCenterTab = ["puantaj-sonuclari", "raporlar"].includes(activeTab);
  const movedFinance = ["avanslar", "bordro"].includes(activeTab);

  useEffect(() => {
    document.body.classList.add("pdks-compact-active");
    return () => document.body.classList.remove("pdks-compact-active");
  }, []);

  const legacyTab = useMemo(() => ![
    "ana-ekran",
    ...PERSONNEL_DESK_TABS,
    "puantaj-kurallari",
    "cihaz-baglantilari",
    "senkron",
    "puantaj-sonuclari",
    "raporlar",
    "avanslar",
    "bordro",
  ].includes(activeTab), [activeTab]);

  return (
    <div className="pdks-module-shell">
      <header className="pdks-section-head">
        <div>
          <small>PDKS</small>
          <h1>{title[0]}</h1>
          <p>{title[1]}</p>
        </div>
        <span>Finans / maaş / bordro işlemleri İK bölümündedir.</span>
      </header>

      <main className="pdks-module-content">
        {blockedForAudit ? (
          <section className="pdks-moved-card"><h2>Bu ekran denetim hesabına kapalıdır.</h2><p>Denetim hesabı yalnız izin verilen PDKS rapor ve puantaj ekranlarını görüntüler.</p></section>
        ) : movedFinance ? (
          <MovedToIk kind={activeTab} openModule={openModule} />
        ) : activeTab === "ana-ekran" && !isAuditAccount ? (
          <PdksLiveHome activeMainCompany={activeMainCompany} openModule={openModule} />
        ) : deviceCenterTab ? (
          <PdksDeviceCenter activeTab={activeTab} activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : personnelDeskTab ? (
          <PdksPersonnelDesk {...props} />
        ) : rulesCenterTab ? (
          <PdksRulesCenter activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
        ) : reportCenterTab ? (
          <PdksReportCenter activeMainCompany={activeMainCompany} />
        ) : legacyTab ? (
          <>
            <QuickAssistant disabled={isAuditAccount} mainCompanyId={mainCompanyId} />
            <PdksPageV2 {...props} />
          </>
        ) : null}
      </main>
    </div>
  );
}
