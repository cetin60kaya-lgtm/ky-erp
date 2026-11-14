import test from "node:test";
import assert from "node:assert/strict";
import {isBrowserVaultSupported,saveIsnetBrowserCredentials,loadIsnetBrowserCredentials} from "./isnetBrowserVault.js";
const build = () => {
  let saved=null;
  return {
    PasswordCredential: class { constructor(props){Object.assign(this,props)} },
    navigator:{credentials:{
      store:async cred=>{saved=cred},
      get:async opts=>{assert.equal(opts.mediation,"required");return saved;}
    }}
  };
};
test("İşNet kimliği farklı prefix ile tarayıcı kasasında saklanır; kullanıcı onayıyla doldurulur",async()=>{
 const env=build();
 assert.equal(isBrowserVaultSupported(env),true);
 assert.deepEqual(await saveIsnetBrowserCredentials("DEMO","TEST_ONLY_PASSWORD",env),{saveRequested:true});
 assert.deepEqual(await loadIsnetBrowserCredentials("DEMO",env),{username:"DEMO",password:"TEST_ONLY_PASSWORD"});
});
test("Farklı İşNet hesabı veya ERP giriş parolası otomatik doldurulamaz",async()=>{
 const env=build();
 env.navigator.credentials.get=async()=>({id:"erp-admin",password:"DUMMY"});
 await assert.rejects(loadIsnetBrowserCredentials("",env),/İşNet kaydı değil/);
 env.navigator.credentials.get=async()=>({id:"isnet:OTHER",password:"DUMMY"});
 await assert.rejects(loadIsnetBrowserCredentials("DEMO",env),/eşleşmedi/);
});
test("Destek yoksa veya şifre boşsa sessiz kayıt yapılmaz",async()=>{
 assert.equal(isBrowserVaultSupported({}),false);
 await assert.rejects(saveIsnetBrowserCredentials("DEMO","",{}),/Önce/);
 await assert.rejects(saveIsnetBrowserCredentials("DEMO","DUMMY",{}),/desteklemiyor/);
 await assert.rejects(loadIsnetBrowserCredentials("DEMO",{}),/desteklenmiyor/);
});
