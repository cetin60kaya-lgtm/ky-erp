import { useEffect, useMemo, useState } from "react";
import {
  createPaymentReminder as createPaymentReminderApi,
  detectAccountingDocument,
  exportAccountingReport,
  getAccountingDashboard,
  getAccountingManagementSummary,
  getAccountingPreview,
  getAccountingQueue,
  getAccountingReport,
  getPaymentQueue,
  runAccountingAction,
  runPaymentAction,
  uploadAccountingDocument,
} from "../../../services/muhasebeApi";

const TODAY = "2026-05-20";

const SCREEN_META = {
  accounting: {
    title: "Belge Merkezi",
    subtitle:
      "PDF, XML, JPG ve PNG belgeleri yüklenir; sistem belge, firma, tarih, tutar, KDV, model ve adet bilgisini eşleştirir.",
    queueTitle: "Muhasebe İş Kuyruğu",
    tableTitle: "Belge / Fatura / İrsaliye Merkezi",
  },
  payment: {
    title: "Cari / Ödeme / Tahsilat",
    subtitle:
      "Cari ödeme, müşteri tahsilatı, tedarikçi ödeme, vergi ve nakit akışı eksik alan paneliyle tamamlanır.",
    queueTitle: "Vade / Ödeme Kuyruğu",
    tableTitle: "Cari, Ödeme ve Tahsilat Takibi",
  },
  due: {
    title: "Çek / Kart / Vade Takip",
    subtitle:
      "Çek, kredi kartı ve yaklaşan vadeler tek kuyrukta izlenir; hatırlatma ve kapanış işlemleri sağ panelden tamamlanır.",
    queueTitle: "Çek / Kart / Vade Kuyruğu",
    tableTitle: "Çek, Kart ve Vade Takibi",
  },
};

const ACCOUNTING_TYPES = [
  "Müşteri İrsaliyesi",
  "Bizim Fatura",
  "Bizim İrsaliye",
  "Tedarikçi Faturası",
  "Ödeme / Ekstre",
];

const PAYMENT_TYPES = [
  "Çek Ödemesi",
  "Çek Tahsilatı",
  "Kredi Kartı",
  "Tedarikçi Ödeme",
  "Müşteri Tahsilat",
  "Cari Ödeme",
  "Maaş / İşçilik",
  "Nakit Gider",
  "Banka Transferi",
  "KDV / Vergi",
  "SGK",
  "Diğer",
];

const PAYMENT_INCOME_TYPES = new Set([
  "Çek Tahsilatı",
  "Müşteri Tahsilat",
  "Banka Transferi",
]);

const PAYMENT_EXPENSE_TYPES = new Set([
  "Çek Ödemesi",
  "Kredi Kartı",
  "Tedarikçi Ödeme",
  "Cari Ödeme",
  "Maaş / İşçilik",
  "Nakit Gider",
  "KDV / Vergi",
  "SGK",
  "Diğer",
]);

const ACCOUNTING_FILTERS = [
  ["all", "Tümü"],
  ["raw", "Ham Belge"],
  ["control", "Kontrol Bekleyen"],
  ["dispatch", "Gelen İrsaliye"],
  ["invoice", "Bizim Fatura / İrsaliye"],
  ["supplier", "Tedarikçi Fatura"],
  ["remaining", "Kalan Fatura"],
  ["cari-kdv", "Cari/KDV Bekleyen"],
  ["mail", "Mail Bekleyen"],
  ["done", "Tamamlanan"],
];

const PAYMENT_FILTERS = [
  ["all", "Tümü"],
  ["today", "Bugün"],
  ["three", "3 gün içinde"],
  ["seven", "7 gün içinde"],
  ["month", "Bu ay"],
  ["late", "Geciken"],
  ["check", "Çek"],
  ["card", "Kredi kartı"],
  ["supplier", "Tedarikçi"],
  ["payroll", "İşçilik / maaş"],
  ["cari", "Cari ödeme"],
  ["collection", "Tahsilat"],
  ["tax", "Vergi / KDV"],
];

const PERIOD_OPTIONS = [
  ["today", "Bugün"],
  ["week", "Bu Hafta"],
  ["month", "Bu Ay"],
  ["last-month", "Geçen Ay"],
  ["range", "Tarih Aralığı"],
];

const REPORT_TYPES = [
  ["WEEKLY_SUMMARY", "Haftalık Özet Yazdır"],
  ["MONTHLY_SUMMARY", "Aylık Özet Yazdır"],
  ["ALL_CHEQUES", "Çek Listesi Yazdır"],
  ["MONTHLY_COLLECTIONS", "Bu Ay Tahsilatlar Yazdır"],
  ["MONTHLY_PAYMENTS", "Bu Ay Ödemeler Yazdır"],
  ["MONTHLY_CASH_FLOW", "Bu Ay Gelen / Giden Yazdır"],
  ["SUPPLIER_DEBTS", "Tedarikçi Borçları Yazdır"],
  ["CUSTOMER_RECEIVABLES", "Müşteri Alacakları Yazdır"],
  ["CARD_BANK_SUMMARY", "Kredi Kartı / Banka Özeti Yazdır"],
  ["FULL_ACCOUNTING_SUMMARY", "Komple Muhasebe Özeti Yazdır"],
];

const LEGACY_ROUTE_MAP = {
  "genel-bakis": { screen: "accounting", filter: "all" },
  "yonetim-ozeti": { screen: "accounting", filter: "all" },
  "kontrol-paneli": { screen: "accounting", filter: "all" },
  "belge-merkezi": { screen: "accounting", filter: "all" },
  "belge-is-akisi": { screen: "accounting", filter: "all" },
  "hizli-giris": { screen: "accounting", filter: "raw" },
  "belge-yukle": { screen: "accounting", filter: "raw" },
  "gelen-irsaliye": { screen: "accounting", filter: "dispatch" },
  "giden-fatura": { screen: "accounting", filter: "invoice" },
  "bizim-fatura": { screen: "accounting", filter: "invoice" },
  "bizim-irsaliye": { screen: "accounting", filter: "invoice" },
  "tedarik-fatura": { screen: "accounting", filter: "supplier" },
  cari: { screen: "accounting", filter: "cari-kdv" },
  firmalar: { screen: "accounting", filter: "cari-kdv" },
  kdv: { screen: "accounting", filter: "cari-kdv" },
  "mail-ekstre": { screen: "accounting", filter: "mail" },
  "eposta-ekstre": { screen: "accounting", filter: "mail" },
  "odeme-tahsilat": { screen: "payment", filter: "all" },
  odemeler: { screen: "payment", filter: "all" },
  "cari-odeme-tahsilat": { screen: "payment", filter: "all" },
  "cek-kart": { screen: "due", filter: "check" },
  "cek-kart-vade": { screen: "due", filter: "all" },
  "odeme-nakit-akisi": { screen: "due", filter: "all" },
  raporlar: { screen: "accounting", filter: "all" },
  ayarlar: { screen: "accounting", filter: "all" },
};

