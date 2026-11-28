// No raw provider message, token or account identity is surfaced here.
const MESSAGES=Object.freeze({MICROSOFT_OAUTH_DENIED:"Microsoft izin ekranı tamamlanmadı. Hesap türünü ve uygulama kaydını kontrol edin.",MICROSOFT_OAUTH_STATE_INVALID:"Bağlantı isteğinin süresi doldu. Aynı hesaptan yeni istek başlatın.",MICROSOFT_ACCOUNT_MISMATCH:"Seçilen Microsoft hesabı kayıtlı posta adresiyle eşleşmiyor.",MICROSOFT_MAIL_CONFIG_MISSING:"Sunucuda Microsoft posta OAuth ayarı eksik.",MICROSOFT_OAUTH_FAILED:"Outlook bağlantısı doğrulanamadı. Microsoft uygulamasının kişisel hesap desteğini ve dönüş adresini kontrol edin."});
export function microsoftMailOAuthFeedback(params){
 if(String(params?.get?.("mailProvider")||"").toUpperCase()!=="MICROSOFT_365")return null;
 if(params.get("mailConnected")==="1")return {ok:true,code:"MICROSOFT_CONNECTED",text:"Microsoft yetkilendirmesi kaydedildi. Tam posta senkronizasyonu ayrıca doğrulanmalı."};
 const raw=String(params.get("mailError")||"");if(!raw)return null;const code=raw.split(":")[0].trim().toUpperCase();return {ok:false,code:Object.hasOwn(MESSAGES,code)?code:"MICROSOFT_OAUTH_FAILED",text:MESSAGES[code]||MESSAGES.MICROSOFT_OAUTH_FAILED};
}
