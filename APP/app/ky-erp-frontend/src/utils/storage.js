// LEGACY / SHARED NON-MUHASEBE STORAGE
// Aktif muhasebe zinciri localStorage seed'lerine dayanmaz.
export const LS_KEYS = {
  PERSONELLER: "kyerp.personeller.v1",
  GUNLUK: "kyerp.gunluk.v1",
  MAKINALAR: "kyerp.makinalar.v1",
  URETIM: "kyerp.uretim.v1",
  KALITE: "kyerp.kalite.v1",
  CARILER: "kyerp.cariler.v1",
  CARI_HAREKETLER: "kyerp.cariHareketleri.v1",
  MUHASEBE_KAYITLARI: "kyerp.muhasebeKayitlari.v1",
  GIDERLER: "kyerp.giderler.v1",
  URUNLER: "kyerp.urunler.v1",
};

export function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
