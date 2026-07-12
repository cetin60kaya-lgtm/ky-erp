import { runScript } from "./import-utils";

const moduleName = process.argv[2] || "unknown";

runScript(`import-${moduleName}`, async () => {
  return {
    imported: 0,
    skipped: 0,
    note: `${moduleName} import iskeleti hazır; canlı ekranlar DB endpointlerine yönlendirildi.`,
  };
});
