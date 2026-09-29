# KY PDKS 6.0 — FINAL REFERENCE

Bu klasör PDKS masaüstü + kyerp.net + Android/tablet senkron işinin tek canonical referansıdır.
Yeni sohbet/agent **önce bu klasörü okusun, baştan analiz yapmasın**.

## Ana karar
- Ana sistem: KY PDKS 6.0 Desktop.
- Ana yerel DB: `KY_PDKS_DATA.FDB`.
- Ham terminal arşivi: `TRYYYY.Tnf`.
- Geçici canlı dosya: `live.dat`.
- `kyerp.net/pdks` ayrı ürün değil; masaüstünün senkron web/tablet yüzüdür.
- İnternet yokken masaüstü tam çalışır; internet gelince kuyruk otomatik eşitlenir.

## Okuma sırası
1. `CODE_MAP.md`
2. `SYNC_CONTRACT.md`
3. `DATA_STATE.md`
4. `ACCEPTANCE_TESTS.md`
5. `NEXT_CHAT_PROMPT.md`
6. `images/01_web_pdks_current.png`
7. `images/02_desktop_pdks_current.png`

## Repo
- Branch: `codex/kyerp-pdks-full-app-prep`
- Desktop root: `APP/desktop/kyerp-pdks-current`
- Final marka: **KY PDKS 6.0**

> Bitmiş sayılma kriteri: Desktop offline çalışacak, web/tablet aynı veriyi gösterecek, çift yönlü sync ve terminal Eşitle gerçek senaryoda test edilecek.