import assert from "node:assert/strict";
import test from "node:test";
import {
  clearResilientDataCache,
  loadModuleData,
} from "./resilientDataLoader.js";

const MODULES = ["ik", "muhasebe", "isnet", "desen", "boyahane", "imalat"];

for (const moduleName of MODULES) {
  test(`${moduleName}: yardımcı 500 ana veriyi boşaltmaz`, async () => {
    clearResilientDataCache();
    const auxiliaryError = Object.assign(new Error("Yardımcı servis geçici hata"), { status: 500 });
    const result = await loadModuleData({
      scope: `${moduleName}:mecit-hakan`,
      sources: {
        main: { critical: true, load: async () => [{ id: `${moduleName}-1` }] },
        auxiliary: { load: async () => { throw auxiliaryError; }, fallback: [] },
      },
    });

    assert.deepEqual(result.data.main, [{ id: `${moduleName}-1` }]);
    assert.deepEqual(result.data.auxiliary, []);
    assert.equal(result.hasCriticalError, false);
    assert.equal(result.hasDegradedData, true);
    assert.equal(result.states.auxiliary.status, "error");
  });
}

test("son başarılı oturum verisi geçici GET hatasında korunur", async () => {
  clearResilientDataCache();
  const scope = "ik:mecit-hakan";
  await loadModuleData({
    scope,
    sources: { pool: { critical: true, load: async () => [{ id: "person-1" }] } },
  });
  const result = await loadModuleData({
    scope,
    sources: {
      pool: {
        critical: true,
        load: async () => { throw Object.assign(new Error("Geçici hata"), { status: 503 }); },
      },
    },
  });

  assert.deepEqual(result.data.pool, [{ id: "person-1" }]);
  assert.equal(result.states.pool.status, "stale");
  assert.equal(result.hasCriticalError, false);
});

test("ilk kritik hata gerçek hata olarak kalır", async () => {
  clearResilientDataCache();
  const result = await loadModuleData({
    scope: "muhasebe:mecit-hakan",
    sources: {
      firms: {
        critical: true,
        load: async () => { throw Object.assign(new Error("Firmalar okunamadı"), { status: 500 }); },
        fallback: [],
      },
    },
  });
  assert.deepEqual(result.data.firms, []);
  assert.equal(result.hasCriticalError, true);
  assert.equal(result.states.firms.status, "error");
});

for (const status of [401, 403]) {
  test(`${status} yetki hatası gizlenmez`, async () => {
    clearResilientDataCache();
    await assert.rejects(
      loadModuleData({
        scope: "ik:mecit-hakan",
        sources: {
          pool: {
            critical: true,
            load: async () => { throw Object.assign(new Error("Yetki hatası"), { status }); },
          },
        },
      }),
      (error) => error.status === status,
    );
  });
}
