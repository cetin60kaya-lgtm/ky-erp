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

  const closeTab = useCallback(
    (id) => {
      let fallback = null;
      setTabs((current) => {
        const index = current.findIndex((item) => item.id === id);
        if (index < 0 || current.length === 1) return current;
        const next = current.filter((item) => item.id !== id);
        if (id === activeId) fallback = next[Math.max(0, index - 1)] || next[0];
        return next;
      });
      if (fallback) activateTab(fallback);
    },
    [activeId, activateTab],
  );

  return {
    tabs,
    activeRoute,
    activeId,
    openTab,
    activateTab,
    closeTab,
  };
}
