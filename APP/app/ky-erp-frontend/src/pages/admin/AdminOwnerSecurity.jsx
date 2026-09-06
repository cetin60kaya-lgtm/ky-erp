import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  confirmSecureMfaRenewal,
  getApplicationOwner,
  getDeliveryCapabilities,
  getOwnerRecoveryConfig,
  getUserEmailDeliveryStatus,
  listActiveSessions,
  reauthOwnerWithPassword,
  revokeSession,
  saveOwnerRecoveryQuestions,
  startOwnerEmailReauth,
  startSecureMfaRenewal,
  startUserEmailVerification,
  updateUser,
  verifyOwnerEmailReauth,
  verifyUserEmail,
} from "../../services/adminApi";
import "./AdminOwnerSecurity.css";

const PROVIDER_LABELS = { GOOGLE: "Google Authenticator", MICROSOFT: "Microsoft Authenticator" };

function rowsOf(value) { if (Array.isArray(value)) return value; if (Array.isArray(value?.items)) return value.items; return []; }
function dateText(value) { if (!value) return "-"; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("tr-TR"); }
function sessionIdFromToken(token) { try { const parts = String(token || "").split("."); if (parts.length !== 3) return ""; const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/"); const padded = raw + "=".repeat((4 - raw.length % 4) % 4); return String(JSON.parse(window.atob(padded))?.sid || ""); } catch { return ""; } }
function friendlyDevice(row) { const label = String(row?.deviceLabel || ""); if (label && !label.startsWith("BROWSER:")) return label; const ua = String(row?.userAgent || ""); const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Tarayıcı"; const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : ""; return [browser, os].filter(Boolean).join(" / ") || "Tarayıcı"; }
function maskSecurityQuestion(value) {
  return String(value || "").split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part) || !part) return part;
    const chars = Array.from(part);
    if (chars.length <= 2) return chars[0] + "*";
    if (chars.length <= 4) return chars[0] + "*".repeat(Math.max(1, chars.length - 2)) + chars[chars.length - 1];
    return chars.slice(0, 2).join("") + "*".repeat(Math.max(2, chars.length - 3)) + chars[chars.length - 1];
  }).join("");
}
function compatibleOtpUri(value) { const raw = String(value || "").trim(); const prefix = "otpauth://totp/"; if (!raw.toLowerCase().startsWith(prefix)) return raw; try { const remainder = raw.slice(prefix.length); const questionIndex = remainder.indexOf("?"); const encodedLabel = questionIndex >= 0 ? remainder.slice(0, questionIndex) : remainder; const query = questionIndex >= 0 ? remainder.slice(questionIndex + 1) : ""; const decodedLabel = decodeURIComponent(encodedLabel); const separatorIndex = decodedLabel.indexOf(":"); if (separatorIndex < 0) return raw; const issuer = decodedLabel.slice(0, separatorIndex).trim(); const account = decodedLabel.slice(separatorIndex + 1).trim(); if (!issuer || !account) return raw; return `${prefix}${encodeURIComponent(issuer)}:${encodeURIComponent(account)}${query ? `?${query}` : ""}`; } catch { return raw; } }

