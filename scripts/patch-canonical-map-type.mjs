import fs from "node:fs";

const path = "APP/app/ky-erp-backend/src/modules/models/canonical-model-flow.service.ts";
const source = fs.readFileSync(path, "utf8");
const before = `    const modelMap = new Map(\n      modelRows.map((row: any) => [String(row.id), row]),\n    );`;
const after = `    const modelMap = new Map<string, any>(\n      modelRows.map((row: any) => [String(row.id), row]),\n    );`;

if (!source.includes(before)) {
  throw new Error("Kanonik model haritası yama noktası bulunamadı.");
}

fs.writeFileSync(path, source.replace(before, after), "utf8");
console.log("Kanonik model haritası Map<string, any> olarak düzeltildi.");
