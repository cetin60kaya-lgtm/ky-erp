import { useEffect, useMemo, useState } from "react";
import "../../styles/public-module-showcase.css";

const MODULES = [
  { key: "pdks", name: "PDKS", tabs: ["Canlı Geçişler", "Günlük Durum", "Cihaz Sağlığı"], metrics: [["Aktif personel", "18"], ["İçeride", "12"], ["Eksik basım", "1"]], rows: ["08:21 Kart okuma · Üretim", "08:27 Giriş · Boyahane", "08:31 Giriş · Desen"], maskMetrics: [1] },
  { key: "ik", name: "İnsan Kaynakları", tabs: ["Personel", "İzin & Mesai", "Bordro Özeti"], metrics: [["Personel", "24"], ["İzinde", "2"], ["Açık işlem", "3"]], rows: ["Yıllık izin bakiyesi güncellendi", "Mesai kaydı bordroya hazır", "Personel kartı kontrol edildi"], maskMetrics: [2] },
  { key: "muhasebe", name: "Muhasebe", tabs: ["Cari", "Gelir-Gider", "Ödeme"], metrics: [["Açık cari", "12"], ["Bugün işlem", "7"], ["Vadesi gelen", "2"]], rows: ["Cari hareket eşleşti", "Ödeme planı güncellendi", "KDV kontrolü tamamlandı"], maskMetrics: [0, 1] },
  { key: "ebelge", name: "e-Belge", tabs: ["Gelen Fatura", "İrsaliye", "Belge Havuzu"], metrics: [["Yeni belge", "4"], ["Eşleşen", "3"], ["Kontrol", "1"]], rows: ["XML belge ayrıştırıldı", "Cari otomatik eşleşti", "PDF önizleme hazır"], maskMetrics: [1] },
  { key: "desen", name: "Desen", tabs: ["Desen Havuzu", "Model", "Dosya Akışı"], metrics: [["Yeni desen", "5"], ["Model hazır", "3"], ["Bekleyen", "2"]], rows: ["Dosya adı modelle eşleşti", "Görsel havuza alındı", "Üretim kartı hazırlandı"], maskMetrics: [0] },
  { key: "boyahane", name: "Boyahane", tabs: ["Reçete", "Lot", "Stok"], metrics: [["Aktif reçete", "6"], ["Lot", "14"], ["Kritik stok", "1"]], rows: ["Renk reçetesi hazırlandı", "Lot bağlantısı yapıldı", "Stok hareketi işlendi"], maskMetrics: [0, 1] },
  { key: "imalat", name: "İmalat", tabs: ["Üretim", "Makine", "Model Takibi"], metrics: [["Üretimde", "8"], ["Makine aktif", "5"], ["Bekleyen model", "3"]], rows: ["Model üretime alındı", "Makine vardiyası açıldı", "Adet kontrolü güncellendi"], maskMetrics: [2] },
  { key: "mail", name: "Mail & Dosyalar", tabs: ["Gelen Kutusu", "Ekler", "Onaylar"], metrics: [["Yeni mail", "6"], ["Ek", "9"], ["Onay", "2"]], rows: ["PDF eki önizlemeye hazır", "Mesaj okundu olarak işlendi", "Onay kaydı bekliyor"], maskMetrics: [0] },
  { key: "denetim", name: "Denetim & Uygunluk", tabs: ["Yaklaşan Evrak", "Eksikler", "AI Kontrol"], metrics: [["Yaklaşan", "4"], ["Eksik", "2"], ["Kontrol", "11"]], rows: ["Belge süresi 10 gün içinde", "Eksik evrak tespit edildi", "AI kontrol paketi tamamlandı"], maskMetrics: [1] },
  { key: "sistem", name: "Sistem Merkezi", tabs: ["Cihazlar", "Sağlık", "Uzak Erişim"], metrics: [["Çevrimiçi", "7"], ["Uyarı", "1"], ["Agent", "8"]], rows: ["PDKS agent çevrimiçi", "Uzak erişim hazır", "Sistem kontrolü başarılı"], maskMetrics: [2] },
  { key: "asistan", name: "KY ERP Asistan", tabs: ["Hızlı Sorgu", "Analiz", "İşlem Desteği"], metrics: [["Sorgu", "12"], ["Analiz", "5"], ["Öneri", "3"]], rows: ["Bugün kim gelmedi?", "Hangi belgeler eksik?", "Üretimde bekleyen model var mı?"], maskMetrics: [0] },
];

