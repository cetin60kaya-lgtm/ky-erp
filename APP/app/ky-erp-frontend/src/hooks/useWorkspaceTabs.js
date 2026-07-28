import { useCallback, useMemo, useRef, useState } from "react";

function tabId(moduleKey, tabKey) {
  return `${moduleKey}:${tabKey}`;
}

export function useWorkspaceTabs(initialRoute, resolveLabel) {
  const [activeRoute, setActiveRoute] = useState(initialRoute);
  const [tabs, setTabs] = useState(() => [
    {
      id: tabId(initialRoute.moduleKey, initialRoute.tabKey),
      ...initialRoute,
      label: resolveLabel(initialRoute.moduleKey, initialRoute.tabKey),
    },
  ]);
  const tabsRef = useRef(tabs);
  const activeRouteRef = useRef(activeRoute);

  tabsRef.current = tabs;
  activeRouteRef.current = activeRoute;

  const activeId = useMemo(
    () => tabId(activeRoute.moduleKey, activeRoute.tabKey),
    [activeRoute],
  );

  const openTab = useCallback(
    (moduleKey, tabKey) => {
      const next = {
        id: tabId(moduleKey, tabKey),
        moduleKey,
        tabKey,
        label: resolveLabel(moduleKey, tabKey),
      };
      setTabs((current) =>
        current.some((item) => item.id === next.id)
          ? current
          : [...current, next],
      );
      setActiveRoute({ moduleKey, tabKey });
      return next;
    },
    [resolveLabel],
  );

  const activateTab = useCallback((item) => {
    if (!item) return;
    setActiveRoute({ moduleKey: item.moduleKey, tabKey: item.tabKey });
  }, []);

  const closeTab = useCallback((id) => {
    const current = tabsRef.current;
    if (current.length <= 1) return;

    const index = current.findIndex((item) => item.id === id);
    if (index < 0) return;

    const next = current.filter((item) => item.id !== id);
    const currentActiveId = tabId(
      activeRouteRef.current.moduleKey,
      activeRouteRef.current.tabKey,
    );

    setTabs(next);
    if (id === currentActiveId) {
      activateTab(next[Math.max(0, index - 1)] || next[0]);
    }
  }, [activateTab]);

  const replaceActiveRoute = useCallback((moduleKey, tabKey) => {
    const nextId = tabId(moduleKey, tabKey);
    const next = {
      id: nextId,
      moduleKey,
      tabKey,
      label: resolveLabel(moduleKey, tabKey),
    };

    setTabs((current) => {
      if (current.some((item) => item.id === nextId)) return current;
      return [...current, next];
    });
    setActiveRoute({ moduleKey, tabKey });
  }, [resolveLabel]);

  return {
    tabs,
    activeRoute,
    activeId,
    openTab,
    activateTab,
    closeTab,
    replaceActiveRoute,
  };
}
