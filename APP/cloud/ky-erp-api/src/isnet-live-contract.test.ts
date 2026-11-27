import test from "node:test";
import assert from "node:assert/strict";
import {LIVE_ENDPOINTS,LIVE_NOT_BEFORE,normalizeLiveProbe,PROBE_TTL} from "./isnet-live-contract.ts";
const now=LIVE_NOT_BEFORE+60000;
const good={checkedAt:now,services:Object.keys(LIVE_ENDPOINTS).map(service=>({service,status:"WSDL_DISCOVERED",httpStatus:200,sha256:"a".repeat(64),operationCount:10}))};
test("live contract metadata is bounded, fresh, environment-specific and never grants provider send",()=>{
 assert.ok(normalizeLiveProbe(good,now));
 assert.equal(normalizeLiveProbe(good,LIVE_NOT_BEFORE-1),null);
 assert.equal(normalizeLiveProbe(good,now+PROBE_TTL+1),null);
 assert.equal(normalizeLiveProbe({...good,services:[good.services[0],good.services[0]]},now),null);
 assert.equal(normalizeLiveProbe({...good,services:[{...good.services[0],sha256:"bad"},good.services[1]]},now),null);
 assert.equal(normalizeLiveProbe({...good,checkedAt:now+1},now),null);
 assert.equal(normalizeLiveProbe({...good,services:[{...good.services[0],httpStatus:403},good.services[1]]},now),null);
 assert.doesNotMatch(JSON.stringify(LIVE_ENDPOINTS),/servicetest/);
 assert.equal(Object.keys(normalizeLiveProbe({...good,providerAuthorized:true,sendEnabled:true},now)!).length,2);
});
