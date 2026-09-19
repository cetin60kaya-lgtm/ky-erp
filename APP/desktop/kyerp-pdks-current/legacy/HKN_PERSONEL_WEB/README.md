# HKN_PERSONEL_WEB (legacy/reference)

Bu klasor, daha once Hedef/Personel icin gelistirilmis Node/HTML katmaninin kaynak referansidir. Aktif urun kodu degildir. Codex bu kodu mevcut masaustu UI parity kurallarini bozmayacak sekilde yalniz referans ve yeniden-kullanim kaynagi olarak ele alir.

## Guvenlik

- Gercek Firebird parolasi GitHub'a yazilmaz.
- DB host/port/path/user/password degerleri ortam degiskenlerinden okunur.
- Canli DATABASE.GDB, lisans ve runtime binary'leri bu klasore konmaz.

## Ortam degiskenleri

`.env.example` yalniz isimleri ve ornek degerleri gosterir. Uygulama su degiskenleri kullanir:

- `KY_PDKS_DB_HOST`
- `KY_PDKS_DB_PORT`
- `KY_PDKS_DB_PATH`
- `KY_PDKS_DB_USER`
- `KY_PDKS_DB_PASSWORD`

## Not

`public/embedded.html` klasik Personel arayuzunu taklit eden eski calismadir. Yeni masaustu tasarimi icin kaynak degildir; masaustu arayuzu `docs/UI_PARITY_LOCK.md` kurallarina gore mevcut klasik uygulamayla bire bir korunur.
