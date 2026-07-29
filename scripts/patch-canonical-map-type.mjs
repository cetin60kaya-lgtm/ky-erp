import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function patchFile(relativePath, replacements) {
  const filePath = path.join(repositoryRoot, relativePath);
  let source = fs.readFileSync(filePath, "utf8");
  let changed = false;

  for (const { before, after } of replacements) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      throw new Error(`Tip düzeltme noktası bulunamadı: ${relativePath}`);
    }
    source = source.replace(before, after);
    changed = true;
  }

  if (changed) fs.writeFileSync(filePath, source, "utf8");
  console.log(`${relativePath}: ${changed ? "düzeltildi" : "zaten güncel"}`);
}

patchFile(
  "APP/app/ky-erp-backend/src/modules/models/canonical-model-flow.service.ts",
  [
    {
      before: `    const modelMap = new Map(\n      modelRows.map((row: any) => [String(row.id), row]),\n    );`,
      after: `    const modelMap = new Map<string, any>(\n      modelRows.map((row: any) => [String(row.id), row]),\n    );`,
    },
  ],
);

patchFile(
  "APP/app/ky-erp-backend/src/modules/models/canonical-workflow-orchestrator.service.ts",
  [
    {
      before: `    const designByModel = new Map(\n      designLinks.map((link: any) => [clean(link.modelId), clean(link.designRecordId)]),\n    );`,
      after: `    const designByModel = new Map<string, string>(\n      designLinks.map((link: any) => [clean(link.modelId), clean(link.designRecordId)]),\n    );`,
    },
    {
      before: `    const designById = new Map(designs.map((row: any) => [clean(row.id), row]));`,
      after: `    const designById = new Map<string, any>(\n      designs.map((row: any) => [clean(row.id), row]),\n    );`,
    },
  ],
);
