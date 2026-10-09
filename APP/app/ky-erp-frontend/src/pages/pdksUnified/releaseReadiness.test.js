import test from "node:test";
import assert from "node:assert/strict";
import {ALL_PRODUCT_TABS} from "./productModel.js";
import {integrationCoverage,inspectReleaseReadiness,TAB_BINDINGS} from "./tabBindings.js";

test("release gate includes every visible route, even unconnected placeholders",()=>{
 const report=inspectReleaseReadiness();
 assert.equal(report.total,49);
 assert.equal(report.tabs.length,ALL_PRODUCT_TABS.length);
 assert.equal(new Set(report.tabs.map(tab=>tab.id)).size,49);
 assert.equal(report.ready,false);
 assert.equal(report.readyCount,0);
 assert.equal(report.blockedCount,49);
 assert.ok(report.tabs.some(tab=>tab.blockers.includes("SOURCE_NOT_IMPLEMENTED")));
});
test("verified API reader never implies physical terminal and FDB/TNF approval",()=>{
 const verifiedSources=[...new Set(TAB_BINDINGS.map(tab=>tab.source))];
 const report=inspectReleaseReadiness({verifiedSources});
 const punches=report.tabs.find(tab=>tab.id==="punches");
 assert.equal(punches.ready,false);
 assert.ok(punches.blockers.includes("TERMINAL_NOT_CERTIFIED"));
 assert.ok(punches.blockers.includes("FDB_TNF_NOT_RECONCILED"));
 const payroll=report.tabs.find(tab=>tab.id==="salary");
 assert.ok(payroll.blockers.includes("PAYROLL_NOT_APPROVED"));
});
test("certifying connected sources still blocks every placeholder route",()=>{
 const verifiedSources=[...new Set(TAB_BINDINGS.map(tab=>tab.source))];
 const report=inspectReleaseReadiness({
  verifiedSources,certifiedTerminal:true,firebirdTnfReconciled:true,approvedPayroll:true,
 });
 assert.equal(report.ready,false);
 assert.ok(report.blockedCount>0);
 assert.equal(report.tabs.filter(tab=>tab.blockers.includes("SOURCE_NOT_IMPLEMENTED")).length,
  integrationCoverage().unconnected);
});
