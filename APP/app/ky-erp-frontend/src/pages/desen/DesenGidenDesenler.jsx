import { CheckCircle2, ExternalLink, FolderOpen, Mail, ShieldCheck } from "lucide-react";

export default function DesenGidenDesenler() {
  const openFolder = () => window.open("https://drive.google.com/drive/folders/11CHAtYphe1VshRhDdMER6umgxHJ9a5wt", "_blank", "noopener,noreferrer");
  return (
    <div className="dsg-outgoing-page">
      <section className="dsg-toolbar-card dsg-outgoing-hero">
        <div>
          <span className="dsg-status green"><CheckCircle2 size={14} /> Otomasyon tanımlı</span>
          <h2>Giden Desen Otomatik Gönderim</h2>
          <p>Google Drive’daki giden desenler klasörüne yeni dosya eklendiğinde bildirim akışı otomatik çalışır.</p>
        </div>
        <button type="button" className="dsg-btn primary" onClick={openFolder}>
          <FolderOpen size={16} /> Google Drive Klasörünü Aç <ExternalLink size={14} />
        </button>
      </section>
      <section className="dsg-outgoing-grid">
        <article className="dsg-toolbar-card"><h3><FolderOpen size={17} /> İzlenen klasör</h3><strong>giden desenler</strong><small>Google Drive sabit klasörü</small></article>
        <article className="dsg-toolbar-card"><h3><Mail size={17} /> Gönderen</h3><strong>Desen sistem maili</strong><small>Gmail bağlantısı</small></article>
        <article className="dsg-toolbar-card"><h3><Mail size={17} /> Alıcı</h3><strong>Tanımlı desen alıcısı</strong><small>Yeni desen bildirimi</small></article>
      </section>
      <section className="dsg-toolbar-card dsg-outgoing-rules">
        <h3><ShieldCheck size={17} /> Çalışma kuralı</h3>
        <div className="dsg-storage-facts">
          <span><CheckCircle2 size={14} /><strong>İlk kurulum:</strong> mevcut eski dosyalar gönderilmez.</span>
          <span><CheckCircle2 size={14} /><strong>Yeni dosya:</strong> yalnız bir kez bildirilir.</span>
          <span><CheckCircle2 size={14} /><strong>Dosya izni:</strong> Drive paylaşım yetkileri değiştirilmez.</span>
          <span><CheckCircle2 size={14} /><strong>Kanal:</strong> Gmail otomatik bildirimi.</span>
        </div>
      </section>
    </div>
  );
}
