/**
 * KY PDKS unified product contract.
 * This is the ONLY source for the complete primary navigation and subpages.
 * Modules describe UX intent; no section may imply a backend write is available.
 */
export const PRODUCT_NAME = "KY PDKS";
export const PRODUCT_VERSION = "Unified 1.0";

const section = (id, label, icon, tabs, description) => ({ id, label, icon, tabs, description });
const tab = (id, label, view, columns, description, options = {}) => ({
  id, label, view, columns, description, ...options,
});

export const PRODUCT_SECTIONS = Object.freeze([
  section("overview", "Genel Bakış", "LayoutDashboard", [
    tab("today", "Bugünün Özeti", "dashboard", [], "Günün doğrulanmış hareketleri ve iş akışı"),
    tab("attention", "Uyarılar", "approval", ["Öncelik","Personel","Olay","Tarih","Kaynak","Durum"], "Öncelikli istisnalar ve sistem uyarıları"),
    tab("approvals", "Bekleyen Onaylar", "approval", ["Talep","Personel","Tarih","Talep Eden","Aşama","Durum"], "Onay sırasındaki işlemler"),
  ], "Tek işyeri görünümü, kritik uyarılar ve onay kuyruğu"),
  section("attendance", "Devam Kontrol", "ScanLine", [
    tab("live", "Canlı Devam", "attendance", ["Tarih","Kart No","Personel","Giriş","Çıkış","Kaynak","E","Durum"], "Ham terminalden gelen doğrulanmış güncel kart geçişleri"),
    tab("punches", "Kart Hareketleri", "attendance", ["Tarih","Kart No","Personel","Giriş","Çıkış","Kaynak","E","Durum"], "Gerçek kart hareketleri, normal/E ve çift vardiya ayrımı"),
    tab("exceptions", "Eksikler ve İstisnalar", "approval", ["Kart No","Personel","Tarih","İhlal","Kaynak","İşlem","Durum"], "Geç, erken, eksik kart, izin ve mesai çakışmaları"),
    tab("history", "Devam Geçmişi", "attendance", ["Tarih","Kart No","Personel","Giriş","Çıkış","Kaynak","E","Durum"], "Tarihsel hareket ve vardiya geçmişi"),
    tab("transfers", "Günlük Aktarımlar", "sync", ["Tarih","Cihaz","Ham Kayıt","Normal","E","Reddedilen","Durum"], "Terminalden alınan batch kanıtları"),
  ], "Kart hareketleri, eksikler, doğrulama ve geçmiş"),
  section("people", "Personel", "UsersRound", [
    tab("people", "Personel Listesi", "people", ["Kart No","Ad Soyad","Departman","Görev","Grup","Giriş","Durum"], "Tüm personeller, tarihsel istihdam ve Personel 360°"),
    tab("cards", "Kart Yönetimi", "people", ["Kart No","Ad Soyad","Kart Durumu","Başlangıç","Bitiş","Son Geçiş"], "Fiziksel kart ataması ve tekrar kullanım geçmişi"),
    tab("employment", "Özlük ve İstihdam", "people", ["Personel","Giriş Tarihi","Çıkış Tarihi","Departman","Görev","Durum"], "Özlük alanları, işe giriş ve işten çıkış"),
    tab("departments", "Bölüm ve Gruplar", "grid", ["Bölüm","Grup","Vardiya","Kişi","Yönetici","Durum"], "Organizasyon ve çalışma grupları"),
    tab("documents", "Personel Evrakları", "grid", ["Personel","Belge","Dönem","Eklenme","Yetki","Durum"], "İmza, sözleşme ve özlük dokümanları"),
  ], "Tek personel kartı, özlük, kart geçmişi ve yetkiler"),
  section("planning", "Vardiya & İzin", "CalendarRange", [
    tab("shift", "Vardiya Planı", "calendar", ["Personel","Tarih","Vardiya","Başlangıç","Bitiş","Onay"], "Gündüz/gece, aynı gün çift vardiya ve plan doğrulama"),
    tab("calendar", "Çalışma Takvimi", "calendar", ["Tarih","Gün","Grup","Plan","Tatil","Durum"], "Çalışma günleri, hafta sonu ve tatil kuralları"),
    tab("leave", "İzin Talepleri", "approval", ["Personel","İzin Türü","Başlangıç","Bitiş","Gün","Onay","Durum"], "Yıllık, mazeret, rapor ve izin onayları"),
    tab("overtime", "Mesai Talepleri", "approval", ["Personel","Tarih","Saat","Oran","Gerekçe","Onay"], "Fazla çalışma onayı ve %50 / %100"),
    tab("holidays", "Resmî Tatiller", "calendar", ["Tarih","Tatil Adı","Süre","Çalışma Kararı","Durum"], "Tam ve yarım gün tatil teyidi"),
    tab("routes", "Servis Hatları", "grid", ["Hat","Güzergâh","Personel","Dönem","Durum"], "Servis, yol ve görev bağlantıları"),
  ], "Çalışma planı, izin, mesai ve takvim"),
  section("timesheet", "Puantaj", "TableProperties", [
    tab("daily", "Günlük Puantaj", "timesheet", ["Kart No","Personel","Tarih","Giriş","Çıkış","Süre","E","Durum"], "Personel bazında günlük çalışma hesabı"),
    tab("monthly", "Aylık Puantaj", "timesheet", ["Kart No","Personel","Çalışılan","İzin","Mesai","Eksik","Durum"], "Kişi × gün ve dönem özetleri"),
    tab("corrections", "Düzeltme Merkezi", "approval", ["Personel","Tarih","Alan","Eski","Yeni","Gerekçe","Onay"], "Kanıt → önizleme → onay → mutabakat"),
    tab("validation", "Dönem Kontrolü", "audit", ["Kontrol","Personel","Gün","Kaynak","Fark","Durum"], "Kaynak ve hesap tutarlılığı"),
    tab("closing", "Ay Kapatma", "approval", ["Dönem","Kontrol","Eksik","Onaylayan","Kilit","Durum"], "Kilit, açma gerekçesi ve denetim"),
  ], "Tek hesap motoru, kontrol ve güvenli dönem kapatma"),
  section("payroll", "Bordro & Ödeme", "WalletCards", [
    tab("earnings", "Hakediş Özeti", "payroll", ["Kart No","Personel","Maaş","Yol","Ek Yol","Yemek","Mesai","Toplam"], "Puantajdan bordroya hakediş"),
    tab("salary", "Maaş Bordrosu", "payroll", ["Personel","Brüt","Kesinti","Net","Dönem","Durum"], "Yetkili bordro hesapları"),
    tab("advances", "Avans & Ek Kazanç", "payroll", ["Personel","Tarih","Tür","Tutar","Onay","Durum"], "Toplu avans ve ek kazanç"),
    tab("deductions", "Kesintiler", "payroll", ["Personel","Tarih","Tür","Tutar","Açıklama","Durum"], "Kesinti kayıtları"),
    tab("payments", "Banka / Elden", "payroll", ["Personel","Dönem","Banka","Elden","Toplam","Ödeme"], "Ödeme ve mutabakat"),
    tab("receipts", "Ödeme Fişleri", "payroll", ["Personel","Dönem","Belge","Tutar","İmza","Durum"], "Ödeme belgesi ve imza"),
  ], "Hakediş, maaş, avans, kesinti ve ödeme"),
  section("reports", "Rapor & Denetim", "ChartNoAxesCombined", [
    tab("attendance", "Devam Raporları", "report", ["Rapor","Dönem","Kapsam","İşlem","Durum"], "Günlük ve aylık personel devam raporları"),
    tab("violations", "İhlal Raporları", "report", ["Personel","Tarih","İhlal","Kanıt","Durum"], "Geç giriş, eksik kart, erken çıkış"),
    tab("signatures", "İmza Formları", "report", ["Tarih","Personel","Kart No","Eksik Hareket","Saat","İmza"], "Eksik kart ve giriş/çıkış imza listeleri"),
    tab("timesheets", "Puantaj Raporları", "report", ["Rapor","Dönem","Gün","Mesai","İzin","Durum"], "Puantaj dönem analizleri"),
    tab("payroll", "Bordro Raporları", "report", ["Personel","Dönem","Maaş","Yol","Ek Yol","Yemek","Mesai","Avans","Kesinti","İcra/Haciz","BES","Banka","Elden","Toplam","Durum"], "Ödeme ve bordro raporları", { sensitive: true }),
    tab("audit", "İşlem Geçmişi", "audit", ["Tarih","Kullanıcı","İşlem","Kaynak","Eski/Yeni","Sonuç"], "Değişiklik yapan kullanıcı ve değişiklik izi"),
  ], "Çıktı, analiz, imza belgeleri ve kayıt izi"),
  section("devices", "Cihaz & Senkron", "ServerCog", [
    tab("terminals", "Terminaller", "sync", ["Cihaz","Bağlantı","Son Okuma","Kayıt","Durum"], "Bağlı fiziksel kart cihazları"),
    tab("transfer", "Aktarım Merkezi", "sync", ["Batch","Cihaz","Başlangıç","Okunan","Yazılan","Reddedilen","Durum"], "Ham cihaz kanıtı ve geri alma"),
    tab("tnf", "TNF Arşivi", "sync", ["Yıl","Kaynak","Normal","E","Son Mutabakat","Durum"], "Yıllık resmî TNF ile aylık cihaz kayıtları ayrımı"),
    tab("cloud", "Cloud Senkron", "sync", ["Kaynak","Sürüm","Son İşlem","ACK","Gecikme","Durum"], "Cloud D1 / Windows Agent olay onayı"),
    tab("reconciliation", "Veri Mutabakatı", "audit", ["Kart","Tarih","FDB","TNF","Cloud","Fark","Durum"], "Kaynaklar arasında onaylı eşleşme"),
    tab("incidents", "Hata Merkezi", "audit", ["Zaman","Kaynak","Hata","Deneme","Günlük","Durum"], "Yeniden deneme ve destek tanılaması"),
  ], "Terminal, TNF, Cloud ve veri tutarlılığı"),
  section("admin", "Yönetim", "Settings2", [
    tab("companies", "Firmalar", "settings", ["Firma","Durum","Personel","Ayar","Güncelleme"], "Firma ve tenant yönetimi"),
    tab("users", "Kullanıcılar", "settings", ["Kullanıcı","Rol","Firma","Son Oturum","Durum"], "Kullanıcı ve oturumlar"),
    tab("permissions", "Roller & Yetkiler", "settings", ["Rol","Modül","Okuma","Yazma","Onay","Bordro"], "İşlem düzeyi rol kuralları"),
    tab("rules", "İş Kuralları", "settings", ["Kural","Grup","Geçerlilik","Onay","Durum"], "Vardiya, tolerans, izin ve puantaj kuralları"),
    tab("backup", "Yedekleme", "settings", ["Kaynak","Son Yedek","Hedef","Sağlık","Durum"], "Yedek ve geri dönüş doğrulaması"),
    tab("integrations", "Entegrasyonlar", "settings", ["Hedef","Bağlantı","İşlem","Son Test","Durum"], "KY ERP ve izinli dış sistemler"),
    tab("system", "Sistem Günlüğü", "audit", ["Zaman","Seviye","Kaynak","Mesaj","Durum"], "Sistem sağlığı ve olay günlükleri"),
  ], "Firma, erişim, kurallar, yedek ve entegrasyon"),
]);

