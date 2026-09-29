import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ErpIcon } from "./IconMap";
import "./CanonicalTaskNavigator.css";

const OWNER_ONLY_ADMIN_TABS = new Set(["uygulama-sahibi", "firma-ucretlendirme", "eslestirmeler", "surum-merkezi"]);

function isOwner(user) {
  return ["SUPER_ADMIN", "ADMIN"].includes(String(user?.role || "").toUpperCase().replace(/İ/g, "I"));
}

function visibleTab(module, tab, user) {
  if (!module || !tab) return false;
  if (module.key === "admin" && OWNER_ONLY_ADMIN_TABS.has(tab[0])) return isOwner(user);
  return true;
}

function visibleGroups(module, user) {
  if (!module) return [];
  if (Array.isArray(module.groups)) {
    return module.groups
      .map((group) => ({ ...group, tabs: (group.tabs || []).filter((tab) => visibleTab(module, tab, user)) }))
      .filter((group) => group.tabs.length);
  }
  const tabs = (module.tabs || []).filter((tab) => visibleTab(module, tab, user));
  return tabs.length ? [{ label: module.label || "İşlemler", tabs }] : [];
}

export default function CanonicalTaskNavigator({ module, activeTab, user, onSelect }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => visibleGroups(module, user), [module, user]);
  const tabs = useMemo(() => groups.flatMap((group) => group.tabs), [groups]);
  const current = tabs.find(([key]) => key === activeTab) || tabs[0];

  useEffect(() => { setOpen(false); }, [module?.key, activeTab]);

  /* Günlük Operasyon mevcut kullanımını korur. Diğer modüller kendi sayfa + açılır işlem düzenini kullanır. */
  if (module?.key !== "gunluk-operasyon" || tabs.length <= 1) return null;

  return (
    <section className={`ky-task-nav ${open ? "is-open" : ""}`} aria-label={`${module.label} işlemleri`}>
      <button
        type="button"
        className="ky-task-nav__trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ky-task-nav__trigger-icon"><ErpIcon name={current?.[2] || module.icon || "dashboard"} size={17} /></span>
        <span className="ky-task-nav__trigger-copy"><small>{module.label}</small><strong>{current?.[1] || "İşlemler"}</strong></span>
        <span className="ky-task-nav__trigger-label">İşlemler</span>
        <ChevronDown size={17} className={open ? "is-open" : ""} />
      </button>

      {open ? (
        <div className="ky-task-nav__panel">
          {groups.map((group) => {
            const activeInGroup = group.tabs.some(([key]) => key === activeTab);
            return (
              <details key={group.label} open={activeInGroup || groups.length === 1}>
                <summary><span>{group.label}</span><small>{group.tabs.length} işlem</small></summary>
                <div className="ky-task-nav__items">
                  {group.tabs.map(([key, label, icon]) => (
                    <button
                      type="button"
                      key={key}
                      className={activeTab === key ? "is-active" : ""}
                      onClick={() => { setOpen(false); onSelect?.(key); }}
                    >
                      <ErpIcon name={icon || "dashboard"} size={16} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
