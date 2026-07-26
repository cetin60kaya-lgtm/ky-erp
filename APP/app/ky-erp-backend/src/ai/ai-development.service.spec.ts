import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { AiDevelopmentService } from "./ai-development.service";

const admin = { id: "test-admin", role: "ADMIN" };

function withDevelopmentMode(run: (service: AiDevelopmentService) => void) {
  const previousMode = process.env.AI_DEVELOPER_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.AI_DEVELOPER_MODE = "true";
  process.env.NODE_ENV = "test";
  try { run(new AiDevelopmentService()); }
  finally {
    if (previousMode === undefined) delete process.env.AI_DEVELOPER_MODE;
    else process.env.AI_DEVELOPER_MODE = previousMode;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

test("geliştirme araçları yalnız ADMIN kullanıcısına açılır", () => {
  withDevelopmentMode((service) => {
    assert.doesNotThrow(() => service.assertAllowed(admin));
    assert.throws(() => service.assertAllowed({ id: "user", role: "USER" }), ForbiddenException);
  });
});

test("production ortamında geliştirme modu kesin olarak kapanır", () => {
  const previousMode = process.env.AI_DEVELOPER_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.AI_DEVELOPER_MODE = "true";
  process.env.NODE_ENV = "production";
  try { assert.throws(() => new AiDevelopmentService().assertAllowed(admin), ForbiddenException); }
  finally {
    if (previousMode === undefined) delete process.env.AI_DEVELOPER_MODE;
    else process.env.AI_DEVELOPER_MODE = previousMode;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("gizli ve proje dışı dosya yolları reddedilir", () => {
  withDevelopmentMode((service) => {
    assert.throws(() => service.prepareEdits({ summary: "x", edits: [{ operation: "replace", path: "backend/.env", find: "x", replacement: "y" }] }, admin), ForbiddenException);
    assert.throws(() => service.prepareEdits({ summary: "x", edits: [{ operation: "replace", path: "backend/../.env", find: "x", replacement: "y" }] }, admin));
  });
});

test("izinli frontend kod düzenlemesi onay için hazırlanır", () => {
  withDevelopmentMode((service) => {
    const result = service.prepareEdits({ summary: "Sekme başlığı güncellenecek", edits: [{ operation: "replace", path: "frontend/src/App.jsx", find: "eski", replacement: "yeni" }] }, admin);
    assert.equal(result.paths[0], "frontend/src/App.jsx");
    assert.equal(result.edits.length, 1);
  });
});
