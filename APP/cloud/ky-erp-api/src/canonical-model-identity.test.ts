import test from "node:test";
import assert from "node:assert/strict";
import { canonicalModelKey, matchCanonicalModel } from "./canonical-model-identity.ts";

const rows = [
  { id: "a", model_name: "GAMER", company_id: "taha", status: "ACTIVE" },
  { id: "b", model_name: "GAMER", company_id: "other", status: "ACTIVE" },
  { id: "c", model_name: "SEKOZIP-2", company_id: "taha", status: "ACTIVE" },
];

test("Türkçe model adı tek eşleştirme anahtarı kullanır", () => {
  assert.equal(canonicalModelKey("  gamer  "), "GAMER");
  assert.equal(canonicalModelKey("SEKOZIP-2"), "SEKOZIP 2");
  assert.equal(canonicalModelKey(""), "");
});

test("aynı model adı farklı firmada farklı kartı korur", () => {
  assert.equal(matchCanonicalModel(rows, { modelName: "gamer", companyId: "taha" })?.id, "a");
  assert.equal(matchCanonicalModel(rows, { modelName: "GAMER", companyId: "other" })?.id, "b");
  assert.equal(matchCanonicalModel(rows, { modelName: "GAMER", companyId: "third" }), null);
});

test("firma belirsizse aynı adla yanlış karta otomatik bağlamaz", () => {
  assert.throws(() => matchCanonicalModel(rows, { modelName: "GAMER" }), /MODEL_DUPLICATE_REVIEW/);
  assert.equal(matchCanonicalModel(rows, { modelName: "SEKOZIP-2" })?.id, "c");
});

test("doğrudan model UUID'si firma veya ad ile çelişirse işlem reddedilir", () => {
  assert.throws(() => matchCanonicalModel(rows, { modelName: "GAMER", requestedId: "c" }), /MODEL_ID_CONFLICT/);
  assert.throws(() => matchCanonicalModel(rows, { modelName: "GAMER", requestedId: "a", companyId: "other" }), /MODEL_ID_CONFLICT/);
});

test("aynı firmada yinelenmiş eski kayıtlar otomatik birleştirilmez", () => {
  assert.throws(() => matchCanonicalModel([...rows, { id: "x", model_name: "GAMER", company_id: "taha" }], { modelName: "GAMER", companyId: "taha" }), /MODEL_DUPLICATE_REVIEW/);
});

test("arşiv modeli sessizce tekrar aktif sayılmaz", () => {
  assert.throws(() => matchCanonicalModel([{ id: "arch", model_name: "GAMER", company_id: "taha", status: "ARCHIVE" }], { modelName: "GAMER", companyId: "taha" }), /MODEL_ARCHIVED_REVIEW/);
});
