import React from "react";

export function MobileLoading({ text = "Yükleniyor..." }) {
  return (
    <div className="ky-mobile-page" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh", flexDirection: "column", gap: "10px" }}>
      <div className="ky-mobile-spinner" style={{ width: "40px", height: "40px", border: "4px solid #f3f3f3", borderTop: "4px solid var(--primary)", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
      <div className="ky-mobile-muted">{text}</div>
      <style>
        {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
      </style>
    </div>
  );
}

export function MobileError({ message = "Veri alınamadı", onRetry }) {
  return (
    <div className="ky-mobile-page" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh", flexDirection: "column", gap: "15px", padding: "20px", textAlign: "center" }}>
      <div style={{ fontSize: "40px" }}>⚠️</div>
      <div style={{ color: "var(--red)", fontWeight: "bold" }}>{message}</div>
      {onRetry && (
        <button className="ky-mobile-btn primary" onClick={onRetry}>
          Tekrar Dene
        </button>
      )}
    </div>
  );
}

export function MobileEmpty({ text = "Kayıt bulunamadı" }) {
  return (
    <div className="ky-mobile-page" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh", flexDirection: "column", gap: "10px", color: "var(--muted)" }}>
      <div style={{ fontSize: "40px" }}>📭</div>
      <div>{text}</div>
    </div>
  );
}
