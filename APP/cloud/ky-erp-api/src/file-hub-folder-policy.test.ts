import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFileHubBindingPath, normalizeFileHubRouteCode, normalizeFileHubPriority, fileHubBindingKey } from "./file-hub-folder-policy.ts";

test("firma klasörü içinde göreli yollar Windows/Drive biçimlerinden eşitlenir", () => {
  assert.equal(normalizeFileHubBindingPath(" Modeller\\MAMBI\\Yerleşim/ "), "Modeller/MAMBI/Yerleşim");
  assert.equal(normalizeFileHubBindingPath(""), "");
});
test("mutlak yol ve üst klasör kaçışı reddedilir", () => {
  for (const path of ["C:\\Firma", "/secret", "../private", "model/../private", "model/./private", "model:C", "?q=x", "a/#"]) {
    assert.throws(() => normalizeFileHubBindingPath(path));
  }
});
test("modül amaç kodu ve öncelik doğrulanır", () => {
  assert.equal(normalizeFileHubRouteCode("Desen"), "DESEN");
  assert.equal(normalizeFileHubPriority(10), 10);
  assert.throws(() => normalizeFileHubRouteCode("DESEN;DROP"));
  assert.throws(() => normalizeFileHubPriority(-1));
  assert.throws(() => normalizeFileHubPriority(1.2));
});
test("ayrı firmalar eşsiz bağlama kimliği taşır", () => {
  const route = {module_code:"DESEN",purpose_code:"PLACEMENT",storage_connection_id:"drive",root_path:"Modeller\\PDF"};
  assert.notEqual(fileHubBindingKey({main_company_slug:"firma-a",...route}),fileHubBindingKey({main_company_slug:"firma-b",...route}));
});
