import test from "node:test";
import assert from "node:assert/strict";
import { MODULES, getModuleGroups, getModuleTabs, getVisibleModuleTabs } from "./moduleRegistry.js";
import { buildShellMenuSections, isShellMenuSectionOpen, toggleShellMenuSection } from "./shellMenuModel.js";

test("15 modülün 89 görünür sekmesi tek menü kaynağından eksiksiz ve tekrarsız çıkar", () => {
  assert.equal(MODULES.length, 15);
  let total = 0;
  for (const module of MODULES) {
    const sections = buildShellMenuSections(module, getModuleGroups(module));
    const menuKeys = sections.flatMap((section) => section.tabs.map(([key]) => key));
    const visibleKeys = getVisibleModuleTabs(module).map(([key]) => key);
    assert.deepEqual(menuKeys, visibleKeys, `${module.key}: tüm görünür rotalar korunmalı`);
    assert.equal(new Set(menuKeys).size, menuKeys.length, `${module.key}: tekrar eden menü olamaz`);
    const registeredKeys = new Set(getModuleTabs(module).map(([key]) => key));
    for (const key of menuKeys) assert.ok(registeredKeys.has(key), `${module.key}: eski/uydurma rota olamaz: ${key}`);
    total += menuKeys.length;
  }
  assert.ok(total >= 89, `Görünür sekme kapsamı 89 altına inmemeli: ${total}`);
});

test("PDKS 5 grup / 18 görünür sekme menüden erişilir; gizli yönetim rotası görünmez", () => {
  const pdks = MODULES.find((module) => module.key === "pdks");
  const sections = buildShellMenuSections(pdks, getModuleGroups(pdks));
  assert.equal(sections.length, 5);
  const tabs = sections.flatMap((section) => section.tabs.map(([key]) => key));
  assert.equal(tabs.length, 18);
  assert.ok(tabs.includes("senkron"));
  assert.ok(tabs.includes("denetim-yillik-temp"));
  assert.ok(!tabs.includes("kullanicilar"));
});

test("Açılır menü seçili grupta başlar, kapatılır ve tekrar açılır", () => {
  const id = "pdks:1";
  assert.equal(isShellMenuSectionOpen("", id, true), true);
  const closed = toggleShellMenuSection("", id, true);
  assert.equal(isShellMenuSectionOpen(closed, id, true), false);
  const opened = toggleShellMenuSection(closed, id, true);
  assert.equal(isShellMenuSectionOpen(opened, id, true), true);
  assert.equal(isShellMenuSectionOpen("pdks:2", id, true), false);
});

test("Tek işlem gruplu modüller yeni sekme oluşturmaz", () => {
  const daily = MODULES.find((module) => module.key === "gunluk-operasyon");
  const sections = buildShellMenuSections(daily, getModuleGroups(daily));
  assert.equal(sections.length, 1);
  assert.equal(sections[0].tabs.length, 5);
});
