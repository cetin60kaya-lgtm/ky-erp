import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productionQuantityIssue, reserveLotKg, designJobState, isRemovedDesignColor } from "./production-flow-safety.ts";

test("İmalat bulk: accepted quantities accumulate per region; explicit override remains", () => {
  assert.equal(productionQuantityIssue(60,[0,0,0],100,0,0,false),"");
  assert.match(productionQuantityIssue(60,[0,0,0],100,0,60,false), /irsaliye/);
  assert.equal(productionQuantityIssue(60,[0,0,0],100,0,60,true),"");
  assert.match(productionQuantityIssue(20,[-1,0,0],100,0,0,false), /negatif/);
  assert.match(productionQuantityIssue(20,[10,10,1],100,0,0,false), /aşamaz/);
});
test("Boyahane same LOT: rows consume cumulative balance", () => {
  const left = reserveLotKg(1, .6)!;
  assert.ok(Math.abs(left-.4)<1e-9);
  assert.equal(reserveLotKg(left,.6),null);
  assert.ok(Math.abs(reserveLotKg(left,.3)!-.1)<1e-9);
  assert.equal(reserveLotKg(1,0),null);
});
test("Desen sync: preserve active, paused and completed workflow unless a new color reopens completion", () => {
  assert.equal(designJobState(null,false).status,"WAITING");
  for (const status of ["ACTIVE","PAUSED","COMPLETED","CANCELLED"]) {
    assert.deepEqual(designJobState({status,priority:"URGENT"},false),{status,priority:"URGENT"});
  }
  assert.equal(designJobState({status:"COMPLETED"},true).completedAt,null);
  assert.equal(designJobState({status:"COMPLETED"},true).status,"WAITING");
  assert.equal(designJobState({status:"ACTIVE"},true).status,"ACTIVE");
});
test("Desen sync: manual colors and completed historical colors are never auto-cancelled", () => {
  assert.equal(isRemovedDesignColor("manual:1",new Set(),"WAITING"),false);
  assert.equal(isRemovedDesignColor("design:1",new Set(),"WAITING"),true);
  assert.equal(isRemovedDesignColor("design:1",new Set(["1"]),"WAITING"),false);
  assert.equal(isRemovedDesignColor("design:1",new Set(),"COMPLETED"),false);
});
test("three actual routes use the safety helpers", () => {
  const read = (name:string) => readFileSync(new URL(name,import.meta.url),"utf8");
  const production = read("./production-center.ts");
  const design = read("./desen-workflow.ts");
  const dye = read("./boyahane-workflow.ts");
  assert.match(production,/productionQuantityIssue\(grossQty/);
  assert.match(production,/committedByRegion\.set\(regionKey, alreadyCommitted \+ grossQty\)/);
  assert.match(design,/designJobState\(currentJob, hasNewPendingColor\)/);
  assert.match(design,/isRemovedDesignColor\(old\.sourceChannelKey/);
  assert.match(design,/await commitStoreBatch\(db,guards,writes\)/);
  assert.match(dye,/JOB_COLOR_MISMATCH/);
  assert.match(dye,/remainingByLot\.set\(line\.lotId,nextRemaining\)/);
  assert.match(dye,/await commitStoreBatch\(db,guards,writes\)/);
  assert.match(read("./main.ts"),/registerBoyahaneLotMovementV2Routes\(app\)/);
  assert.match(read("./main.ts"),/shell\.use\("\/api\/boyahane\/\*", enforceBoyahaneTenant\)/);
});
