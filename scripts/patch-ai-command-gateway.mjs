import fs from 'node:fs';

const path = new URL('../APP/cloud/ky-erp-api/src/ai-cloud.ts', import.meta.url);
let source = fs.readFileSync(path, 'utf8');
const importLine = 'import { canWriteAccounting, cancelAccountingAction, confirmAccountingAction, proposeAccountingAction } from "./accounting-ai-write";';
const gatewayImport = 'import { registerErpCommandGatewayRoutes } from "./erp-command-gateway";';
if (!source.includes(gatewayImport)) source = source.replace(importLine, `${importLine}\n${gatewayImport}`);
if (!source.includes('registerErpCommandGatewayRoutes(app);')) source = source.replace('  registerCompanyBillingRoutes(app);', '  registerCompanyBillingRoutes(app);\n  registerErpCommandGatewayRoutes(app);');
fs.writeFileSync(path, source, 'utf8');
