import { useEffect, useMemo, useState } from "react";
import { ErpIcon } from "../erp/IconMap";
import { useAuth } from "../../context/AuthContext";
import { MODULES, getVisibleModuleTabs } from "../../app/moduleRegistry";
import {
  LEFT_CLICK_BUILTINS,
  buildLeftClickActionCatalog,
  parseRouteActionId,
  routeActionId,
} from "../../app/leftClickMenuCatalog";
import {
  LEFT_CLICK_SETTINGS_EVENT,
  getCachedLeftClickMenuSettings,
  loadLeftClickMenuSettings,
  normalizeLeftClickMenuSettings,
} from "../../services/applicationUiSettings";
import "../../styles/global-left-click-menu.css";

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "summary",
  "[role='button']",
  "[role='menuitem']",
  "[role='option']",
  "[contenteditable='true']",
  "[data-ky-no-left-menu]",
  "[data-ky-left-click-menu]",
].join(",");

function canonicalRole(value) {
  return String(value || "").trim().toUpperCase().replace(/İ/g, "I");
}

function ownerRole(user) {
  return ["SUPER_ADMIN", "ADMIN"].includes(canonicalRole(user?.role));
}

function currentRoute() {
  const [moduleKey = "", tabKey = ""] = String(window.location.pathname || "")
    .split("/")
    .filter(Boolean);
  return { moduleKey, tabKey };
}

