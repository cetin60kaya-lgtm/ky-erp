import { nextDocumentSort } from "./documentListSort";

export default function DocumentSortHeader({ label, column, sort, onChange }) {
  const active = sort?.sortBy === column;
  return <button type="button" className="accounting-sort-header"
    aria-label={`${label} artan veya azalan sırala`} aria-pressed={active}
    onClick={() => onChange(nextDocumentSort(sort, column))}>
    {label} <span aria-hidden="true">{active ? (sort.sortDirection === "ASC" ? "↑" : "↓") : "↕"}</span>
  </button>;
}
