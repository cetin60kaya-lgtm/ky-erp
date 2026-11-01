import assert from "node:assert/strict";
import { test } from "node:test";
import { KY_NAV_GROUPS, KY_PRIMARY_MENU_KEYS, KY_SETTINGS_MENU_KEYS, navigationGroupFor, visibleMenuModules, visibleNavigationGroups } from "./navigationGroups.js";

test("sol menü kararlaştırılan sırayı korur ve yalnız yönetim açılır", () => {
  assert.deepEqual(KY_PRIMARY_MENU_KEYS, [
    "ana-sayfa", "muhasebe", "e-belge", "gunluk-operasyon", "ik", "pdks",
    "desen", "uretim", "boyahane", "compliance", "iletisim",
  ]);
  assert.deepEqual(KY_SETTINGS_MENU_KEYS, ["admin", "depolama", "sistem-merkezi", "asistan"]);
  const keys = [...KY_PRIMARY_MENU_KEYS, ...KY_SETTINGS_MENU_KEYS];
  assert.equal(keys.length, 15);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(KY_NAV_GROUPS.flatMap((group) => group.keys), keys.slice(1));
  assert.equal(navigationGroupFor("muhasebe"), "finance");
  assert.equal(navigationGroupFor("pdks"), "daily");
  assert.equal(navigationGroupFor("compliance"), "company");
  assert.equal(navigationGroupFor("depolama"), "management");
  assert.equal(navigationGroupFor("ana-sayfa"), "");
});

test("sol menü ve mantıksal gruplar yalnız izinli modülleri gösterir", () => {
  const modules = [
    { key: "ana-sayfa" }, { key: "muhasebe", label: "Muhasebe" },
    { key: "pdks", label: "PDKS" }, { key: "compliance", label: "Denetim" },
  ];
  assert.deepEqual(visibleMenuModules(modules, KY_PRIMARY_MENU_KEYS).map((item) => item.key),
    ["ana-sayfa", "muhasebe", "pdks", "compliance"]);
  assert.deepEqual(visibleMenuModules(modules, KY_SETTINGS_MENU_KEYS), []);
  const groups = visibleNavigationGroups(modules);
  assert.deepEqual(groups.map((group) => group.key), ["finance", "daily", "company"]);
  assert.deepEqual(groups.flatMap((group) => group.modules.map((module) => module.key)),
    ["muhasebe", "pdks", "compliance"]);
  assert.deepEqual(visibleNavigationGroups([]), []);
});
