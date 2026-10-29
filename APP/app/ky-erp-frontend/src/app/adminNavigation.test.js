import assert from "node:assert/strict";
import { test } from "node:test";
import { ADMIN_SECTIONS, ADMIN_PRIMARY_ROUTES, findAdminPanel, getAdminHiddenTabs, getAdminPrimaryTabs } from "./adminNavigation.js";

test("13 Yönetim işlemi tek rota sözlüğünden açılır; geriye uyumlu rotalar kalır",()=>{
 const routes=ADMIN_SECTIONS.flatMap(section=>section.panels.map(panel=>panel.route));
 assert.equal(routes.length,13);
 assert.equal(new Set(routes).size,routes.length);
 assert.deepEqual(getAdminPrimaryTabs().map(([key])=>key),ADMIN_PRIMARY_ROUTES);
 const registered=[...getAdminPrimaryTabs(),...getAdminHiddenTabs()].map(([key])=>key);
 assert.equal(new Set(registered).size,registered.length);
 for(const route of routes)assert.ok(registered.includes(route),route);
 assert.equal(findAdminPanel("firma-yetkilileri").panel.label,"Firma Yetkilileri");
 assert.equal(findAdminPanel("giris-onaylari").panel.route,"admin-guvenlik");
 assert.equal(findAdminPanel("uygulama-ayarlari").panel.route,"admin-sistem");
});
