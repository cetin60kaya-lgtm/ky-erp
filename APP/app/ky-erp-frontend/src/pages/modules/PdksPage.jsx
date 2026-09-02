import { useEffect, useMemo, useState } from "react";
import { executePdksAssistantCommand, PDKS_ASSISTANT_EXAMPLES } from "../../services/pdksAssistant";
import PdksPageV2 from "./PdksPageV2";
import "./pdks-shell.css";

const NAV_GROUPS = [
  {
    key: "gunluk",
    label: "Günlük",
    hint: "Kart, giriş/çıkış ve puantaj",
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
    label: "Personel & İK",
    hint: "Personel, izin ve bordro bağlantısı",
    items: [
      ["personel-bilgileri", "Personel Bilgileri"],
      ["izinler", "İzinler"],
      ["calisma-tarihi", "Çalışma Tarihi"],
      ["avanslar", "Avanslar"],
      ["bordro", "Bordro"],
    ],
  },
  {
    key: "tanimlar",
    label: "Tanımlar",
    hint: "Vardiya, bölüm ve çalışma kuralları",
    items: [
      ["gruplar-vardiyalar", "Gruplar / Vardiyalar"],
      ["puantaj-kurallari", "Puantaj Kuralları"],
      ["bolumler", "Bölümler"],
      ["gorevler", "Görevler"],
      ["servisler", "Servisler"],
      ["durumlar", "Durumlar"],
      ["firmalar", "Firmalar"],
      ["tatiller", "Tatiller"],
      ["donemler", "Dönemler"],
    ],
  },
  {
    key: "terminal",
    label: "Terminal & Sistem",
    hint: "Cihaz, saat ve kullanıcı ayarları",
    items: [
      ["saat-terminal", "Saat / Terminal"],
      ["kullanicilar", "Kullanıcılar"],
    ],
  },
  {
    key: "rapor",
    label: "Rapor & Denetim",
    hint: "Raporlar ve yıllık denetim paketi",
    items: [
      ["raporlar", "Raporlar"],
      ["denetim-yillik-temp", "Yıllık TEMP / Denetim"],
    ],
  },
];

const AUDIT_ALLOWED_TABS = new Set([
  "ana-ekran",
  "giris-cikislar",
  "puantaj",
  "puantaj-sonuclari",
  "calisma-tarihi",
  "raporlar",
  "denetim-yillik-temp",
]);

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
  const groups = useMemo(() => NAV_GROUPS
    .map((group) => ({
      ...group,
      items: isAuditAccount ? group.items.filter(([key]) => AUDIT_ALLOWED_TABS.has(key)) : group.items,
    }))
    .filter((group) => group.items.length), [isAuditAccount]);
  const currentGroup = groupForTab(activeTab, groups);
  const [openGroup, setOpenGroup] = useState("");

  useEffect(() => {
    document.body.classList.add("pdks-compact-active");
    return () => document.body.classList.remove("pdks-compact-active");
  }, []);

  useEffect(() => {
    setOpenGroup("");
  }, [activeTab]);

  useEffect(() => {
    const close = (event) => {
      if (!event.target?.closest?.(".pdks-command-nav")) setOpenGroup("");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const go = (tabKey) => {
    setOpenGroup("");
    openModule?.("pdks", { tabKey });
  };
  const mainCompanyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";

  return (
    <div className="pdks-module-shell">
      <nav className="pdks-command-nav" aria-label="PDKS işlemleri">
        <div className="pdks-command-brand">
          <strong>PDKS</strong>
          <span>İşlem Merkezi</span>
        </div>
        <div className="pdks-command-groups">
          {groups.map((group) => {
            const expanded = openGroup === group.key;
            const current = currentGroup === group.key;
            return (
              <div className={`pdks-command-group ${current ? "current" : ""}`} key={group.key}>
                <button
                  type="button"
                  className={`pdks-command-toggle ${expanded ? "open" : ""}`}
                  onClick={() => setOpenGroup((value) => (value === group.key ? "" : group.key))}
                  aria-expanded={expanded}
                >
                  <span><strong>{group.label}</strong><small>{group.hint}</small></span>
                  <i>⌄</i>
                </button>
                {expanded ? (
                  <div className="pdks-command-menu">
                    {group.items.map(([key, label]) => (
                      <button
                        type="button"
                        key={key}
                        className={activeTab === key ? "active" : ""}
                        onClick={() => go(key)}
                      >
                        <span>{label}</span>
                        {activeTab === key ? <b>Aktif</b> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </nav>

      <main className="pdks-module-content">
        <QuickAssistant disabled={isAuditAccount} mainCompanyId={mainCompanyId} />
        <PdksPageV2 {...props} />
      </main>
    </div>
  );
}
