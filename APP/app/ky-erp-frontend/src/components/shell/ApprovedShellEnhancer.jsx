import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";

const STORAGE_KEY = "kyerp-approved-work-tabs-v1";
const HOME_PATH = "/muhasebe/yonetim-ozeti";

const MODULE_LABELS = {
  muhasebe: "Muhasebe",
  isnet: "İşNet",
  ik: "İK",
  desen: "Desen",
  uretim: "İmalat",
  boyahane: "Boyahane",
  admin: "Yönetim",
};

const SCREEN_LABELS = {
  "yonetim-ozeti": "Yönetim Özeti",
  "firma-kartlari": "Firma Kartları",
  "firma-yetkilileri": "Firma Yetkilileri",
  "gider-kategorileri": "Gider Kategorileri",
  "tedarikci-faturalar": "Tedarikçi Faturaları",
  "kesilen-faturalar": "Kesilen Faturalar",
  "musteri-irsaliyeleri": "İrsaliyeler",
  "irsaliye-fatura-kontrol": "İrsaliye / Fatura",
  "model-takip": "Model Üretim Takibi",
  "cari-hareketler": "Cari Hareketler",
  "kar-zarar": "Gelir / Gider",
  "envanter-urunleri": "Ürünler",
  "kdv-kontrol": "KDV Kontrol",
  "cek-odeme": "Çek / Ödeme",
  "mail-ekstre": "Mail / Ekstre",
  "mail-sablonlari": "Mail Şablonları",
  "muhasebe-raporlari": "Muhasebe Raporları",
  "yonetim-merkezi": "Analiz ve Eşleştirme",
  "belge-akisi": "Gelen / Giden Belgeler",
  "irsaliyeden-faturaya": "Fatura Kesme Yardımcısı",
  "kesilen-belgeler": "Yerel Belge Arşivi",
  "cikti-kuyrugu": "Çıktı ve Mail",
  ayarlar: "Ayarlar",
  ozet: "İK Özet",
  "personel-kartlari": "Personel Kartları",
  "uretim-girisi": "Üretim Girişi",
  "imalat-kontrol-rapor": "Denetim ve Rapor",
  "gelen-desenler": "Gelen Desenler",
  "desen-modeller": "Desen Havuzu",
  "is-akisi": "İş Akışı",
};

function routeInfo(pathname = window.location.pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  const moduleKey = parts[0] || "muhasebe";
  const screenKey = parts[1] || "yonetim-ozeti";
  const moduleLabel = MODULE_LABELS[moduleKey] || "KY ERP";
  const screenLabel = SCREEN_LABELS[screenKey] || screenKey.replaceAll("-", " ");
  return {
    id: `${moduleKey}:${screenKey}`,
    path: `/${moduleKey}/${screenKey}`,
    moduleKey,
    title: `${moduleLabel} · ${screenLabel}`,
  };
}

function readTabs() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length) return parsed.slice(0, 12);
  } catch {
    // Bozuk oturum verisi yeni rota ile sıfırlanır.
  }
  return [routeInfo(HOME_PATH)];
}

function navigate(path) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function ApprovedShellEnhancer() {
  const [targets, setTargets] = useState({ topbar: null, main: null });
  const [activePath, setActivePath] = useState(window.location.pathname);
  const [tabs, setTabs] = useState(readTabs);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const resolveTargets = () => {
      setTargets({
        topbar: document.querySelector(".kyerp-global-topbar"),
        main: document.querySelector(".main-content"),
      });
    };
    resolveTargets();
    const observer = new MutationObserver(resolveTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setActivePath(window.location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    const current = routeInfo(activePath);
    setTabs((previous) => {
      const exists = previous.some((tab) => tab.id === current.id);
      const next = exists ? previous : [...previous, current].slice(-12);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [activePath]);

  const active = useMemo(() => routeInfo(activePath), [activePath]);

  const closeTab = useCallback(
    (tabId) => {
      setTabs((previous) => {
        if (previous.length === 1) return previous;
        const index = previous.findIndex((tab) => tab.id === tabId);
        const next = previous.filter((tab) => tab.id !== tabId);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        if (tabId === active.id) {
          const fallback = next[Math.max(0, index - 1)] || next[0];
          window.setTimeout(() => navigate(fallback.path), 0);
        }
        return next;
      });
    },
    [active.id],
  );

  const submitSearch = (event) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    window.dispatchEvent(
      new CustomEvent("kyerp:global-search", { detail: { query: value } }),
    );
  };

  return (
    <>
      {targets.topbar
        ? createPortal(
            <form className="approved-global-search" onSubmit={submitSearch}>
              <Search size={17} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                placeholder="Firma, belge, model, ürün veya personel ara..."
                aria-label="Global arama"
              />
            </form>,
            targets.topbar,
          )
        : null}

      {targets.main
        ? createPortal(
            <>
              <nav className="approved-work-tabs" aria-label="Açık çalışma sekmeleri">
                {tabs.map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    className={tab.id === active.id ? "approved-work-tab active" : "approved-work-tab"}
                    onClick={() => navigate(tab.path)}
                    title={tab.title}
                  >
                    <span>{tab.title}</span>
                    {tabs.length > 1 ? (
                      <span
                        className="approved-tab-close"
                        role="button"
                        tabIndex={0}
                        aria-label={`${tab.title} sekmesini kapat`}
                        onClick={(event) => {
                          event.stopPropagation();
                          closeTab(tab.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            closeTab(tab.id);
                          }
                        }}
                      >
                        <X size={13} />
                      </span>
                    ) : null}
                  </button>
                ))}
              </nav>
              <footer className="approved-statusbar">
                <span>KY ERP</span>
                <span>{active.title}</span>
                <span className="approved-status-ok">● Sistem hazır</span>
              </footer>
            </>,
            targets.main,
          )
        : null}
    </>
  );
}
