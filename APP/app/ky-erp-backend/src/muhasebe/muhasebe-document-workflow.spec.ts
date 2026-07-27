import assert from "node:assert/strict";
import test from "node:test";
import { MuhasebeDocumentWorkflowService } from "./muhasebe-document-workflow.service";

function serviceWithModels() {
  const service = new MuhasebeDocumentWorkflowService(
    {} as any,
    {} as any,
    {} as any,
  );
  (service as any).modelStore = {
    getById: (_slug: string, _companyId: string, modelId: string) =>
      modelId
        ? { id: modelId, modelAdi: `MODEL ${modelId.toUpperCase()}` }
        : null,
  };
  return service as any;
}

const company = { id: "main-1", slug: "hakan-baski", name: "Hakan Baskı" };

test("tek model bağlantısını belgenin bütün satırlarına uygular", () => {
  const service = serviceWithModels();
  const result = service.approvedPoolModelLinks(
    company,
    {
      kalemler: [
        { id: "line-1", quantity: 10 },
        { id: "line-2", quantity: 20 },
      ],
    },
    { modelLinks: [{ modelId: "magic" }] },
  );

  assert.equal(result.primary.modelId, "magic");
  assert.deepEqual(
    result.lines.map((line: any) => line.modelId),
    ["magic", "magic"],
  );
  assert.ok(result.lines.every((line: any) => line.matchStatus === "APPROVED"));
});

test("çok modelli belgede eşleşmemiş satır bırakmaz", () => {
  const service = serviceWithModels();
  assert.throws(
    () =>
      service.approvedPoolModelLinks(
        company,
        {
          kalemler: [
            { id: "line-1", quantity: 10 },
            { id: "line-2", quantity: 20 },
          ],
        },
        {
          modelLinks: [
            { lineId: "line-1", modelId: "magic" },
            { lineId: "missing-line", modelId: "nova" },
          ],
        },
      ),
    /2\. belge kalemi için model bağlantısı eksik/,
  );
});
