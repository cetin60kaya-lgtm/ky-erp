import test from "node:test";
import assert from "node:assert/strict";
import { probeIsnetSessionHealth } from "./isnet-session-health.ts";
const URL="https://provider.example/api/Company/GetRecipientList";
const mock=(status:number,data:any={Result:0})=>async(_url:any,init:any)=>{
  assert.equal(_url,URL);
  assert.equal(init.method,"POST");
  assert.deepEqual(JSON.parse(init.body),{CompanyId:123});
  assert.equal(Object.keys(JSON.parse(init.body)).length,1);
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
};
test("read-only endpoint 200 is genuinely connected, but response hides token and recipients",async()=>{
  const r=await probeIsnetSessionHealth(mock(200,{Result:0,Recipients:[{name:"secret fixture"}]}) as any,URL,"TEST_DUMMY_TOKEN","123");
  assert.equal(r.status,"CONNECTED");assert.equal(r.connected,true);assert.ok(r.lastVerifiedAt);
  assert.doesNotMatch(JSON.stringify(r),/DUMMY_TOKEN|secret fixture|Recipients/);
});
test("401, 403, 500 never masquerade as CONNECTED",async()=>{
  for(const status of [401,403,500]){
    const r=await probeIsnetSessionHealth(mock(status) as any,URL,"TEST_DUMMY_TOKEN","123");
    assert.equal(r.connected,false);assert.equal(r.status,status===500?"ERROR":"SESSION_INVALID");
  }
});
test("timeout does not retry and does not log credentials",async()=>{
  let requests=0;
  const pending=async(_url:any,opts:any)=>{requests++;return new Promise((_resolve,reject)=>{
    opts.signal.addEventListener("abort",()=>reject(Object.assign(new Error("timeout"),{name:"AbortError"})));
  })};
  const result=await probeIsnetSessionHealth(pending as any,URL,"TEST_DUMMY_TOKEN","123",5);
  assert.equal(result.status,"TIMEOUT");assert.equal(result.connected,false);
  assert.equal(requests,1);
  assert.doesNotMatch(JSON.stringify(result),/DUMMY_TOKEN/);
});
test("provider rejects or malformed JSON: transparent error, no accidental invoice upload",async()=>{
  for(const data of [{Result:1}, {result:false}]) {
    const result=await probeIsnetSessionHealth(mock(200,data) as any,URL,"TEST_DUMMY_TOKEN","123");
    assert.equal(result.status,"ERROR");
  }
  const bad=await probeIsnetSessionHealth((async()=>new Response("<html>no</html>",{status:200})) as any,URL,"TEST_DUMMY_TOKEN","123");
  assert.equal(bad.status,"ERROR");
});
test("no token: no network request at all",async()=>{
  const bad=await probeIsnetSessionHealth((async()=>{throw Error("must not call")}) as any,URL,"","123");
  assert.equal(bad.connected,false);
});

test("HTTP 200 ama kimlik kanıtı içermeyen boş cevap BAĞLI sayılmaz",async()=>{
  const unverified=await probeIsnetSessionHealth(mock(200,{}) as any,URL,"TEST_DUMMY_TOKEN","123");
  assert.equal(unverified.connected,false);
  assert.equal(unverified.status,"UNVERIFIED");
  assert.equal(unverified.sourceError,"PROVIDER_RESPONSE_UNVERIFIED");
  const list=await probeIsnetSessionHealth(mock(200,{Recipients:[]}) as any,URL,"TEST_DUMMY_TOKEN","123");
  assert.equal(list.connected,true);
});
