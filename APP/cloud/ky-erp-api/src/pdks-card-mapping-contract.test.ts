import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mapping = readFileSync(resolve(here, "ik-pdks-card-mapping.ts"), "utf8");
const bridge = readFileSync(resolve(here, "ik-pdks-card-bridge.ts"), "utf8");
const device = readFileSync(resolve(here, "ik-pdks-device.ts"), "utf8");
const guard = readFileSync(resolve(here, "ik-pdks-guard.ts"), "utf8");

const expected = [
  ["00001", "ADEM YAZER"], ["00002", "AHMET KURT"], ["00003", "AYŞE ÖKSÜZ"], ["00004", "ÇETİN KAYA"],
  ["00006", "ERSİN YAVAŞ"], ["00008", "FEHMİ ÖZKARA"], ["00011", "ÖZCAN YILDIZ"], ["00013", "CUMA ÖZKURT"],
  ["00039", "FADİME TÜRKYILMAZ"], ["00047", "MURAT AYDIN"], ["00048", "ALİ AKKAYA"], ["00049", "MURAT MİNANZ"],
  ["00050", "HALİL İBRAHİM ÇAĞLAR"], ["00056", "İRFAN KAMALI"], ["00057", "ZEYNEP ARSLAN"], ["00059", "HAYRİ ŞENGÜL"],
];

test("terminal card numbers stay separate from HKN personnel codes", () => {
  for (const [cardNo, fullName] of expected) {
    assert.match(mapping, new RegExp(`\\[\\"${cardNo}\\", \\"${fullName}\\"\\]`));
  }
  assert.match(mapping, /card_no=excluded\.card_no/);
  assert.doesNotMatch(mapping, /UPDATE\s+hr_monthly_employees\s+SET\s+code/i);
});

test("card mapping routes are registered behind the PDKS guard", () => {
  assert.match(guard, /import \{ registerIkPdksCardMappingRoutes \} from "\.\/ik-pdks-card-mapping"/);
  assert.match(guard, /registerIkPdksCardMappingRoutes\(app\)/);
  assert.match(bridge, /registerIkPdksCardMappingRoutes\(app\)/);
  assert.match(mapping, /card-mappings\/apply-initial/);
  assert.match(mapping, /ik_pdks_card_mapping_migrations/);
  assert.match(mapping, /INITIAL_VERSION/);
});

test("duplicate terminal card never steals another employee mapping", () => {
  assert.match(mapping, /PDKS_CARD_ALREADY_ASSIGNED/);
  assert.match(mapping, /if \(result\.conflict\)/);
  assert.doesNotMatch(mapping, /UPDATE ik_person_card_settings SET card_no=''[^;]*employee_id<>\?/s);
});

test("device import resolves terminal punches from canonical card_no", () => {
  assert.match(device, /normalizeCard\(row\.card_no\)/);
  assert.match(device, /const person = people\.get\(cardNo\)/);
  assert.match(device, /Aktif kartlı personel \+ tarih\/saat eşleşmedi/);
});
