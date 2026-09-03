import fs from "node:fs";

function patch(path, replacements) {
  let source = fs.readFileSync(path, "utf8");
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error(`${path}: beklenen blok bulunamadı: ${before.slice(0, 90)}`);
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}

patch("APP/cloud/ky-erp-api/src/main.ts", [
  [
    'import { registerAccountingCompanyProfileRoutes } from "./accounting-company-profile";',
    'import { registerAccountingCompanyProfileRoutes } from "./accounting-company-profile";\nimport { registerAccountingDocumentArchiveRoutes } from "./accounting-document-archive";\nimport { registerFileHubPreviewRoutes } from "./file-hub-preview";\nimport { registerEBelgeCenterRoutes } from "./e-belge-center-cloud";\nimport { registerEBelgeLineToolRoutes } from "./e-belge-line-tools";\nimport { enforceAccountingTenant } from "./accounting-tenant-guard";',
  ],
  [
    'registerAccountingCompanyProfileRoutes(app);',
    'registerAccountingCompanyProfileRoutes(app);\nregisterAccountingDocumentArchiveRoutes(app);\nregisterFileHubPreviewRoutes(app);\nregisterEBelgeCenterRoutes(app);\nregisterEBelgeLineToolRoutes(app);',
  ],
  [
    'shell.use("/api/isnet/*", enforceIsnetTenant);',
    'shell.use("/api/isnet/*", enforceIsnetTenant);\n\n// e-Belge Merkezi, Muhasebe yetkisi ve oturumun tenant bağlamı dışında erişilemez.\nshell.use("/api/e-belge/*", enforceAccountingTenant);',
  ],
]);

patch("APP/app/ky-erp-frontend/src/pages/modules/muhasebe/EBelgeCenterPage.jsx", [
  [
    'import "./eBelgeCenter.css";',
    'import EBelgeLineReview from "./EBelgeLineReview";\nimport "./eBelgeCenter.css";',
  ],
  [
    '<small>{line.product_code || line.supplier_product_code || ""}</small></span><span>{Number(line.quantity || 0).toLocaleString("tr-TR")} {line.unit_code || ""}</span>',
    '<small>{line.product_code || line.supplier_product_code || ""}</small><EBelgeLineReview documentId={id} line={line} onChanged={load} /></span><span>{Number(line.quantity || 0).toLocaleString("tr-TR")} {line.unit_code || ""}</span>',
  ],
]);

console.log("e-Belge production wiring tamamlandı.");
