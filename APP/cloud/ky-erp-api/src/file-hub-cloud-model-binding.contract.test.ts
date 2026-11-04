import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyDesignSourcePath,
  matchExistingDesignModelNames,
  selectCloudModelBinding,
} from "./file-hub-cloud-model-binding.ts";

const root = { module_code: "DESEN", purpose_code: "MODEL_SOURCE", root_path: "modeller" };

test("DTF tek model klasörü ayrı ERP modeli üretmez", () => {
  assert.deepEqual(classifyDesignSourcePath(root, "modeller/EBONUR DTF/EBONUR_AW.pdf"), {
    purposeCode: "RIP_PDF",
    folderModelName: "EBONUR",
    isDtf: true,
  });
  assert.deepEqual(classifyDesignSourcePath(root, "modeller/ASPEL/ASPEL.pdf"), {
    purposeCode: "MODEL_SOURCE",
    folderModelName: "ASPEL",
    isDtf: false,
  });
  assert.deepEqual(matchExistingDesignModelNames(["EBONUR", "ASPEL"], "EBONUR"), ["EBONUR"]);
});

test("yerleşim dosyaları mevcut model adından bağlanır, varyant korunur", () => {
  const known = ["ASPEL", "ASPEL-A", "EBAREL-B", "OSKERO"];
  assert.deepEqual(matchExistingDesignModelNames(known, "ASPEL-A MODELİNİN ÖN BEDEN BASKI YERLEŞİM KALIPLARI.PDF"), ["ASPEL-A"]);
  assert.deepEqual(matchExistingDesignModelNames(known, "OSKERO-SWEAT ON BEDEN DESEN YERLESIMI.PDF"), ["OSKERO"]);
  assert.deepEqual(matchExistingDesignModelNames(known, "BİLİNMEYEN MODEL.pdf"), []);
});

test("tek giden PSD birden fazla bilinen modele bağlanabilir, aynı fiziksel dosya korunur", () => {
  const known = ["MITENA", "ELEREN", "BRAWLS-2", "PEONY", "BARNEY"];
  assert.deepEqual(
    matchExistingDesignModelNames(known, "MITENA REVİZE - ELEREN - BRAWLS-2.psd", { multi: true }),
    ["BRAWLS-2", "ELEREN", "MITENA"],
  );
  assert.deepEqual(
    matchExistingDesignModelNames(known, "PEONY - BARNEY.psd", { multi: true }),
    ["BARNEY", "PEONY"],
  );
});

test("kaynak yolu kesin bağlanmadan kaynak seçilemez", () => {
  const bindings = [root, { module_code: "DESEN", purpose_code: "MODEL_IMAGE", root_path: "görsel/2026" }];
  assert.equal(selectCloudModelBinding(bindings, "görsel/2026/ASPEL.jpg", "ASPEL.jpg")?.purpose_code, "MODEL_IMAGE");
  assert.equal(selectCloudModelBinding(bindings, "muhasebe/ASPEL.pdf", "ASPEL.pdf"), null);
  assert.equal(selectCloudModelBinding(bindings, "modeller/ASPEL/ASPEL.exe", "ASPEL.exe"), null);
});