export const ALL_PRODUCT_TABS = Object.freeze(PRODUCT_SECTIONS.flatMap((group) =>
  group.tabs.map((item) => ({ ...item, section: group.id, sectionLabel: group.label, icon: group.icon }))));

const sectionMap = new Map(PRODUCT_SECTIONS.map((item) => [item.id, item]));
const tabMap = new Map(ALL_PRODUCT_TABS.map((item) => [item.id, item]));
export const getSection = (sectionId) => sectionMap.get(sectionId) || PRODUCT_SECTIONS[0];
export const getTab = (tabId) => tabMap.get(tabId) || ALL_PRODUCT_TABS[0];
export const resolveProductRoute = (sectionId, tabId) => {
  const sectionValue = getSection(sectionId);
  const tabValue = sectionValue.tabs.find((item) => item.id === tabId) || sectionValue.tabs[0];
  return { section: sectionValue, tab: tabValue };
};

export const PRODUCT_PERSON_TABS = Object.freeze([
  ["identity","Özlük"],["card","Kart & Cihaz"],["attendance","Devam"],
  ["shift","Vardiya"],["leave","İzin"],["timesheet","Puantaj"],
  ["payroll","Bordro"],["documents","Evrak"],["history","İşlem Geçmişi"],
]);

export const isSensitiveProductTab = (tabId) => {
  const item = tabMap.get(tabId);
  return item?.sensitive === true || item?.view === "payroll" ||
    item?.section === "payroll";
};

