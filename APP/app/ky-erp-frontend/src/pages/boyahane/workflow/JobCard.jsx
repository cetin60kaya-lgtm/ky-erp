import { JOB_STATUS, formatDate, statusTone } from "./boyahaneFormat";
import ModelThumbnail from "./ModelThumbnail";

export default function JobCard({ job, onOpen, onStart, onPause }) {
  const status = JOB_STATUS[job?.status] || job?.status || "-";
  return (
    <article className={`bh-job-card ${job?.status === "ACTIVE" ? "active" : ""}`}>
      <ModelThumbnail src={job?.imageUrl} alt={job?.modelName} size="card" className="bh-job-image" />
      <div className="bh-job-main">
        <div className="bh-job-title">
          <div><h3>{job?.modelName || "Adsız model"}</h3><p>{job?.companyName || "Firma bilgisi yok"}</p></div>
          <span className={`bh-status ${statusTone(job?.status)}`}>{status}</span>
        </div>
        <div className="bh-job-facts">
          <span><b>Sipariş</b>{job?.orderNo || "-"}</span>
          <span><b>Baskı</b>{job?.printRegion || "-"}</span>
          <span><b>Planlanan</b>{Number(job?.plannedQuantity || 0).toLocaleString("tr-TR")}</span>
          <span><b>Kanal</b>{job?.channelCount || 0}</span>
          <span><b>Benzersiz renk</b>{job?.uniqueColorCount || job?.colors?.length || 0}</span>
          <span><b>Kalıp</b>{job?.moldCount || 0}</span>
          <span><b>Hazır / Bekleyen</b>{job?.preparedColorCount || 0} / {job?.pendingColorCount || 0}</span>
          <span><b>Öncelik</b>{job?.priority || "NORMAL"}</span>
          <span><b>Oluşturma</b>{formatDate(job?.createdAt)}</span>
        </div>
        <div className="bh-job-actions">
          {job?.status !== "COMPLETED" && job?.status !== "ACTIVE" ? <button className="bh-btn primary" onClick={() => onStart(job)}>İşe Başla</button> : null}
          <button className="bh-btn" onClick={() => onOpen(job)}>{job?.status === "COMPLETED" ? "Tamamlananı Gör" : "İşi Aç"}</button>
          {job?.status === "ACTIVE" ? <button className="bh-btn" onClick={() => onPause(job)}>Beklemeye Al</button> : null}
        </div>
      </div>
    </article>
  );
}
