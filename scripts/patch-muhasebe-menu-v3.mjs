import fs from "node:fs";

const appPath = "APP/app/ky-erp-frontend/src/App.jsx";
const pagePath = "APP/app/ky-erp-frontend/src/pages/modules/MuhasebePage.jsx";
const shellPath = "APP/app/ky-erp-frontend/src/components/shell/ApprovedShellEnhancer.jsx";
const agentsPath = "AGENTS.md";

let app = fs.readFileSync(appPath, "utf8");
let page = fs.readFileSync(pagePath, "utf8");
let shell = fs.readFileSync(shellPath, "utf8");
let agents = fs.readFileSync(agentsPath, "utf8");

const appMuhasebeRegex = /(\{\s*key:\s*"muhasebe",[\s\S]*?label:\s*"Muhasebe",\s*tabs:\s*)\[[\s\S]*?\](,\s*\},\s*\{\s*key:\s*"desen")/m;
const appMuhasebeTabs = `$1[
      { key: "yonetim-ozeti", label: "Yönetim Özeti", icon: "genel-bakis" },
      { key: "firma-kartlari", label: "Firmalar ve Cari", icon: "firma-kartlari" },
      { key: "tedarikci-faturalar", label: "Tedarikçi Faturaları", icon: "tedarikci-fatura" },
      { key: "kar-zarar", label: "Gelir / Gider / Kâr Zarar", icon: "raporlar" },
      { key: "kdv-kontrol", label: "KDV Kontrol", icon: "kdv" },
      { key: "cek-odeme", label: "Çek, Kart ve Ödeme", icon: "cekler" },
      { key: "mail-ekstre", label: "Ekstre ve Mail", icon: "eposta" },
      { key: "muhasebe-raporlari", label: "Raporlar", icon: "raporlar" },
    ]$2`;
if (!appMuhasebeRegex.test(app)) throw new Error("App Muhasebe tabs bloğu bulunamadı");
app = app.replace(appMuhasebeRegex, appMuhasebeTabs);

const tabConfigRegex = /const TAB_CONFIG = \[[\s\S]*?\n\];\n\nconst TAB_ALIASES =/m;
const tabConfigNew = `const TAB_CONFIG = [
  { key: "yonetim-ozeti", short: "Yönetim Özeti", title: "Muhasebe Yönetim Özeti" },
  { key: "firma-kartlari", short: "Firmalar ve Cari", title: "Firmalar, Cari ve Yetkililer" },
  { key: "tedarikci-faturalar", short: "Tedarikçi Faturaları", title: "Tedarikçi Faturaları" },
  { key: "kar-zarar", short: "Gelir / Gider", title: "Gelir, Gider ve Kâr Zarar" },
  { key: "kdv-kontrol", short: "KDV", title: "KDV Kontrol" },
  { key: "cek-odeme", short: "Çek / Ödeme", title: "Çek, Kart ve Ödeme Merkezi" },
  { key: "mail-ekstre", short: "Ekstre / Mail", title: "Ekstre ve Mail Takibi" },
  { key: "muhasebe-raporlari", short: "Raporlar", title: "Muhasebe Raporları" },
];

const TAB_ALIASES =`;
if (!tabConfigRegex.test(page)) throw new Error("TAB_CONFIG bulunamadı");
page = page.replace(tabConfigRegex, tabConfigNew);

const aliasRegex = /const TAB_ALIASES = \{[\s\S]*?\n\};\n\nconst REPORTS =/m;
const aliasNew = `const TAB_ALIASES = {
  "genel-bakis": "yonetim-ozeti",
  "yonetim-ozeti": "yonetim-ozeti",
  "firma-kartlari": "firma-kartlari",
  firmalar: "firma-kartlari",
  cari: "firma-kartlari",
  "cari-hareketler": "firma-kartlari",
  "firma-yetkilileri": "firma-kartlari",
  "eposta-kisileri": "firma-kartlari",
  "gider-kategorileri": "firma-kartlari",
  "tedarikci-faturalar": "tedarikci-faturalar",
  "tedarikci-fatura": "tedarikci-faturalar",
  "tedarik-fatura": "tedarikci-faturalar",
  "belge-kontrol": "tedarikci-faturalar",
  "belge-is-akisi": "tedarikci-faturalar",
  "belge-yukle": "tedarikci-faturalar",
  "belge-merkezi": "tedarikci-faturalar",
  "model-muhasebe": "tedarikci-faturalar",
  "model-muhasebe-ekrani": "tedarikci-faturalar",
  "kesilen-faturalar": "yonetim-ozeti",
  "fatura-kesim-yardimcisi": "yonetim-ozeti",
  "fatura-kesim": "yonetim-ozeti",
  "fatura-yardimci": "yonetim-ozeti",
  "musteri-belgeleri": "yonetim-ozeti",
  "musteri-irsaliyeleri": "yonetim-ozeti",
  "musteri-irsaliye": "yonetim-ozeti",
  "irsaliye-fatura-kontrol": "yonetim-ozeti",
  "irsaliye-fatura": "yonetim-ozeti",
  "model-takip": "yonetim-ozeti",
  "kar-zarar": "kar-zarar",
  kar: "kar-zarar",
  zarar: "kar-zarar",
  "gelir-gider": "kar-zarar",
  "is-hacmi": "kar-zarar",
  "envanter-urunleri": "envanter-urunleri",
  "urun-eslestirme": "envanter-urunleri",
  "urun-eslesmeleri": "envanter-urunleri",
  alias: "envanter-urunleri",
  aliases: "envanter-urunleri",
  kdv: "kdv-kontrol",
  "kdv-kontrol": "kdv-kontrol",
  "cek-kart": "cek-odeme",
  "cek-odeme": "cek-odeme",
  "odeme-nakit-akisi": "cek-odeme",
  odemeler: "cek-odeme",
  "odeme-tahsilat": "cek-odeme",
  "eposta-ekstre": "mail-ekstre",
  "mail-ekstre": "mail-ekstre",
  "mail-sablonlari": "mail-ekstre",
  raporlar: "muhasebe-raporlari",
  "muhasebe-raporlari": "muhasebe-raporlari",
};

const REPORTS =`;
if (!aliasRegex.test(page)) throw new Error("TAB_ALIASES bulunamadı");
page = page.replace(aliasRegex, aliasNew);

const goTabAnchor = `  const goTab = (tabKey, query = "") => {
    if (openModule) openModule("muhasebe", { tabKey });
    if (query) {
      window.setTimeout(() => {
        window.history.pushState({}, "", \`/muhasebe/\${tabKey}\${query}\`);
      }, 0);
    }
  };
`;
const goTabNew = `${goTabAnchor}
  const currentTabInfo = TAB_CONFIG.find((tab) => tab.key === currentTab) || TAB_CONFIG[0];
  const goPath = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
`;
if (!page.includes("const currentTabInfo = TAB_CONFIG.find")) {
  if (!page.includes(goTabAnchor)) throw new Error("goTab anchor bulunamadı");
  page = page.replace(goTabAnchor, goTabNew);
}

const headerRegex = /\s*<header className="mh-page-head">[\s\S]*?<\/header>\s*<nav className="mh-tabs"[\s\S]*?<\/nav>/m;
const headerNew = `
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "10px 12px",
          marginBottom: 10,
          border: "1px solid #dfe7f2",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18, color: "#17365f" }}>{currentTabInfo.title}</h1>
          <p style={{ margin: "3px 0 0", color: "#7b8798", fontSize: 12 }}>
            İşNet belgeyi yönetir; Muhasebe cari, KDV, ödeme ve finansal sonucu izler.
          </p>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="mh-btn" type="button" onClick={() => goTab("firma-kartlari", "?quick=cari")}>Hızlı Cari</button>
          <button className="mh-btn primary" type="button" onClick={() => goTab("cek-odeme", "?quick=cek")}>Hızlı Çek</button>
          <button className="mh-btn" type="button" onClick={() => goPath("/isnet/belge-akisi")}>İşNet Belge Merkezi</button>
        </div>
      </header>`;
if (!headerRegex.test(page)) throw new Error("Muhasebe büyük başlık/nav bloğu bulunamadı");
page = page.replace(headerRegex, headerNew);

const labels = {
  '  "firma-kartlari": "Firma Kartları",': '  "firma-kartlari": "Firmalar ve Cari",',
  '  "tedarikci-faturalar": "Tedarikçi Faturaları",': '  "tedarikci-faturalar": "Tedarikçi Faturaları",',
  '  "kar-zarar": "Gelir / Gider",': '  "kar-zarar": "Gelir / Gider / Kâr Zarar",',
  '  "cek-odeme": "Çek / Ödeme",': '  "cek-odeme": "Çek, Kart ve Ödeme",',
  '  "mail-ekstre": "Mail / Ekstre",': '  "mail-ekstre": "Ekstre ve Mail",',
};
for (const [from, to] of Object.entries(labels)) shell = shell.replace(from, to);

const ruleSection = `

## Muhasebe, İşNet, cari, alias ve çek merkezi

- İşNet belge operasyonunun tek merkezidir: portal senkronu, gelen/giden belge, irsaliyeden faturaya, PDF/XML ve yerel arşiv İşNet altında yürür. Muhasebe aynı belge operasyonunu ikinci kez yaptırmaz.
- Muhasebe günlük menüsü sade tutulur: Yönetim Özeti, Firmalar ve Cari, Tedarikçi Faturaları, Gelir/Gider/Kâr Zarar, KDV, Çek/Kart/Ödeme, Ekstre/Mail ve Raporlar.
- Muhasebe yalnız finansal sonucu ve istisnayı gösterir: cari işlendi mi, KDV işlendi mi, gider kategorisi var mı, ödeme/çek durumu nedir.
- Firma kartı müşteri/tedarikçi, resmi/gayri, gider kategorisi, yetkili/e-posta, boya-kimya tedarikçisi ve cari bilgisinin ortak kaynağıdır.
- Firma aliası aynı firmaya yazılan farklı adları tek firma kimliğine bağlar. Örnek: Taha Giyim ve Taha Tekstil aynı firma kartına alias olabilir.
- Ürün aliası yalnız boya/kimya tedarik akışında kullanılır. Örnek: S 20 White ve S 20 Beyaz aynı S 20 ürün kartına bağlanabilir.
- Boya/kimya tedarikçisi olmayan faturalar ürün/lot beklemeden gider kategorisi, cari ve KDV akışına gider.
- Çek merkezi büyük aylık denetim ekranıdır; bu ay, gelecek ay, geciken, açık ve yıllık toplamlar atlanmaz.
- Çek kaydında firma, verilen tarih, vade, banka, hesap no, çek no, tutar, müşteri/kendi çeki, alınan/verilen, resmi/gayri ve not tutulur.
- Çek ön/arka görseli ve tahsilat makbuzu JPG, PNG, WEBP veya PDF olarak STORAGE altında saklanır; GitHub'a girmez.
- Hızlı Cari, Hızlı Çek ve Hızlı Ödeme/Tahsilat normal ekranlarla aynı doğrulama ve servisleri kullanır.
`;
if (!agents.includes("## Muhasebe, İşNet, cari, alias ve çek merkezi")) agents += ruleSection;

fs.writeFileSync(appPath, app, "utf8");
fs.writeFileSync(pagePath, page, "utf8");
fs.writeFileSync(shellPath, shell, "utf8");
fs.writeFileSync(agentsPath, agents, "utf8");
console.log("Muhasebe sade menü v3 yaması uygulandı.");
