import { useEffect, useMemo, useState } from "react";
import { executePdksAssistantCommand, PDKS_ASSISTANT_EXAMPLES } from "../../services/pdksAssistant";
import PdksPageV2 from "./PdksPageV2";
import "./pdks-shell.css";

const NAV_GROUPS = [
  {
    key: "gunluk",
    label: "Günlük İşlemler",
    items: [
      ["ana-ekran", "Ana Ekran"],
      ["bilgi-aktar", "Bilgi Aktar"],
      ["giris-cikislar", "Giriş / Çıkış"],
      ["puantaj", "Puantaj"],
      ["puantaj-sonuclari", "Puantaj Sonuçları"],
    ],
  },
  {
    key: "personel",
    label: "Personel",
    items: [
      ["personel-bilgileri", "Personel Bilgileri"],
      ["izinler", "İzinler"],
      ["calisma-tarihi", "Çalışma Tarihi"],
    ],
  },
  {
    key: "tanimlar",
    label: "Vardiya ve Tanımlar",
    items: [
      ["gruplar-vardiyalar", "Gruplar / Vardiyalar"],
      ["servisler", "Servisler"],
      ["tatiller", "Tatiller"],
      ["donemler", "Dönemler"],
    ],
  },
  {
    key: "ik-baglanti",
    label: "İK Bağlantısı",
    finance: true,
    items: [
      ["avanslar", "Avanslar"],
      ["bordro", "Bordro"],
    ],
  },
  {
    key: "sistem",
    label: "Sistem ve Denetim",
    items: [
      ["saat-terminal", "Saat / Terminal"],
      ["raporlar", "Raporlar"],
      ["denetim-yillik-temp", "Yıllık TEMP / Denetim"],
    ],
  },
];

function groupForTab(tabKey, groups) {
  return groups.find((group) => group.items.some(([key]) => key === tabKey))?.key || "gunluk";
}

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
        <div><strong>PDKS Hızlı Asistan</strong><span>Personel adı + işlem yaz; kayıt aynı İK/PDKS D1 verisine gider.</span></div>
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

export default function PdksPage(props) {
  const { activeTab = "ana-ekran", isAuditAccount = false, openModule, activeMainCompany } = props;
  const groups = useMemo(
    () => NAV_GROUPS.filter((group) => !(isAuditAccount && group.finance)),
    [isAuditAccount],
  );
  const currentGroup = groupForTab(activeTab, groups);
  const [openGroup, setOpenGroup] = useState(currentGroup);

  useEffect(() => {
    document.body.classList.add("pdks-compact-active");
    return () => document.body.classList.remove("pdks-compact-active");
  }, []);

  useEffect(() => {
    setOpenGroup(currentGroup);
  }, [currentGroup]);

  const go = (tabKey) => openModule?.("pdks", { tabKey });
  const mainCompanyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";

  return (
    <div className="pdks-module-shell">
      <aside className="pdks-local-nav" aria-label="PDKS işlemleri">
        <div className="pdks-local-nav-head">
          <strong>PDKS İşlemleri</strong>
          <span>İşlevler gruplandı; ana ERP menüsü sade tutulur.</span>
        </div>
        {groups.map((group) => {
          const expanded = openGroup === group.key;
          return (
            <section className="pdks-nav-group" key={group.key}>
              <button
                type="button"
                className={`pdks-nav-group-toggle ${expanded ? "open" : ""}`}
                onClick={() => setOpenGroup((value) => (value === group.key ? "" : group.key))}
                aria-expanded={expanded}
              >
                <span>{group.label}</span><i>›</i>
              </button>
              {expanded ? (
                <div className="pdks-nav-items">
                  {group.items.map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      className={`pdks-nav-item ${activeTab === key ? "active" : ""}`}
                      onClick={() => go(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </aside>
      <main className="pdks-module-content">
        <QuickAssistant disabled={isAuditAccount} mainCompanyId={mainCompanyId} />
        <PdksPageV2 {...props} />
      </main>
    </div>
  );
}
