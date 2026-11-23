/**
 * LC Waikiki ekolojik uygunluk — kaynak belgeye dayanan kontrol başlıkları.
 * Rev.6 (26.02.2025), LC.GSD.EL.006 ve LC.GSD.TB.001 (05.03.2025).
 * Bunlar kurumun resmi onay/sertifika kararları değildir. Limitler, test kapsamı
 * ve hangi analitin uygulanacağı güncel müşteri dokümanından yetkili kişi tarafından
 * teyit edilmeden otomatik "uygun" üretilemez.
 */
export const LCW_PROFILE_SEED={
  code:"LCW_ECO",
  name:"LC Waikiki — Ekolojik Ürün ve Baskı Uygunluğu",
  version:"LC.GSD.EL.006 Rev.6 / 26.02.2025",
  description:"LCW ürün ve malzeme ekoloji şartları; baskı, hammadde, kimyasal, CAS, test raporu, taahhütname ve tedarikçi kanıtı. Sürüm değişirse müşteri el kitabı yeniden doğrulanır.",
  sourceUrl:"",
  requirements:[
    ["LCW-001","Güncel LCW ekolojik el kitabı ve doküman revizyonunun kabulü","Kapsam ve Politika",0,"Kalite"],
    ["LCW-002","LCW ekolojik ürün taahhütnamesi; alt tedarikçi ve baskı kapsamı","Kapsam ve Politika",0,"Yönetim"],
    ["LCW-003","Baskıda kullanılan ürünlerin ticari ad, üretici, tedarikçi ve lot envanteri","Kimyasal Envanter",0,"Boyahane"],
    ["LCW-004","Kimyasal ürünlerin güncel SDS/GBF ve CAS bileşen kayıtları","Kimyasal Envanter",0,"Boyahane"],
    ["LCW-005","Baskı kimyasallarının TDS ve teknik kullanım kısıtları","Kimyasal Envanter",0,"Boyahane"],
    ["LCW-006","LCW yasaklı/kısıtlı kimyasal liste revizyonu ve tedarikçi beyanları","Kimyasal Uygunluk",0,"Boyahane"],
    ["LCW-007","CAS bazında madde sınırlarının malzeme/baskı kapsamına göre kontrolü","Kimyasal Uygunluk",0,"Kalite"],
    ["LCW-008","ZDHC MRSL ürün/tedarikçi kanıtları (kapsam gerektiriyorsa)","Kimyasal Uygunluk",0,"Boyahane"],
    ["LCW-009","Baskı için azo, alerjen ve kanserojen boyarmadde test değerlendirmesi","Baskı Testleri",0,"Kalite"],
    ["LCW-010","Baskı için formaldehit, ağır metal ve ilgili kimyasal analizleri","Baskı Testleri",0,"Kalite"],
    ["LCW-011","Baskı tipine göre PVC, ftalat, organotin, APEO ve PAH kontrolleri","Baskı Testleri",0,"Kalite"],
    ["LCW-012","İlgili proseslere göre PFAS, solvent ve diğer spesifik analizler","Baskı Testleri",0,"Kalite"],
    ["LCW-013","Akredite laboratuvar test raporları, numune/ürün ve rapor tarihi","Baskı Testleri",0,"Kalite"],
    ["LCW-014","İlgili model/sipariş, müşteri ve ürün grubu bazında test uygulanabilirliği","İzlenebilirlik",0,"Kalite"],
    ["LCW-015","Tedarikçi kimyasal uygunluk deklarasyonları ve imza/geçerlilik kontrolü","Tedarik Zinciri",0,"Satınalma"],
    ["LCW-016","ZDHC / GOTS ürün listelerinde tedarikçi belge ve gerçek sürüm eşleşmesi","Tedarik Zinciri",0,"Boyahane"],
    ["LCW-017","Kimyasal ve ürün değişiminde yeniden inceleme / revizyon kontrolü","Değişiklik Yönetimi",0,"Boyahane"],
    ["LCW-018","Gerekli ekoloji uyumlandırma denetim raporları ve CAPA kayıtları","Denetim ve CAPA",0,"Yönetim"],
    ["LCW-019","Atık su ZDHC analizi ve müşteri taahhüt kapsamına göre takip","Çevre ve Atık Su",0,"Çevre"],
    ["LCW-020","Çevre su/enerji, atık ve kimyasal azaltım izleme kanıtları","Çevre ve Atık Su",0,"Çevre"],
    ["LCW-021","GOTS sertifikalı ürünlerde ek GOTS kimyasal şartları ve kapsam kanıtı","GOTS Kapsamı",0,"Kalite"],
    ["LCW-022","Uygunsuz ürün engelleme, müşteri bildirimi ve düzeltici faaliyet kaydı","Denetim ve CAPA",0,"Kalite"]
  ]
} as const;
