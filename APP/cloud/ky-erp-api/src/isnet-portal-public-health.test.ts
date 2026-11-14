import test from "node:test";
import assert from "node:assert/strict";
import { probeIsnetPublicLogin } from "./isnet-portal-public-health.ts";
const synthetic = '<html><form method="post"><input name="VknTckn"/><input name="__RequestVerificationToken" type="hidden" value="SYNTHETIC_TEST_VALUE"/></form></html>';
const fetchWith=(body:string,status=200)=>async()=>new Response(body,{status,headers:{"Content-Type":"text/html"}});
test("Şifresiz İşNet erişim kontrolü: geçerli form yalnız READY ağ durumudur",async()=>{
 const result=await probeIsnetPublicLogin(fetchWith(synthetic) as any,"https://nettefatura.isnet.net.tr/Account/Login");
 assert.deepEqual(result,{reachable:true,status:"READY",httpStatus:200});
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_TEST_VALUE|VknTckn|cookie/i);
});
test("HTTP 403 ve HTML 200 ama giriş formu yoksa doğrulama başlamaz",async()=>{
 assert.deepEqual(await probeIsnetPublicLogin(fetchWith("Blocked",403) as any,"https://nettefatura.isnet.net.tr/Account/Login"),{reachable:false,status:"HTTP_ERROR",httpStatus:403});
 assert.deepEqual(await probeIsnetPublicLogin(fetchWith("<html>captcha</html>") as any,"https://nettefatura.isnet.net.tr/Account/Login"),{reachable:false,status:"FORM_MISSING",httpStatus:200});
});
test("Redirect ve network/timeout ayrı sınıflandırılır; credential gerektirmez",async()=>{
 const redirected=async()=>new Response("",{status:302,headers:{Location:"/account/login"}});
 assert.equal((await probeIsnetPublicLogin(redirected as any,"https://nettefatura.isnet.net.tr/Account/Login")).status,"REDIRECT");
 const broken=async()=>{throw new TypeError("connection refused")};
 assert.equal((await probeIsnetPublicLogin(broken as any,"https://nettefatura.isnet.net.tr/Account/Login")).status,"NETWORK_ERROR");
 const stalled=async(_url:any,opts:any)=>new Promise((_resolve,reject)=>opts.signal.addEventListener("abort",()=>reject(Object.assign(new Error("timeout"),{name:"AbortError"}))));
 assert.equal((await probeIsnetPublicLogin(stalled as any,"https://nettefatura.isnet.net.tr/Account/Login",5)).status,"TIMEOUT");
});
