import { Archive, Download, Eye, File, Trash2, Upload } from "lucide-react";
import { fileDownloadUrl, filePreviewUrl } from "../../services/desenService";

export default function FileCard({ activeMainCompany, title, hint, fileId, status, accept, onUpload, onDelete, infoOnly }) {
  const isDone = Boolean(fileId);
  return (
    <div className={`desen-file-card ${infoOnly ? "info" : isDone ? "done" : "missing"}`}>
      <div className="desen-file-icon">{infoOnly ? <Archive size={18} /> : <File size={18} />}</div>
      <div className="desen-file-main">
        <strong>{title}</strong>
        <span>{status || (isDone ? "Yüklendi" : hint || "Dosya bekliyor")}</span>
        <div className="desen-file-actions">
          {fileId ? (
            <>
              <a href={filePreviewUrl(activeMainCompany, fileId)} target="_blank" rel="noreferrer" title="Önizle"><Eye size={16} /></a>
              <a href={fileDownloadUrl(activeMainCompany, fileId)} title="İndir"><Download size={16} /></a>
              <button type="button" onClick={onDelete} title="Sil"><Trash2 size={16} /></button>
            </>
          ) : null}
          {!infoOnly ? (
            <label className="icon-upload" title={isDone ? "Değiştir" : "Yükle"}>
              <Upload size={16} />
              <input type="file" accept={accept} onChange={(event) => onUpload?.(event?.target.files?.[0])} />
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}

