/**
 * Provider credentials are stored ONLY in browser-managed password storage,
 * in the current kyerp.net origin. KY ERP API/D1 never stores this password.
 * Retrieval is explicitly user-mediated, never automatic or background.
 */
export const ISNET_BROWSER_PREFIX = "isnet:";
export const isIsnetBrowserCredential = (id) => typeof id === "string" && id.startsWith(ISNET_BROWSER_PREFIX);

export function isBrowserVaultSupported(env = globalThis) {
  return Boolean(env?.PasswordCredential && env?.navigator?.credentials?.store && env?.navigator?.credentials?.get);
}
export async function saveIsnetBrowserCredentials(username, password, env = globalThis) {
  const name = String(username || "").trim();
  if (!name || !password) throw new Error("Önce kullanıcı adını ve şifrenizi girin.");
  if (!isBrowserVaultSupported(env)) throw new Error("Bu tarayıcı kaydı desteklemiyor. Chrome Şifre Yöneticisi'nden kyerp.net için ayrı bir İşNet hesabı ekleyin.");
  const credential = new env.PasswordCredential({
    id: ISNET_BROWSER_PREFIX + name,
    password,
    name: "KY ERP - İşNet",
  });
  await env.navigator.credentials.store(credential);
  // Browser still controls its own save confirmation; no automatic PASS here.
  return { saveRequested: true };
}
export async function loadIsnetBrowserCredentials(username, env = globalThis) {
  if (!isBrowserVaultSupported(env)) throw new Error("Tarayıcı parola yöneticisi bu cihazda desteklenmiyor.");
  const credential = await env.navigator.credentials.get({ password: true, mediation: "required" });
  if (!credential) return null;
  if (!isIsnetBrowserCredential(credential.id)) {
    throw new Error("Seçilen hesap İşNet kaydı değil. İşNet hesabını seçin.");
  }
  const resultUsername = credential.id.slice(ISNET_BROWSER_PREFIX.length);
  const expected = String(username || "").trim();
  if (!resultUsername || (expected && expected !== resultUsername) || !credential.password) {
    throw new Error("Kayıtlı İşNet hesabı mevcut kullanıcı adıyla eşleşmedi.");
  }
  return { username: resultUsername, password: credential.password };
}