const initialData = {
  accounting: [
    {
      id: "A-1001",
      source: "dispatch",
      date: "2026-05-19",
      type: "Müşteri İrsaliyesi",
      firm: "TAHA GİYİM",
      model: "THINK",
      product: "",
      docNo: "DDM2026000000410",
      dispatchQty: 35640,
      productionQty: 35640,
      invoiceQty: 29700,
      amount: 0,
      official: true,
      needsLot: false,
      lotNo: "",
      cari: true,
      kdv: true,
      mail: false,
      closed: false,
      note: "Kalan fatura ve mail bekliyor.",
      logs: ["Müşteri irsaliyesi geldi.", "Model bağlandı.", "Kısmi fatura kesildi."],
    },
    {
      id: "A-1002",
      source: "quick",
      date: "2026-05-19",
      type: "Müşteri İrsaliyesi",
      firm: "TAHA GİYİM",
      model: "",
      product: "",
      docNo: "DDM2026000000418",
      dispatchQty: 66805,
      productionQty: 0,
      invoiceQty: 0,
      amount: 0,
      official: true,
      needsLot: false,
      lotNo: "",
      cari: false,
      kdv: false,
      mail: false,
      closed: false,
      note: "Model ve imalat bekliyor.",
      logs: ["Belge hızlı girişe düştü.", "Firma ve adet okundu."],
    },
    {
      id: "A-1003",
      source: "invoice",
      date: "2026-05-18",
      type: "Bizim Fatura",
      firm: "TAHA GİYİM",
      model: "KAPPA 10",
      product: "",
      docNo: "HKN2026000000411",
      dispatchQty: 31680,
      productionQty: 31680,
      invoiceQty: 31680,
      amount: 0,
      official: true,
      needsLot: false,
      lotNo: "",
      cari: true,
      kdv: true,
      mail: false,
      closed: false,
      note: "Fatura ve irsaliye tamam, mail bekliyor.",
      logs: ["Fatura no oluştu.", "Cari/KDV işlendi."],
    },
    {
      id: "A-1004",
      source: "supplier",
      date: "2026-05-17",
      type: "Tedarikçi Faturası",
      firm: "URAS KİMYA",
      model: "",
      product: "S 10 ŞEFFAF",
      docNo: "SLV2026000000461",
      dispatchQty: 0,
      productionQty: 0,
      invoiceQty: 0,
      amount: 80236,
      official: true,
      needsLot: true,
      lotNo: "LOT-0461",
      cari: true,
      kdv: true,
      mail: true,
      closed: false,
      note: "Tedarikçi faturası tamam.",
      logs: ["Ürün ve lot eşleşti.", "Cari/KDV işlendi."],
    },
    {
      id: "A-1005",
      source: "supplier",
      date: "2026-05-18",
      type: "Tedarikçi Faturası",
      firm: "SELVİ KİMYA",
      model: "",
      product: "",
      docNo: "SLV2026000000491",
      dispatchQty: 0,
      productionQty: 0,
      invoiceQty: 0,
      amount: 63825,
      official: true,
      needsLot: true,
      lotNo: "",
      cari: false,
      kdv: false,
      mail: true,
      closed: false,
      note: "Ürün alias ve lot bekliyor.",
      logs: ["Fatura okundu.", "Ürün eşleşmesi yok."],
    },
    {
      id: "A-1006",
      source: "statement",
      date: "2026-05-19",
      type: "Ödeme / Ekstre",
      firm: "BOYA TEDARİK",
      model: "",
      product: "Ekstre",
      docNo: "EXT-2026-05",
      dispatchQty: 0,
      productionQty: 0,
      invoiceQty: 0,
      amount: 33864,
      official: false,
      needsLot: false,
      lotNo: "",
      cari: false,
      kdv: false,
      mail: true,
      closed: false,
      note: "Cari ödeme ile eşleşecek.",
      logs: ["Ekstre kaydı açıldı."],
    },
  ],
  payment: [
    {
      id: "P-2001",
      dueDate: "2026-05-19",
      type: "Müşteri Tahsilat",
      firm: "TAHA GİYİM",
      desc: "Fatura tahsilatı",
      docNo: "HKN2026000000411",
      amount: 180000,
      method: "Banka",
      account: "Garanti Bankası",
      reminder: true,
      paid: false,
      closed: false,
      cariClosed: false,
      note: "Bugün tahsil edilecek.",
      logs: ["Tahsilat planı açıldı.", "Hatırlatma kuruldu."],
    },
    {
      id: "P-2002",
      dueDate: "2026-05-21",
      type: "Çek Ödemesi",
      firm: "URAS KİMYA",
      desc: "Tedarikçi çek ödemesi",
      docNo: "CEK-2026-001",
      amount: 150000,
      method: "Çek",
      account: "Banka / Çek",
      reminder: true,
      paid: false,
      closed: false,
      cariClosed: false,
      note: "2 gün içinde ödeme.",
      logs: ["Çek kaydı açıldı.", "Yaklaşan ödeme olarak işaretlendi."],
    },
    {
      id: "P-2003",
      dueDate: "2026-05-22",
      type: "Kredi Kartı",
      firm: "İş Bankası",
      desc: "Kredi kartı dönem ödemesi",
      docNo: "KK-IS-05",
      amount: 87500,
      method: "Kredi Kartı",
      account: "İş Bankası Kart",
      reminder: false,
      paid: false,
      closed: false,
      cariClosed: false,
      note: "Kart ödeme günü yaklaşıyor.",
      logs: ["Kredi kartı ödeme kaydı açıldı."],
    },
    {
      id: "P-2004",
      dueDate: "2026-05-25",
      type: "Maaş / İşçilik",
      firm: "Personel",
      desc: "Aylık işçilik ve maaş ödemesi",
      docNo: "MAAS-2026-05",
      amount: 220000,
      method: "Banka / Nakit",
      account: "Kasa + Banka",
      reminder: true,
      paid: false,
      closed: false,
      cariClosed: false,
      note: "Maaş ödeme planı.",
      logs: ["Maaş ödeme planı oluşturuldu."],
    },
    {
      id: "P-2005",
      dueDate: "2026-05-15",
      type: "Tedarikçi Ödeme",
      firm: "BOYA TEDARİK",
      desc: "Geciken tedarikçi ödemesi",
      docNo: "BT202600000115",
      amount: 33864,
      method: "Banka",
      account: "Garanti Bankası",
      reminder: true,
      paid: false,
      closed: false,
      cariClosed: false,
      note: "Gecikmiş ödeme.",
      logs: ["Ödeme gecikti olarak işaretlendi."],
    },
    {
      id: "P-2006",
      dueDate: "2026-05-28",
      type: "KDV / Vergi",
      firm: "Vergi Dairesi",
      desc: "Mayıs KDV tahakkuku",
      docNo: "KDV-2026-05",
      amount: 64000,
      method: "Banka",
      account: "Ziraat Bankası",
      reminder: false,
      paid: false,
      closed: false,
      cariClosed: false,
      note: "Vergi ödeme vadesi.",
      logs: ["KDV ödeme planı açıldı."],
    },
  ],
};

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatQty(value) {
  return Number(value || 0).toLocaleString("tr-TR");
}

function calculateRemainingQty(record = {}) {
  return Math.max(0, Number(record.dispatchQty || 0) - Number(record.invoiceQty || 0));
}

function calculateDaysLeft(dateValue) {
  if (!dateValue) return 999;
  const today = new Date(`${TODAY}T00:00:00`);
  const due = new Date(`${dateValue}T00:00:00`);
  return Math.round((due - today) / 86400000);
}

function getAccountingStatus(record = {}) {
  const remaining = calculateRemainingQty(record);
  if (record.closed) return { text: "Kapandı", tone: "green", ok: true };
  if (record.raw) return { text: "Ham Belge", tone: "blue", ok: false };
  if (record.controlWaiting) return { text: "Kontrol Bekliyor", tone: "orange", ok: false };
  if (!record.docNo || !record.firm) return { text: "Eksik bilgi", tone: "red", ok: false };
  if (record.type !== "Tedarikçi Faturası" && record.type !== "Ödeme / Ekstre" && !record.model) return { text: "Model eksik", tone: "red", ok: false };
  if (record.type !== "Tedarikçi Faturası" && Number(record.dispatchQty || 0) > 0 && !Number(record.productionQty || 0)) return { text: "İmalat bekliyor", tone: "blue", ok: false };
  if (remaining > 0) return { text: "Kalan fatura var", tone: "orange", ok: false };
  if (record.type === "Tedarikçi Faturası" && !record.product) return { text: "Ürün eksik", tone: "red", ok: false };
  if (record.type === "Tedarikçi Faturası" && record.needsLot && !record.lotNo) return { text: "Lot bekliyor", tone: "orange", ok: false };
  if (!record.cari || (record.official && !record.kdv)) return { text: "Cari/KDV bekliyor", tone: "purple", ok: false };
  if ((record.type === "Bizim Fatura" || record.type === "Bizim İrsaliye") && !record.mail) return { text: "Mail bekliyor", tone: "orange", ok: false };
  return { text: "Tamam", tone: "green", ok: true };
}

function getPaymentStatus(record = {}) {
  if (record.closed) return { text: "Kapandı", tone: "green", ok: true };
  if (record.paid && record.type.includes("Tahsilat")) return { text: "Tahsil edildi", tone: "green", ok: true };
  if (record.paid) return { text: "Ödendi", tone: "green", ok: true };
  if (!record.dueDate || !record.firm || !Number(record.amount || 0) || !record.method) return { text: "Bekliyor", tone: "red", ok: false };
  const days = calculateDaysLeft(record.dueDate);
  if (days < 0) return { text: "Gecikti", tone: "red", ok: false };
  if (days === 0) return { text: "Bugün", tone: "orange", ok: false };
  if (days <= 3) return { text: "Yaklaşıyor", tone: "orange", ok: false };
  if (record.reminder) return { text: "Hatırlatma kurulu", tone: "blue", ok: false };
  return { text: "Bekliyor", tone: "gray", ok: false };
}

function getNextAccountingAction(record = {}) {
  const status = getAccountingStatus(record).text;
  if (status === "Kapandı") return "Tekrar aç";
  if (status === "Ham Belge") return "Kontrole Al";
  if (status === "Kontrol Bekliyor") return "Bilgiyi tamamla";
  if (status === "Eksik bilgi") return "Bilgiyi tamamla";
  if (status === "Model eksik") return "Modele bağla";
  if (status === "İmalat bekliyor") return "İmalat adedini al";
  if (status === "Kalan fatura var") return "Kalanı kes";
  if (status === "Ürün eksik") return "Ürün eşleştir";
  if (status === "Lot bekliyor") return "Lot oluştur";
  if (status === "Cari/KDV bekliyor") return "Cari/KDV işle";
  if (status === "Mail bekliyor") return "Mail gönder";
  return "Kapat";
}

function getNextPaymentAction(record = {}) {
  const status = getPaymentStatus(record).text;
  if (status === "Kapandı") return "Tekrar aç";
  if (record.paid || status === "Ödendi" || status === "Tahsil edildi") return "Cariyle eşleştir";
  if (!record.reminder && status === "Bekliyor") return "Hatırlatma kur";
  if (status === "Gecikti") return "Gecikti işaretle";
  if (record.type === "Çek Ödemesi") return "Çek ödendi yap";
  if (record.type === "Çek Tahsilatı") return "Çek tahsil edildi yap";
  if (record.type === "Kredi Kartı") return "Kart ödemesini kapat";
  if (record.type.includes("Tahsilat")) return "Tahsilat gir";
  if (status === "Bugün") return "Bugün kapat";
  return "Ödeme gir";
}

function accountingActionCode(action) {
  return {
    "Kontrole Al": "CONTROL",
    "Firmayı eşleştir": "MATCH_FIRM",
    "Modele bağla": "LINK_MODEL",
    "Ürün eşleştir": "MATCH_PRODUCT",
    "Lot oluştur": "CREATE_LOT",
    "İmalat adedini al": "IMPORT_PRODUCTION_QTY",
    "Kalanı kes": "CREATE_REMAINING_INVOICE",
    "Cari/KDV işle": "POST_CARI_KDV",
    "Mail gönder": "SEND_MAIL",
    Kapat: "CLOSE",
    "Tekrar aç": "REOPEN",
  }[action] || "CONTROL";
}

function paymentActionCode(action) {
  return {
    "Hatırlatma kur": "CREATE_REMINDER",
    "Ödeme gir": "MARK_PAID",
    "Tahsilat gir": "MARK_COLLECTED",
    "Bugün kapat": "MARK_PAID",
    "Gecikti işaretle": "MARK_DELAYED",
    "Çek ödendi yap": "MARK_PAID",
    "Çek tahsil edildi yap": "MARK_COLLECTED",
    "Kart ödemesini kapat": "MARK_PAID",
    "Cariyle eşleştir": "MATCH_CARI",
    Kapat: "CLOSE",
    "Tekrar aç": "REOPEN",
  }[action] || "CREATE_REMINDER";
}

