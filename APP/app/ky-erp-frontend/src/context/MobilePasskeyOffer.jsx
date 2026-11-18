import { useEffect, useState } from "react";
import { isMobilePasskeySupported, isMobileAppPage, rememberedMobileCredential } from "./mobilePasskeyClient";
import "./MobilePasskeyOffer.css";

const dismissKey = (userId) => "kyerp_mobile_passkey_offer_" + String(userId || "");
export default function MobilePasskeyOffer({ user, getStatus, onEnroll }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!user?.id || !isMobileAppPage() || !isMobilePasskeySupported()) return undefined;
    let dismissed = 0;
    try { dismissed = Number(sessionStorage.getItem(dismissKey(user.id)) || 0); } catch { /* noop */ }
    if (dismissed) return undefined;
    getStatus().then((status) => {
      const localId = rememberedMobileCredential(user.id);
      const onThisDevice = Boolean(localId && Array.isArray(status?.credentialIds) && status.credentialIds.includes(localId));
      if (active) setVisible(!onThisDevice);
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
    <div><strong>Bir sonraki girişiniz tek dokunuş olsun</strong>
      <p>Parmak izi, yüz tanıma veya ekran PIN'iyle ERP'yi açın. Kurulum yalnız bu hesap için yapılır.</p></div>
    {error ? <p className="ky-mobile-passkey-error" role="alert">{error}</p> : null}
    <div className="ky-mobile-passkey-actions">
      <button type="button" onClick={enroll} disabled={busy}>{busy ? "Güvenli kayıt yapılıyor..." : "Telefonda Hızlı Girişi Etkinleştir"}</button>
      <button type="button" onClick={dismiss} disabled={busy}>Şimdi değil</button>
    </div>
  </aside>;
}
