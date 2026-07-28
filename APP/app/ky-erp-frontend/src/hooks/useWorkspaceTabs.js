import { useCallback, useMemo, useState } from "react";

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
    setActiveRoute({ moduleKey: item.moduleKey, tabKey: item.tabKey });
  }, []);

  const closeTab = useCallback((id) => {
    if (tabs.length === 1) return;

    const index = tabs.findIndex((item) => item.id === id);
    if (index < 0) return;

    const nextTabs = tabs.filter((item) => item.id !== id);
    setTabs(nextTabs);

    if (id === activeId) {
      const fallback = nextTabs[Math.max(0, index - 1)] || nextTabs[0];
      if (fallback) {
        setActiveRoute({ moduleKey: fallback.moduleKey, tabKey: fallback.tabKey });
      }
    }
  }, [activeId, tabs]);

  const replaceActiveRoute = useCallback(
    (moduleKey, tabKey) => {
      const next = {
        id: tabId(moduleKey, tabKey),
        moduleKey,
        tabKey,
        label: resolveLabel(moduleKey, tabKey),
      };
      setTabs((current) => {
        const oldId = tabId(activeRoute.moduleKey, activeRoute.tabKey);
        const withoutOld = current.filter((item) => item.id !== oldId);
        return withoutOld.some((item) => item.id === next.id)
          ? withoutOld
          : [...withoutOld, next];
      });
      setActiveRoute({ moduleKey, tabKey });
    },
    [activeRoute.moduleKey, activeRoute.tabKey, resolveLabel],
  );

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