function calculateDashboardStats(screen, rows) {
  if (screen === "control") {
    const accountingRows = rows.accounting || [];
    const paymentRows = rows.payment || [];
    const monthRows = paymentRows.filter((row) => String(row?.dueDate || "").slice(0, 7) === TODAY.slice(0, 7));
    const monthExpense = monthRows
      .filter((row) => PAYMENT_EXPENSE_TYPES.has(row?.type))
      .reduce((sum, row) => sum + Number(row?.amount || 0), 0);
    const monthIncome = monthRows
      .filter((row) => PAYMENT_INCOME_TYPES.has(row?.type))
      .reduce((sum, row) => sum + Number(row?.amount || 0), 0);
    const cashDiff = monthIncome - monthExpense;
    return [
      ["Bugün ödenecek", formatMoney(sumPayment(paymentRows, (row) => calculateDaysLeft(row?.dueDate) === 0 && PAYMENT_EXPENSE_TYPES.has(row?.type) && !row?.paid)), "Bugün"],
      ["Bugün tahsil edilecek", formatMoney(sumPayment(paymentRows, (row) => calculateDaysLeft(row?.dueDate) === 0 && PAYMENT_INCOME_TYPES.has(row?.type) && !row?.paid)), "Bugün"],
      ["Bu hafta ödenecek", formatMoney(sumPayment(paymentRows, (row) => betweenDays(row, 0, 7) && PAYMENT_EXPENSE_TYPES.has(row?.type) && !row?.paid)), "7 gün"],
      ["Bu hafta tahsil edilecek", formatMoney(sumPayment(paymentRows, (row) => betweenDays(row, 0, 7) && PAYMENT_INCOME_TYPES.has(row?.type) && !row?.paid)), "7 gün"],
      ["Bu ay toplam gider", formatMoney(monthExpense), "Çıkış"],
      ["Bu ay toplam tahsilat", formatMoney(monthIncome), "Giriş"],
      ["Nakit açık / fazla", formatMoney(cashDiff), cashDiff >= 0 ? "Pozitif" : "Negatif", cashDiff >= 0 ? "green" : "red"],
      ["Geciken ödeme", paymentRows.filter((row) => calculateDaysLeft(row?.dueDate) < 0 && PAYMENT_EXPENSE_TYPES.has(row?.type) && !row?.paid).length, "Acil", "red"],
      ["Geciken tahsilat", paymentRows.filter((row) => calculateDaysLeft(row?.dueDate) < 0 && PAYMENT_INCOME_TYPES.has(row?.type) && !row?.paid).length, "Aranacak", "red"],
      ["Yaklaşan çek", paymentRows.filter((row) => row?.type.includes("Çek") && betweenDays(row, 0, 7) && !row?.paid).length, "Çek"],
      ["Yaklaşan kredi kartı", paymentRows.filter((row) => row.type === "Kredi Kartı" && betweenDays(row, 0, 7) && !row?.paid).length, "Kart"],
      ["Tedarikçi borcu", formatMoney(sumPayment(paymentRows, (row) => row.type === "Tedarikçi Ödeme" && !row?.paid)), "Bekleyen"],
      ["Müşteri alacağı", formatMoney(sumPayment(paymentRows, (row) => PAYMENT_INCOME_TYPES.has(row?.type) && !row?.paid)), "Bekleyen"],
      ["KDV / vergi bekleyen", formatMoney(sumPayment(paymentRows, (row) => (row.type === "KDV / Vergi" || row.type === "SGK") && !row?.paid)), "Vergi"],
      ["Maaş / işçilik bu ay", formatMoney(sumPayment(monthRows, (row) => row.type === "Maaş / İşçilik")), "Personel"],
      ["Belge durumları", accountingRows.filter((row) => !getAccountingStatus(row).ok).length, "Açık iş"],
    ];
  }

  if (screen === "accounting") {
    return [
      ["Bugün gelen belge", rows.filter((row) => row.date === TODAY).length, "Yeni kayıt"],
      ["Yeni yüklenen belge", rows.filter((row) => row?.raw).length, "Ham belge"],
      ["Kontrol bekleyen", rows.filter((row) => row?.controlWaiting).length, "İncelenecek"],
      ["Model bekleyen", rows.filter((row) => getAccountingStatus(row).text === "Model eksik").length, "Bağlanacak"],
      ["Kalan fatura", formatQty(rows.reduce((sum, row) => sum + calculateRemainingQty(row), 0)), "Kesilecek adet"],
      ["Tedarikçi fatura bekleyen", rows.filter((row) => row.type === "Tedarikçi Faturası" && !getAccountingStatus(row).ok).length, "Ürün/lot/cari"],
      ["Cari/KDV bekleyen", rows.filter((row) => getAccountingStatus(row).text === "Cari/KDV bekliyor").length, "İşlenecek"],
      ["Mail bekleyen", rows.filter((row) => getAccountingStatus(row).text === "Mail bekliyor").length, "Gönderilecek"],
    ];
  }

  const monthRows = rows.filter((row) => String(row?.dueDate || "").slice(0, 7) === TODAY.slice(0, 7));
  const monthExpense = monthRows
    .filter((row) => PAYMENT_EXPENSE_TYPES.has(row?.type))
    .reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const monthIncome = monthRows
    .filter((row) => PAYMENT_INCOME_TYPES.has(row?.type))
    .reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const cashDiff = monthIncome - monthExpense;
  return [
    ["Bugün ödenecek", formatMoney(sumPayment(rows, (row) => calculateDaysLeft(row?.dueDate) === 0 && PAYMENT_EXPENSE_TYPES.has(row?.type) && !row?.paid)), "Vadesi gelen"],
    ["Bugün tahsil edilecek", formatMoney(sumPayment(rows, (row) => calculateDaysLeft(row?.dueDate) === 0 && PAYMENT_INCOME_TYPES.has(row?.type) && !row?.paid)), "Beklenen"],
    ["Geciken ödeme", rows.filter((row) => calculateDaysLeft(row?.dueDate) < 0 && PAYMENT_EXPENSE_TYPES.has(row?.type) && !row?.paid).length, "Acil"],
    ["Geciken tahsilat", rows.filter((row) => calculateDaysLeft(row?.dueDate) < 0 && PAYMENT_INCOME_TYPES.has(row?.type) && !row?.paid).length, "Aranacak"],
    ["3 gün içinde", rows.filter((row) => betweenDays(row, 1, 3) && !row?.paid).length, "Yaklaşıyor"],
    ["Bu hafta ödenecek", formatMoney(sumPayment(rows, (row) => betweenDays(row, 0, 7) && PAYMENT_EXPENSE_TYPES.has(row?.type) && !row?.paid)), "7 gün"],
    ["Yaklaşan çek", rows.filter((row) => row?.type.includes("Çek") && betweenDays(row, 0, 7) && !row?.paid).length, "Çek"],
    ["Yaklaşan kredi kartı", rows.filter((row) => row.type === "Kredi Kartı" && betweenDays(row, 0, 7) && !row?.paid).length, "Kart"],
    ["Bu ay tedarikçi", formatMoney(sumPayment(monthRows, (row) => row.type === "Tedarikçi Ödeme")), "Ödeme"],
    ["Bu ay işçilik / maaş", formatMoney(sumPayment(monthRows, (row) => row.type === "Maaş / İşçilik")), "Personel"],
    ["Bu ay KDV / vergi", formatMoney(sumPayment(monthRows, (row) => row.type === "KDV / Vergi" || row.type === "SGK")), "Vergi"],
    ["Bu ay toplam gider", formatMoney(monthExpense), "Çıkış"],
    ["Bu ay beklenen tahsilat", formatMoney(monthIncome), "Giriş"],
    ["Nakit açık / fazla", formatMoney(cashDiff), cashDiff >= 0 ? "Pozitif" : "Negatif", cashDiff >= 0 ? "green" : "red"],
  ];
}

function sumPayment(rows, predicate) {
  return rows.filter(predicate).reduce((sum, row) => sum + Number(row?.amount || 0), 0);
}

function betweenDays(row, min, max) {
  const days = calculateDaysLeft(row?.dueDate);
  return days >= min && days <= max;
}

function getReportTitle(reportType) {
  return (
    REPORT_TYPES.find(([key]) => key === reportType)?.[1].replace(" Yazdır", "") ||
    "Muhasebe Özeti"
  );
}

function calculateReportTotals(rows = []) {
  const payments = rows.filter((row) => PAYMENT_EXPENSE_TYPES.has(row?.type));
  const collections = rows.filter((row) => PAYMENT_INCOME_TYPES.has(row?.type));
  const totalPayment = payments.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const totalCollection = collections.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  return {
    totalPayment,
    totalCollection,
    cashDiff: totalCollection - totalPayment,
    overduePayment: payments.filter((row) => calculateDaysLeft(row?.dueDate) < 0 && !row?.paid).length,
    overdueCollection: collections.filter((row) => calculateDaysLeft(row?.dueDate) < 0 && !row?.paid).length,
  };
}

function buildManagementReportData(records, filters = {}) {
  const payments = records.payment || [];
  const documents = records.accounting || [];
  const weekPayments = payments.filter((row) => betweenDays(row, 0, 7));
  const monthPayments = payments.filter((row) => String(row?.dueDate || "").slice(0, 7) === TODAY.slice(0, 7));
  const cheques = payments.filter((row) => row?.type.includes("Çek"));
  const cardBankRows = payments.filter((row) => row.type === "Kredi Kartı" || String(row?.method || "").includes("Banka"));
  const supplierDebts = payments.filter((row) => row.type === "Tedarikçi Ödeme" || row.type === "Çek Ödemesi");
  const customerReceivables = payments.filter((row) => PAYMENT_INCOME_TYPES.has(row?.type));
  return {
    filters,
    payments,
    documents,
    weekPayments,
    weekCollections: weekPayments.filter((row) => PAYMENT_INCOME_TYPES.has(row?.type)),
    weekExpenses: weekPayments.filter((row) => PAYMENT_EXPENSE_TYPES.has(row?.type)),
    monthPayments,
    monthCollections: monthPayments.filter((row) => PAYMENT_INCOME_TYPES.has(row?.type)),
    monthExpenses: monthPayments.filter((row) => PAYMENT_EXPENSE_TYPES.has(row?.type)),
    cheques,
    cardBankRows,
    supplierDebts,
    customerReceivables,
    totals: calculateReportTotals(monthPayments),
    weekTotals: calculateReportTotals(weekPayments),
  };
}

function buildPrintableReport(records, filters) {
  return buildManagementReportData(records, filters);
}

