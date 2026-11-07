import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyDesignSourcePath,
  findUniqueMissingDesignImageModel,
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


test("sonradan gelen JPEG yalnız tekil ve eksik canonical modele bağlanır", () => {
  const rows = [
    { id: "m-1", model_name: "NYCTEAM", model_code: "NYCTEAM", image_url: "" },
    { id: "m-2", model_name: "ARİNA", model_code: "ARİNA", image_url: null },
    { id: "m-3", model_name: "MALICE", model_code: "MALICE", image_url: "/api/old-preview" },
    { id: "m-4", model_name: "MINECRAFT-5", model_code: "MINECRAFT-5", image_url: "" },
  ];
  assert.equal(findUniqueMissingDesignImageModel(rows, "NYCTEAM.jpg"), "m-1");
  assert.equal(findUniqueMissingDesignImageModel(rows, "ARINA.jpg"), "m-2");
  assert.equal(findUniqueMissingDesignImageModel(rows, "MALICE.jpg"), null);
  assert.equal(findUniqueMissingDesignImageModel(rows, "MINECRAFT.jpg"), null);
  assert.equal(findUniqueMissingDesignImageModel(rows, "NYCTEAM.pdf"), null);
  assert.equal(findUniqueMissingDesignImageModel(rows, "NYCTEAM DTF.jpg"), null);
});

test("aynı ada sahip iki firma modeli ve silinmiş kayıt yanlış bağlanmaz", () => {
  const shared = [
    { id: "a", model_name: "EBAREL", image_url: "" },
    { id: "b", model_name: "EBAREL", image_url: "" },
  ];
  assert.equal(findUniqueMissingDesignImageModel(shared, "EBAREL.jpg"), null);
  assert.equal(findUniqueMissingDesignImageModel(
    [...shared, { id: "deleted", model_name: "ANIL", image_url: "", deleted_at: "2026-09-01" }],
    "ANIL.jpg",
  ), null);
});
