import React from "react";

const NAV_ITEMS = [
  ["ozet", "Kontrol Merkezi"],
  ["personel", "Personel"],
  ["ucret", "Ücret Planı"],
  ["hareket", "Mesai / Avans"],
  ["izin", "Yıllık İzin"],
  ["bordro", "Bordro / Ödeme"],
  ["evrak", "SGK / Ay Sonu"],
];

export default function IkMonthlyProShell({
  page,
  onNavigate,
  year,
  month,
  months,
  onPeriodChange,
  periodPrepared,
  isLocked,
  balanced,
  issueCount,
  employeeCount,
  sgkCount,
  payrollCount,
  companyName,
  children,
}) {
  const reviewDone = periodPrepared && balanced && issueCount === 0;
  const payrollReady = periodPrepared && balanced && payrollCount > 0;
  const stages = [
    { label: "Dönem Hazırlığı", done: periodPrepared, active: !periodPrepared },
    { label: "Kontrol", done: reviewDone, active: periodPrepared && !reviewDone },
    { label: "Bordro Hazır", done: payrollReady, active: reviewDone && !payrollReady },
    { label: "Ay Kilidi", done: isLocked, active: payrollReady && !isLocked },
  ];

  return (
    <div className="ik-pro-shell">
      <header className="ik-pro-command">
        <div className="ik-pro-identity">
          <span className="ik-pro-kicker">{companyName || "KY ERP"}</span>
          <h1>İK Aylık Kontrol Merkezi</h1>
          <p>Maaş, hareket, izin, bordro, ödeme ve ay kapanışı tek kontrollü akışta.</p>
        </div>
        <div className="ik-pro-period-panel">
          <div className="ik-pro-period-fields">
            <label>Yıl<select value={year} onChange={(event) => onPeriodChange(Number(event.target.value), month)}>{[2025, 2026, 2027, 2028].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Ay<select value={month} onChange={(event) => onPeriodChange(year, Number(event.target.value))}>{months.map((item, index) => <option key={item} value={index + 1}>{item}</option>)}</select></label>
          </div>
          <div className="ik-pro-status-row">
            <span className={`ik-pro-pill ${isLocked ? "danger" : "neutral"}`}>{isLocked ? "Dönem Kapalı" : "Dönem Açık"}</span>
            <span className={`ik-pro-pill ${balanced ? "success" : "warning"}`}>{balanced ? "Ödeme Dengeli" : "Ödeme Kontrolü"}</span>
          </div>
        </div>
      </header>

      <nav className="ik-pro-nav" aria-label="İK aylık bölümleri">
        {NAV_ITEMS.map(([key, label]) => (
          <button type="button" key={key} className={page === key ? "active" : ""} aria-current={page === key ? "page" : undefined} onClick={() => onNavigate(key)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="ik-pro-overview-strip">
        <div className="ik-pro-people">
          <span><b>{employeeCount}</b>Dönem personeli</span>
          <span><b>{sgkCount}</b>SGK'lı</span>
          <span><b>{issueCount}</b>Açık kontrol</span>
          <span><b>{payrollCount || "—"}</b>Bordro satırı</span>
        </div>
        <div className="ik-pro-flow" aria-label="Ay sonu ilerleme">
          {stages.map((stage, index) => (
            <div key={stage.label} className={`ik-pro-step ${stage.done ? "done" : stage.active ? "active" : ""}`}>
              <span>{stage.done ? "✓" : index + 1}</span>
              <b>{stage.label}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="ik-pro-content">{children}</div>
    </div>
  );
}
