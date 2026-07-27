import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MobileCompatService {
  constructor(private readonly prisma: PrismaService) {}

  async getYonetimSummary(mainCompanySlug: string) {
    // Statik mock datayı dinamik veritabanı sorgularıyla değiştireceğiz.
    // Şimdilik sistem patlamasın diye mock veriyi DB yapısında dönüyoruz.
    return {
      bakiye: { tutar: "₺1.284.600", durum: "Alacak" },
      yaklasanOdeme: { tutar: "₺218.000", detay: "7 gün" },
      vadesiGelenCek: { adet: "3 adet", detay: "1 gecikmiş" },
      bugunImalat: { miktar: "3.056", durum: "Tamam" },
      sonHareketler: [
        { icon: "💰", baslik: "Taha Giyim tahsilat beklentisi", detay: "₺125.000 · 5 gün kaldı" },
        { icon: "🏭", baslik: "1331552 imalat tamamlandı", detay: "3.056 adet · fire 0" },
        { icon: "🧾", baslik: "Müşteri irsaliyesi fatura kontrolünde", detay: "Kalan adet ve KDV kontrolü bekliyor" },
        { icon: "💳", baslik: "Çek vadesi yaklaşıyor", detay: "Garanti · ÇK-2026-001 · 5 gün" },
      ]
    };
  }

  async getMuhasebeSummary(mainCompanySlug: string) {
    return {
      bekleyenIslem: "14 Onay Bekleyen",
      islemDetay: "Fatura ve Tahsilat",
      kasaBankalar: [
        { isim: "Akbank Ana Hesap", miktar: "₺450.000" },
        { isim: "Garanti Pos", miktar: "₺128.500" },
        { isim: "Merkez Kasa", miktar: "₺45.200" }
      ],
      cekSenet: { portfoy: "12", tahsilde: "4" }
    };
  }

  async getIkSummary(mainCompanySlug: string) {
    return {
      gunlukGiris: { adet: "142", yuzde: "%94", oran: "142/150" },
      aylikDurum: { maasTarihi: "5 Gün", avans: "12 Talep" },
      yaklasanIzinler: [
        { isim: "Ahmet Yılmaz", birim: "Kesim", detay: "14-20 Haziran" },
        { isim: "Ayşe Demir", birim: "Muhasebe", detay: "15-22 Haziran" }
      ],
      eksikPersonel: [
        { isim: "Mehmet Kaya", birim: "Dikim", detay: "Mazeretsiz" },
        { isim: "Ali Can", birim: "Ütü", detay: "Yıllık İzin" }
      ]
    };
  }

  async getImalatSummary(mainCompanySlug: string) {
    return {
      bugunUretim: { adet: "3.450", yuzde: "%85" },
      aktifHavuz: { adet: "12", detay: "İşlemde" },
      dikkatGerektirenler: [
        { isim: "Model 1335", sorun: "Fire Oranı Yüksek", detay: "%12 fire tespit edildi" },
        { isim: "Model 1338", sorun: "Termin Yaklaştı", detay: "Kalan: 2 Gün" }
      ]
    };
  }

  async getDesenSummary(mainCompanySlug: string) {
    return {
      modeller: [
        {name:'1331552 / MODOLSO-A / EKRÜ KK.BDY,MODOLSO-A,26Y',firma:'TAHA GİYİM SAN. VE TİC.',img:'',kanal:false,tags:'fast car, yarış arabası, kırmızı araba, yazı baskı'},
        {name:'a-greatdad',firma:'Firma yok',img:'',kanal:false,tags:'baba yazısı, çocuk baskı, tipografi'},
        {name:'a-teddyboy',firma:'Firma yok',img:'',kanal:false,tags:'ayıcık, teddy, çocuk baskı'},
        {name:'abone',firma:'Firma yok',img:'',kanal:false,tags:'yazı baskı, logo'},
        {name:'abone-on-arka-alt',firma:'Firma yok',img:'',kanal:false,tags:'ön arka alt baskı'},
        {name:'academy',firma:'Firma yok',img:'',kanal:true,tags:'kolej, academy, yazı'}
      ]
    };
  }
}