function downloadCsv(fileName, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  try {
    document.body.appendChild(link);
    link?.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function screenFromRoute(activeTab) {
  return LEGACY_ROUTE_MAP[activeTab] || LEGACY_ROUTE_MAP["genel-bakis"];
}

function matchesSearch(row, search) {
  const needle = search.trim().toLocaleLowerCase("tr-TR");
  if (!needle) return true;
  return Object.values(row).join(" ").toLocaleLowerCase("tr-TR").includes(needle);
}

function applyAccountingFilter(row, filter) {
  const status = getAccountingStatus(row).text;
  if (filter === "all") return true;
  if (filter === "quick" || filter === "raw") return row?.raw || row.source === "quick";
  if (filter === "control") return row?.controlWaiting || status === "Kontrol Bekliyor";
  if (filter === "dispatch") return row.type === "Müşteri İrsaliyesi";
  if (filter === "invoice") return row.type === "Bizim Fatura" || row.type === "Bizim İrsaliye";
  if (filter === "supplier") return row.type === "Tedarikçi Faturası";
  if (filter === "remaining") return calculateRemainingQty(row) > 0;
  if (filter === "cari-kdv") return status === "Cari/KDV bekliyor";
  if (filter === "mail") return status === "Mail bekliyor";
  if (filter === "done") return getAccountingStatus(row).ok;
  return true;
}

function applyPaymentFilter(row, filter) {
  if (filter === "all") return true;
  if (filter === "today") return calculateDaysLeft(row?.dueDate) === 0;
  if (filter === "three") return betweenDays(row, 0, 3);
  if (filter === "seven") return betweenDays(row, 0, 7);
  if (filter === "month") return String(row?.dueDate || "").slice(0, 7) === TODAY.slice(0, 7);
  if (filter === "late") return calculateDaysLeft(row?.dueDate) < 0 && !row?.paid;
  if (filter === "check") return row?.type.includes("Çek");
  if (filter === "card") return row.type === "Kredi Kartı";
  if (filter === "supplier") return row.type === "Tedarikçi Ödeme";
  if (filter === "payroll") return row.type === "Maaş / İşçilik";
  if (filter === "cari") return row.type === "Cari Ödeme";
  if (filter === "collection") return row?.type.includes("Tahsilat");
  if (filter === "tax") return row.type === "KDV / Vergi" || row.type === "SGK";
  return true;
}

function statusTone(status) {
  if (typeof status === "string") {
    if (["Tamam", "Kapandı", "Ödendi", "Tahsil edildi"].includes(status)) return "green";
    if (status.includes("Cari") || status.includes("KDV")) return "purple";
    if (status.includes("Eksik") || status.includes("Gecikti")) return "red";
    if (status.includes("bekliyor") || status.includes("Yaklaşıyor") || status.includes("Bugün")) return "orange";
    return "blue";
  }
  return status.tone || "blue";
}

function getStatusForScreen(screen, row) {
  return screen === "accounting" ? getAccountingStatus(row) : getPaymentStatus(row);
}

function getActionForScreen(screen, row) {
  return screen === "accounting" ? getNextAccountingAction(row) : getNextPaymentAction(row);
}

function rowTitle(screen, row) {
  if (screen === "accounting") return row?.docNo || row?.type || row?.id;
  return row?.docNo || row?.type || row?.id;
}

function rowSub(screen, row) {
  if (screen === "accounting") return `${row?.firm || "-"} / ${row?.model || row?.product || "-"}`;
  return `${row?.firm || "-"} / ${formatMoney(row?.amount)}`;
}

function systemText(screen, row) {
  const status = getStatusForScreen(screen, row);
  if (screen === "accounting") {
    return `Sistem bu kaydı ${row?.type || "belge"} olarak izliyor. Belge, model/ürün, kalan adet, cari, KDV ve mail durumuna göre tek aksiyon üretildi. Durum: ${status.text}.`;
  }
  return `Sistem bu kaydı ${row?.type || "ödeme"} olarak izliyor. Vade, tutar, hatırlatma ve ödeme/tahsilat durumuna göre tek aksiyon üretildi. Durum: ${status.text}.`;
}

function missingText(screen, row) {
  if (screen === "accounting") {
    const misses = [];
    if (!row?.docNo) misses.push("Belge no");
    if (!row?.firm) misses.push("Firma");
    if (row?.type !== "Tedarikçi Faturası" && row?.type !== "Ödeme / Ekstre" && !row?.model) misses.push("Model");
    if (row.type === "Tedarikçi Faturası" && !row?.product) misses.push("Ürün");
    if (row.type === "Tedarikçi Faturası" && row?.needsLot && !row?.lotNo) misses.push("Lot");
    if (!row?.cari) misses.push("Cari");
    if (row?.official && !row?.kdv) misses.push("KDV");
    if ((row.type === "Bizim Fatura" || row.type === "Bizim İrsaliye") && !row?.mail) misses.push("Mail");
    return misses.length ? misses.join(", ") : "Eksik veri yok.";
  }
  const misses = [];
  if (!row?.dueDate) misses.push("Vade tarihi");
  if (!row?.firm) misses.push("Firma / kişi");
  if (!Number(row?.amount || 0)) misses.push("Tutar");
  if (!row?.method) misses.push("Ödeme şekli");
  if (!row?.reminder && !row?.paid) misses.push("Hatırlatma / takip");
  if (!row?.paid && !row?.closed) misses.push("Ödeme / tahsilat kapanışı");
  return misses.length ? misses.join(", ") : "Eksik veri yok.";
}

function StatusBadge({ status }) {
  const text = typeof status === "string" ? status : status.text;
  return <span className={`muh-flow-badge tone-${statusTone(status)}`}>{text}</span>;
}

function Dashboard({ screen, rows }) {
  return (
    <div className="muh-flow-summary is-dashboard">
      {calculateDashboardStats(screen, rows).map(([label, value, sub, tone]) => (
        <div key={label} className={`muh-flow-metric tone-${tone || "blue"}`}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{sub}</small>
        </div>
      ))}
    </div>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={(event) => onChange(event?.target.value)}>
      {options.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}

function QueuePanel({ screen, rows, selectedId, onSelect, search, setSearch, filter, setFilter }) {
  const filters = screen === "accounting" ? ACCOUNTING_FILTERS : PAYMENT_FILTERS;
  return (
    <aside className="muh-flow-panel muh-flow-queue">
      <div className="muh-flow-panel-head">
        <h3>{screen === "accounting" ? "İş kuyruğu" : "Vade kuyruğu"}</h3>
        <span>{rows.length}</span>
      </div>
      <div className="muh-flow-filters">
        <input value={search} onChange={(event) => setSearch(event?.target.value)} placeholder="Ara" />
        <FilterSelect value={filter} onChange={setFilter} options={filters} />
      </div>
      <div className="muh-flow-queue-list">
        {rows.map((row) => {
          const status = getStatusForScreen(screen, row);
          return (
            <button key={row?.id} className={row.id === selectedId ? "active" : ""} type="button" onClick={() => onSelect(row?.id)}>
              <strong>{rowTitle(screen, row)}</strong>
              <span>{rowSub(screen, row)}</span>
              <StatusBadge status={status} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function MainTable({ screen, rows, selectedId, onSelect, search, setSearch, filter, setFilter, detectCurrentRecord }) {
  const filters = screen === "accounting" ? ACCOUNTING_FILTERS : PAYMENT_FILTERS;
  return (
    <section className="muh-flow-panel muh-flow-table-panel">
      <div className="muh-flow-panel-head">
        <h3>{SCREEN_META[screen].tableTitle}</h3>
        <button className="soft-btn" type="button" onClick={detectCurrentRecord}>
          Tespit Et
        </button>
      </div>
      <div className="muh-flow-filters">
        <input value={search} onChange={(event) => setSearch(event?.target.value)} placeholder="Tabloda ara" />
        <FilterSelect value={filter} onChange={setFilter} options={filters} />
      </div>
      <div className="muh-flow-table-wrap">
        <table>
          <thead>
            <tr>
              {tableColumns(screen).map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th>Durum</th>
              <th>Sıradaki Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = getStatusForScreen(screen, row);
              return (
                <tr key={row?.id} className={row.id === selectedId ? "selected" : ""} onClick={() => onSelect(row?.id)}>
                  {tableColumns(screen).map((column) => (
                    <td key={column.key}>{column.render ? column.render(row) : row[column.key] || "-"}</td>
                  ))}
                  <td>
                    <StatusBadge status={status} />
                  </td>
                  <td>
                    <strong>{getActionForScreen(screen, row)}</strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ManagementSummaryPage({
  records,
  activeMainCompany,
  reportFilters,
  setReportFilters,
  printableReport,
  setPrintableReport,
  setApiNotice,
  onOpenScreen,
}) {
  const reportData = useMemo(
    () => buildManagementReportData(records, reportFilters),
    [records, reportFilters],
  );
  const cheques = reportData.cheques.slice(0, 8);
  const cardBankRows = reportData.cardBankRows.slice(0, 8);
  const documentRows = reportData.documents.slice(0, 8);

  function updateFilter(key, value) {
    setReportFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function prepareReport(reportType = reportFilters.reportType) {
    const nextFilters = { ...reportFilters, reportType };
    try {
      await getAccountingManagementSummary({
        ...nextFilters,
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
      });
      await getAccountingReport(reportType, nextFilters);
    } catch (error) {
      console.warn("Muhasebe management report API error", error);
      setApiNotice("Rapor API yanıt vermedi; canlı kayıtlar ekrandaki mevcut veriden hazırlandı.");
    }
    setPrintableReport({
      reportType,
      createdAt: new Date().toLocaleString("tr-TR"),
      data: buildPrintableReport(records, nextFilters),
    });
    setReportFilters(nextFilters);
  }

  function handlePrintReport() {
    if (!printableReport) {
      setPrintableReport({
        reportType: reportFilters.reportType,
        createdAt: new Date().toLocaleString("tr-TR"),
        data: buildPrintableReport(records, reportFilters),
      });
    }
    window.setTimeout(() => window.print(), 50);
  }

  async function handleExportReport() {
    try {
      await exportAccountingReport(reportFilters.reportType, reportFilters);
    } catch (error) {
      console.warn("Muhasebe export fallback", error);
      const rows = [
        ["Rapor", getReportTitle(reportFilters.reportType)],
        ["Dönem", reportFilters.period],
        ["Toplam ödeme", reportData.totals.totalPayment],
        ["Toplam tahsilat", reportData.totals.totalCollection],
        ["Nakit farkı", reportData.totals.cashDiff],
        [],
        ["Vade", "Tip", "Firma", "Belge No", "Tutar", "Durum"],
        ...reportData.monthPayments.map((row) => [
          row?.dueDate,
          row?.type,
          row?.firm,
          row?.docNo,
          row?.amount,
          getPaymentStatus(row).text,
        ]),
      ];
      downloadCsv(
        `KYERP_Muhasebe_Raporu_${reportFilters.reportType}_${TODAY}.csv`,
        rows,
      );
      setApiNotice("API export yok; CSV dosyası yerel olarak üretildi.");
    }
  }

  return (
    <div className="muh-management-page">
      <section className="muh-flow-panel muh-management-filters no-print">
        <div className="muh-flow-panel-head">
          <h3>Yönetim Rapor Filtresi</h3>
          <span>Rapor</span>
        </div>
        <div className="muh-management-filter-grid">
          <Field label="Dönem">
            <FilterSelect value={reportFilters.period} onChange={(value) => updateFilter("period", value)} options={PERIOD_OPTIONS} />
          </Field>
          <Field label="Başlangıç tarihi"><input type="date" value={reportFilters.startDate} onChange={(event) => updateFilter("startDate", event?.target.value)} /></Field>
          <Field label="Bitiş tarihi"><input type="date" value={reportFilters.endDate} onChange={(event) => updateFilter("endDate", event?.target.value)} /></Field>
          <Field label="Rapor türü">
            <FilterSelect value={reportFilters.reportType} onChange={(value) => updateFilter("reportType", value)} options={REPORT_TYPES.map(([key, label]) => [key, label.replace(" Yazdır", "")])} />
          </Field>
          <button className="primary-btn" type="button" onClick={() => prepareReport(reportFilters.reportType)}>Raporu hazırla</button>
          <button className="soft-btn" type="button" onClick={handlePrintReport}>Yazdır</button>
          <button className="soft-btn" type="button" onClick={handleExportReport}>Excel'e aktar</button>
          <button className="soft-btn" type="button" onClick={() => prepareReport("FULL_ACCOUNTING_SUMMARY")}>PDF / Yazdırma görünümü</button>
        </div>
      </section>

      <section className="muh-flow-panel no-print">
        <div className="muh-flow-panel-head">
          <h3>Rapor Çıktıları</h3>
          <span>{REPORT_TYPES.length + 2}</span>
        </div>
        <div className="muh-report-actions">
          {REPORT_TYPES.map(([key, label]) => (
            <button key={key} className="soft-btn" type="button" onClick={() => prepareReport(key)}>
              {label}
            </button>
          ))}
          <button className="soft-btn" type="button" onClick={handleExportReport}>Excel'e Aktar</button>
          <button className="primary-btn" type="button" onClick={() => prepareReport("FULL_ACCOUNTING_SUMMARY")}>PDF / Yazdırma Görünümü</button>
        </div>
      </section>

      <div className="muh-management-grid no-print">
        <ManagementTable
          title="Bu Hafta Ödeme Planı"
          rows={reportData.weekExpenses}
          columns={[
            ["dueDate", "Vade"],
            ["type", "Tip"],
            ["firm", "Firma / Kişi"],
            ["desc", "Açıklama"],
            ["amount", "Tutar", (row) => formatMoney(row?.amount)],
            ["method", "Ödeme Şekli"],
            ["days", "Kalan Gün", (row) => calculateDaysLeft(row?.dueDate)],
            ["status", "Durum", (row) => <StatusBadge status={getPaymentStatus(row)} />],
          ]}
        />
        <ManagementTable
          title="Çek Listesi"
          rows={cheques}
          columns={[
            ["dueDate", "Vade"],
            ["docNo", "Çek No"],
            ["firm", "Firma"],
            ["type", "Tip"],
            ["amount", "Tutar", (row) => formatMoney(row?.amount)],
            ["account", "Banka"],
            ["days", "Kalan Gün", (row) => calculateDaysLeft(row?.dueDate)],
            ["status", "Durum", (row) => <StatusBadge status={getPaymentStatus(row)} />],
          ]}
        />
        <ManagementTable
          title="Kredi Kartı ve Banka Özeti"
          rows={cardBankRows}
          columns={[
            ["account", "Hesap / Kart"],
            ["docNo", "Dönem"],
            ["dueDate", "Son ödeme"],
            ["amount", "Tutar", (row) => formatMoney(row?.amount)],
            ["days", "Kalan gün", (row) => calculateDaysLeft(row?.dueDate)],
            ["status", "Durum", (row) => <StatusBadge status={getPaymentStatus(row)} />],
          ]}
        />
        <MonthlyCashFlowSummary reportData={reportData} />
        <ManagementTable
          title="Belge / İş Özeti"
          rows={documentRows}
          onRowClick={() => onOpenScreen("accounting")}
          columns={[
            ["date", "Tarih"],
            ["type", "Belge Türü"],
            ["firm", "Firma"],
            ["modelProduct", "Model / Ürün", (row) => row?.model || row?.product || "-"],
            ["docNo", "Belge No"],
            ["status", "Durum", (row) => <StatusBadge status={getAccountingStatus(row)} />],
          ]}
        />
      </div>

      <PrintableReport
        report={printableReport || {
          reportType: reportFilters.reportType,
          createdAt: new Date().toLocaleString("tr-TR"),
          data: reportData,
        }}
        activeMainCompany={activeMainCompany}
      />
    </div>
  );
}

function ManagementTable({ title, rows, columns, onRowClick }) {
  return (
    <section className="muh-flow-panel muh-management-card">
      <div className="muh-flow-panel-head">
        <h3>{title}</h3>
        <span>{rows.length}</span>
      </div>
      <div className="muh-flow-table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map(([key, label]) => <th key={key}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row?.id} onClick={onRowClick}>
                {columns.map(([key, , render]) => (
                  <td key={key}>{render ? render(row) : row[key] || "-"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MonthlyCashFlowSummary({ reportData }) {
  const incoming = [
    ["Müşteri tahsilat", sumPayment(reportData.monthPayments, (row) => row.type === "Müşteri Tahsilat")],
    ["Çek tahsilatı", sumPayment(reportData.monthPayments, (row) => row.type === "Çek Tahsilatı")],
    ["Banka gelen", sumPayment(reportData.monthPayments, (row) => row.type === "Banka Transferi")],
    ["Nakit gelen", 0],
    ["Diğer gelen", 0],
  ];
  const outgoing = [
    ["Tedarikçi ödeme", sumPayment(reportData.monthPayments, (row) => row.type === "Tedarikçi Ödeme")],
    ["Çek ödemesi", sumPayment(reportData.monthPayments, (row) => row.type === "Çek Ödemesi")],
    ["Kredi kartı", sumPayment(reportData.monthPayments, (row) => row.type === "Kredi Kartı")],
    ["Maaş / işçilik", sumPayment(reportData.monthPayments, (row) => row.type === "Maaş / İşçilik")],
    ["KDV / vergi", sumPayment(reportData.monthPayments, (row) => row.type === "KDV / Vergi")],
    ["SGK", sumPayment(reportData.monthPayments, (row) => row.type === "SGK")],
  ];
  return (
    <section className="muh-flow-panel muh-management-card">
      <div className="muh-flow-panel-head">
        <h3>Bu Ay Gelen / Giden</h3>
        <span>{formatMoney(reportData.totals.cashDiff)}</span>
      </div>
      <div className="muh-cash-flow-columns">
        <CashFlowList title="Gelenler" rows={incoming} />
        <CashFlowList title="Gidenler" rows={outgoing} />
      </div>
      <div className="muh-management-totals">
        <strong>Toplam gelen: {formatMoney(reportData.totals.totalCollection)}</strong>
        <strong>Toplam giden: {formatMoney(reportData.totals.totalPayment)}</strong>
        <strong className={reportData.totals.cashDiff >= 0 ? "tone-green" : "tone-red"}>Nakit farkı: {formatMoney(reportData.totals.cashDiff)}</strong>
      </div>
    </section>
  );
}

function CashFlowList({ title, rows }) {
  return (
    <div className="muh-cash-flow-list">
      <h4>{title}</h4>
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{formatMoney(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function PrintableReport({ report, activeMainCompany }) {
  const data = report.data;
  return (
    <section className="print-area muh-print-preview">
      <header className="muh-print-header">
        <h1>KY ERP - Muhasebe Yönetim Özeti</h1>
        <div>
          <span>Ana Firma: {activeMainCompany?.name || activeMainCompany?.slug || "-"}</span>
          <span>Dönem: {data?.filters.period || "Bu Ay"}</span>
          <span>Rapor Türü: {getReportTitle(report.reportType)}</span>
          <span>Oluşturma Tarihi: {report.createdAt}</span>
        </div>
      </header>
      <div className="muh-print-kpis">
        <div><span>Toplam ödeme</span><strong>{formatMoney(data?.totals.totalPayment)}</strong></div>
        <div><span>Toplam tahsilat</span><strong>{formatMoney(data?.totals.totalCollection)}</strong></div>
        <div><span>Nakit farkı</span><strong>{formatMoney(data?.totals.cashDiff)}</strong></div>
        <div><span>Geciken ödeme</span><strong>{data?.totals.overduePayment}</strong></div>
      </div>
      <PrintableTable title="Bu Hafta Ödeme Planı" rows={data?.weekExpenses} />
      <PrintableTable title="Bu Hafta Tahsilat Planı" rows={data?.weekCollections} />
      <PrintableTable title="Çek Listesi" rows={data?.cheques} />
      <PrintableTable title="Bu Ay Ödemeler" rows={data?.monthExpenses} />
      <PrintableTable title="Bu Ay Tahsilatlar" rows={data?.monthCollections} />
      <PrintableTable title="Tedarikçi Borçları" rows={data?.supplierDebts} />
      <PrintableTable title="Müşteri Alacakları" rows={data?.customerReceivables} />
      <PrintableTable title="Kredi Kartı / Banka Özeti" rows={data?.cardBankRows} />
      <PrintableDocumentTable rows={data?.documents} />
      <footer className="muh-print-footer">
        <div>Hazırlayan:</div>
        <div>Not:</div>
      </footer>
    </section>
  );
}

function PrintableTable({ title, rows }) {
  return (
    <div className="muh-print-section">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Vade</th>
            <th>Tip</th>
            <th>Firma / Kişi</th>
            <th>Açıklama</th>
            <th>Belge No</th>
            <th>Tutar</th>
            <th>Ödeme Şekli</th>
            <th>Kalan Gün</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={row?.id}>
              <td>{row?.dueDate || "-"}</td>
              <td>{row?.type || "-"}</td>
              <td>{row?.firm || "-"}</td>
              <td>{row?.desc || "-"}</td>
              <td>{row?.docNo || "-"}</td>
              <td>{formatMoney(row?.amount)}</td>
              <td>{row?.method || "-"}</td>
              <td>{calculateDaysLeft(row?.dueDate)}</td>
              <td>{getPaymentStatus(row).text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintableDocumentTable({ rows }) {
  return (
    <div className="muh-print-section">
      <h2>Belge Durum Özeti</h2>
      <table>
        <thead>
          <tr><th>Tarih</th><th>Belge Türü</th><th>Firma</th><th>Model / Ürün</th><th>Belge No</th><th>Durum</th></tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={row?.id}>
              <td>{row?.date || "-"}</td>
              <td>{row?.type || "-"}</td>
              <td>{row?.firm || "-"}</td>
              <td>{row?.model || row?.product || "-"}</td>
              <td>{row?.docNo || "-"}</td>
              <td>{getAccountingStatus(row).text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function tableColumns(screen) {
  if (screen === "accounting") {
    return [
      { key: "date", label: "Tarih" },
      { key: "type", label: "Belge türü" },
      { key: "firm", label: "Firma" },
      { key: "modelProduct", label: "Model / Ürün", render: (row) => row?.model || row?.product || "-" },
      { key: "docNo", label: "Belge No" },
      { key: "dispatchQty", label: "İrsaliye Adedi", render: (row) => row?.dispatchQty ? formatQty(row?.dispatchQty) : "-" },
      { key: "productionQty", label: "İmalat Adedi", render: (row) => row?.productionQty ? formatQty(row?.productionQty) : "-" },
      { key: "invoiceQty", label: "Kesilen Fatura", render: (row) => row?.invoiceQty ? formatQty(row?.invoiceQty) : "-" },
      { key: "remaining", label: "Kalan Adet", render: (row) => formatQty(calculateRemainingQty(row)) },
      { key: "amount", label: "Tutar", render: (row) => row?.amount ? formatMoney(row?.amount) : "-" },
      { key: "cari", label: "Cari", render: (row) => row?.cari ? "Tamam" : "Bekliyor" },
      { key: "kdv", label: "KDV", render: (row) => row?.official ? (row?.kdv ? "Tamam" : "Bekliyor") : "Yok" },
      { key: "mail", label: "Mail", render: (row) => row?.mail ? "Tamam" : "Bekliyor" },
    ];
  }
  return [
    { key: "dueDate", label: "Vade Tarihi" },
    { key: "type", label: "İşlem Tipi" },
    { key: "firm", label: "Firma / Kişi" },
    { key: "desc", label: "Açıklama" },
    { key: "docNo", label: "Belge / Fatura No" },
    { key: "amount", label: "Tutar", render: (row) => formatMoney(row?.amount) },
    { key: "method", label: "Ödeme Şekli" },
    { key: "account", label: "Banka / Kasa / Kart" },
    { key: "days", label: "Kalan Gün", render: (row) => calculateDaysLeft(row?.dueDate) },
    { key: "reminder", label: "Hatırlatma", render: (row) => row?.reminder ? "Kurulu" : "Yok" },
  ];
}

function DetailPanel({ screen, record, onChange, onAction, onOpenScreen }) {
  if (!record) {
    return (
      <aside className="muh-flow-panel muh-flow-detail">
        <div className="muh-flow-empty">Kayıt seçin.</div>
      </aside>
    );
  }
  const status = getStatusForScreen(screen, record);
  const action = getActionForScreen(screen, record);
  return (
    <aside className="muh-flow-panel muh-flow-detail">
      <div className="muh-flow-panel-head">
        <h3>{screen === "accounting" ? "Seçili kayıt özeti" : "Seçili ödeme özeti"}</h3>
        <StatusBadge status={status} />
      </div>
      <div className="muh-flow-steps">
        {(screen === "accounting" ? ["Belge", "Tespit", "İşlem", "Kapanış"] : ["Vade", "Hatırlatma", "Ödeme", "Kapanış"]).map((step, index) => (
          <span key={step} className={index <= currentStep(status.text) ? "done" : ""}>
            {step}
          </span>
        ))}
      </div>
      <div className="muh-flow-detect">
        <strong>{screen === "accounting" ? "Sistem ne anladı" : "Vade değerlendirmesi"}</strong>
        <span>{systemText(screen, record)}</span>
      </div>
      <div className="muh-flow-detect tone-warn">
        <strong>Eksik veri ne</strong>
        <span>{missingText(screen, record)}</span>
      </div>
      {screen === "accounting" ? <DocumentPreview record={record} /> : null}
      <InfoGrid screen={screen} record={record} />
      <RecordForm screen={screen} record={record} onChange={onChange} />
      <button className="primary-btn muh-flow-next" type="button" onClick={() => onAction()}>
        {action}
      </button>
      {onOpenScreen ? (
        <button className="soft-btn muh-flow-next" type="button" onClick={() => onOpenScreen(screen)}>
          {screen === "accounting" ? "Belge İş Akışına Git" : "Ödeme Ekranına Git"}
        </button>
      ) : null}
      <div className="muh-flow-history">
        <h4>İşlem geçmişi</h4>
        {(record.logs || []).map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </aside>
  );
}

function DocumentPreview({ record }) {
  return (
    <div className="muh-flow-preview-box">
      <strong>Belge önizleme</strong>
      <span>{record.fileName || record.docNo || "Önizleme için belge seçilmedi"}</span>
      <small>{record.fileType || record.type || "PDF / XML / Image alanı hazır"}</small>
    </div>
  );
}

function currentStep(status) {
  if (["Tamam", "Kapandı", "Ödendi", "Tahsil edildi"].includes(status)) return 3;
  if (status.includes("Kalan") || status.includes("Cari") || status.includes("Mail") || status.includes("Bugün")) return 2;
  if (status.includes("Eksik") || status.includes("Gecikti")) return 1;
  return 2;
}

function InfoGrid({ screen, record }) {
  const items = screen === "accounting"
     [
        ["Belge", record.docNo || "-"],
        ["Model / Ürün", record.model || record.product || "-"],
        ["Kalan", formatQty(calculateRemainingQty(record))],
        ["Cari / KDV / Mail", `${record.cari ? "Cari" : "Cari bekliyor"} / ${record.official ? (record.kdv ? "KDV" : "KDV bekliyor") : "KDV yok"} / ${record.mail ? "Mail" : "Mail bekliyor"}`],
      ? ]
    : [
        ["Kim", record.firm || "-"],
        ["Vade", `${record.dueDate || "-"} (${calculateDaysLeft(record.dueDate)} gün)`],
        ["Tutar", formatMoney(record.amount)],
        ["Yöntem", `${record.method || "-"} / ${record.account || "-"}`],
      ];
  return (
    <div className="muh-flow-mini-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="muh-flow-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function UploadQuickPanel({ draft, onDraftChange, onDetect, onSubmit, uploadMessage }) {
  return (
    <section className="muh-flow-panel muh-flow-upload">
      <div className="muh-flow-panel-head">
        <h3>Belge Yükle / Hızlı Giriş</h3>
        <span>RAW</span>
      </div>
      <div className="muh-flow-upload-body">
        <label className="muh-flow-dropzone">
          <input
            type="file"
            accept=".pdf,.xml,.jpg,.jpeg,.png,.zip"
            onChange={(event) => {
              const file = event?.target.files?.[0] || null;
              onDraftChange("file", file);
              onDraftChange("fileName", file?.name || "");
            }}
          />
          <strong>{draft.fileName || "Dosya seç / sürükle bırak"}</strong>
          <span>PDF, XML, JPG, PNG, ZIP</span>
        </label>
        <div className="muh-flow-upload-form">
          <Field label="Belge Türü">
            <select value={draft.type} onChange={(event) => onDraftChange("type", event?.target.value)}>
              {ACCOUNTING_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="Firma"><input value={draft.firm} onChange={(event) => onDraftChange("firm", event?.target.value)} /></Field>
          <Field label="Model"><input value={draft.model} onChange={(event) => onDraftChange("model", event?.target.value)} /></Field>
          <Field label="Ürün"><input value={draft.product} onChange={(event) => onDraftChange("product", event?.target.value)} /></Field>
          <Field label="Adet"><input type="number" value={draft.qty} onChange={(event) => onDraftChange("qty", Number(event?.target.value))} /></Field>
          <Field label="Tutar"><input type="number" value={draft.amount} onChange={(event) => onDraftChange("amount", Number(event?.target.value))} /></Field>
          <Field label="KDV"><input type="number" value={draft.kdvAmount} onChange={(event) => onDraftChange("kdvAmount", Number(event?.target.value))} /></Field>
          <Field label="Belge No"><input value={draft.docNo} onChange={(event) => onDraftChange("docNo", event?.target.value)} /></Field>
          <Field label="Tarih"><input type="date" value={draft.date} onChange={(event) => onDraftChange("date", event?.target.value)} /></Field>
          <Field label="Not"><input value={draft.note} onChange={(event) => onDraftChange("note", event?.target.value)} /></Field>
          <button className="soft-btn" type="button" onClick={onDetect}>Tespit Et</button>
          <button className="primary-btn" type="button" onClick={onSubmit}>Kontrole Al</button>
        </div>
      </div>
      {uploadMessage ? <div className="muh-flow-upload-message">{uploadMessage}</div> : null}
    </section>
  );
}

function RecordForm({ screen, record, onChange }) {
  const update = (key, value) => onChange({ ...record, [key]: value });
  if (screen === "accounting") {
    return (
      <div className="muh-flow-form">
        <Field label="Tarih"><input type="date" value={record.date || ""} onChange={(event) => update("date", event?.target.value)} /></Field>
        <Field label="Belge Türü"><select value={record.type || ""} onChange={(event) => update("type", event?.target.value)}>{ACCOUNTING_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
        <Field label="Firma"><input value={record.firm || ""} onChange={(event) => update("firm", event?.target.value)} /></Field>
        <Field label="Belge No"><input value={record.docNo || ""} onChange={(event) => update("docNo", event?.target.value)} /></Field>
        <Field label="Model"><input value={record.model || ""} onChange={(event) => update("model", event?.target.value)} /></Field>
        <Field label="Ürün"><input value={record.product || ""} onChange={(event) => update("product", event?.target.value)} /></Field>
        <Field label="İrsaliye Adedi"><input type="number" value={record.dispatchQty || 0} onChange={(event) => update("dispatchQty", Number(event?.target.value))} /></Field>
        <Field label="İmalat Adedi"><input type="number" value={record.productionQty || 0} onChange={(event) => update("productionQty", Number(event?.target.value))} /></Field>
        <Field label="Kesilen Fatura"><input type="number" value={record.invoiceQty || 0} onChange={(event) => update("invoiceQty", Number(event?.target.value))} /></Field>
        <Field label="Tutar"><input type="number" value={record.amount || 0} onChange={(event) => update("amount", Number(event?.target.value))} /></Field>
        <Field label="Resmi / Gayri"><select value={record.official ? "true" : "false"} onChange={(event) => update("official", event?.target.value === "true")}><option value="true">Resmi</option><option value="false">Gayri</option></select></Field>
        <Field label="Lot No"><input value={record.lotNo || ""} onChange={(event) => update("lotNo", event?.target.value)} /></Field>
        <Field label="Not"><textarea value={record.note || ""} onChange={(event) => update("note", event?.target.value)} /></Field>
      </div>
    );
  }
  return (
    <div className="muh-flow-form">
      <Field label="Vade Tarihi"><input type="date" value={record.dueDate || ""} onChange={(event) => update("dueDate", event?.target.value)} /></Field>
      <Field label="İşlem Tipi"><select value={record.type || ""} onChange={(event) => update("type", event?.target.value)}>{PAYMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
      <Field label="Firma / Kişi"><input value={record.firm || ""} onChange={(event) => update("firm", event?.target.value)} /></Field>
      <Field label="Açıklama"><input value={record.desc || ""} onChange={(event) => update("desc", event?.target.value)} /></Field>
      <Field label="Belge / Fatura No"><input value={record.docNo || ""} onChange={(event) => update("docNo", event?.target.value)} /></Field>
      <Field label="Tutar"><input type="number" value={record.amount || 0} onChange={(event) => update("amount", Number(event?.target.value))} /></Field>
      <Field label="Ödeme Şekli"><input value={record.method || ""} onChange={(event) => update("method", event?.target.value)} /></Field>
      <Field label="Banka / Kasa / Kart"><input value={record.account || ""} onChange={(event) => update("account", event?.target.value)} /></Field>
      <Field label="Hatırlatma"><select value={record.reminder ? "true" : "false"} onChange={(event) => update("reminder", event?.target.value === "true")}><option value="true">Kurulu</option><option value="false">Yok</option></select></Field>
      <Field label="Not"><textarea value={record.note || ""} onChange={(event) => update("note", event?.target.value)} /></Field>
    </div>
  );
}

export default function MuhasebeFlowPage({ activeTab, activeMainCompany }) {
  const mapped = screenFromRoute(activeTab);
  const [activeScreen, setActiveScreen] = useState(mapped.screen);
  const [records, setRecords] = useState({ accounting: [], payment: [] });
  const [apiNotice, setApiNotice] = useState("");
  const [uploadDraft, setUploadDraft] = useState({
    file: null,
    fileName: "",
    type: "Müşteri İrsaliyesi",
    firm: "",
    model: "",
    product: "",
    qty: 0,
    amount: 0,
    kdvAmount: 0,
    docNo: "",
    date: TODAY,
    note: "",
  });
  const [selectedIds, setSelectedIds] = useState({
    accounting: "",
    payment: "",
    due: "",
  });
  const [reportFilters, setReportFilters] = useState({
    period: "month",
    startDate: TODAY.slice(0, 8) + "01",
    endDate: TODAY,
    reportType: "FULL_ACCOUNTING_SUMMARY",
  });
  const [printableReport, setPrintableReport] = useState(null);
  const [filters, setFilters] = useState({ accounting: mapped.filter, payment: "all", due: mapped.filter });
  const [queueFilters, setQueueFilters] = useState({ accounting: mapped.filter, payment: "all", due: mapped.filter });
  const [search, setSearch] = useState("");
  const [queueSearch, setQueueSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const companyParams = {
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    };
    async function loadApiQueues() {
      try {
        await Promise.all([
          getAccountingDashboard(companyParams),
          getAccountingPreview(companyParams),
        ]);
        const [accountingQueue, paymentQueue] = await Promise.all([
          getAccountingQueue(companyParams),
          getPaymentQueue(companyParams),
        ]);
        if (cancelled) return;
        setRecords({
          accounting: Array.isArray(accountingQueue) ? accountingQueue : [],
          payment: Array.isArray(paymentQueue) ? paymentQueue : [],
        });
        setSelectedIds({
          accounting: Array.isArray(accountingQueue) ? accountingQueue[0].id || "" : "",
          payment: Array.isArray(paymentQueue) ? paymentQueue[0].id || "" : "",
          due: Array.isArray(paymentQueue) ? paymentQueue[0].id || "" : "",
        });
        setApiNotice("");
      } catch (error) {
        if (!cancelled) {
          setRecords({ accounting: [], payment: [] });
          setApiNotice("API bağlantısı hazır; servis yanıt vermediği için kayıt listesi boş gösteriliyor.");
          console.warn("Muhasebe API fallback", error);
        }
      }
    }
    loadApiQueues();
    return () => {
      cancelled = true;
    };
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  const activeRows = useMemo(
    () => (activeScreen === "accounting" ? records.accounting : records.payment),
    [activeScreen, records],
  );
  const selectedRecord = activeRows.find((row) => row.id === selectedIds[activeScreen]) || activeRows[0];
  const visibleRows = useMemo(() => {
    return activeRows.filter((row) => {
      const filterOk = activeScreen === "accounting" ? applyAccountingFilter(row, filters.accounting) : applyPaymentFilter(row, filters[activeScreen]);
      return filterOk && matchesSearch(row, search);
    });
  }, [activeRows, activeScreen, filters, search]);
  const queueRows = useMemo(() => {
    return activeRows.filter((row) => {
      const filterOk = activeScreen === "accounting" ? applyAccountingFilter(row, queueFilters.accounting) : applyPaymentFilter(row, queueFilters[activeScreen]);
      return filterOk && matchesSearch(row, queueSearch);
    });
  }, [activeRows, activeScreen, queueFilters, queueSearch]);

  function setScreen(screen) {
    setActiveScreen(screen);
    setSearch("");
    setQueueSearch("");
  }

  function setFilterForScreen(value) {
    setFilters((prev) => ({ ...prev, [activeScreen]: value }));
  }

  function setQueueFilterForScreen(value) {
    setQueueFilters((prev) => ({ ...prev, [activeScreen]: value }));
  }

  function selectRecord(id) {
    setSelectedIds((prev) => ({ ...prev, [activeScreen]: id }));
  }

  function updateSelectedRecord(nextRecord) {
    const targetScreen = nextRecord.dueDate ? "payment" : "accounting";
    setRecords((prev) => ({
      ...prev,
      [targetScreen]: prev[targetScreen].map((row) => row.id === nextRecord.id ? nextRecord : row),
    }));
  }

  function handleDocumentUploadDraft(key, value) {
    setUploadDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function detectUploadDraft() {
    try {
      if (uploadDraft.docNo) {
        await detectAccountingDocument(uploadDraft.docNo);
      }
      setApiNotice("Belge tespiti hazır; formdaki bilgiler kontrol kuyruğuna aktarılabilir.");
    } catch (error) {
      setApiNotice("Tespit servisi yanıt vermedi; manuel bilgilerle devam ediliyor.");
      console.warn("Muhasebe detect fallback", error);
    }
  }

  function isAllowedUploadFile(file) {
    if (!file) return true;
    const extension = String(file?.name || "").split(".").pop().toLocaleLowerCase("tr-TR");
    return ["pdf", "xml", "jpg", "jpeg", "png", "zip"].includes(extension);
  }

  async function handleDocumentToQueue() {
    if (!isAllowedUploadFile(uploadDraft.file)) {
      setApiNotice("Sadece PDF, XML, JPG, PNG veya ZIP belge yüklenebilir.");
      return;
    }
    try {
      if (uploadDraft.file) {
        const formData = new FormData();
        formData.set("file", uploadDraft.file);
        formData.set("documentType", uploadDraft.type);
        formData.set("firmName", uploadDraft.firm);
        formData.set("modelName", uploadDraft.model);
        formData.set("productName", uploadDraft.product);
        formData.set("quantity", String(uploadDraft.qty || 0));
        formData.set("amount", String(uploadDraft.amount || 0));
        formData.set("vatAmount", String(uploadDraft.kdvAmount || 0));
        formData.set("documentNo", uploadDraft.docNo);
        formData.set("documentDate", uploadDraft.date);
        formData.set("note", uploadDraft.note);
        formData.set("mainCompanySlug", activeMainCompany?.slug || "");
        formData.set("mainCompanyId", activeMainCompany?.id || "");
        await uploadAccountingDocument(formData);
      }
      setApiNotice("Belge kontrole alındı.");
    } catch (error) {
      setApiNotice("API yükleme başarısız; kayıt yerel taslak olarak kuyruğa eklendi, backend onayı bekliyor.");
      console.warn("Muhasebe document upload fallback", error);
    }

    if (uploadDraft.type === "Ödeme / Ekstre") {
      const payment = {
        id: uid("P"),
        dueDate: uploadDraft.date || TODAY,
        type: "Cari Ödeme",
        firm: uploadDraft.firm,
        desc: uploadDraft.fileName ? `Ham belge: ${uploadDraft.fileName}` : "Ödeme / ekstre ham belgesi",
        docNo: uploadDraft.docNo,
        amount: Number(uploadDraft.amount || 0),
        method: "",
        account: "",
        reminder: false,
        paid: false,
        closed: false,
        cariClosed: false,
        note: uploadDraft.note || "Belge Yükleme & İş Akışı hızlı girişinden ödeme/nakit akışına aktarıldı.",
        fileName: uploadDraft.fileName,
        fileType: uploadDraft.file.type || "",
        logs: ["Ham ödeme/ekstre belgesi kuyruğa alındı."],
      };
      setRecords((prev) => ({ ...prev, payment: [payment, ...prev?.payment] }));
      setSelectedIds((prev) => ({ ...prev, payment: payment.id }));
      setActiveScreen("payment");
      setFilters((prev) => ({ ...prev, payment: "all" }));
      setQueueFilters((prev) => ({ ...prev, payment: "all" }));
    } else {
      const isSupplier = uploadDraft.type === "Tedarikçi Faturası";
      const row = {
        id: uid("A"),
        source: "quick",
        raw: true,
        controlWaiting: false,
        date: uploadDraft.date || TODAY,
        type: uploadDraft.type,
        firm: uploadDraft.firm,
        model: uploadDraft.model,
        product: uploadDraft.product,
        docNo: uploadDraft.docNo,
        dispatchQty: Number(uploadDraft.qty || 0),
        productionQty: 0,
        invoiceQty: uploadDraft.type === "Bizim Fatura" ? Number(uploadDraft.qty || 0) : 0,
        amount: Number(uploadDraft.amount || 0),
        official: true,
        needsLot: isSupplier,
        lotNo: "",
        cari: false,
        kdv: false,
        mail: false,
        closed: false,
        note: uploadDraft.note || (uploadDraft.fileName ? `Ham belge: ${uploadDraft.fileName}` : "Ham belge kontrole alındı."),
        fileName: uploadDraft.fileName,
        fileType: uploadDraft.file.type || "",
        logs: ["Belge RAW / Ham Belge olarak Belge İş Akışı kuyruğuna düştü."],
      };
      setRecords((prev) => ({ ...prev, accounting: [row, ...prev?.accounting] }));
      setSelectedIds((prev) => ({ ...prev, accounting: row?.id }));
      setActiveScreen("accounting");
      setFilters((prev) => ({ ...prev, accounting: "raw" }));
      setQueueFilters((prev) => ({ ...prev, accounting: "raw" }));
    }
    setUploadDraft({
      file: null,
      fileName: "",
      type: "Müşteri İrsaliyesi",
      firm: "",
      model: "",
      product: "",
      qty: 0,
      amount: 0,
      kdvAmount: 0,
      docNo: "",
      date: TODAY,
      note: "",
    });
  }

  function addLog(screen, id, text, patch = {}) {
    setRecords((prev) => ({
      ...prev,
      [screen]: prev[screen].map((row) =>
        row.id === id
           ? { ...row, ...patch, logs: [`${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} - ${text}`, ...(row?.logs || [])].slice(0, 8) }
          : row,
      ),
    }));
  }

  function saveCurrentRecord() {
    if (!selectedRecord) return;
    addLog(activeScreen, selectedRecord.id, "Kayıt kaydedildi.");
  }

  async function detectCurrentRecord() {
    if (!selectedRecord) return;
    if (activeScreen === "accounting") {
      try {
        await detectAccountingDocument(selectedRecord.id);
      } catch (error) {
        console.warn("Muhasebe detect current fallback", error);
      }
      const patch = {};
      if (!selectedRecord.firm && String(selectedRecord.docNo || "").includes("DDM")) patch.firm = "TAHA GİYİM";
      if (!selectedRecord.type && String(selectedRecord.docNo || "").includes("SLV")) patch.type = "Tedarikçi Faturası";
      addLog("accounting", selectedRecord.id, "Sistem tespiti yenilendi.", patch);
      return;
    }
    addLog("payment", selectedRecord.id, "Vade ve hatırlatma kontrolü yenilendi.");
  }

  function createNewRecord() {
    const targetScreen = activeScreen === "payment" || activeScreen === "due" ? "payment" : "accounting";
    const row = targetScreen === "accounting"
       {
          id: uid("A"),
          source: "quick",
          date: TODAY,
          type: "Müşteri İrsaliyesi",
          firm: "",
          model: "",
          product: "",
          docNo: "",
          dispatchQty: 0,
          productionQty: 0,
          invoiceQty: 0,
          amount: 0,
          official: true,
          needsLot: false,
          lotNo: "",
          cari: false,
          kdv: false,
          mail: false,
          closed: false,
          note: "",
          logs: ["Yeni muhasebe işi açıldı."],
        ? }
      : {
          id: uid("P"),
          dueDate: TODAY,
          type: "Tedarikçi Ödeme",
          firm: "",
          desc: "",
          docNo: "",
          amount: 0,
          method: "",
          account: "",
          reminder: false,
          paid: false,
          closed: false,
          cariClosed: false,
          note: "",
          logs: ["Yeni ödeme/nakit akışı kaydı açıldı."],
    };
    setRecords((prev) => ({ ...prev, [targetScreen]: [row, ...prev[targetScreen]] }));
    setSelectedIds((prev) => ({ ...prev, [targetScreen]: row?.id }));
  }

  async function createPaymentReminder(record = selectedRecord) {
    if (!record) return;
    try {
      await createPaymentReminderApi(record.id, {
        confirm: true,
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
      });
    } catch (error) {
      console.warn("Muhasebe reminder fallback", error);
    }
    addLog("payment", record.id, "Hatırlatma kuruldu.", { reminder: true });
  }

  function closePayment(record = selectedRecord) {
    if (!record) return;
    const isCollection = record.type.includes("Tahsilat");
    addLog("payment", record.id, isCollection ? "Tahsilat girildi." : "Ödeme girildi.", { paid: true, closed: true, reminder: true });
  }

  function closeAccountingWork(record = selectedRecord) {
    if (!record) return;
    addLog("accounting", record.id, "Muhasebe işi kapatıldı.", { closed: true });
  }

  async function runCurrentAction(record = selectedRecord, screen = activeScreen) {
    if (!record) return;
    if (screen === "payment" || screen === "due") {
      const action = getNextPaymentAction(record);
      try {
        await runPaymentAction(record.id, paymentActionCode(action), {
          confirm: true,
          mainCompanySlug: activeMainCompany?.slug,
          mainCompanyId: activeMainCompany?.id,
        });
      } catch (error) {
        console.warn("Muhasebe payment action fallback", error);
      }
      if (action === "Tekrar aç") addLog("payment", record.id, "Kayıt tekrar açıldı.", { closed: false, paid: false });
      else if (action === "Hatırlatma kur") createPaymentReminder(record);
      else if (action === "Cariyle eşleştir") addLog("payment", record.id, "Cariyle eşleştirildi.", { cariClosed: true, closed: true });
      else closePayment(record);
      return;
    }

    const action = getNextAccountingAction(record);
    try {
      await runAccountingAction(record.id, accountingActionCode(action), {
        confirm: true,
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
      });
    } catch (error) {
      console.warn("Muhasebe accounting action fallback", error);
    }
    if (action === "Tekrar aç") addLog("accounting", record.id, "Kayıt tekrar açıldı.", { closed: false });
    else if (action === "Kontrole Al") addLog("accounting", record.id, "Ham belge kontrol kuyruğuna alındı.", { raw: false, controlWaiting: true });
    else if (action === "Modele bağla") addLog("accounting", record.id, "Model bağlandı.", { model: record.model || `MODEL-${String(record.docNo || "").slice(-3)}` });
    else if (action === "İmalat adedini al") addLog("accounting", record.id, "İmalat adedi alındı.", { productionQty: record.productionQty || record.dispatchQty });
    else if (action === "Kalanı kes") addLog("accounting", record.id, "Kalan fatura kesildi.", { invoiceQty: record.dispatchQty });
    else if (action === "Ürün eşleştir") addLog("accounting", record.id, "Ürün eşleştirildi.", { product: record.product || "Hammadde" });
    else if (action === "Lot oluştur") addLog("accounting", record.id, "Boyahane lot havuzu için lot oluşturuldu.", { lotNo: record.lotNo || `LOT-${String(Date.now()).slice(-5)}` });
    else if (action === "Cari/KDV işle") addLog("accounting", record.id, record.official ? "Cari ve KDV işlendi." : "Cari işlendi, KDV atlandı.", { cari: true, kdv: record.official });
    else if (action === "Mail gönder") addLog("accounting", record.id, "Fatura/irsaliye mail gönderildi.", { mail: true });
    else if (action === "Kapat") closeAccountingWork(record);
    else addLog("accounting", record.id, "Eksik bilgiyi tamamla.");
  }

  const meta = SCREEN_META[activeScreen];
  const currentFilter = filters[activeScreen];
  const currentQueueFilter = queueFilters[activeScreen];
  const dashboardRows = activeRows;

  return (
    <div className="content-grid muhasebe-page muh-flow-page">
      <header className="muh-flow-header">
        <div>
          <div className="mgi-breadcrumb">
            <span>KY ERP</span>
            <span>/</span>
            <span>Muhasebe</span>
            <span>/</span>
            <strong>{meta.title}</strong>
          </div>
          <h2>{meta.title}</h2>
          <p>{meta.subtitle}</p>
        </div>
        <div className="muh-flow-actions">
          <button className="soft-btn" type="button" onClick={createNewRecord}>Yeni</button>
          <button className="soft-btn" type="button" onClick={saveCurrentRecord}>Kaydet</button>
          <button className="primary-btn" type="button" onClick={() => runCurrentAction()}>
            {selectedRecord ? getActionForScreen(activeScreen, selectedRecord) : "Sıradaki Aksiyon"}
          </button>
        </div>
      </header>
      <nav className="muhasebe-inline-tabs muh-flow-tabs" aria-label="Muhasebe ana ekranları">
        <button type="button" className={activeScreen === "accounting" ? "active" : ""} onClick={() => setScreen("accounting")}>Belge Merkezi</button>
        <button type="button" className={activeScreen === "payment" ? "active" : ""} onClick={() => setScreen("payment")}>Cari / Ödeme / Tahsilat</button>
        <button type="button" className={activeScreen === "due" ? "active" : ""} onClick={() => setScreen("due")}>Çek / Kart / Vade Takip</button>
      </nav>
      {apiNotice ? <div className="muh-flow-notice">{apiNotice}</div> : null}
      <Dashboard screen={activeScreen} rows={dashboardRows} />
      {activeScreen === "accounting"  (
        <UploadQuickPanel
          draft={uploadDraft}
          onDraftChange={handleDocumentUploadDraft}
          onDetect={detectUploadDraft}
          onSubmit={handleDocumentToQueue}
          uploadMessage={apiNotice}
        />
      ) : null}
      <div className="muh-flow-workspace">
        <QueuePanel
          screen={activeScreen}
          rows={queueRows}
          selectedId={selectedRecord.id}
          onSelect={selectRecord}
          search={queueSearch}
          setSearch={setQueueSearch}
          filter={currentQueueFilter}
          setFilter={setQueueFilterForScreen}
        />
        <MainTable
          screen={activeScreen}
          rows={visibleRows}
          selectedId={selectedRecord.id}
          onSelect={selectRecord}
          search={search}
          setSearch={setSearch}
          filter={currentFilter}
          setFilter={setFilterForScreen}
          detectCurrentRecord={detectCurrentRecord}
        />
        <DetailPanel screen={activeScreen} record={selectedRecord} onChange={updateSelectedRecord} onAction={runCurrentAction} />
      </div>
    </div>
  );
}
