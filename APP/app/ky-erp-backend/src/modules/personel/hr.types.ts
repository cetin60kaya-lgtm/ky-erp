export type HrResourceName =
  | "personel"
  | "puantaj"
  | "izinler"
  | "bordro-havuz"
  | "bordro-hazirlik"
  | "maas-hesaplari"
  | "odemeler"
  | "evraklar"
  | "logs"
  | "settings";

export type HrStatus = "AKTIF" | "PASIF";
export type HrOfficialType = "RESMI" | "GAYRI_RESMI";
export type HrPaymentType = "BANKA" | "ELDEN" | "KARISIK";

export interface HrBaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface HrPersonelRecord extends HrBaseEntity {
  adSoyad: string;
  anaFirma: string;
  departman: string;
  gorev: string;
  calismaTipi: "AYLIK" | "GUNLUK";
  maas: number;
  yolUcreti: number;
  bankaEldenTercihi: HrPaymentType;
  iban: string;
  mesaiSaatTabani: number;
  aktif: boolean;
  gorevUnvan?: string;
  vasif?: string;
  aktifPasif?: HrStatus;
  sgkSskDurumu?: string;
  resmiGayriResmi?: HrOfficialType;
  devredenYillikIzin?: number;
  yillikIzinHakki?: number;
  araci?: string;
  not?: string;
}

export interface HrPuantajRecord extends HrBaseEntity {
  personelId: string;
  personelAdSoyad: string;
  tarih: string;
  geldi: boolean;
  gelmedi: boolean;
  gecGeldi: boolean;
  erkenCikti: boolean;
  haftaIciMesai: number;
  haftaSonuMesai: number;
  mesai50Saat: number;
  mesai100Saat: number;
  kesintiSaat: number;
  aciklama: string;
}

export interface HrIzinRecord extends HrBaseEntity {
  personelId: string;
  personelAdSoyad: string;
  izinTuru: string;
  izinEtkiTipi?:
    | "YILLIK_IZINDEN_DUS"
    | "MAZERET_YILLIK_IZINDEN_DUS"
    | "MAZERET_AYDAN_DUS"
    | "MAZERET_DUSME"
    | "ISTISNA_DUSME";
  baslangic: string;
  bitis: string;
  gun: number;
  ayDusenGun?: number;
  yillikIzinHakki?: number;
  devredenIzin: number;
  kullanilan: number;
  kalan: number;
  durum: string;
  aciklama: string;
  personelNotu?: string;
  mazeretNotu?: string;
  belgeVarMi: boolean;
  belgeAdi: string;
}

export interface HrBordroHazirlikRecord extends HrBaseEntity {
  personelId: string;
  personelAdSoyad: string;
  donem: string;
  anaFirma?: string;
  maas: number;
  yol: number;
  avans: number;
  kalanBakiye: number;
  mesaiSaati: number;
  mesai50Saat: number;
  mesai100Saat: number;
  kesintiSaat: number;
  mesai50Tutar: number;
  mesai100Tutar: number;
  toplamMesai: number;
  kesintiTutar: number;
  banka: number;
  elden: number;
  toplam: number;
  kontrol: number;
  aciklama?: string;
  bordroNotu?: string;
  bordroDurum?: string;
  izinEtkisi?: number;
  resmiGayriResmiEtkisi?: number;
  hakEdilenIzinEtkisi?: number;
  kullanilanIzinEtkisi?: number;
  devredenIzinEtkisi?: number;
}

export interface HrBordroHavuzRecord extends HrBordroHazirlikRecord {
  kayitDurumu?: "HAVUZ" | "KAYDEDILDI";
}

export type HrMaasHazirlikRecord = HrBordroHazirlikRecord;

export interface HrOdemeRecord extends HrBaseEntity {
  personelId: string;
  personelAdSoyad: string;
  donem: string;
  banka: number;
  elden: number;
  toplam: number;
  fisNo: string;
  odemeTarihi: string;
  aciklama: string;
}

export interface HrEvrakRecord extends HrBaseEntity {
  personelId: string;
  personelAdSoyad: string;
  evrakTuru: string;
  belgeAdi: string;
  belgeUrl: string;
  imzaDurumu: string;
  tarih: string;
  aciklama: string;
}

export interface HrLogRecord extends HrBaseEntity {
  tip: string;
  kaynak: string;
  hedefId: string;
  aciklama: string;
  snapshot: Record<string, any> | null;
}

export interface HrSettingRecord extends HrBaseEntity {
  donem: string;
  asgariUcret: number;
  aciklama?: string;
}

export interface HrBootstrapData {
  personel: HrPersonelRecord[];
  puantaj: HrPuantajRecord[];
  izinler: HrIzinRecord[];
  bordroHavuz: HrBordroHavuzRecord[];
  bordroHazirlik: HrBordroHazirlikRecord[];
  maasHesaplari: HrMaasHazirlikRecord[];
  odemeler: HrOdemeRecord[];
  evraklar: HrEvrakRecord[];
  logs: HrLogRecord[];
  settings: HrSettingRecord[];
}
