import assert from "node:assert/strict";
import test from "node:test";
import {
  turnstileHostnameAllowed,
  turnstilePublicConfig,
  turnstileRequiredForOrigin,
  verifyTurnstileForLogin,
} from "./turnstile-cloud.ts";

test("Turnstile is required only for canonical KY ERP browser origins", () => {
  assert.equal(turnstileRequiredForOrigin("https://kyerp.net"), true);
  assert.equal(turnstileRequiredForOrigin("https://www.kyerp.net"), true);
  assert.equal(turnstileRequiredForOrigin("https://kyerp.net"), true);
  assert.equal(turnstileRequiredForOrigin("http://localhost:5173"), false);
  assert.equal(turnstileRequiredForOrigin(""), false);
});

test("Turnstile accepts only KY ERP production hostnames", () => {
  assert.equal(turnstileHostnameAllowed("kyerp.net"), true);
  assert.equal(turnstileHostnameAllowed("www.kyerp.net"), true);
  assert.equal(turnstileHostnameAllowed("legacy.invalid"), false);
  assert.equal(turnstileHostnameAllowed("evil.example"), false);
  assert.equal(turnstileHostnameAllowed(""), false);
});


test("Turnstile public config stays enabled on production but is disabled on Pages preview QA origins", () => {
  const env = { TURNSTILE_SITE_KEY: "prod-site", TURNSTILE_SECRET_KEY: "prod-secret" };
  const context = (origin) => ({ env, req: { header: (name) => name === "Origin" ? origin : "" } });

  assert.deepEqual(turnstilePublicConfig(context("https://kyerp.net")), {
    enabled: true,
    siteKey: "prod-site",
    required: true,
  });
  assert.deepEqual(turnstilePublicConfig(context("https://08389b3c.ky-erp-frontend.pages.dev")), {
    enabled: false,
    siteKey: "",
    required: false,
  });
  assert.deepEqual(turnstilePublicConfig(context("http://localhost:5173")), {
    enabled: false,
    siteKey: "",
    required: false,
  });
});

const verificationContext = {env:{TURNSTILE_SITE_KEY:"synthetic-site",TURNSTILE_SECRET_KEY:"synthetic-secret"},req:{header:(name:string)=>name==="Origin"?"https://kyerp.net":""}};
const valid = () => Response.json({success:true,hostname:"kyerp.net"});
test("Siteverify retries transient network loss with the same idempotency key",async()=>{
 const ids:string[]=[];
 const result=await verifyTurnstileForLogin(verificationContext,"synthetic-token",async(_url:unknown,init:any)=>{ids.push(new URLSearchParams(init.body).get("idempotency_key")||"");if(ids.length===1)throw new Error("synthetic transport loss");return valid()});
 assert.equal(result.ok,true);assert.equal(ids.length,2);assert.ok(ids[0]);assert.equal(ids[0],ids[1]);
});
test("expired or used token rejected without provider retry",async()=>{
 let calls=0;const result=await verifyTurnstileForLogin(verificationContext,"synthetic-token",async()=>{calls++;return Response.json({success:false,"error-codes":["timeout-or-duplicate"]})});
 assert.equal(result.ok,false);assert.equal(result.code,"TURNSTILE_TOKEN_EXPIRED");assert.equal(calls,1);
});
test("provider internal-error retried at most once and failure remains closed",async()=>{
 let calls=0;const result=await verifyTurnstileForLogin(verificationContext,"synthetic-token",async()=>{calls++;return Response.json({success:false,"error-codes":["internal-error"]})});
 assert.equal(result.ok,false);assert.equal(result.status,503);assert.equal(calls,2);
});
test("hostname mismatch never grants login and never retries",async()=>{
 let calls=0;const result=await verifyTurnstileForLogin(verificationContext,"synthetic-token",async()=>{calls++;return Response.json({success:true,hostname:"invalid.example"})});
 assert.equal(result.ok,false);assert.equal(result.code,"TURNSTILE_HOSTNAME_MISMATCH");assert.equal(calls,1);
});
test("invalid provider JSON and invalid config fail closed",async()=>{
 let calls=0;const result=await verifyTurnstileForLogin(verificationContext,"synthetic-token",async()=>{calls++;return new Response("invalid json")});assert.equal(result.ok,false);assert.equal(result.status,503);assert.equal(calls,2);
 const invalid=await verifyTurnstileForLogin(verificationContext,"synthetic-token",async()=>Response.json({success:false,"error-codes":["invalid-input-secret"]}));assert.equal(invalid.code,"TURNSTILE_NOT_CONFIGURED");assert.equal(invalid.ok,false);
});
