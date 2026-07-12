export type DesenFileRole =
  | "desen_gorseli"
  | "kanal_gorseli_psd"
  | "musteri_calisma_psd"
  | "yerlesim_pdf"
  | "teknik_gorsel"
  | "revizyon_notu"
  | "kalip_hazir_dosya";

export type DesenFileRecord = {
  id: string;
  mainCompanySlug: string;
  desenId: string;
  modelId: string;
  fileRole: DesenFileRole;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
  previewPath: string;
  thumbnailPath: string;
  status: string;
  uploadedAt: string;
  uploadedBy: string;
  deletedAt?: string;
};

export type DesenRecord = {
  id: string;
  mainCompanySlug: string;
  desenAdi: string;
  desenSlug: string;
  modelId: string;
  modelAdi: string;
  musteri: string;
  siparisNo: string;
  zeminRenk: string;
  durum: string;
  tarih: string;
  aciklama: string;
  notes: string;
  kanalSayisi: number;
  kanalBilgileri: Array<{
    id: string;
    kanalNo: number;
    kanalAdi: string;
    renkKodu: string;
    boyaTuru: string;
    hex: string;
    aktif: boolean;
  }>;
  boyahaneNotu: string;
  files: Record<string, string | string[]>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type YerlesimRecord = {
  id: string;
  mainCompanySlug: string;
  desenId: string;
  modelId: string;
  yerlesimDosyaAdi: string;
  tarih: string;
  baskiBolgesi: string;
  baskiEn: string;
  baskiBoy: string;
  cekmePayiEn: string;
  cekmePayiBoy: string;
  teknikNot: string;
  pdfFileId: string;
  teknikGorselFileId: string;
  revizyonFileId: string;
  bedenSatirlari: Array<Record<string, any>>;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type KalipParsedItem = {
  id: string;
  rawText: string;
  parsedModelName: string;
  bedenBoy: string;
  matchedModelId: string;
  matchedModelName: string;
  musteri: string;
  zemin: string;
  dagilimYuzde?: number;
  kalipBolgesi?: string;
  matchStatus: "Eşleşti" | "Kontrol" | "Eşleşmedi" | "Onaylandı";
  approved: boolean;
};

export type KalipYerlesimRecord = {
  id: string;
  mainCompanySlug: string;
  desenId: string;
  kalipKodu: string;
  kalipEbatti: string;
  kalipSayisi: number;
  yuksekKalipVar: boolean;
  yuksekKalipAdedi: number;
  simVar: boolean;
  simNotu: string;
  aciklama: string;
  dosyaAdi: string;
  hazirDosyaFileId: string;
  parsedItems: KalipParsedItem[];
  status: string;
  createdAt: string;
  updatedAt: string;
};
