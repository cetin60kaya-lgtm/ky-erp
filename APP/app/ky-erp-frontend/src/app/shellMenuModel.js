// Tek kaynak: moduleRegistry gruplarını, yeni rota veya sekme kopyası üretmeden menüye hazırlar.
export function buildShellMenuSections(module, groups = []) {
  const source = Array.isArray(groups) ? groups : [];
  return source.filter((group) => Array.isArray(group?.tabs) && group.tabs.length > 0).map((group, index) => {
    const firstTab = group.tabs[0];
    const matchingSidebar = (module?.sidebarGroups || []).find(([key]) =>
      group.tabs.some(([tabKey]) => tabKey === key),
    );
    return {
      id: `${module?.key || "module"}:${index}`,
      label: group.label || module?.label || "İşlemler",
      icon: matchingSidebar?.[2] || firstTab?.[2] || module?.icon || "dashboard",
      tabs: group.tabs,
    };
  });
}

export function isShellMenuSectionOpen(override, sectionId, containsActiveTab) {
  return override ? override === sectionId : Boolean(containsActiveTab);
}

export function toggleShellMenuSection(override, sectionId, containsActiveTab) {
  return isShellMenuSectionOpen(override, sectionId, containsActiveTab)
    ? `closed:${sectionId}`
    : sectionId;
}
