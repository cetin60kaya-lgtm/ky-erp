import { Download, Printer, ZoomIn, ZoomOut } from "lucide-react";
import { fileDownloadUrl, filePreviewUrl } from "../../services/desenService";

export default function PdfPreviewPanel({ activeMainCompany, fileId }) {
  return (
    <div className="pdf-preview-panel">
      <div className="pdf-preview-toolbar">
        <span>Sayfa 1 / 1</span>
        <button type="button" title="Yakınlaştır"><ZoomIn size={16} /></button>
        <button type="button" title="Uzaklaştır"><ZoomOut size={16} /></button>
        {fileId ? <a href={fileDownloadUrl(activeMainCompany, fileId)} title="İndir"><Download size={16} /></a> : null}
        <button type="button" title="Yazdır"><Printer size={16} /></button>
      </div>
      {fileId ? (
        <iframe title="Yerleşim PDF Önizleme" src={filePreviewUrl(activeMainCompany, fileId)} />
      ) : (
        <div className="placement-blueprint">
          <div className="garment-outline">
            <div className="neck" />
            <div className="center-line" />
            <div className="print-block">Baskı Görseli</div>
            <div className="measure-arrow top">Üst mesafe</div>
            <div className="measure-arrow width">Baskı en / boy</div>
          </div>
          <strong>Yerleşim PDF yükleyin</strong>
          <span>Beden, kalıp çizimi, baskı konumu ve teknik ölçüler burada görüntülenir.</span>
        </div>
      )}
    </div>
  );
}

