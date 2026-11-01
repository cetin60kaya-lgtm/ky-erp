/**
 * KY ERP ortak belge taksonomisi.
 * Bunlar bölüm/dosya ataması için seçilebilen gerçek File Hub purposeCode değerleridir.
 * Yeni klasör, erişim hakkı veya veri aktarımı kendiliğinden oluşturmaz.
 */
export const STORAGE_DOCUMENT_MODULES = Object.freeze([
  ["DESEN","Desen"],
  ["DTF","DTF / RIP"],
  ["IMALAT","İmalat"],
  ["BOYAHANE","Boyahane"],
  ["MUHASEBE","Muhasebe"],
  ["EBELGE","e-Belge / Fatura / İrsaliye"],
  ["CARI","Cari / Firma Belgeleri"],
  ["KASA","Kasa / Banka / Çek"],
  ["IK","İK Aylık / Özlük"],
  ["PDKS","PDKS / Puantaj / Bordro"],
  ["DENETIM","Denetim / İSG / Kalite"],
  ["STOK","Stok / Satın Alma"],
  ["FIRMA","Firma / Resmî Evrak"],
  ["GENEL","Genel Dosyalar"],
]);
export const STORAGE_DOCUMENT_TYPES = Object.freeze([
  ["MODEL_IMAGE","Model Görseli"],["MODEL_SOURCE","Kaynak PSD / AI / TIFF"],
  ["PLACEMENT","Kalıp / Yerleşim"],["OUTGOING_DESIGN","Giden Desen / Takım"],
  ["RIP_PDF","DTF / RIP PDF"],["CUSTOMER_REFERENCE","Müşteri Referansı"],
  ["TECHNICAL_SHEET","Teknik Föy"],["PRODUCTION_PHOTO","Üretim Fotoğrafı"],
  ["RECIPE","Boyahane Reçetesi"],["QUALITY","Kalite Belgesi"],
  ["QUALITY_PHOTO","Kalite Fotoğrafı"],
  ["INVOICE","Fatura"],["E_INVOICE_XML","e-Fatura XML"],
  ["E_ARCHIVE_INVOICE","e-Arşiv Fatura"],["DELIVERY_NOTE","İrsaliye"],
  ["E_DELIVERY_NOTE","e-İrsaliye"],["E_DOCUMENT","Diğer e-Belge"],
  ["PURCHASE_INVOICE","Alış Faturası"],["SALES_INVOICE","Satış Faturası"],
  ["CREDIT_NOTE","İade / Düzeltme Belgesi"],["EXPENSE_RECEIPT","Gider Fişi / Makbuz"],
  ["PAYMENT_DOCUMENT","Ödeme / Tahsilat Belgesi"],
  ["CHEQUE","Çek"],["PROMISSORY_NOTE","Senet"],
  ["BANK_RECEIPT","Banka Dekontu"],["CREDIT_CARD_SLIP","Kredi Kartı Slip"],
  ["ACCOUNT_RECONCILIATION","Cari Mutabakat"],["TAX_DOCUMENT","KDV / Vergi Belgesi"],
  ["PERSONNEL_DOCUMENT","Personel Evrakı"],["EMPLOYEE_ID","Kimlik / Kişisel Belge"],
  ["EMPLOYEE_CONTRACT","İş Sözleşmesi"],["EMPLOYEE_LEAVE","Yıllık İzin / Mazeret"],
  ["EMPLOYEE_MEDICAL","Sağlık / İşe Giriş Sağlık Evrakı"],
  ["EMPLOYEE_PAYROLL","Bordro / Ücret Pusulası"],
  ["EMPLOYEE_PAYMENT","Personel Ödeme Belgesi"],["ATTENDANCE_REPORT","PDKS / Puantaj"],
  ["OVERTIME_APPROVAL","Mesai Onayı"],["DISCIPLINARY_RECORD","Personel Tutanak"],
  ["CONTRACT","Sözleşme"],["AUDIT_REPORT","Denetim Raporu"],
  ["AUDIT_EVIDENCE","Denetim Kanıtı / Ek"],
  ["OHS_DOCUMENT","İSG / İş Sağlığı ve Güvenliği"],
  ["CERTIFICATE","Sertifika / Uygunluk"],["COMPANY_LICENSE","Ruhsat / Resmî İzin"],
  ["COMPANY_REGISTRY","Firma Sicil / Vergi Kaydı"],
  ["PURCHASE_ORDER","Satın Alma Siparişi"],
  ["STOCK_DOCUMENT","Stok / Mal Kabul Belgesi"],
  ["GENERIC","Genel Ek / Diğer"],
]);
export const STORAGE_PURPOSES_BY_MODULE = Object.freeze({
 DESEN:["MODEL_IMAGE","MODEL_SOURCE","PLACEMENT","OUTGOING_DESIGN","CUSTOMER_REFERENCE"],
 DTF:["RIP_PDF","MODEL_SOURCE","PLACEMENT","GENERIC"],
 IMALAT:["TECHNICAL_SHEET","PRODUCTION_PHOTO","QUALITY","PURCHASE_ORDER","GENERIC"],
 BOYAHANE:["RECIPE","QUALITY","QUALITY_PHOTO","PRODUCTION_PHOTO","GENERIC"],
 MUHASEBE:["INVOICE","PURCHASE_INVOICE","SALES_INVOICE","EXPENSE_RECEIPT","DELIVERY_NOTE","PAYMENT_DOCUMENT","CHEQUE","PROMISSORY_NOTE","BANK_RECEIPT","CREDIT_CARD_SLIP","ACCOUNT_RECONCILIATION","TAX_DOCUMENT","GENERIC"],
 EBELGE:["E_INVOICE_XML","E_ARCHIVE_INVOICE","E_DELIVERY_NOTE","E_DOCUMENT","INVOICE","DELIVERY_NOTE","CREDIT_NOTE","GENERIC"],
 CARI:["CONTRACT","ACCOUNT_RECONCILIATION","INVOICE","DELIVERY_NOTE","PAYMENT_DOCUMENT","CUSTOMER_REFERENCE","GENERIC"],
 KASA:["CHEQUE","PROMISSORY_NOTE","BANK_RECEIPT","CREDIT_CARD_SLIP","PAYMENT_DOCUMENT","EXPENSE_RECEIPT","GENERIC"],
 IK:["PERSONNEL_DOCUMENT","EMPLOYEE_ID","EMPLOYEE_CONTRACT","EMPLOYEE_LEAVE","EMPLOYEE_MEDICAL","EMPLOYEE_PAYROLL","EMPLOYEE_PAYMENT","OVERTIME_APPROVAL","DISCIPLINARY_RECORD","GENERIC"],
 PDKS:["ATTENDANCE_REPORT","EMPLOYEE_PAYROLL","EMPLOYEE_PAYMENT","EMPLOYEE_LEAVE","OVERTIME_APPROVAL","GENERIC"],
 DENETIM:["AUDIT_REPORT","AUDIT_EVIDENCE","OHS_DOCUMENT","QUALITY","CERTIFICATE","DISCIPLINARY_RECORD","GENERIC"],
 STOK:["TECHNICAL_SHEET","PURCHASE_ORDER","STOCK_DOCUMENT","QUALITY","GENERIC"],
 FIRMA:["COMPANY_LICENSE","COMPANY_REGISTRY","CONTRACT","CERTIFICATE","TAX_DOCUMENT","AUDIT_REPORT","GENERIC"],
 GENEL:["GENERIC","CONTRACT","CERTIFICATE"],
});
/** Bu türler şirket içi sınırlı erişim ister; klasör ataması kendiliğinden ACL değildir. */
export const SENSITIVE_STORAGE_PURPOSES = Object.freeze([
 "EMPLOYEE_ID","EMPLOYEE_CONTRACT","EMPLOYEE_LEAVE","EMPLOYEE_MEDICAL",
 "EMPLOYEE_PAYROLL","EMPLOYEE_PAYMENT","PERSONNEL_DOCUMENT","ATTENDANCE_REPORT",
 "OVERTIME_APPROVAL","DISCIPLINARY_RECORD","CHEQUE","PROMISSORY_NOTE",
 "BANK_RECEIPT","CREDIT_CARD_SLIP","TAX_DOCUMENT","AUDIT_EVIDENCE",
]);
export const STORAGE_MODULES = STORAGE_DOCUMENT_MODULES.map(([code])=>code);
export const STORAGE_PURPOSES = STORAGE_DOCUMENT_TYPES.map(([code])=>code);
export const storageModuleLabel = value => STORAGE_DOCUMENT_MODULES.find(([code])=>code===value)?.[1]||value||"-";
export const storagePurposeLabel = value => STORAGE_DOCUMENT_TYPES.find(([code])=>code===value)?.[1]||value||"-";
export const isSensitiveStoragePurpose = code => SENSITIVE_STORAGE_PURPOSES.includes(code);
