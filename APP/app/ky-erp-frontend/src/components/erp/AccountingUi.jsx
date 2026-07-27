import { ErpIcon } from "./IconMap";

export function AccountingPageShell({
  title,
  subtitle,
  breadcrumb = ["KY ERP", "Muhasebe"],
  children,
}) {
  return (
    <div className="kyerp-page">
      <header className="kyerp-header">
        <div className="kyerp-breadcrumb" aria-label="Sayfa yolu">
          {breadcrumb.map((item, index) => (
            <span key={`${item}-${index}`}>
              {index > 0 ? <span className="kyerp-breadcrumb-sep">/</span> : null}
              <span className={index === breadcrumb.length - 1 ? "is-current" : ""}>
                {item}
              </span>
            </span>
          ))}
        </div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      {children}
    </div>
  );
}

export function KpiCard({ icon, label, value, subText, tone = "blue" }) {
  return (
    <div className="kyerp-kpi">
      <span className={`kyerp-icon-badge tone-${tone}`}>
        <ErpIcon name={icon} size={24} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {subText ? <small>{subText}</small> : null}
      </div>
    </div>
  );
}

export function SectionCard({ title, icon, actions, children, className = "" }) {
  return (
    <section className={`kyerp-card ${className}`}>
      <div className="kyerp-card-title">
        <div>
          {icon ? <ErpIcon name={icon} size={18} /> : null}
          <h3>{title}</h3>
        </div>
        {actions ? <div className="kyerp-card-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({ children, tone = "info" }) {
  return <span className={`kyerp-badge kyerp-badge-${tone}`}>{children}</span>;
}

export function EmptyState({ title = "Kayıt bulunamadı.", text = "" }) {
  return (
    <div className="kyerp-empty">
      <ErpIcon name="bilgi" size={28} />
      <strong>{title}</strong>
      {text ? <span>{text}</span> : null}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Ara..." }) {
  return (
    <label className="kyerp-search">
      <ErpIcon name="ara" size={16} />
      <input value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  );
}

export function IconButton({
  icon,
  label,
  tone = "secondary",
  className = "",
  ...props
}) {
  return (
    <button
      className={`kyerp-icon-button kyerp-button-${tone} ${className}`}
      title={label}
      aria-label={label}
      type="button"
      {...props}
    >
      <ErpIcon name={icon} size={15} />
      {label ? <span>{label}</span> : null}
    </button>
  );
}

export function UploadDropzone({ title, text }) {
  return (
    <div className="kyerp-upload">
      <ErpIcon name="yukle" size={26} />
      <strong>{title}</strong>
      {text ? <span>{text}</span> : null}
    </div>
  );
}
