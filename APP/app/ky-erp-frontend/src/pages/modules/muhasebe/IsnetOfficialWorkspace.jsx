import { useState } from "react";
import "./isnetOfficialWorkspace.css";

// Existing KYERP views remain the source of truth. No official write path is
// enabled until a server-owned service capability and atomic send gate exist.
const documents = [
  ["Gelen Faturalar", "gelen-faturalar"],
  ["Giden Faturalar", "giden-faturalar"],
  ["Gelen İrsaliyeler", "gelen-irsaliyeler"],
  ["Giden İrsaliyeler", "giden-irsaliyeler"],
];
const groups = [
  { title: "Belge oluştur", actions: ["Sıfırdan e-İrsaliye oluştur", "Sıfırdan e-Fatura oluştur", "Yeni e-Arşiv"], reason: "Belge türüne göre alıcı, seri, sevk veya vergi bilgileri; resmî servis kabulü bekleniyor." },
  { title: "İrsaliye işlemleri ve dönüşüm", actions: ["Giden irsaliyeyi faturaya çevir", "Kalan miktarı sevk et", "İrsaliye taslağı güncelle"], reason: "Gelenden oluşturma hazırlığı mevcut Gelen İrsaliyeler ekranında. Resmî dönüşüm, miktar rezervasyonu ve gönderim henüz kapalı." },
  { title: "Taslaklar ve gönderim", actions: ["İrsaliye taslakları", "Fatura taslakları", "Güncelle / kaydet", "Önizle", "Gönderim onayı", "Resmî gönder", "ETTN / GİB durum sorgula"], reason: "İki ayrı belge yaşam döngüsü; resmî taslak, şema doğrulama ve atomik gönderim servisi bekleniyor." },
  { title: "Diğer belge aileleri", actions: ["e-Arşiv", "e-SMM", "e-Müstahsil", "e-Dekont"], reason: "Belge türü şeması, listeleme ve hizmet yetkileri doğrulanmalı." },
  { title: "Belge yanıtları", actions: ["Ticari fatura kabul / ret", "İrsaliye kabul / kısmi kabul", "İptal / itiraz"], reason: "Resmî yanıt servisi ve işlem bazlı kullanıcı onayı gerekli." },
  { title: "Firma ve araçlar", actions: ["Firma / şube / seri", "Mükellef / adres defteri", "Ürün / hizmet", "Kullanıcı / rol", "Parametreler"], reason: "Sağlayıcının yetkili yönetim metotları bekleniyor; mevcut KYERP kartları korunur." },
  { title: "Raporlar ve finans", actions: ["İşNet raporları", "Kontör bakiyesi", "Tahsilat durumu"], reason: "Sağlayıcıdan doğrulanmış okuma servisi bekleniyor." },
];
export default function IsnetOfficialWorkspace({ openModule, onOpenSync, onOpenRules, onOpenTest, enabled }) {
  const [expanded, setExpanded] = useState(null);
  const navigate = tabKey => openModule?.("e-belge", { tabKey });
  return <section className="isow" aria-label="KYERP İşNet işlem merkezi">
    <header className="isow-head"><div><small>KYERP / e-BELGE / İŞNET</small><h3>İşNet İşlem Merkezi</h3>
      <p>Günlük belgeler tek havuzda; resmî servis yetenekleri doğrulanmadan açılmaz.</p></div>
      <span className="isow-state">{enabled ? "Resmî servis kabulü bekleniyor" : "Firma entegrasyonu pasif"}</span></header>
    <div className="isow-docs">{documents.map(([label, tabKey]) => <button type="button" key={tabKey} disabled={!openModule} onClick={() => navigate(tabKey)}>{label}<small>KYERP belge havuzu · XML / PDF</small></button>)}</div>
    <div className="isow-actions">
      <button type="button" disabled={!openModule} onClick={() => navigate("gelen-irsaliyeler")}>Gelenden irsaliye oluştur / kısmi sevk hazırlığı</button>
      <button type="button" disabled={!enabled} onClick={onOpenSync}>XML + PDF Al</button>
      <button type="button" disabled={!openModule} onClick={() => navigate("belge-havuzu")}>Belge Yükle / Havuz</button>
      <button type="button" disabled={!openModule} onClick={() => navigate("arsiv-cikti")}>Arşiv / Çıktı</button>
      <button type="button" disabled={!openModule} onClick={() => navigate("onay-sorunlar")}>Muhasebe Onayları</button>
      <button type="button" disabled={!enabled} onClick={onOpenRules}>Bağlantı ve İş Kuralları</button>
      <button type="button" disabled={!enabled} onClick={onOpenTest}>Dosya Kontrolü</button>
    </div>
    <p className="isow-note" role="status">Mevcut belge okuma ve arşiv akışı kullanılabilir. Aşağıdaki resmî işlemler tasarım kapsamındadır; henüz sağlayıcıya çağrı yapmaz. Muhasebe onayı resmî gönderim onayı değildir.</p>
    <div className="isow-groups">{groups.map((group, index) => <section key={group.title} className="isow-group">
      <button type="button" className="isow-group-title" aria-expanded={expanded === index} onClick={() => setExpanded(current => current === index ? null : index)}>{group.title}<span>{expanded === index ? "−" : "+"}</span></button>
      {expanded === index && <div className="isow-group-body"><p>{group.reason}</p><div className="isow-actions">{group.actions.map(action => <button type="button" disabled key={action}>{action}</button>)}</div></div>}
    </section>)}</div>
  </section>;
}
