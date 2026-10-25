import assert from "node:assert/strict";
import { test } from "node:test";
import { KY_NAV_GROUPS, navigationGroupFor, visibleNavigationGroups } from "./navigationGroups.js";

test("ana sayfa ve menü grupları tüm canonical operasyon modüllerini tekrarsız kapsar", () => {
  const keys = KY_NAV_GROUPS.flatMap((group) => group.keys);
  assert.equal(keys.length, 14);
  assert.equal(new Set(keys).size, 14);
  assert.equal(navigationGroupFor("muhasebe"), "finance");
  assert.equal(navigationGroupFor("pdks"), "daily");
  assert.equal(navigationGroupFor("ana-sayfa"), "");
});

test("görünür gruplar sadece erişilebilen modülleri içerir", () => {
  const groups = visibleNavigationGroups([
    { key: "ana-sayfa" },
    { key: "muhasebe", label: "Muhasebe" },
    { key: "pdks", label: "PDKS" },
  ]);
  assert.deepEqual(groups.map((group) => group.key), ["daily", "finance"]);
  assert.deepEqual(groups.flatMap((group) => group.modules.map((module) => module.key)), ["pdks", "muhasebe"]);
  assert.deepEqual(visibleNavigationGroups([]), []);
});
