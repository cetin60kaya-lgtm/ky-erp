import { useEffect, useMemo, useState } from "react";
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

export default function PdksPage(props) {
  const { activeTab = "ana-ekran", isAuditAccount = false, openModule } = props;
  const groups = useMemo(
    () => NAV_GROUPS.filter((group) => !(isAuditAccount && group.finance)),
    [isAuditAccount],
  );
  const currentGroup = groupForTab(activeTab, groups);
  const [openGroup, setOpenGroup] = useState(currentGroup);

  useEffect(() => {
    setOpenGroup(currentGroup);
  }, [currentGroup]);

  const go = (tabKey) => openModule?.("pdks", { tabKey });

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
        <PdksPageV2 {...props} />
      </main>
    </div>
  );
}
