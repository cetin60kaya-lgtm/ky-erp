// Başlık kaynağı: modül ve işlem, aynı isimler tekrar edilmez.
export function workspaceTabTitle(moduleLabel,tabLabel) {
  if (!moduleLabel)return tabLabel || "Ekran";
  if (!tabLabel || moduleLabel===tabLabel)return moduleLabel;
  return `${moduleLabel} · ${tabLabel}`;
}
export function breadcrumbTitles(groupLabel,moduleLabel,tabLabel) {
  return [groupLabel,moduleLabel,tabLabel].filter((value,index,all)=>Boolean(value) && value!==all[index-1]);
}
