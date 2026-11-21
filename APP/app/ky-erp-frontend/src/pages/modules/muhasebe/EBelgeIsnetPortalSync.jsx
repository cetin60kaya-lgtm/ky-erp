import { useState } from "react";
import { FileCheck2, FileText, FolderOpen, HardDrive, Link2, LockKeyhole, Monitor, ShieldCheck } from "lucide-react";
import "./eBelgeIsnetPortalSync.css";

const LOCAL_ARCHIVE_URL = "http://127.0.0.1:8791/";
const DIRECTIONS = [
  ["Gelen e-Fatura","Orijinal XML + PDF"],
  ["Giden e-Fatura","Orijinal XML + PDF"],
  ["Gelen e-İrsaliye","Orijinal XML + PDF"],
  ["Giden e-İrsaliye","Orijinal XML + PDF"],
];

export default function EBelgeIsnetPortalSync({ activeMainCompany, openModule, enabled=true }) {
  const [localOpen,setLocalOpen]=useState(false);
  return <section className="eis-local" aria-label="İşNet Drive yerel arşiv merkezi">
    <header className="eis-local-head">
      <div>
        <span className="eis-local-kicker"><ShieldCheck size={15}/> İŞNET · TEK YEREL ENTEGRASYON</span>
        <h3>İşNet Belgelerini Arşive Al</h3>
        <p>İşNet bağlantısı firmanın yetkilendirdiği Windows bilgisayarında çalışır. Dört yöndeki orijinal XML ve PDF, firmanın seçtiği Drive eşitleme arşivine alınır.</p>
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
        <strong><Monitor size={18}/> Yerel İşNet Aktarımı · Bu Bilgisayar</strong>
        <p>İşNet portalını tekrar KY ERP bulut sunucusundan giriş yaptırmaya çalışmayacağız. Çalışan yerel bağlantı üzerinden belgeler doğrudan arşivlenir; tarayıcının İndirilenler klasörüne ikinci belge kopyası oluşturulmaz.</p>
        <button className="eis-local-open" type="button" disabled={!enabled} onClick={()=>setLocalOpen(value=>!value)}>
          <Monitor size={17}/> {localOpen?"İşNet Panelini Kapat":"İşNet Panelini Bu Ekranda Aç"}
        </button>
        <small className="eis-local-hint">Bağlı Windows cihazında 8791 servisi çalışıyorsa İşNet paneli aşağıda açılır. Portal girişi yalnız yerel oturumda kalır; dosyalar yalnız firmanın yetkili klasörüne yazılır.</small>
      </div>
      <div className="eis-local-destination">
        <span><HardDrive size={17}/> TEK FİZİKSEL ARŞİV</span>
        <strong>Firmanın bağladığı Drive / yerel arşiv</strong>
        <small>Gelen/Giden Fatura · Gelen/Giden İrsaliye</small>
        <small>Her belge: 1 orijinal XML + 1 orijinal PDF + küçük SHA-256 kayıt dosyası</small>
      </div>
    </div>
    {localOpen && <div className="eis-local-embedded">
      <header><strong>İşNet · Dört Yönlü Otomatik Arşiv</strong><small>İşlem bu pencerede yürütülür; kapatsan bile yerel servis başladığı işi tamamlar.</small></header>
      <iframe title="İşNet Yerel Senkronizasyon" src={LOCAL_ARCHIVE_URL} sandbox="allow-same-origin allow-scripts allow-forms allow-downloads" loading="lazy" referrerPolicy="no-referrer"/>
      <small>Yerel servis bağlantısı veya tarayıcı güvenlik politikası paneli engelliyorsa dosyaları indirmeye çalışma; bağlantı durumunu Yerel Entegrasyon Merkezi'nde kontrol et.</small>
    </div>}
    <div className="eis-local-directions">
      {DIRECTIONS.map(([title,detail])=><div key={title}><FileText size={16}/><span><strong>{title}</strong><small>{detail}</small></span><FileCheck2 size={15}/></div>)}
    </div>
    <div className="eis-local-actions">
      <button type="button" onClick={()=>openModule?.("depolama",{tabKey:"depolama-atamalar"})}><FolderOpen size={16}/> İşNet Arşiv Klasörünü Bağla</button>
      <button type="button" onClick={()=>openModule?.("depolama",{tabKey:"depolama-dosyalar"})}><HardDrive size={16}/> Drive Dosya İndeksini Gör</button>
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
