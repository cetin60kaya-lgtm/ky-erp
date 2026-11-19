import test from "node:test";
import assert from "node:assert/strict";
import { accountMatchesFilter, mailAccountReadiness, mailProviderReady } from "./mailAccountRules.js";

const configured = { adapterReady: true, configured: true };
const unavailable = { adapterReady: false, configured: false, reason: "Bağlantı ayarı eksik." };
const complete = {
  status: "ACTIVE", approval_status: "APPROVED", provider_connected: 1,
  readiness: { companyApproved: true, oauthConnected: true,
    syncHealthy: true, enabledFolders: 15, completedFolders: 15 },
};

test("Tam hazır Outlook hesabı: firma onayı, OAuth, bütün klasörler ve provider", () => {
  const state = mailAccountReadiness(complete, configured);
  assert.equal(state.ready, true);
  assert.deepEqual([state.enabled, state.completed], [15, 15]);
});
test("Eski bağlı Gmail kaydı adapter yokken hazır gösterilmez; hiçbir kayıt silinmez", () => {
  assert.equal(mailProviderReady(unavailable), false);
  assert.equal(mailAccountReadiness(complete, unavailable).ready, false);
});
test("15 klasörün 0 tanesi tamamlanmışsa senkron hazır sayılmaz", () => {
  const state = mailAccountReadiness({
    ...complete, readiness: { ...complete.readiness,
      syncHealthy: false, completedFolders: 0 },
  }, configured);
  assert.equal(state.ready, false);
  assert.equal(state.enabled, 15);
  assert.equal(state.completed, 0);
});
test("Onaysız veya OAuth olmayan hesap kullanıma hazır sayılmaz", () => {
  assert.equal(mailAccountReadiness({ ...complete, approval_status: "PENDING",
    readiness: { ...complete.readiness, companyApproved: false } }, configured).ready, false);
  assert.equal(mailAccountReadiness({ ...complete, provider_connected: 0,
    readiness: { ...complete.readiness, oauthConnected: false } }, configured).ready, false);
});
test("Aktif firma posta kutuları Türkçe bölüm adı, sağlayıcı veya adrese göre aranır", () => {
  const account = { display_name: "Örnek Muhasebe", email_address: "hesap@ornek.com",
    department_code: "MUHASEBE", provider_type: "MICROSOFT_365" };
  assert.equal(accountMatchesFilter(account, "muhasebe"), true);
  assert.equal(accountMatchesFilter(account, "HESAP@ORNEK.COM"), true);
  assert.equal(accountMatchesFilter(account, "outlook"), false);
  assert.equal(accountMatchesFilter(account, "DESEN"), false);
});
