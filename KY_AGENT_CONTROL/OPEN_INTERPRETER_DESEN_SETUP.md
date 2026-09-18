# Open Interpreter - DESEN PC Kurulum Kaydi

Tarih: 2026-09-18
Cihaz: DESEN
Amaç: Windows masaüstünde GUI kontrolü; ekran okuma, mouse, klavye, uygulama menüleri ve diyaloglarla çalışma.

## Kullanılacak ürün
Open Interpreter Desktop App (Windows)

Not: Terminal/CLI sürümü ayrı üründür; GUI testi için Desktop App kullanılacak.

## İlk kurulum standardı
- Resmi indirme: https://www.openinterpreter.com/download/windows
- Workspace: D:\KY-INTERPRETER-WORKSPACE
- İlk test: Not Defteri aç -> `KY INTERPRETER TEST - BAGLANTI CALISIYOR` yaz -> kaydetmeden kapat.
- İkinci test: Chrome aç/kapat ve bir menü tıklaması.
- Üçüncü test: Photoshop aç, yalnızca pencere/menü gezintisi; dosyada kalıcı değişiklik yok.

## Yetkiler
Windows ilk açılış UAC izni verilecek. Uygulama aynı Windows kullanıcısı altında çalışacak.

## Model planı
İlk tercih: yerel Ollama/LM Studio profili (API kredisi olmadan). Yerel model GUI görevlerinde yetersiz kalırsa yalnız zor işler için hosted model profili eklenecek.

## Güvenlik
- Şifre/API anahtarı bu repoya yazılmayacak.
- Silme, gönderme, paylaşma ve overwrite işlemlerinde onay açık kalacak.
- Workspace dışında dosya erişimi gerektiğinde klasör bazında izin verilecek.

## Sonraki adım
DESEN PC'de Desktop App kurulumu tamamlandıktan sonra ilk Not Defteri testi yapılacak ve sonuç bu kayda eklenecek.