export default function AdminOwnerSecurity() {
  const { token, logout } = useAuth();
  const [owner, setOwner] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [delivery, setDelivery] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Süper Yönetici güvenlik bilgileri yükleniyor...");
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({ fullName: "", username: "", email: "" });
  const [recoveryConfig, setRecoveryConfig] = useState(null);
  const [recoveryQuestions, setRecoveryQuestions] = useState([
    { question: "", answer: "" },
    { question: "", answer: "" },
    { question: "", answer: "" },
  ]);
  const [recoveryProvider, setRecoveryProvider] = useState("GOOGLE");
  const [recoveryStepUpCode, setRecoveryStepUpCode] = useState("");
  const [showRecoveryAnswers, setShowRecoveryAnswers] = useState([false, false, false]);
  const [showRecoveryQuestions, setShowRecoveryQuestions] = useState([false, false, false]);

  const [emailChallenge, setEmailChallenge] = useState(null);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailDelivery, setEmailDelivery] = useState(null);
  const [mailPollCount, setMailPollCount] = useState(0);

  const [renewProvider, setRenewProvider] = useState("");
  const [renewStage, setRenewStage] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthEmailChallenge, setReauthEmailChallenge] = useState(null);
  const [reauthEmailOtp, setReauthEmailOtp] = useState("");
  const [renewal, setRenewal] = useState(null);
  const [renewCode, setRenewCode] = useState("");
  const [qrError, setQrError] = useState("");
  const qrRef = useRef(null);

  const currentSessionId = useMemo(() => sessionIdFromToken(token), [token]);
  const ownerSessions = useMemo(() => sessions.filter((row) => String(row.userId || row.user_id || "") === String(owner?.id || "")), [sessions, owner?.id]);
  const configuredRecoveryCount = Array.isArray(recoveryConfig?.questions) ? recoveryConfig.questions.filter((row) => row?.configured !== false).length : 0;
  const recoveryChannelReady = Boolean(recoveryConfig?.readiness?.emailReady || recoveryConfig?.readiness?.smsReady);
  const recoveryChannelLabel = recoveryConfig?.readiness?.emailReady ? "Doğrulanmış e-posta" : recoveryConfig?.readiness?.smsReady ? "Doğrulanmış SMS" : "Kanal bekliyor";

  async function loadAll() {
    setBusy(true);
    try {
      const [ownerResult, sessionResult, deliveryResult, recoveryResult] = await Promise.allSettled([
        getApplicationOwner(),
        listActiveSessions(),
        getDeliveryCapabilities(),
        getOwnerRecoveryConfig(),
      ]);
      if (ownerResult.status === "rejected") {
        setOwner(null);
        setMessage(`Hata: ${ownerResult.reason?.message || "Süper Yönetici hesabı alınamadı."}`);
        return;
      }
      const ownerData = ownerResult.value;
      const unavailable = [];
      setOwner(ownerData);
      setProfile({ fullName: ownerData?.fullName || "", username: ownerData?.username || "", email: ownerData?.email || "" });
      if (sessionResult.status === "fulfilled") setSessions(rowsOf(sessionResult.value));
      else { setSessions([]); unavailable.push("aktif oturumlar"); }
      if (deliveryResult.status === "fulfilled") setDelivery(deliveryResult.value);
      else { setDelivery(null); unavailable.push("e-posta servisi"); }
      if (recoveryResult.status === "fulfilled") {
        const recovery = recoveryResult.value || null;
        const configured = Array.isArray(recovery?.questions) ? recovery.questions : [];
        setRecoveryConfig(recovery);
        setRecoveryQuestions([0, 1, 2].map((index) => ({
          question: String(configured[index]?.question || ""),
          answer: "",
        })));
        setShowRecoveryAnswers([false, false, false]);
        setShowRecoveryQuestions([false, false, false]);
      } else {
        setRecoveryConfig(null);
        setRecoveryQuestions([
          { question: "", answer: "" },
          { question: "", answer: "" },
          { question: "", answer: "" },
        ]);
        setShowRecoveryAnswers([false, false, false]);
        setShowRecoveryQuestions([false, false, false]);
        unavailable.push("hesap kurtarma güvenliği");
      }
      setMessage(unavailable.length
        ? `Süper Yönetici hesabı yüklendi. Alınamayan yardımcı kaynak: ${unavailable.join(", ")}.`
        : "Süper Yönetici hesabı ve güvenlik durumu güncel.");
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Süper Yönetici güvenlik bilgileri alınamadı."}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function saveProfile(event) {
    event.preventDefault();
    if (!owner) return;
    const sameEmail = String(profile.email || "").trim().toLowerCase() === String(owner.email || "").trim().toLowerCase();
    setBusy(true);
    try {
      await updateUser(owner.id, {
        fullName: profile.fullName,
        username: profile.username,
        email: profile.email,
        mainCompanySlug: owner.mainCompanySlug,
        role: "SUPER_ADMIN",
        isActive: true,
        emailVerified: sameEmail && owner.emailVerified === true,
      });
      setEditing(false);
      setMessage(sameEmail ? "Süper Yönetici profili güncellendi." : "E-posta değişti. Yeni adres güvenlik nedeniyle yeniden doğrulanmalıdır.");
      await loadAll();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Profil güncellenemedi."}`);
    } finally { setBusy(false); }
  }

  async function checkEmailDelivery(messageId = emailChallenge?.providerMessageId) {
    if (!owner?.id || !messageId) return;
    try {
      const status = await getUserEmailDeliveryStatus(owner.id, messageId);
      setEmailDelivery(status);
      const event = String(status?.event || "unknown").toLowerCase();
      if (status?.delivered) setMessage(`E-posta Resend tarafından teslim edildi (${event}). Gelen kutusundaki 6 haneli kodu girin.`);
      else if (status?.failed) setMessage(`Hata: E-posta teslimatı başarısız (${event}). Resend teslimat kaydı kontrol edilmelidir.`);
      else setMessage(`E-posta Resend tarafından kabul edildi. Teslimat durumu: ${event}.`);
    } catch (error) {
      setMessage(`Hata: ${error?.message || "E-posta teslimat durumu alınamadı."}`);
    }
  }

  useEffect(() => {
    if (!emailChallenge?.providerMessageId || emailDelivery?.delivered || emailDelivery?.failed || mailPollCount >= 24) return undefined;
    const timer = window.setTimeout(async () => {
      await checkEmailDelivery(emailChallenge.providerMessageId);
      setMailPollCount((value) => value + 1);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [emailChallenge?.providerMessageId, emailDelivery?.delivered, emailDelivery?.failed, mailPollCount]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveRecoverySecurity(event) {
    event.preventDefault();
    const cleanCode = String(recoveryStepUpCode || "").replace(/\D/g, "");
    const questions = recoveryQuestions.map((row) => ({
      question: String(row?.question || "").trim(),
      answer: String(row?.answer || "").trim(),
    }));
    if (questions.some((row) => row.question.length < 6)) {
      setMessage("Hata: Üç özel güvenlik sorusunun her biri en az 6 karakter olmalıdır.");
      return;
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      setMessage("Hata: Kaydetmek için mevcut Google veya Microsoft Authenticator uygulamanızdaki 6 haneli kodu girin.");
      return;
    }
    const existing = Array.isArray(recoveryConfig?.questions) ? recoveryConfig.questions : [];
    const missingNewAnswer = questions.some((row, index) => {
      const oldQuestion = String(existing[index]?.question || "").trim();
      return row.question !== oldQuestion && !row.answer;
    });
    if (missingNewAnswer) {
      setMessage("Hata: Yeni veya değiştirilen her güvenlik sorusu için cevap girin.");
      return;
    }

    setBusy(true);
    try {
      const result = await saveOwnerRecoveryQuestions({
        provider: recoveryProvider,
        code: cleanCode,
        questions,
      });
      setRecoveryStepUpCode("");
      setMessage(result?.recoveryEnabled
        ? "Hesap kurtarma güvenliği kaydedildi. Üç güvenlik sorusu ve doğrulanmış kanal aktif."
        : "Güvenlik soruları kaydedildi. Hesap kurtarmanın aktif olması için doğrulanmış e-posta veya SMS kanalı da hazır olmalıdır.");
      await loadAll();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Özel güvenlik soruları kaydedilemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  async function startEmailVerification() {
    if (!owner) return;
    if (!delivery?.email) return setMessage("Hata: Gerçek Resend e-posta servisi aktif Worker üzerinde kullanılamıyor.");
    setBusy(true);
    try {
      const result = await startUserEmailVerification(owner.id);
      if (result?.alreadyVerified) { setMessage("Süper Yönetici e-postası zaten doğrulanmış."); await loadAll(); return; }
      if (result?.deliveryStatus !== "PROVIDER_ACCEPTED" || !result?.providerMessageId) throw new Error("Resend sağlayıcı kabul kimliği dönmedi.");
      setEmailChallenge(result);
      setEmailOtp("");
      setEmailDelivery({ event: "accepted", delivered: false, failed: false, messageId: result.providerMessageId });
      setMailPollCount(0);
      setMessage(`Resend gönderim isteğini kabul etti. Sağlayıcı ID: ${result.providerMessageId}. Teslimat ayrıca kontrol ediliyor.`);
      window.setTimeout(() => checkEmailDelivery(result.providerMessageId), 1200);
    } catch (error) {
      setEmailChallenge(null);
      setEmailDelivery(null);
      setMessage(`Hata: ${error?.message || "E-posta doğrulama isteği gönderilemedi."}`);
    } finally { setBusy(false); }
  }

  async function finishEmailVerification() {
    if (!owner || !emailChallenge) return;
    const otp = String(emailOtp || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(otp)) return setMessage("Hata: E-postadaki 6 haneli doğrulama kodunu girin.");
    setBusy(true);
    try {
      await verifyUserEmail(owner.id, { verificationId: emailChallenge.verificationId, verificationToken: emailChallenge.verificationToken, otp });
      setEmailChallenge(null); setEmailOtp(""); setEmailDelivery(null); setMailPollCount(0);
      setMessage("Süper Yönetici e-postası doğrulandı. Artık MFA yenilemede şifreye alternatif olarak e-posta kodu kullanılabilir.");
      await loadAll();
    } catch (error) { setMessage(`Hata: ${error?.message || "E-posta kodu doğrulanamadı."}`); }
    finally { setBusy(false); }
  }

  function beginRenew(provider) {
    setRenewProvider(provider);
    setRenewStage("CHOOSE");
    setReauthPassword(""); setReauthEmailChallenge(null); setReauthEmailOtp(""); setRenewal(null); setRenewCode(""); setQrError("");
    setMessage(`${PROVIDER_LABELS[provider]} yenileme için önce yeniden kimlik doğrulaması gerekir.`);
  }

  function cancelRenew() {
    setRenewProvider(""); setRenewStage(""); setReauthPassword(""); setReauthEmailChallenge(null); setReauthEmailOtp(""); setRenewal(null); setRenewCode(""); setQrError("");
    setMessage("MFA yenileme iptal edildi. Mevcut Authenticator kaydı değiştirilmedi.");
  }

  async function openQrFromGrant(grant) {
    if (!owner || !renewProvider) return;
    const result = await startSecureMfaRenewal(owner.id, renewProvider, { reauthId: grant.reauthId, reauthToken: grant.reauthToken });
    setRenewal(result); setRenewCode(""); setRenewStage("QR");
    setMessage(`${PROVIDER_LABELS[renewProvider]} için yeni QR hazır. Yeni kaydı okutun ve 6 haneli kodu doğrulayın. Mevcut kayıt henüz değiştirilmedi.`);
  }

  async function passwordReauth(event) {
    event.preventDefault();
    if (!owner || !renewProvider || !reauthPassword) return setMessage("Hata: Süper Yönetici şifresini girin.");
    setBusy(true);
    try {
      const grant = await reauthOwnerWithPassword({ password: reauthPassword, targetUserId: owner.id, provider: renewProvider });
      setReauthPassword("");
      await openQrFromGrant(grant);
    } catch (error) { setMessage(`Hata: ${error?.message || "Şifre ile yeniden doğrulama başarısız."}`); }
    finally { setBusy(false); }
  }

  async function startEmailReauth() {
    if (!owner || !renewProvider) return;
    if (!owner.emailVerified) return setMessage("Hata: E-posta ile MFA yenileme doğrulaması için önce Süper Yönetici e-postasını doğrulayın.");
    setBusy(true);
    try {
      const result = await startOwnerEmailReauth({ targetUserId: owner.id, provider: renewProvider });
      setReauthEmailChallenge(result); setReauthEmailOtp(""); setRenewStage("EMAIL_OTP");
      setMessage(`${result.masked || owner.email} adresine MFA yenileme güvenlik kodu gönderildi. Sağlayıcı ID: ${result.providerMessageId || "-"}.`);
    } catch (error) { setMessage(`Hata: ${error?.message || "E-posta güvenlik kodu gönderilemedi."}`); }
    finally { setBusy(false); }
  }

  async function verifyEmailReauth(event) {
    event.preventDefault();
    if (!reauthEmailChallenge) return;
    const otp = String(reauthEmailOtp || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(otp)) return setMessage("Hata: E-postadaki 6 haneli güvenlik kodunu girin.");
    setBusy(true);
    try {
      const grant = await verifyOwnerEmailReauth({ reauthId: reauthEmailChallenge.reauthId, reauthToken: reauthEmailChallenge.reauthToken, otp });
      setReauthEmailChallenge(null); setReauthEmailOtp("");
      await openQrFromGrant(grant);
    } catch (error) { setMessage(`Hata: ${error?.message || "E-posta güvenlik kodu doğrulanamadı."}`); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (renewStage !== "QR" || !renewal?.otpauthUri) return undefined;
    const holder = qrRef.current;
    if (!holder) return undefined;
    holder.replaceChildren();
    const QRCodeCtor = window.QRCode;
    if (typeof QRCodeCtor !== "function") { setQrError("QR bileşeni yüklenemedi. Sayfayı yenileyip yeniden deneyin."); return undefined; }
    try {
      new QRCodeCtor(holder, { text: compatibleOtpUri(renewal.otpauthUri), width: 210, height: 210, colorDark: "#0f172a", colorLight: "#ffffff", correctLevel: QRCodeCtor.CorrectLevel?.M });
      setQrError("");
    } catch { setQrError("QR kodu oluşturulamadı. Yenilemeyi iptal edip yeniden başlayın."); }
    return () => holder.replaceChildren();
  }, [renewStage, renewal?.otpauthUri]);

  async function confirmRenew(event) {
    event.preventDefault();
    if (!owner || !renewal || !renewProvider) return;
    const code = String(renewCode || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) return setMessage("Hata: Yeni Authenticator uygulamasındaki 6 haneli kodu girin.");
    setBusy(true);
    try {
      const result = await confirmSecureMfaRenewal(owner.id, renewProvider, { renewalId: renewal.renewalId, renewalToken: renewal.renewalToken, code });
      const provider = renewProvider;
      setRenewProvider(""); setRenewStage(""); setRenewal(null); setRenewCode("");
      setMessage(`${result?.providerLabel || PROVIDER_LABELS[provider]} güvenli şekilde yenilendi. Bu oturum korundu; diğer eski oturumlar kapatıldı.`);
      await loadAll();
    } catch (error) { setMessage(`Hata: ${error?.message || "Yeni Authenticator kodu doğrulanamadı. Mevcut kayıt değiştirilmedi."}`); }
    finally { setBusy(false); }
  }

  async function closeSession(row) {
    if (!row?.id) return;
    setBusy(true);
    try {
      if (String(row.id) === String(currentSessionId)) { setMessage("Bu cihazdan güvenli çıkış yapılıyor."); await logout(); return; }
      await revokeSession(row.id); setMessage("Seçilen eski oturum sonlandırıldı."); await loadAll();
    } catch (error) { setMessage(`Hata: ${error?.message || "Oturum sonlandırılamadı."}`); }
    finally { setBusy(false); }
  }

  if (!owner) return <div className="aos-page"><div className={`aos-banner ${String(message).startsWith("Hata:") ? "bad" : ""}`}>{message}</div></div>;

  return <div className="aos-page">
    <div className="aos-title"><div><small>PLATFORM YÖNETİMİ / SÜPER YÖNETİCİ</small><h1>Süper Yönetici Güvenlik Merkezi</h1><p>Bu hesap normal kullanıcı değildir. Kimlik, e-posta, MFA ve oturum güvenliği ayrı yönetilir.</p></div><button disabled={busy} onClick={loadAll}>Yenile</button></div>
    <div className={`aos-banner ${String(message).startsWith("Hata:") ? "bad" : ""}`}>{message}</div>

    <section className="aos-owner-card">
      <div className="aos-owner-badge">SUPER ADMIN</div>
      {!editing ? <>
        <div className="aos-owner-copy"><h2>{owner.fullName}</h2><p>@{owner.username} · {owner.email || "e-posta yok"}</p><div className="aos-tags"><span>Süper Yönetici</span><span>{owner.mainCompanySlug || "-"}</span><span className={owner.emailVerified ? "good" : "warn"}>{owner.emailVerified ? "E-posta doğrulandı" : "E-posta doğrulanmadı"}</span></div></div>
        <button className="primary" onClick={() => setEditing(true)}>Profili Düzenle</button>
      </> : <form className="aos-profile-form" onSubmit={saveProfile}><label>Ad Soyad<input value={profile.fullName} onChange={(e) => setProfile((v) => ({ ...v, fullName: e.target.value }))}/></label><label>Kullanıcı Adı<input value={profile.username} onChange={(e) => setProfile((v) => ({ ...v, username: e.target.value }))}/></label><label>E-posta<input type="email" value={profile.email} onChange={(e) => setProfile((v) => ({ ...v, email: e.target.value }))}/></label><div><button className="primary" type="submit">Kaydet</button><button type="button" onClick={() => setEditing(false)}>Vazgeç</button></div></form>}
    </section>

    <div className="aos-grid">
      <section className="aos-card">
        <div className="aos-card-head"><div><h3>E-posta Doğrulama</h3><p>Resend kabulü ve gerçek teslimat olayı ayrı takip edilir.</p></div><span className={owner.emailVerified ? "state good" : "state warn"}>{owner.emailVerified ? "Doğrulandı" : "Doğrulanmadı"}</span></div>
        <div className="aos-email">{owner.email || "E-posta kayıtlı değil"}</div>
        {!owner.emailVerified && <button className="primary" disabled={busy || !owner.email || !delivery?.email} onClick={startEmailVerification}>Doğrulama Kodu Gönder</button>}
        {!delivery?.email && <div className="aos-error">Resend aktif Worker üzerinde kullanılamıyor.</div>}
        {emailChallenge && <div className="aos-flow"><div className="aos-delivery"><b>Resend durumu:</b> {emailDelivery?.event || "accepted"}{emailChallenge.providerMessageId && <small>ID: {emailChallenge.providerMessageId}</small>}</div><div className="aos-row"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={emailOtp} onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}/><button className="primary" onClick={finishEmailVerification}>Kodu Doğrula</button><button onClick={() => checkEmailDelivery()}>Teslimatı Kontrol Et</button></div></div>}
      </section>

      <section className="aos-card">
        <div className="aos-card-head"><div><h3>Authenticator Kayıtları</h3><p>QR yenileme, açık oturum olsa bile yeniden kimlik doğrulaması ister.</p></div></div>
        <div className="aos-provider"><div><b>Google Authenticator</b><small>{owner.googleMfaEnabled ? "Aktif" : "Kurulu değil"}</small></div><button onClick={() => beginRenew("GOOGLE")}>Google QR Yenile</button></div>
        <div className="aos-provider"><div><b>Microsoft Authenticator</b><small>{owner.microsoftMfaEnabled ? "Aktif" : "Kurulu değil"}</small></div><button onClick={() => beginRenew("MICROSOFT")}>Microsoft QR Yenile</button></div>
      </section>
    </div>

    <section className="aos-card aos-recovery-security">
      <div className="aos-card-head aos-recovery-head">
        <div>
          <small className="aos-section-kicker">HESAP KURTARMA / SÜPER YÖNETİCİ</small>
          <h3>Hesap Kurtarma ve Kimlik Doğrulama</h3>
          <p>Üç güvenlik sorusu tanımlanır. Hesap kurtarma sırasında doğrulanmış iletişim kanalı ile birlikte rastgele iki soru sorulur; başarılı doğrulamadan sonra Authenticator kayıtları güvenli şekilde yeniden kurulur.</p>
        </div>
        <span className={recoveryConfig?.recoveryEnabled ? "state good" : "state warn"}>
          {recoveryConfig?.recoveryEnabled ? "Kurtarma Hazır" : "Kurulum Bekliyor"}
        </span>
      </div>

      <div className="aos-recovery-summary">
        <div className={recoveryConfig?.recoveryEnabled ? "ready" : "pending"}>
          <span>Kurtarma Durumu</span>
          <strong>{recoveryConfig?.recoveryEnabled ? "Aktif" : "Hazırlanıyor"}</strong>
          <small>{recoveryConfig?.recoveryEnabled ? "Güvenli kurtarma kullanılabilir" : "Eksik adımları tamamlayın"}</small>
        </div>
        <div className={configuredRecoveryCount === 3 ? "ready" : "pending"}>
          <span>Güvenlik Soruları</span>
          <strong>{configuredRecoveryCount}/3</strong>
          <small>{configuredRecoveryCount === 3 ? "Üç soru kayıtlı" : "Üç soru zorunlu"}</small>
        </div>
        <div className={owner.emailVerified ? "ready" : "pending"}>
          <span>E-posta</span>
          <strong>{owner.emailVerified ? "Doğrulandı" : "Bekliyor"}</strong>
          <small>{owner.email || "E-posta kayıtlı değil"}</small>
        </div>
        <div className={recoveryChannelReady ? "ready" : "pending"}>
          <span>Kurtarma Kanalı</span>
          <strong>{recoveryChannelReady ? "Hazır" : "Bekliyor"}</strong>
          <small>{recoveryChannelLabel}</small>
        </div>
      </div>

      <form className="aos-recovery-form" onSubmit={saveRecoverySecurity}>
        <div className="aos-question-grid">
          {recoveryQuestions.map((row, index) => {
            const saved = Boolean(recoveryConfig?.questions?.[index]?.configured);
            const answerVisible = Boolean(showRecoveryAnswers[index]);
            const questionVisible = !saved || Boolean(showRecoveryQuestions[index]);
            return (
              <div className="aos-question-card" key={index}>
                <div className="aos-question-title">
                  <div><span>{index + 1}</span><div><b>Güvenlik Sorusu</b><small>{saved ? "Kayıtlı · cevaplamak veya düzenlemek için soruyu açın" : "Henüz kaydedilmedi"}</small></div></div>
                  <span className={saved ? "saved" : "new"}>{saved ? "Kayıtlı" : "Yeni"}</span>
                </div>

                {questionVisible ? (
                  <label>Soru
                    <div className="aos-question-field">
                      <input
                        value={row.question}
                        onChange={(event) => setRecoveryQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, question: event.target.value } : item))}
                        placeholder="Yalnız sizin bildiğiniz, tahmin edilmesi zor bir soru yazın"
                        maxLength={220}
                      />
                      {saved ? <button
                        type="button"
                        className="aos-question-toggle"
                        onClick={() => {
                          setShowRecoveryQuestions((current) => current.map((value, itemIndex) => itemIndex === index ? false : value));
                          setShowRecoveryAnswers((current) => current.map((value, itemIndex) => itemIndex === index ? false : value));
                        }}
                      >Soruyu Gizle</button> : null}
                    </div>
                  </label>
                ) : (
                  <div className="aos-question-preview">
                    <span>Soru</span>
                    <div>
                      <strong>{maskSecurityQuestion(row.question)}</strong>
                      <button
                        type="button"
                        className="aos-question-toggle"
                        onClick={() => setShowRecoveryQuestions((current) => current.map((value, itemIndex) => itemIndex === index ? true : value))}
                      >Soruyu Göster</button>
                    </div>
                    <small>Cevabı girmeden önce sorunun tamamını görmek için açın.</small>
                  </div>
                )}

                <label>Cevap
                  <div className="aos-answer-field">
                    <input
                      type={answerVisible ? "text" : "password"}
                      autoComplete="new-password"
                      value={row.answer}
                      disabled={saved && !questionVisible}
                      onChange={(event) => setRecoveryQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item))}
                      placeholder={saved ? (questionVisible ? "Kayıtlı — değiştirmek için yeni cevap yazın" : "Önce soruyu gösterin") : "Özel cevabınızı yazın"}
                    />
                    <button
                      type="button"
                      className="aos-answer-toggle"
                      disabled={!row.answer || (saved && !questionVisible)}
                      onClick={() => setShowRecoveryAnswers((current) => current.map((value, itemIndex) => itemIndex === index ? !value : value))}
                      aria-label={answerVisible ? "Cevabı gizle" : "Cevabı göster"}
                    >{answerVisible ? "Gizle" : "Göster"}</button>
                  </div>
                </label>
              </div>
            );
          })}
        </div>

        <div className="aos-recovery-stepup">
          <div>
            <b>Değişikliği doğrula</b>
            <small>Güvenlik soruları yalnız mevcut Authenticator kodunuz doğrulandıktan sonra kaydedilir.</small>
          </div>
          <label>Authenticator
            <select value={recoveryProvider} onChange={(event) => setRecoveryProvider(event.target.value)}>
              <option value="GOOGLE">Google Authenticator</option>
              <option value="MICROSOFT">Microsoft Authenticator</option>
            </select>
          </label>
          <label>6 haneli kod
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={recoveryStepUpCode}
              onChange={(event) => setRecoveryStepUpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              aria-label="Mevcut Authenticator kodu"
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>Kurtarma Güvenliğini Kaydet</button>
        </div>
      </form>

      <div className="aos-security-note">
        <b>Gizlilik:</b> Kayıtlı sorular sayfa açılışında kısmen maskelenir; “Soruyu Göster” ile yalnız işlem sırasında tam görünür. Kayıtlı cevapların düz metni sunucudan geri getirilemez. Cevaplar salt + PBKDF2 hash olarak tutulur; “Göster / Gizle” yalnız şu anda yazdığınız yeni cevabı gösterir.
      </div>
    </section>

    {renewProvider && <section className="aos-card aos-renew">
      <div className="aos-card-head"><div><h3>{PROVIDER_LABELS[renewProvider]} — Güvenli QR Yenileme</h3><p>Mevcut Authenticator kaydı yeni kod doğrulanana kadar değiştirilmez.</p></div><button onClick={cancelRenew}>İptal</button></div>
      {renewStage === "CHOOSE" && <div className="aos-step"><h4>1. Yeniden kimlik doğrulaması</h4><p>Oturumun açık olması yeterli değildir. Şifrenizi doğrulayın veya doğrulanmış e-posta adresinize kod gönderin.</p><div className="aos-row"><button className="primary" onClick={() => setRenewStage("PASSWORD")}>Şifre ile Doğrula</button><button disabled={!owner.emailVerified || !delivery?.email} onClick={startEmailReauth}>E-posta Kodu ile Doğrula</button></div>{!owner.emailVerified && <small>E-posta seçeneği için önce üstteki e-posta doğrulamasını tamamlayın.</small>}</div>}
      {renewStage === "PASSWORD" && <form className="aos-step" onSubmit={passwordReauth}><h4>1. Şifrenizi doğrulayın</h4><div className="aos-row"><input type="password" autoComplete="current-password" placeholder="Süper Yönetici şifresi" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)}/><button className="primary" type="submit">Doğrula ve QR Aç</button><button type="button" onClick={() => setRenewStage("CHOOSE")}>Geri</button></div></form>}
      {renewStage === "EMAIL_OTP" && <form className="aos-step" onSubmit={verifyEmailReauth}><h4>1. E-posta güvenlik kodunu doğrulayın</h4><p>{reauthEmailChallenge?.masked || owner.email}</p><div className="aos-row"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={reauthEmailOtp} onChange={(e) => setReauthEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}/><button className="primary" type="submit">Doğrula ve QR Aç</button><button type="button" onClick={() => setRenewStage("CHOOSE")}>Geri</button></div></form>}
      {renewStage === "QR" && <form className="aos-step aos-qr-step" onSubmit={confirmRenew}><div><h4>2. Yeni QR kodunu okutun</h4><div className="aos-qr" ref={qrRef}/>{qrError && <div className="aos-error">{qrError}</div>}<small>Manuel anahtar: <code>{renewal?.secret || ""}</code></small></div><div className="aos-qr-confirm"><h4>3. Yeni kaydı doğrulayın</h4><p>Yeni Authenticator uygulamasında görünen 6 haneli kodu girin. Kod doğru değilse eski kayıt korunur.</p><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={renewCode} onChange={(e) => setRenewCode(e.target.value.replace(/\D/g, "").slice(0, 6))}/><button className="primary" type="submit">Yeni Authenticator'ı Onayla</button></div></form>}
    </section>}

    <section className="aos-card">
      <div className="aos-card-head"><div><h3>Süper Yönetici Oturumları</h3><p>Bu cihaz güvenli çıkış yapabilir; diğer cihazlar tek tek sonlandırılabilir.</p></div><span className="state">{ownerSessions.length} aktif</span></div>
      <div className="aos-session-table"><div className="head"><span>Cihaz</span><span>Oluşturma</span><span>Son Görülme</span><span>İşlem</span></div>{ownerSessions.length ? ownerSessions.map((row) => { const current = String(row.id) === String(currentSessionId); return <div className="line" key={row.id}><span><b>{friendlyDevice(row)}</b>{current && <small>Bu cihaz</small>}</span><span>{dateText(row.createdAt || row.created_at)}</span><span>{dateText(row.lastSeenAt || row.last_seen_at)}</span><span><button className="danger" disabled={busy} onClick={() => closeSession(row)}>{current ? "Güvenli Çıkış" : "Oturumu Sonlandır"}</button></span></div>; }) : <div className="empty">Aktif oturum bulunamadı.</div>}</div>
    </section>
  </div>;
}
