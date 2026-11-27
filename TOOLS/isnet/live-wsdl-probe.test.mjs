import test from "node:test";
import assert from "node:assert/strict";
import {probeLiveWsdl,LIVE_ENDPOINTS,LIVE_NOT_BEFORE} from "./live-wsdl-probe.mjs";
const wsdl='<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"><wsdl:portType name="P"><wsdl:operation name="Read"/></wsdl:portType></wsdl:definitions>';
test("no probe before provider activation; exact GET endpoints; no redirects",async()=>{
 let calls=0;const fetcher=async(url,init)=>{calls++;assert.ok(Object.values(LIVE_ENDPOINTS).some(e=>url===e+"?singleWsdl"));assert.equal(init.method,"GET");assert.equal(init.redirect,"manual");return new Response(wsdl)};
 assert.equal(await probeLiveWsdl(fetcher,()=>LIVE_NOT_BEFORE-1),null);assert.equal(calls,0);
 const good=await probeLiveWsdl(fetcher,()=>LIVE_NOT_BEFORE+1000);assert.equal(calls,2);assert.ok(good.services.every(x=>x.status==="WSDL_DISCOVERED"&&x.operationCount===1&&x.sha256.length===64));
 const denied=await probeLiveWsdl(async()=>new Response(null,{status:403}),()=>LIVE_NOT_BEFORE+1000);assert.ok(denied.services.every(x=>x.status==="HTTP_ERROR"));
 const redirected=await probeLiveWsdl(async()=>new Response(null,{status:302,headers:{Location:"https://example.invalid"}}),()=>LIVE_NOT_BEFORE+1000);assert.ok(redirected.services.every(x=>x.status==="REDIRECT_REJECTED"));
 const bad=await probeLiveWsdl(async()=>new Response("<html>login</html>"),()=>LIVE_NOT_BEFORE+1000);assert.ok(bad.services.every(x=>x.status==="INVALID_WSDL"));
});
