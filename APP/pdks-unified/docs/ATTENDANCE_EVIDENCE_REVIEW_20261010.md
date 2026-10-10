# KY PDKS — Devam ve Puantaj / Kanıt Eşleştirme (2026-10-10)

## Kapsam

Mevcut KY PDKS Günlük, Aylık, Devam ve Puantaj Kontrolü sekmelerine salt okunur yerel kanıt karşılaştırma paneli eklendi. Yeni uygulama veya canlı veritabanı tablosu oluşturulmadı. Yetkili kullanıcının seçtiği JSON kanıt paketi yalnız tarayıcı belleğinde açılır; sunucuya yüklenmez ve veritabanı, terminal, yıllık TNF, maaş veya SGK kaydı oluşturulmaz.

Eşleşen RAW/FDB/TNF üçlüsü bile kullanıcının seçtiği dosyanın gerçekliğini bağımsız olarak kanıtlamaz. Bu yüzden çıktı daima LOCAL REVIEW, localReconciled=false ve approvedForPayroll=false olarak kalır.

## Kaynaklar

- APP/pdks-unified/core/attendanceRules.mjs: mevcut saf gün değerlendirme çekirdeği.
- APP/pdks-unified/core/attendanceEvidenceBundle.mjs: yeni kaynak mutabakatı.
- APP/app/ky-erp-frontend/src/pages/pdksUnified/EvidencePuantajPanel.jsx: mevcut günlük/aylık ekrana yerel dosya yükleme, inceleme tablosu ve salt okunur CSV.
- APP/pdks-unified/windows/FirebirdStageAttendanceSnapshot.cs: mevcut izole Firebird kopyası KIMLIK/GIRCIK kaynağıdır; cihaz RAW ya da yıllık TNF değildir.

## Yerel dosya sözleşmesi (örnek yapı, GERÇEK VERİ DEĞİLDİR)

Aşağıdaki şekil yalnız kod entegrasyonunu ve testleri anlatan sentetik örnektir.

~~~json
{
  "kind": "KY_PDKS_ATTENDANCE_EVIDENCE_V1",
  "schemaVersion": 1,
  "companyId": "company-01",
  "period": "2026-10",
  "timezone": "Europe/Istanbul",
  "personnel": [{
    "cardNo": "00001", "fullName": "TEST PERSONEL",
    "requirePunch": true, "workDays": [1,2,3,4,5],
    "employment": {"startDate": "2025-01-01", "exitDate": null}
  }],
  "days": [{
    "cardNo": "00001", "date": "2026-10-08",
    "shifts": [{
      "id":"day","startAt":"2026-10-08T08:30",
      "endAt":"2026-10-08T19:00",
      "lateToleranceMinutes":5,"earlyToleranceMinutes":10
    }],
    "leave": null, "holiday": {"kind":"NONE"},
    "raw": [
      {"source":"DEVICE_RAW","eventId":"raw-in",
       "timestamp":"2026-10-08T08:30:00","direction":"IN","shiftId":"day"},
      {"source":"DEVICE_RAW","eventId":"raw-out",
       "timestamp":"2026-10-08T19:00:00","direction":"OUT","shiftId":"day"}
    ],
    "firebird": [
      {"source":"FIREBIRD_GIRCIK_COPY","eventId":"fdb-in",
       "timestamp":"2026-10-08T08:30:00","direction":"IN","legacyType":""},
      {"source":"FIREBIRD_GIRCIK_COPY","eventId":"fdb-out",
       "timestamp":"2026-10-08T19:00:00","direction":"OUT","legacyType":""}
    ],
    "tnf": [
      {"source":"ANNUAL_TNF","eventId":"tnf-in",
       "timestamp":"2026-10-08T08:30"},
      {"source":"ANNUAL_TNF","eventId":"tnf-out",
       "timestamp":"2026-10-08T19:00"}
    ],
    "adminE": []
  }]
}
~~~

Gerçek RAW hareketi fiziksel cihazın kendi kayıtlarından, Firebird tarafı ayrı gbak ile restore edilmiş kopyadan, yıllık TNF tarafı bağımsız TNF okumasından alınmalıdır. Bu paket bir gerçeklik sertifikası değildir. Kaynaklar karıştırılıp RAW taklidi oluşturulamaz.

Onaylı E hareketi, adminE dizisinde source=ADMIN_E_APPROVAL, eventId, tam saniyeli timestamp, direction, shiftId, approvalId ve approvedBy alanlarını kullanır; Firebird eşinde legacyType=E olmalı ve yıllık TNF tarafı da tutmalıdır. E, RAW sayılmaz.

İkinci vardiyanın her hareketi açık ve yetkili shiftId ile eşleşmelidir. Gece vardiyası çıkışı ertesi günün gerçek timestamp'ıyla aynı çalışma günü kaydında tutulmalıdır. Onaylı izin için leave.approved=true + approvalId + approvedBy gerekir. Resmî tatil çalışma onayı da holiday.explicitWorkApproval=true + approvalId + approvedBy ister. Yetkili vardiya, izin ve tatil kaynağının bağımsız doğrulaması bu aşamada bulunmadığından onay referansı tek başına kabul sayılmaz.

## Değişmez kurallar

1. RAW ile E olmayan Firebird kayıtları yön, saniye ve çoklukla eşleşir.
2. E ile Firebird'in E tarafları yön, saniye ve çoklukla eşleşir.
3. TNF yön içermez; yalnız tarih/dakika ve çoklukla karşılaştırılır. TNF'den IN/OUT türetilmez.
4. Kaynak uyuşmazlığı, eksik kart tarafı veya belirsiz vardiyada çalışma dakikası boş tutulur.
5. İzin veya tatilde kart geçişi varsa eşleşse bile incelemeye düşer.
6. Aylık toplam bütün personel ve takvim günlerini kapsamadığında eksik sayılır; hiçbir koşulda bordro onayı sayılmaz.
7. İçe aktarılan dosya 8 MB üzerinde olamaz, firma ve ay seçimi dosyayla eşleşmelidir; hiçbiri veri tabanına yazılmaz.

## Test / yayına alma engelleri

Bu feature branch'teki saf karşılaştırma testleri sentetik ve tekrarlanabilir veriler üzerinde çalıştırılır. **Fiziksel RAW, gerçek Firebird, yıllık TNF, E onayları ve iki vardiyanın sahada gerçek mutabakatı henüz sınanmış değildir**. Eksikler:

- FP_CLOCK / eski Hedef / PS-2000 için kanıtı doğrulanan, gerçek cihaz RAW salt-okunur adaptörü.
- İzole gerçek Firebird ve bağımsız yıllık TNF kaynaklarının otomatik ve yetkili kanıt paketine bağlanması.
- Vardiya/grup, E hareketi, izin, tatil kaynaklarının yetkili imza/onay doğrulaması.
- Tam ay ve gerçek kişi üzerinde veri bütünlüğü, desktop/Windows build ve uçtan uca kabul testi.
- Kullanıcı onayı öncesi hiçbir production D1 migration, Firebird/TNF write veya canlı deploy yok.

**Durum:** Mevcut uygulamaya yerel kanıt karşılaştırma bağlandı. Tam otomatik gerçek puantaj/bordro entegrasyonu bu commit ile tamamlanmış değildir.