function navigate(moduleKey, tabKey) {
  if (!moduleKey || !tabKey) return;
  const nextPath = `/${moduleKey}/${tabKey}`;
  if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function clampPosition(clientX, clientY, itemCount) {
  const width = 326;
  const estimatedHeight = Math.min(520, 76 + Math.max(1, itemCount) * 44);
  const left = Math.max(10, Math.min(clientX + 4, window.innerWidth - width - 10));
  const top = Math.max(10, Math.min(clientY + 4, window.innerHeight - estimatedHeight - 10));
  return { left, top };
}

function visibleModulesForUser(hasModule, user) {
  const owner = ownerRole(user);
  return MODULES.filter((module) => {
    if (module.key === "admin" && !owner) return false;
    return typeof hasModule === "function" ? hasModule(module.permissionKey) : true;
  });
}

export default function GlobalLeftClickMenu() {
  const { user, isAuthenticated, hasModule } = useAuth();
  const [settings, setSettings] = useState(() => getCachedLeftClickMenuSettings());
  const [menu, setMenu] = useState({ open: false, left: 0, top: 0 });
  const [notice, setNotice] = useState("");
  const visibleModules = useMemo(() => visibleModulesForUser(hasModule, user), [hasModule, user]);
  const catalog = useMemo(() => buildLeftClickActionCatalog(visibleModules), [visibleModules]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let alive = true;
    loadLeftClickMenuSettings().then((value) => { if (alive) setSettings(value); });
    const onSettings = (event) => setSettings(normalizeLeftClickMenuSettings(event?.detail));
    window.addEventListener(LEFT_CLICK_SETTINGS_EVENT, onSettings);
    return () => {
      alive = false;
      window.removeEventListener(LEFT_CLICK_SETTINGS_EVENT, onSettings);
    };
  }, [isAuthenticated]);

  const actions = useMemo(() => {
    if (!settings.enabled) return [];
    const byId = new Map(catalog.map((action) => [action.id, action]));
    const route = currentRoute();
    const activeModule = visibleModules.find((module) => module.key === route.moduleKey) || visibleModules[0];
    const rows = [];
    const seen = new Set();

    if (settings.includeActiveModuleTabs && activeModule) {
      getVisibleModuleTabs(activeModule)
        .slice(0, settings.activeModuleTabLimit)
        .forEach((tab) => {
          const id = routeActionId(activeModule.key, tab[0]);
          const action = byId.get(id);
          if (action && !seen.has(id)) {
            rows.push({ ...action, contextual: true });
            seen.add(id);
          }
        });
    }

    settings.items.forEach((id) => {
      const action = byId.get(id);
      if (!action || seen.has(id)) return;
      rows.push(action);
      seen.add(id);
    });

    return rows.slice(0, settings.maxItems);
  }, [catalog, settings, visibleModules]);

  useEffect(() => {
    if (!isAuthenticated || !settings.enabled) {
      setMenu((current) => current.open ? { ...current, open: false } : current);
      return undefined;
    }

    const onPointerUp = (event) => {
      if (event.button !== 0 || event.pointerType === "touch") return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(INTERACTIVE_SELECTOR)) return;
      const shell = target.closest(".shell-v3");
      if (!shell) return;
      if (settings.blankAreaOnly && !target.closest(".shell-v3-workspace")) return;
      const selectedText = String(window.getSelection?.()?.toString?.() || "").trim();
      if (selectedText) return;
      const position = clampPosition(event.clientX, event.clientY, actions.length);
      setNotice("");
      setMenu({ open: true, ...position });
    };

    const close = (event) => {
      if (event?.type === "keydown" && event.key !== "Escape") return;
      setMenu((current) => current.open ? { ...current, open: false } : current);
    };

    document.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("popstate", close);
    return () => {
      document.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("popstate", close);
    };
  }, [actions.length, isAuthenticated, settings.blankAreaOnly, settings.enabled]);

  async function runAction(action) {
    setNotice("");
    const route = parseRouteActionId(action.id);
    if (route) {
      navigate(route.moduleKey, route.tabKey);
      setMenu((current) => ({ ...current, open: false }));
      return;
    }

    if (action.id === "shell:module-home") {
      const routeNow = currentRoute();
      const module = visibleModules.find((item) => item.key === routeNow.moduleKey) || visibleModules[0];
      const tab = getVisibleModuleTabs(module)[0];
      if (module && tab) navigate(module.key, tab[0]);
    } else if (action.id === "shell:quick") {
      document.querySelector(".shell-v3-quick-button")?.click();
    } else if (action.id === "shell:search") {
      document.querySelector(".shell-v3-search input")?.focus();
    } else if (action.id === "shell:back") {
      window.history.back();
    } else if (action.id === "shell:copy-link") {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setNotice("Bağlantı kopyalandı");
        window.setTimeout(() => setMenu((current) => ({ ...current, open: false })), 450);
        return;
      } catch {
        setNotice("Bağlantı kopyalanamadı");
        return;
      }
    } else if (action.id === "shell:print") {
      window.print();
    } else if (action.id === "shell:refresh") {
      window.location.reload();
      return;
    } else if (action.id === "shell:fullscreen") {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else await document.documentElement.requestFullscreen?.();
    } else if (action.id === "shell:new-tab") {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
    }
    setMenu((current) => ({ ...current, open: false }));
  }

  if (!isAuthenticated || !settings.enabled || !menu.open) return null;

  const route = currentRoute();
  const activeModule = visibleModules.find((module) => module.key === route.moduleKey);
  const builtinIds = new Set(LEFT_CLICK_BUILTINS.map((item) => item.id));

  return (
    <section
      className={`ky-left-click-menu ${settings.compact ? "compact" : ""}`}
      data-ky-left-click-menu="true"
      role="menu"
      aria-label="Sol tık hızlı menüsü"
      style={{ left: menu.left, top: menu.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header>
        <span><ErpIcon name={activeModule?.icon || "hizli"} size={16} /></span>
        <div><strong>Sol Tık Menüsü</strong><small>{activeModule?.label || "KY ERP"}</small></div>
      </header>
      <div className="ky-left-click-menu-list">
        {actions.map((action) => (
          <button type="button" role="menuitem" key={action.id} onClick={() => runAction(action)}>
            {settings.showIcons ? <i><ErpIcon name={action.icon || "hizli"} size={16} /></i> : null}
            <span><strong>{action.label}</strong><small>{action.contextual ? "Bu modül" : action.moduleLabel || action.description}</small></span>
            {builtinIds.has(action.id) ? <em>İşlem</em> : null}
          </button>
        ))}
        {!actions.length ? <div className="ky-left-click-menu-empty">Bu menü için aktif işlem seçilmemiş.</div> : null}
      </div>
      {notice ? <footer>{notice}</footer> : null}
    </section>
  );
}
