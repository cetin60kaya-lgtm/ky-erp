// Shared browser WebAuthn helper for all KY ERP mobile roles and PWA entry points.
// The PIN/biometric remains inside the platform authenticator; no secrets are stored here.
export const REMEMBERED_MOBILE_USER_KEY = "kyerp_mobile_passkey_user_v1";
const CREDENTIAL_PREFIX = "kyerp_mobile_passkey_credential_v1_";
export function rememberedMobileCredential(userId) {
  try { return String(localStorage.getItem(CREDENTIAL_PREFIX + String(userId)) || ""); }
  catch { return ""; }
}
export function rememberMobileCredential(userId, credentialId) {
  try { if (userId && credentialId) localStorage.setItem(CREDENTIAL_PREFIX + String(userId), String(credentialId)); }
  catch { /* non-secret device preference */ }
}
const RP_ID = "kyerp.net";
const b64 = (data) => btoa(String.fromCharCode(...new Uint8Array(data))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const bytes = (value) => {
  const raw = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), (part) => part.charCodeAt(0));
};
export function isMobilePasskeySupported() {
  return Boolean(window.isSecureContext && window.PublicKeyCredential && navigator.credentials?.create && navigator.credentials?.get);
}
// Both Windows Hello and phone platform authenticators are supported.
// The operating system selects fingerprint/face/PIN; the browser never reads the biometric.
export async function hasPlatformPasskeyAuthenticator() {
  if (!isMobilePasskeySupported()) return false;
  if (typeof window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return false;
  try { return Boolean(await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch { return false; }
}
export function isMobileAppPage() {
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  return Boolean(standalone || /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigator.userAgent || "")));
}
export function rememberedMobileUser() {
  try { return String(localStorage.getItem(REMEMBERED_MOBILE_USER_KEY) || "").trim().slice(0, 160); }
  catch { return ""; }
}
export function rememberMobileUser(identity) {
  try { const clean = String(identity || "").trim().slice(0, 160); if (clean) localStorage.setItem(REMEMBERED_MOBILE_USER_KEY, clean); } catch { /* optional only */ }
}
export async function createMobilePasskey(challenge) {
  if (!isMobilePasskeySupported()) throw new Error("Bu cihaz WebAuthn parmak izi / ekran kilidini desteklemiyor.");
  const created = await navigator.credentials.create({ publicKey: {
    challenge: bytes(challenge.challengeToken),
    rp: { name: "KY ERP", id: RP_ID },
    user: { id: new TextEncoder().encode(String(challenge.userId)).slice(0, 64),
      name: String(challenge.username), displayName: String(challenge.displayName || challenge.username) },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
    attestation: "none", timeout: 60000,
  } });
  if (!created || !created.rawId || created.response?.getPublicKeyAlgorithm?.() !== -7) {
    throw new Error("Telefon giriş anahtarı oluşturulamadı.");
  }
  const publicKey = created.response?.getPublicKey?.();
  const authenticatorData = created.response?.getAuthenticatorData?.();
  if (!publicKey || !authenticatorData) throw new Error("Bu cihaz güvenli giriş için gerekli WebAuthn alanlarını sunmuyor.");
  const credentialId = b64(created.rawId);
  // Prove possession with a fresh platform assertion before the API accepts enrollment.
  const verified = await navigator.credentials.get({ publicKey: {
    challenge: bytes(challenge.challengeToken), rpId: RP_ID,
    allowCredentials: [{ type: "public-key", id: bytes(credentialId) }],
    userVerification: "required", timeout: 60000,
  } });
  if (!verified || b64(verified.rawId) !== credentialId) throw new Error("Telefon giriş anahtarı doğrulanamadı.");
  return {
    credentialId,
    creation: { clientDataJSON: b64(created.response.clientDataJSON), authenticatorData: b64(authenticatorData), publicKey: b64(publicKey) },
    proof: { credentialId, clientDataJSON: b64(verified.response.clientDataJSON),
      authenticatorData: b64(verified.response.authenticatorData), signature: b64(verified.response.signature) },
  };
}
export async function assertMobilePasskey(challenge) {
  if (!isMobilePasskeySupported()) throw new Error("Parmak izi / PIN doğrulaması bu cihazda desteklenmiyor.");
  const allowCredentials = Array.isArray(challenge.credentialIds)
    ? challenge.credentialIds.map((id) => ({ type: "public-key", id: bytes(id) })) : [];
  if (!allowCredentials.length) throw new Error("Bu kullanıcı için mobil geçiş anahtarı tanımlanmamış.");
  const assertion = await navigator.credentials.get({ publicKey: {
    challenge: bytes(challenge.challengeToken), rpId: RP_ID, allowCredentials,
    userVerification: "required", timeout: 60000,
  } });
  if (!assertion?.response?.signature || !assertion?.rawId) throw new Error("Telefon giriş doğrulaması tamamlanmadı.");
  return { credentialId: b64(assertion.rawId), clientDataJSON: b64(assertion.response.clientDataJSON),
    authenticatorData: b64(assertion.response.authenticatorData), signature: b64(assertion.response.signature) };
}
