import test from "node:test";
import assert from "node:assert/strict";
import {readTestUblIdentity,requireVerifiedTestUblIdentity} from "./isnet-test-ubl-identity.ts";
const ettn="11111111-2222-3333-4444-555555555555",base="urn:oasis:names:specification:ubl:schema:xsd:";
const fixture=(kind:"E_FATURA"|"E_IRSALIYE"="E_FATURA",note="")=>{
 const inv=kind==="E_FATURA",n=inv?"Invoice":"DespatchAdvice",sender=inv?"AccountingSupplierParty":"DespatchSupplierParty",receiver=inv?"AccountingCustomerParty":"DeliveryCustomerParty";
 const party=(role:string,id:string)=>'<a:'+role+'><a:Party><a:PartyIdentification><b:ID schemeID="VKN">'+id+'</b:ID></a:PartyIdentification></a:Party></a:'+role+'>';
 return '<'+n+' xmlns="'+base+n+'-2" xmlns:a="'+base+'CommonAggregateComponents-2" xmlns:b="'+base+'CommonBasicComponents-2"><b:ID>TST2026000000001</b:ID><b:UUID>'+ettn+'</b:UUID>'+note+party(sender,"0000000000")+party(receiver,"1111111111")+'</'+n+'>';
};
const bytes=(x:string)=>new TextEncoder().encode(x);
test("strict UBL identity for both kinds and original document number",async()=>{
 for(const kind of ["E_FATURA","E_IRSALIYE"] as const){const r=await readTestUblIdentity(bytes(fixture(kind)),kind,ettn);assert.equal(r.documentNo,"TST2026000000001");assert.equal(r.ettn,ettn);assert.notEqual(r.senderHash,r.receiverHash);}
});
test("fixture marker, spoofed namespace, duplicate identity and wrong ETTN are rejected",async()=>{
 const xml=fixture();
 for(const bad of [fixture("E_FATURA",'<b:Note>NOT FOR SENDING</b:Note>'),xml.replace(base+"CommonBasicComponents-2","urn:wrong"),xml.replace("</b:UUID>","</b:UUID><b:UUID>"+ettn+"</b:UUID>"),xml.replace(ettn,"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),fixture("E_IRSALIYE"),xml.replace("TST2026000000001","INVALID")])await assert.rejects(()=>readTestUblIdentity(bytes(bad),"E_FATURA",ettn));
});
test("synthetic identities cannot be authorized even with purported provider evidence",async()=>{
 const data=bytes(fixture()),identity=await readTestUblIdentity(data,"E_FATURA",ettn),now=Date.now();
 await assert.rejects(()=>requireVerifiedTestUblIdentity({bytes:data,kind:"E_FATURA",tenant:"fixture",ettn,senderHash:identity.senderHash,receiverTag:"urn:mail:test@example.invalid",evidence:{tenant:"fixture",environment:"TEST",kind:"E_FATURA",senderHash:identity.senderHash,receiverHash:identity.receiverHash,receiverTag:"urn:mail:test@example.invalid",verifiedAt:new Date(now).toISOString(),providerVerified:true},now}),/TEST_UBL_COMPANY_NOT_ALLOWED/);
});