export default function PublicModuleShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const [paused, setPaused] = useState(false);
  const [apiLive, setApiLive] = useState(null);
  const active = useMemo(() => MODULES[activeIndex], [activeIndex]);
  useEffect(() => { setActiveTab(0); }, [activeIndex]);
  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => setActiveIndex((value) => (value + 1) % MODULES.length), 7000);
    return () => window.clearInterval(timer);
  }, [paused]);
  useEffect(() => {
    let alive = true;
    fetch("https://api.kyerp.net/api/health", { method: "GET", headers: { Accept: "application/json" } })
      .then((response) => { if (!response.ok) throw new Error("health"); return response.json(); })
      .then(() => { if (alive) setApiLive(true); })
      .catch(() => { if (alive) setApiLive(false); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="ky-module-showcase" id="canli-demo" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="ky-module-showcase__head">
        <div><span className="ky-public-kicker">KY ERP'Yİ CANLI KEŞFET</span><h2>Her modülden gerçek kullanım mantığını gösteren küçük önizlemeler.</h2></div>
        <p>İş akışı görünür; kişisel, firma ve finansal alanların bir bölümü bilinçli olarak puslu tutulur. <b>{apiLive === true ? "Canlı API bağlantısı aktif." : apiLive === false ? "API durumu alınamadı." : "Canlı bağlantı kontrol ediliyor..."}</b></p>
      </div>
      <div className="ky-module-showcase__layout">
        <nav className="ky-module-showcase__nav" aria-label="Modül önizlemeleri">
          {MODULES.map((module, index) => (
            <button key={module.key} type="button" className={index === activeIndex ? "active" : ""} onClick={() => setActiveIndex(index)}>
              <span>{String(index + 1).padStart(2, "0")}</span><b>{module.name}</b>
            </button>
          ))}
        </nav>
        <div className="ky-module-showcase__preview">
          <header><div><span>KY ERP / {active.name.toUpperCase()}</span><h3>{active.name}</h3></div><em><i /> {apiLive ? "Sistem bağlı" : "Önizleme"}</em></header>
          <div className="ky-module-showcase__tabs">
            {active.tabs.map((tab, index) => <button key={tab} type="button" className={index === activeTab ? "active" : ""} onClick={() => setActiveTab(index)}>{tab}</button>)}
          </div>
          <div className="ky-module-showcase__metrics">
            {active.metrics.map(([label, value], index) => <div className={active.maskMetrics?.includes(index) ? "masked" : ""} key={label}><small>{label}</small><strong>{value}</strong><span>{active.tabs[activeTab]}</span></div>)}
          </div>
          <div className="ky-module-showcase__workarea">
            <div className="ky-module-showcase__workhead"><b>{active.tabs[activeTab]}</b><span>Anonim önizleme · hassas alanlar gizli</span></div>
            {active.rows.map((row, index) => <div className="ky-module-showcase__row" key={`${active.key}-${row}`}><i className={index === 0 ? "live" : index === 1 ? "done" : ""} /><span className={index === 2 ? "soft-mask" : ""}>{row}</span><em>{index === 0 ? "Şimdi" : index === 1 ? "Hazır" : "Kontrol"}</em></div>)}
          </div>
          <div className="ky-module-showcase__teaser" aria-hidden="true"><span>Yetkili içerik</span></div>
          <footer><span>{activeIndex + 1} / {MODULES.length} modül</span><b>Üzerine gelince otomatik geçiş durur.</b></footer>
        </div>
      </div>
    </section>
  );
}
