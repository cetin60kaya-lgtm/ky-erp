import { ImageOff } from "lucide-react";

export function Status({ children, tone = "blue" }) {
  return <span className={`iw-status ${tone}`}>{children}</span>;
}

export function Field({ label, children }) {
  return (
    <label className="iw-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function InfoLine({ label, value }) {
  return (
    <div className="iw-info-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function VisualBox({ label = "Model / Desen Görseli", src = "" }) {
  return (
    <div className="iw-visual">
      {src ? (
        <img src={src} alt={label} />
      ) : (
        <span className="iw-visual-empty">
          <ImageOff size={26} />
          {label}
        </span>
      )}
    </div>
  );
}
