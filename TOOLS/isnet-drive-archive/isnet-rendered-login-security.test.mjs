import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { createServer } from "node:net";

const basedir=dirname(fileURLToPath(import.meta.url));
async function freePort(){
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function waitReady(url,proc){
  for(let i=0;i<80;i++){
    if(proc.exitCode!==null)throw Error("ISNET_SERVER_EXITED");
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(800)});
      if(response.ok)return response;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,110));
  }
  throw Error("ISNET_SERVER_NOT_READY");
}
test("8791 gerçek HTML tarayıcı kodu çalışır; giriş hiçbir koşulda GET/URL şifresi üretmez",async()=>{
  const root=await mkdtemp(join(tmpdir(),"KY-ISNET-QA-"));
  const port=await freePort();
  const base="http://127.0.0.1:"+port;
  const proc=spawn(process.execPath,[join(basedir,"isnet-drive-yerel.mjs")],{
    cwd:basedir,env:{...process.env,PORT:String(port),KY_ISNET_ARCHIVE_ROOT:root,KY_ISNET_SELFTEST:""},
    windowsHide:true,stdio:"ignore",
  });
  try{
    const page=await waitReady(base+"/",proc);
    assert.equal(page.status,200);
    assert.match(page.headers.get("content-security-policy")||"",/frame-ancestors https:\/\/kyerp\.net/);
    assert.equal(page.headers.get("referrer-policy"),"no-referrer");
    const html=await page.text();
    assert.match(html,/<form id="login"[^>]+method="post"/);
    assert.match(html,/<form id="login"[^>]+onsubmit="return false"/);
    assert.match(html,/<form id="login"[^>]+action="\/login"/);
    const inline=html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(inline,"INLINE_SCRIPT_MISSING");
    assert.doesNotThrow(()=>new Script(inline[1],{filename:"isnet-rendered-ui.js"}));
    assert.match(inline[1],/querySelector\('#login'\)\.onsubmit/);
    assert.match(inline[1],/api\('\/login',\{username,password:/);
    assert.match(inline[1],/api\('\/login-saved',\{username\}\)/);
    assert.match(inline[1],/api\('\/password-delete',\{username\}\)/);
    assert.match(html,/id="rememberPassword"/);
    assert.match(html,/id="rememberCompany"/);
    assert.match(html,/id="loginSaved"/);
    assert.match(html,/id="deleteSaved"/);
    assert.doesNotMatch(html,/id="keepMonitoring" type="checkbox" checked/);
    assert.match(inline[1],/querySelector\("#archiveAll"\)/);
    assert.match(inline[1],/querySelector\("#keepMonitoring"\)/);
    assert.match(html,/id="reviewRefresh"/);
    assert.match(html,/id="reviewPreview"/);
    assert.match(inline[1],/showPdfReviews/);
    assert.match(inline[1],/api\("\/review-resolve"/);
    assert.match(inline[1],/api\("\/review-refresh"/);
    const token=inline[1].match(/const csrf="([a-f0-9]{48})"/)?.[1];
    assert.ok(token,"CSRF_MISSING");
    const secureHeaders={"content-type":"application/json","x-ky-csrf":token,"origin":base};
    for(const endpoint of ["/review-list","/review-pdf","/review-resolve","/review-refresh"]){
      const response=await fetch(base+endpoint,{method:"POST",headers:secureHeaders,
        body:JSON.stringify({sourceKey:"incoming_invoice",sourceId:"123",action:"KEEP_ORIGINAL",variant:"original"})});
      assert.equal(response.status,400,endpoint+" must reject unauthenticated access");
    }

    // Simulates an accidentally supplied GET query without storing any real credentials.
    const q=await fetch(base+"/?username=example&password=NOT_A_REAL_PASSWORD",{redirect:"manual"});
    assert.equal(q.status,303);
    assert.equal(q.headers.get("location"),"/");
    assert.equal(q.headers.get("cache-control"),"no-store");
    assert.equal(q.headers.get("referrer-policy"),"no-referrer");
    const noCsrf=await fetch(base+"/login",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({username:"example",password:"NOT_A_REAL_PASSWORD"}),
    });
    assert.equal(noCsrf.status,403);
    const denied=await noCsrf.text();
    assert.doesNotMatch(denied,/NOT_A_REAL_PASSWORD/);
  }finally{
    proc.kill();
    await rm(root,{recursive:true,force:true});
  }
});
