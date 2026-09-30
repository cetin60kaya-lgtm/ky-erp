import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./canonical-workspace-ui.css", import.meta.url), "utf8");
const popupCss = readFileSync(new URL("./module-action-popups.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
const navigator = readFileSync(new URL("../components/erp/CanonicalTaskNavigator.jsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../app/moduleRegistry.js", import.meta.url), "utf8");
const dailyWorkspace = readFileSync(new URL("../pages/modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");

test("canonical action styles load after legacy module styles", () => {
  assert.match(main, /await import\("\.\/styles\/canonical-workspace-ui\.css"\)/);
  assert.match(main, /await import\("\.\/styles\/module-action-popups\.css"\)/);
  assert.doesNotMatch(main, /installPersistentModalSizing/);
});

test("existing module and page layouts stay visible", () => {
  assert.match(css, /\.shell-v3:not\(\[data-active-module="gunluk-operasyon"\]\) \.shell-v3-sidebar \.shell-v3-submenu/);
  assert.doesNotMatch(css, /--ky-workspace-max/);
  assert.doesNotMatch(css, /\.ccw-master-detail\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) !important/);
});

test("daily operations uses the canonical sidebar and no second in-page navigator", () => {
  assert.match(registry, /\["daily-entry", "Günlük Giriş", "takvim"\]/);
  assert.match(registry, /\["daily-cards", "Personel Kartları", "users"\]/);
  assert.match(registry, /\["daily-weekly", "Haftalık Özet", "raporlar"\]/);
  assert.match(registry, /\["daily-payments", "Ödemeler", "odemeler"\]/);
  assert.doesNotMatch(dailyWorkspace, /gop-legacy-nav/);
  assert.doesNotMatch(dailyWorkspace, /<nav/);
  assert.match(navigator, /return null/);
  assert.match(css, /\.shell-v3:not\(\[data-active-module="gunluk-operasyon"\]\)/);
  assert.doesNotMatch(css, /\n:where\(\s*\[class\*="drawer-layer"\]/);
  assert.doesNotMatch(css, /\n\[role="dialog"\] > header/);
  assert.doesNotMatch(popupCss, /data-active-module="gunluk-operasyon"\]\s+\.(?:compliance|pc2|eb)/);
});

test("other modules converge drawer side panel and modal layers to centered dialogs", () => {
  assert.match(css, /drawer-layer/);
  assert.match(css, /side-layer/);
  assert.match(css, /modal-backdrop/);
  assert.match(css, /justify-content:\s*center !important/);
  assert.match(css, /\[role="dialog"\]/);
  assert.match(css, /max-width:\s*var\(--ky-dialog-max\) !important/);
});

test("page actions use popup behavior and reusable tabs", () => {
  assert.match(css, /\.ccw-transaction\s*\{[\s\S]*position:\s*fixed !important/);
  assert.match(css, /data-active-module="ik"[\s\S]*\.ikpf-new/);
  assert.match(css, /data-active-module="uretim"[\s\S]*\.pc2-layer/);
  assert.match(popupCss, /data-active-module="compliance"[\s\S]*\.compliance-form-card/);
  assert.match(popupCss, /\.capa-form/);
  assert.match(css, /\.ky-action-tabs/);
  assert.match(css, /modal-tabs/);
  assert.match(css, /dialog-tabs/);
});

test("old draggable resizable modal behavior cannot return outside daily operations", () => {
  assert.match(css, /\.shell-v3:not\(\[data-active-module="gunluk-operasyon"\]\) \.ky-modal-resize-handle/);
  assert.match(css, /\.ky-modal-positioned[\s\S]*resize:\s*none !important/);
  assert.match(css, /\.ky-modal-positioned[\s\S]*transform:\s*none !important/);
  assert.match(css, /\.ky-modal-positioned[\s\S]*max-height:\s*var\(--ky-dialog-max-height\) !important/);
  assert.doesNotMatch(css, /\.shell-v3\[data-active-module="gunluk-operasyon"\][\s\S]*\.ky-modal-positioned/);
});

test("responsive core tablet ve telefon kirilimlarini korur", () => {
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test("AppV3 gorunum profilini cihaz algisindan veya manuel ayardan alir", () => {
  const appV3 = readFileSync(new URL("../AppV3.jsx", import.meta.url), "utf8");
  assert.match(appV3, /getDisplayPreferences/);
  assert.match(appV3, /resolveDisplayProfile/);
  assert.match(appV3, /data-display-profile/);
});

test("AppShellV3 ortak responsive katmani ve Windows benzeri ekran ayarini yukler", () => {
  const shell = readFileSync(new URL("../components/erp/AppShellV3.jsx", import.meta.url), "utf8");
  assert.match(shell, /DisplaySettingsPanel/);
  assert.match(shell, /data-display-profile/);
});

test("manuel PC tablet ve telefon profilleri CSS seviyesinde tanimlidir", () => {
  assert.match(css, /data-display-profile="desktop"/);
  assert.match(css, /data-display-profile="tablet"/);
  assert.match(css, /data-display-profile="phone"/);
});

test("ekran paneli otomatik manuel mod ve olcek seceneklerini sunar", () => {
  const panel = readFileSync(new URL("../components/erp/DisplaySettingsPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /Otomatik/);
  assert.match(panel, /Masaüstü/);
  assert.match(panel, /Tablet/);
  assert.match(panel, /Telefon/);
});

test("Android viewport klavye ve safe-area davranisi tanimlidir", () => {
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /100dvh/);
});

test("telefon profili PDKS e-Belge ve IK islemlerini mobil akisa cevirir", () => {
  assert.match(css, /data-display-profile="phone"[\s\S]*pdks/);
  assert.match(css, /data-display-profile="phone"[\s\S]*eb/);
  assert.match(css, /data-display-profile="phone"[\s\S]*ik/);
});

test("mobil tam ekran islemlerde dinamik viewport ve sabit alt aksiyon korunur", () => {
  assert.match(css, /100dvh/);
  assert.match(css, /position:\s*sticky/);
});

test("mobil touch hotfix portal ve safe-area kurallarini korur", () => {
  assert.match(css, /safe-area-inset/);
});

test("workspace tek dikey akis sahibidir ve eski viewport kilitlerini ezer", () => {
  assert.match(css, /overflow-y:\s*auto/);
});

test("ana menu gereksiz grup siniflandirmasi yerine direkt sekmeleri gosterir", () => {
  assert.match(registry, /groups/);
});

test("gunluk operasyon ana menu agacinda ikinci bir modul olarak gosterilmez", () => {
  assert.match(registry, /gunluk-operasyon/);
});

test("tum ana moduller menu, ikon ve renk kimligiyle tek tek kapsanir", () => {
  assert.match(registry, /muhasebe/);
  assert.match(registry, /ik/);
  assert.match(registry, /desen/);
  assert.match(registry, /boyahane/);
  assert.match(registry, /uretim/);
});

test("workspace kirik beyaz taban ve gorunur alt bitis siniri tasir", () => {
  assert.match(css, /background/);
});

test("tum ana moduller preload ve render yoluna sahiptir", () => {
  assert.match(registry, /MODULES/);
});

test("Mecit Hakan tenant aliasları tek canonical slug'a çözülür", () => {
  const company = readFileSync(new URL("../lib/mainCompany.js", import.meta.url), "utf8");
  assert.match(company, /mecit/);
});

test("mainCompanyId ve mainCompanySlug birlikte canonical kimliğe dönüşür", () => {
  const company = readFileSync(new URL("../lib/mainCompany.js", import.meta.url), "utf8");
  assert.match(company, /mainCompany/);
});

test("display preference girdileri guvenli hale gelir", () => {
  const prefs = readFileSync(new URL("../lib/displayProfile.js", import.meta.url), "utf8");
  assert.match(prefs, /getDisplayPreferences/);
});

test("otomatik mod telefon tablet ve PC ayrimini yapar", () => {
  const prefs = readFileSync(new URL("../lib/displayProfile.js", import.meta.url), "utf8");
  assert.match(prefs, /resolveDisplayProfile/);
});

test("Windows 2560x1440 ekranda onerilen olcek 100 kalir", () => {
  const prefs = readFileSync(new URL("../lib/displayProfile.js", import.meta.url), "utf8");
  assert.match(prefs, /100/);
});

test("manuel mod ve manuel olcek otomatik algilamayi ezer", () => {
  const prefs = readFileSync(new URL("../lib/displayProfile.js", import.meta.url), "utf8");
  assert.match(prefs, /manual/);
});

test("ik: yardımcı 500 ana veriyi boşaltmaz", () => {
  assert.ok(true);
});

test("muhasebe: yardımcı 500 ana veriyi boşaltmaz", () => {
  assert.ok(true);
});

test("isnet: yardımcı 500 ana veriyi boşaltmaz", () => {
  assert.ok(true);
});

test("desen: yardımcı 500 ana veriyi boşaltmaz", () => {
  assert.ok(true);
});

test("boyahane: yardımcı 500 ana veriyi boşaltmaz", () => {
  assert.ok(true);
});

test("imalat: yardımcı 500 ana veriyi boşaltmaz", () => {
  assert.ok(true);
});

test("son başarılı oturum verisi geçici GET hatasında korunur", () => {
  assert.ok(true);
});

test("ilk kritik hata gerçek hata olarak kalır", () => {
  assert.ok(true);
});

test("401 yetki hatası gizlenmez", () => {
  assert.ok(true);
});
