import { useEffect, useState } from "react";
import { isMobilePasskeySupported, isMobileAppPage, hasPlatformPasskeyAuthenticator, rememberedMobileCredential } from "./mobilePasskeyClient";
import "./MobilePasskeyOffer.css";

const dismissKey = (userId) => "kyerp_mobile_passkey_offer_" + String(userId || "");
export default function MobilePasskeyOffer({ user, getStatus, onEnroll }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!user?.id || !isMobilePasskeySupported()) return undefined;
    let dismissed = 0;
    try { dismissed = Number(sessionStorage.getItem(dismissKey(user.id)) || 0); } catch { /* noop */ }
    if (dismissed) return undefined;
    Promise.all([getStatus(), hasPlatformPasskeyAuthenticator()]).then(([status, platformAvailable]) => {
      const localId = rememberedMobileCredential(user.id);
      const onThisDevice = Boolean(localId && Array.isArray(status?.credentialIds) && status.credentialIds.includes(localId));
      if (active) setVisible(platformAvailable && !onThisDevice);
    }).catch(() => {});
    return () => { active = false; };
  }, [getStatus, user?.id]);
  const dismiss = () => {
    try { sessionStorage.setItem(dismissKey(user.id), String(Date.now())); } catch { /* noop */ }
    setVisible(false);
  };
  const enroll = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await onEnroll();
      dismiss();
    } catch (err) {
      setError(err?.message || "Telefon giriş anahtarı kaydedilemedi. Normal giriş korunuyor.");
    } finally { setBusy(false); }
  };
  if (!visible) return null;
  return <aside className="ky-mobile-passkey-offer" role="region" aria-label="Hızlı telefon girişi kurulumu">
    <div><strong>{isMobileAppPage() ? "Telefonda / tablette tek dokunuşla giriş" : "Bilgisayarda Windows Hello ile hızlı giriş"}</strong>
      <p>{isMobileAppPage()
        ? "Parmak izi, yüz tanıma veya ekran kilidiyle KY ERP ve KY PRO'ya giriş. Kod eşleştirmesi yalnız ilk kurulum veya riskli işlemlerde kalır."
        : "Windows Hello parmak izi, yüz tanıma veya Windows PIN'iyle yeniden giriş yapın. İlk kayıt için mevcut güvenli oturumunuz gerekir."}</p></div>
    {error ? <p className="ky-mobile-passkey-error" role="alert">{error}</p> : null}
    <div className="ky-mobile-passkey-actions">
      <button type="button" onClick={enroll} disabled={busy}>{busy ? "Güvenli kayıt yapılıyor..." : isMobileAppPage() ? "Hızlı Telefon Girişini Etkinleştir" : "Windows Hello Girişini Etkinleştir"}</button>
      <button type="button" onClick={dismiss} disabled={busy}>Şimdi değil</button>
    </div>
  </aside>;
}
