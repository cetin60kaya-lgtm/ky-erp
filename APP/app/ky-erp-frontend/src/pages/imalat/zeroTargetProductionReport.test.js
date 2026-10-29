import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductionCanonicalReport } from './productionCanonicalReport.js';

test('new models without target or production do not count as missing operation or active batch',()=>{
 const rows=[{id:'m1',modelName:'TEST',incomingQty:0,printRegions:[{regionName:'Ön'}],productionEntries:[]}];
 const report=buildProductionCanonicalReport({rows},{});
 assert.equal(report.audit.rows.length,1);
 assert.equal(report.audit.rows[0].durum,'Bekliyor');
 assert.equal(report.audit.summary.acikParti,0);
 assert.equal(report.report.summary.eksikOperasyon,0);
});
