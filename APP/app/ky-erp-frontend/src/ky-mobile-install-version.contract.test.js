import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../public/", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const owner = JSON.parse(read("guvenlik/manifest.webmanifest"));
const company = JSON.parse(read("ky-firma/manifest.webmanifest"));
const shell = read("ky-app-shell/app.js");
const app = read("guvenlik/app.js");
const host = readFileSync(new URL("../../../cloud/ky-erp-security-host/worker.js", import.meta.url), "utf8");
const assets = readFileSync(new URL("../../../cloud/ky-erp-security-host/prepare-assets.mjs", import.meta.url), "utf8");

test("Tek KY Guvenlik PWA kimligi sabit, KY Firma ayri kurulur", () => {
  assert.deepEqual([owner.id, company.id], ["/guvenlik/", "/ky-firma/"]);
  for (const [manifest, path] of [[owner, "/guvenlik/"], [company, "/ky-firma/"]]) {
    assert.equal(manifest.start_url, path);
    assert.equal(manifest.scope, path);
    assert.equal(manifest.display, "standalone");
  }
  assert.equal(existsSync(new URL("ky-sistem/", root)), false);
  assert.equal(existsSync(new URL("owner-security/", root)), false);
  assert.doesNotMatch(assets, /"ky-sistem"/);
  assert.match(host, /const ADDITIONAL_APPS=\["\/ky-firma"\]/);
});

test("Guncel tek owner telefon uygulamasi v4.2.0 ve kapsamli guvenlik ozeti sunar", () => {
  const html = read("guvenlik/index.html");
  const control = read("guvenlik/security-control-center.js");
  assert.match(html, /id="appVersionBadge">v4\.2\.0/);
  assert.match(html, /id="accountVersion">v4\.2\.0/);
  assert.match(app, /APP_DISPLAY_VERSION="v4\.2\.0"/);
  for(const id of ["ownerSummarySessions","ownerSummaryDevices","ownerSummaryLogins","ownerSummaryEvents"]) {
    assert.ok(html.includes('id="' + id + '"'));
    assert.ok(control.includes(id));
  }
  assert.doesNotMatch(html, /href="\/ky-sistem\//);
  assert.match(shell, /APP_VERSION="v4\.1\.0"/); // KY Firma ayrı ürün sürümüdür; KY ERP PRO 4.2 ile karıştırılmaz.
});

test("Surum degisikligi mevcut telefon cihaz kaydini ve kilidini korur", () => {
  assert.match(app, /DB_NAME="kyerp-security-fresh-v3"/);
  assert.match(app, /CLIENT_VERSION="security-v4\.0"/);
  assert.match(app, /PENDING_ENROLL_KEY="kyerp-security-fresh-enrollment-v3"/);
  assert.match(shell, /DB="kyerp-security-fresh-v3"/);
  assert.match(shell, /"X-KYERP-Security-App-Version":"security-v4\.0"/);
  assert.match(host, /ky-sistem\/sw\.js/); // Eski paket acik kaldiysa SW emekli edilir.
});
