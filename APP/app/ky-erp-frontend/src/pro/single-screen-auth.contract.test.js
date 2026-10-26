import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=(name)=>readFileSync(new URL(name,import.meta.url),"utf8");
const home=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const pub=(name)=>readFileSync(new URL("../../public/guvenlik/"+name,import.meta.url),"utf8");

test("Pro login never rewrites installed /guvenlik/pro/ into desktop root",()=>{
  const login=home("pages/LoginPage.jsx");
  assert.match(login,/!window\.location\.pathname\.startsWith\("\/guvenlik\/pro"\)/);
  assert.match(login,/<InlineSecurityApproval challengeId=\{flow\.phoneApprovalId\}/);
  assert.match(login,/window\.setTimeout\(refreshPhoneApproval,350\)/);
  assert.match(login,/window\.setInterval\(refreshPhoneApproval,\s*2200\)/);
  assert.match(login,/checkPhoneApproval\(/);
});
test("Security and ERP stay mounted inside one shared AuthProvider and Android bottom dock",()=>{
  const app=src("main.jsx");
  assert.match(app,/<AuthProvider><ProApplication\/>/);
  assert.match(app,/<SecurityCenter\/>/);
  assert.match(app,/hidden=\{securityOpen\|\|home\}/);
  assert.match(app,/workspaceMounted/);
  assert.match(app,/setSecurityOpen\(true\)/);
  assert.doesNotMatch(app,/location\.assign\("\/guvenlik\/"\)/);
  assert.doesNotMatch(app,/<a href="\/guvenlik\/"/);
});
test("same-device self login must use signed request and platform PIN/biometrics",()=>{
  const client=src("securityDevice.js"),inline=src("InlineSecurityApproval.jsx");
  assert.match(client,/kyerp-security-fresh-v3/);
  assert.match(client,/KYERP-DEVICE-AUTH-V1/);
  assert.match(client,/KYERP-DECISION-V2/);
  assert.match(client,/userVerification:"required"/);
  assert.match(client,/crypto\.subtle\.sign/);
  assert.match(inline,/row\.kind==="SELF_LOGIN"&&String\(row\.id\)===String\(challengeId\)/);
  assert.match(inline,/decideTrustedApproval\(item,"APPROVE"/);
  assert.match(inline,/enteredMatch!==match/);
  assert.doesNotMatch(inline,/location\.assign|location\.replace|window\.location\.reload/);
});
test("root phone install migrates in-place and push focus does not reload ongoing login",()=>{
  const app=pub("app.js"),worker=pub("sw.js"),manifest=JSON.parse(pub("manifest.webmanifest"));
  assert.equal(manifest.id,"/guvenlik/");
  assert.equal(manifest.start_url,"/guvenlik/");
  assert.equal(manifest.scope,"/guvenlik/");
  assert.match(app,/isStandalone\(\)&&localDevice\?\.deviceId&&localDevice\?\.signingPrivateKey/);
  assert.match(app,/location\.replace\("\/guvenlik\/pro\/"\)/);
  assert.match(worker,/existing\.postMessage\(\{type:"KYERP_SECURITY_PUSH_WAKE"\}\)/);
  assert.doesNotMatch(worker,/existing\.navigate\(APP_URL\)/);
  assert.match(worker,/clients\.openWindow\("\/guvenlik\/pro\/"\)/);
});
