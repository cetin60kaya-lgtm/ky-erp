import test from "node:test";
import assert from "node:assert/strict";
import { probeIsnetReadOnlyLists, fetchOneIsnetXmlReadOnly } from "./isnet-read-only-probe.ts";

const BASE="https://einvoiceapi.isnet.net.tr";
const ETTN="11111111-2222-3333-4444-555555555555";
const xml='<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"></Invoice>';
const json=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{
  status,headers:{"content-type":"application/json"}
});

test("Sahte İşNet resmî API: iki gelen belge listesi salt-okunur kabul",async()=>{
  const requests:string[]=[];
  const fetcher=async(url:any,init:any)=>{
    const path=String(url).replace(BASE,"");requests.push(path);
    assert.equal(init.method,"POST");
    assert.ok((init.headers.Authorization||"").startsWith("Bearer "));
    if(path.endsWith("GetIncomingEInvoiceList"))return json({Result:0,Invoices:[]});
    if(path.endsWith("GetIncomingDespatchList"))return json({Result:0,Despatches:[]});
    throw Error("İzin verilmeyen sağlayıcı metodu");
  };
  const result=await probeIsnetReadOnlyLists(fetcher as any,"SYNTHETIC_FAKE_TOKEN",101,"2026-11-01","2026-11-23");
  assert.equal(result.verified,true);
  assert.equal(requests.length,2);
  assert.deepEqual(Object.values(result.results).map(x=>x.status),["VERIFIED_READ_ONLY","VERIFIED_READ_ONLY"]);
  assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_FAKE_TOKEN/);
});

test("Sahte İşNet: bir UBL XML alma, yanıt tipini ve resmî gönderim yokluğunu sınama",async()=>{
  const requests:string[]=[];
  const fetcher=async(url:any,init:any)=>{
    const target=String(url);requests.push(target);
    if(target.endsWith("/api/Invoice/GetIncomingEInvoiceList"))
      return json({Result:0,Invoices:[{Ettn:ETTN,InvoiceDate:"2026-11-22"}]});
    if(target.endsWith("/api/Invoice/GetInvoiceExternalXmlUrl"))
      return json({Result:0,ExternalLink:"https://files.isnet.net.tr/synthetic/test.xml"});
    if(target==="https://files.isnet.net.tr/synthetic/test.xml")
      return new Response(xml,{status:200,headers:{"content-type":"application/xml"}});
    throw Error("Beklenmeyen ağ çağrısı");
  };
  const result=await fetchOneIsnetXmlReadOnly(fetcher as any,"SYNTHETIC_FAKE_TOKEN",101,
    "invoice","2026-11-01","2026-11-23","incoming",ETTN);
  assert.equal(result.kind,"invoice");
  assert.match(new TextDecoder().decode(result.bytes),/<Invoice\b/);
  assert.equal(requests.length,3);
  assert.ok(requests.every(x=>!x.includes("Submit")&&!x.includes("Send")&&!x.includes("Approve")));
});

test("Sahte İşNet: harici XML bağlantısında farklı domaine çıkılmaz",async()=>{
  const requests:string[]=[];
  const fetcher=async(url:any)=>{
    const target=String(url);requests.push(target);
    if(target.endsWith("/api/Invoice/GetIncomingEInvoiceList"))
      return json({Result:0,Invoices:[{Ettn:ETTN,InvoiceDate:"2026-11-22"}]});
    if(target.endsWith("/api/Invoice/GetInvoiceExternalXmlUrl"))
      return json({Result:0,ExternalLink:"https://untrusted.example.test/doc.xml"});
    throw Error("Güvenli reddetme çalışmadı");
  };
  await assert.rejects(fetchOneIsnetXmlReadOnly(fetcher as any,"SYNTHETIC_FAKE_TOKEN",101,
    "invoice","2026-11-01","2026-11-23","incoming",ETTN),
    /ISNET_XML_URL_NOT_ALLOWLISTED/);
  assert.equal(requests.length,2);
});

test("Sahte İşNet: API yetkisizse doğrulandı sonucu dönmez",async()=>{
  const fetcher=async()=>json({},401);
  const result=await probeIsnetReadOnlyLists(fetcher as any,"INVALID_TEST_TOKEN",101,"2026-11-01","2026-11-23");
  assert.equal(result.verified,false);
  assert.ok(Object.values(result.results).every(x=>x.status==="SESSION_INVALID"));
});
