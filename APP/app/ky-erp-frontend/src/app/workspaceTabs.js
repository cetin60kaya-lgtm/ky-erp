// Açık çalışma sekmeleri tek yerde yönetilir; gizlenen sekmeler kapanmaz.
// Aktif sekme her zaman görünür ve kalanlara 'Diğer sekmeler' menüsünden erişilir.
export function partitionWorkspaceTabs(tabs = [], activeTabId, maxVisible = 6) {
  const all = Array.isArray(tabs) ? tabs : [];
  const capacity = Math.max(1, Math.floor(Number(maxVisible) || 6));
  const initial = all.slice(0, capacity);
  const active = all.find((tab) => tab.id === activeTabId);
  const visible = all.length > capacity && active && !initial.some((tab) => tab.id === active.id)
    ? [...initial.slice(0, capacity - 1), active]
    : initial;
  const visibleIds = new Set(visible.map((tab) => tab.id));
  return { visible, overflow: all.filter((tab) => !visibleIds.has(tab.id)) };
}