export function inspectProductModel() {
  const sectionIds = PRODUCT_SECTIONS.map((x) => x.id);
  const tabIds = ALL_PRODUCT_TABS.map((x) => x.id);
  return {
    sections: sectionIds.length,
    tabs: tabIds.length,
    duplicateSections: sectionIds.filter((x,i) => sectionIds.indexOf(x) !== i),
    duplicateTabs: tabIds.filter((x,i) => tabIds.indexOf(x) !== i),
    unsupportedViews: ALL_PRODUCT_TABS.filter((x) => !new Set([
      "dashboard","attendance","approval","people","grid","calendar","timesheet",
      "payroll","report","sync","settings","audit",
    ]).has(x.view)).map((x) => x.id),
    missingColumns: ALL_PRODUCT_TABS.filter((x) => x.view !== "dashboard" && !x.columns.length).map((x) => x.id),
  };
}

/**
 * Presentation-only, tenant-customizable module menu.
 * Permission checks remain mandatory in the API and cannot be granted here.
 */
export function configuredProductSections(options = {}, {audit = false} = {}) {
  const known = new Set(PRODUCT_SECTIONS.map((item) => item.id));
  const invisible = new Set(
    (Array.isArray(options.hiddenSections) ? options.hiddenSections : [])
      .filter((id) => known.has(id))
  );
  if (audit) {
    invisible.add("payroll");
    invisible.add("admin");
  }
  // Keep at least one working landing page even if the config is invalid.
  invisible.delete("overview");
  const order = Array.isArray(options.sectionOrder)
    ? options.sectionOrder.filter((id) => known.has(id))
    : [];
  const captions = options.labels && typeof options.labels === "object"
    ? options.labels : {};
  return PRODUCT_SECTIONS
    .filter((item) => !invisible.has(item.id))
    .sort((a,b) => {
      const ai=order.indexOf(a.id), bi=order.indexOf(b.id);
      return (ai<0?999:ai)-(bi<0?999:bi);
    })
    .map((item) => ({
      ...item,
      tabs: audit ? item.tabs.filter((tab) => !isSensitiveProductTab(tab.id)) : item.tabs,
      label: typeof captions[item.id] === "string" &&
        captions[item.id].trim().length > 0 &&
        captions[item.id].length <= 32
          ? captions[item.id].trim() : item.label,
    }));
}
