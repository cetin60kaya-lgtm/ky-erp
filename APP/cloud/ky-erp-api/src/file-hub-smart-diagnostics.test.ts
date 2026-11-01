import test from "node:test";
import assert from "node:assert/strict";
import { buildFileHubSmartDiagnostics } from "./file-hub-smart-diagnostics.ts";
const now=Date.parse("2026-11-01T08:00:00Z");
const cloud=(id:string,type:string)=>({id,name:type,provider_type:type,is_active:1,sync_mode:"CLOUD_API",connection_status:"CONNECTED",last_sync_at:"2026-11-01T07:55:00Z"});
const run=(connections:any[]=[],bindings:any[]=[],extra:any={})=>buildFileHubSmartDiagnostics({connections,bindings,agents:[],unmatchedCount:0,missingCount:0,now,...extra});
test("Google ve Microsoft birlikte aktifteyse bağlantı eksik uyarısı çıkmaz",()=>{
 const rows=[cloud("g","GOOGLE_DRIVE"),cloud("m","ONEDRIVE")];
 const result=run(rows,[{module_code:"DESEN",purpose_code:"MODEL_IMAGE",storage_connection_id:"g",sync_enabled:1}]);
 assert.equal(result.length,1);assert.equal(result[0].code,"READY");
});
test("tek Drive, Agent veya pasif servis ikinci bulutun yerini tutmaz",()=>{
 const out=run([cloud("g","GOOGLE_DRIVE"),{id:"x",provider_type:"ONEDRIVE",sync_mode:"AGENT",is_active:1}]);
 assert.ok(out.some(x=>x.code==="CONNECT_ONEDRIVE"));
 assert.ok(out.some(x=>x.code==="DESEN_IMAGE_BINDING"));
 assert.ok(out.some(x=>x.code==="AGENT_OFFLINE"));
});
test("bağlantı hatası, kesilen tarama, eşleşmeyen ve kayıp dosyalar işlemsiz tespit edilir",()=>{
 const out=run([{...cloud("g","GOOGLE_DRIVE"),connection_status:"ERROR",last_error:"Yetki süresi doldu",metadata:{syncTruncated:true}}],[],{missingCount:3,unmatchedCount:2});
 assert.ok(out.some(x=>x.code==="ERROR_g"&&x.level==="critical"));
 assert.ok(out.some(x=>x.code==="TRUNCATED_g"));
 assert.ok(out.some(x=>x.code==="MISSING_FILES"));
 assert.ok(out.some(x=>x.code==="UNMATCHED_FILES"));
});
test("eski senkron gerçekten 24 saati geçtiğinde uyarı verir",()=>{
 const out=run([{...cloud("g","GOOGLE_DRIVE"),last_sync_at:"2026-10-28T06:00:00Z"},cloud("m","ONEDRIVE")]);
 assert.ok(out.some(x=>x.code==="STALE_g"));
 assert.ok(!out.some(x=>x.code==="STALE_m"));
});
