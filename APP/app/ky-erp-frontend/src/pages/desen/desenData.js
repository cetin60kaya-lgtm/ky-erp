export const desenJobs = [
  {
    id: "desen-245",
    desenAdi: "Nova cicek desen",
    model: "M-245",
    firma: "TAHA",
    kanalAdet: 6,
    kacRenk: 6,
    durum: "Eksik Bilgi",
    tone: "orange",
    bolge: "On Baski",
    zemin: "Siyah penye",
    kalip: "40x60",
    yerlesim: "m245-yerlesim.psd",
    renkPantone: "18-1664 / Siyah / Beyaz",
    eksikNot: "Yerlesim dosyasi ve kanal gorseli kontrol edilecek.",
    desenNot: "Renk bilgileri ileride kullanilmak uzere kayit altinda tutulur.",
    sonraki: "Bilgi tamamla",
  },
  {
    id: "desen-246",
    desenAdi: "Kanal gorseli",
    model: "M-246",
    firma: "TAHA",
    kanalAdet: 4,
    kacRenk: 4,
    durum: "Yerlesim Bekliyor",
    tone: "orange",
    bolge: "On Baski",
    zemin: "Ekru",
    kalip: "Secilecek",
    yerlesim: "Bekliyor",
    renkPantone: "19-4007 / 18-1663",
    eksikNot: "Kalip olcusu ve yerlesim dosyasi secilecek.",
    desenNot: "Kanal gorseli yuklendi.",
    sonraki: "Yerlesim tamamla",
  },
  {
    id: "desen-247",
    desenAdi: "Yazi baski",
    model: "M-247",
    firma: "TAHA",
    kanalAdet: 1,
    kacRenk: 1,
    durum: "Uretime Hazir",
    tone: "green",
    bolge: "Sirt",
    zemin: "Beyaz",
    kalip: "50x70",
    yerlesim: "m247-yerlesim.psd",
    renkPantone: "Siyah",
    eksikNot: "Eksik bilgi yok.",
    desenNot: "Uretim oncesi kontrol tamamlandi.",
    sonraki: "Uretime hazir",
  },
];

export function statusTone(status) {
  const value = String(status || "").toLocaleLowerCase("tr-TR");
  if (value.includes("hazir") || value.includes("hazır")) return "green";
  if (value.includes("eksik")) return "orange";
  if (value.includes("bekliyor")) return "orange";
  return "blue";
}
