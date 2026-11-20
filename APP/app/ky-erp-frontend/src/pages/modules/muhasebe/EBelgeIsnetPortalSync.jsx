import { FileCheck2, FileText, FolderOpen, HardDrive, Link2, LockKeyhole, Monitor, ShieldCheck } from "lucide-react";
import "./eBelgeIsnetPortalSync.css";

const LOCAL_ARCHIVE_URL = "http://127.0.0.1:8790/";
const DIRECTIONS = [
  ["Gelen e-Fatura","Orijinal XML + PDF"],
  ["Giden e-Fatura","Orijinal XML + PDF"],
  ["Gelen e-İrsaliye","Orijinal XML + PDF"],
  ["Giden e-İrsaliye","Orijinal XML + PDF"],
];

export default function EBelgeIsnetPortalSync({ activeMainCompany, openModule, enabled=true }) {
  return <section className="eis-local" aria-label="İşNet Drive yerel arşiv merkezi">
    <header className="eis-local-head">
      <div>
        <span className="eis-local-kicker"><ShieldCheck size={15}/> İŞNET · TEK YEREL ENTEGRASYON</span>
        <h3>İşNet Belgelerini Arşive Al</h3>
        <p>Gerçek NetteFatura bağlantısı DESEN bilgisayarında çalışır. Orijinal XML ve PDF, Google Drive'ın eşitlediği tek yerel klasöre alınır.</p>
      </div>
      <span className="eis-local-tag"><HardDrive size={15}/> Google Drive eşitleme klasörü</span>
    </header>
    <div className="eis-local-steps" aria-label="İşlem sırası">
      <div><b>1</b><strong>İşNet'e bağlan</strong><small>Şifre yalnız yerel oturumda</small></div>
      <div><b>2</b><strong>Dört belge türünü al</strong><small>XML + PDF, tek arşiv</small></div>
      <div><b>3</b><strong>Havuzda kontrol et</strong><small>File Hub bağlantısıyla ilişkilendir</small></div>
    </div>
    <div className="eis-local-main">
      <div>
        <strong><Monitor size={18}/> DESEN · Yerel İşNet Aktarımı</strong>
        <p>İşNet portalını tekrar KY ERP bulut sunucusundan giriş yaptırmaya çalışmayacağız. Çalışan yerel bağlantı üzerinden belgeler doğrudan arşivlenir; tarayıcının İndirilenler klasörüne ikinci belge kopyası oluşturulmaz.</p>
        <a className="eis-local-open" href={LOCAL_ARCHIVE_URL} target="_blank" rel="noopener noreferrer">
          <FolderOpen size={17}/> Yerel İşNet Arşivini Aç
        </a>
        <small className="eis-local-hint">Bu adres yalnız aktarımı çalıştıran DESEN bilgisayarında açılır. Başka bilgisayarlarda belgeler Google Drive eşitlemesi üzerinden görülür.</small>
      </div>
      <div className="eis-local-destination">
        <span><HardDrive size={17}/> TEK FİZİKSEL ARŞİV</span>
        <strong>Hakan Emp / Firma Yedekleri / ISNET_EBELGE</strong>
        <small>Gelen/Giden Fatura · Gelen/Giden İrsaliye</small>
        <small>Her belge: 1 orijinal XML + 1 orijinal PDF + küçük SHA-256 kayıt dosyası</small>
      </div>
    </div>
    <div className="eis-local-directions">
      {DIRECTIONS.map(([title,detail])=><div key={title}><FileText size={16}/><span><strong>{title}</strong><small>{detail}</small></span><FileCheck2 size={15}/></div>)}
    </div>
    <div className="eis-local-actions">
      <button type="button" onClick={()=>openModule?.("e-belge",{tabKey:"belge-havuzu"})}><FolderOpen size={16}/> KY ERP Belge Havuzu</button>
      <button type="button" onClick={()=>openModule?.("e-belge",{tabKey:"eslestirmeler"})}><Link2 size={16}/> Fatura–İrsaliye Eşleşmeleri</button>
    </div>
    <div className="eis-local-warning"><LockKeyhole size={17}/>
      <span>Yerel arşiv ve Google Drive eşitlemesi ayrı, KY ERP D1/Belge Havuzu kaydı ayrıdır. File Hub E_DOCUMENT bağlantısı canlı doğrulanana kadar Drive'daki belge otomatik muhasebe kaydı sayılmaz. Resmî fatura gönderimi veya kesin mali kayıt yapılmaz.</span>
    </div>
    {!enabled && <p role="alert" className="eis-local-disabled">Bu firma için İşNet entegrasyonu pasif; ERP'ye bağlantı izni ayrıca kontrol edilmelidir.</p>}
    {activeMainCompany?.name && <small className="eis-local-footer">KY ERP'de seçili şirket: {activeMainCompany.name}</small>}
  </section>;
}
