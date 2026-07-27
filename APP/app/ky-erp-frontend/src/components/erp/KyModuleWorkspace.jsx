import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import "./KyModuleWorkspace.css";

export function KyPageHeader({ eyebrow, title, description, actions, status }) {
  return (
    <header className="kyws-header">
      <div className="kyws-header__copy">
        {eyebrow ? <small>{eyebrow}</small> : null}
        <div className="kyws-header__title-row">
          <h1>{title}</h1>
          {status ? <span className={`kyws-status kyws-status--${status.tone || "neutral"}`}>{status.label}</span> : null}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="kyws-header__actions">{actions}</div> : null}
    </header>
  );
}

export function KyMetricStrip({ items = [] }) {
  return (
    <section className="kyws-metrics">
      {items.map((item) => (
        <article key={item.key || item.label} className={`kyws-metric kyws-metric--${item.tone || "blue"}`}>
          <small>{item.label}</small>
          <strong>{item.value ?? "—"}</strong>
          {item.note ? <span>{item.note}</span> : null}
        </article>
      ))}
    </section>
  );
}

export function KyFilterPanel({ open, onToggle, children, activeCount = 0, title = "Filtreler" }) {
  return (
    <aside className={`kyws-filter ${open ? "is-open" : "is-closed"}`}>
      <button className="kyws-filter__toggle" type="button" onClick={onToggle} title={open ? "Filtre panelini kapat" : "Filtre panelini aç"}>
        {open ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        <span>{open ? title : activeCount ? String(activeCount) : ""}</span>
      </button>
      {open ? (
        <div className="kyws-filter__body">
          <div className="kyws-filter__head"><Filter size={16} /><strong>{title}</strong>{activeCount ? <span>{activeCount}</span> : null}</div>
          {children}
        </div>
      ) : null}
    </aside>
  );
}

export function KyActiveFilters({ items = [], onRemove, onClear }) {
  if (!items.length) return null;
  return (
    <div className="kyws-active-filters">
      {items.map((item) => (
        <button key={item.key} type="button" onClick={() => onRemove?.(item.key)}>
          <span>{item.label}</span><X size={13} />
        </button>
      ))}
      <button type="button" className="clear" onClick={onClear}>Tümünü temizle</button>
    </div>
  );
}

export function KyTableToolbar({
  search,
  onSearch,
  searchPlaceholder = "Ara",
  left,
  right,
  count,
  onRefresh,
  loading = false,
}) {
  return (
    <div className="kyws-toolbar">
      <label className="kyws-search">
        <Search size={16} />
        <input value={search || ""} onChange={(event) => onSearch?.(event.target.value)} placeholder={searchPlaceholder} />
      </label>
      {left ? <div className="kyws-toolbar__group">{left}</div> : null}
      <div className="kyws-toolbar__spacer" />
      {typeof count === "number" ? <span className="kyws-toolbar__count">{count.toLocaleString("tr-TR")} kayıt</span> : null}
      {onRefresh ? (
        <button type="button" className="kyws-btn kyws-btn--secondary" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={15} className={loading ? "kyws-spin" : ""} /> Yenile
        </button>
      ) : null}
      {right ? <div className="kyws-toolbar__group">{right}</div> : null}
    </div>
  );
}

export function KyDataTable({ columns = [], rows = [], rowKey = "id", emptyTitle = "Kayıt bulunamadı", emptyText = "Filtreleri değiştirip tekrar deneyin.", onRowClick, selectedKey }) {
  return (
    <div className="kyws-table-wrap">
      <table className="kyws-table">
        <thead><tr>{columns.map((column) => <th key={column.key} style={column.width ? { width: column.width } : undefined}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const key = typeof rowKey === "function" ? rowKey(row, index) : row[rowKey] ?? index;
            return (
              <tr key={key} className={selectedKey === key ? "is-selected" : ""} onClick={() => onRowClick?.(row)}>
                {columns.map((column) => <td key={column.key}>{column.render ? column.render(row, index) : row[column.key] ?? "—"}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length ? <div className="kyws-empty"><strong>{emptyTitle}</strong><span>{emptyText}</span></div> : null}
    </div>
  );
}

export function KyPagination({ page = 1, pageSize = 50, total = 0, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <footer className="kyws-pagination">
      <span>{total.toLocaleString("tr-TR")} kayıt · {page}/{pages} sayfa</span>
      <select value={pageSize} onChange={(event) => onPageSize?.(Number(event.target.value))}>
        {[25, 50, 100].map((size) => <option key={size} value={size}>{size} / sayfa</option>)}
      </select>
      <button type="button" disabled={page <= 1} onClick={() => onPage?.(page - 1)}><ChevronLeft size={16} /></button>
      <button type="button" disabled={page >= pages} onClick={() => onPage?.(page + 1)}><ChevronRight size={16} /></button>
    </footer>
  );
}

export function KyWorkspace({ filter, children, className = "" }) {
  return <section className={`kyws-layout ${className}`}>{filter}{<div className="kyws-content">{children}</div>}</section>;
}

export function KyModal({ open, title, description, onClose, children, footer, size = "lg" }) {
  if (!open) return null;
  return (
    <div className="kyws-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className={`kyws-modal kyws-modal--${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div><button type="button" onClick={onClose}><X size={18} /></button></header>
        <div className="kyws-modal__body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}

export function KyTabs({ items = [], active, onChange }) {
  return <nav className="kyws-tabs">{items.map((item) => <button key={item.key} type="button" className={active === item.key ? "is-active" : ""} onClick={() => onChange?.(item.key)}>{item.label}{item.count != null ? <span>{item.count}</span> : null}</button>)}</nav>;
}

export function useKyFilters(initial = {}) {
  const [filters, setFilters] = useState(initial);
  const activeItems = useMemo(() => Object.entries(filters).filter(([, value]) => value !== "" && value !== "all" && value != null && value !== false).map(([key, value]) => ({ key, label: `${key}: ${String(value)}` })), [filters]);
  return {
    filters,
    setFilters,
    patchFilter: (key, value) => setFilters((current) => ({ ...current, [key]: value })),
    activeItems,
    clearFilter: (key) => setFilters((current) => ({ ...current, [key]: initial[key] ?? "" })),
    clearAll: () => setFilters(initial),
  };
}
