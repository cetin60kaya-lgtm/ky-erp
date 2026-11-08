import assert from "node:assert/strict";
import test from "node:test";
import { productionImagePath } from "./productionModelImage.js";

test("gerçek File Hub UUID görselini yetkili önizleme endpointine eşler", () => {
  assert.equal(productionImagePath("6795957f-d624-473a-b852-ef5108eba00e"),
    "/api/file-hub/files/6795957f-d624-473a-b852-ef5108eba00e/preview");
});
test("açık görüntü URL ve Desen API görüntü yolları korunur", () => {
  assert.equal(productionImagePath("https://example.org/img/abc.png"), "https://example.org/img/abc.png");
  assert.equal(productionImagePath("/api/desen/models/preview.png"), "/api/desen/models/preview.png");
  assert.equal(productionImagePath("gorsel/MODEL.png"), "gorsel/MODEL.png");
});
test("opaque preview, hatalı id ve tehlikeli URL boş bırakılır", () => {
  for (const value of ["", "preview", "thumbnail", "6795957f-d624", "javascript:alert(1)", "//evil.example/a.jpg", "unknown-model"]) {
    assert.equal(productionImagePath(value), "", value);
  }
});
