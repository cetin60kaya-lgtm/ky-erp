import test from "node:test";
import assert from "node:assert/strict";
import {buildTestUblFromOperatorDraft} from "./isnet-operator-ubl.ts";
import {buildTestTagRequest,parseTestTagResponse,queryTestTags} from "./isnet-test-tag-evidence.ts";
import {requireProviderUnsignedStructure} from "./isnet-soap-provider-numbering.ts";
const address={street:"TEST Sokak",buildingNumber:"1",district:"Merkez",city:"Istanbul",postalCode:"34000",country:"Türkiye"};
const sender={id:"sender",taxNo:"0000000000",name:"TEST Tedarikçi",taxOffice:"TEST",address};
const receiver={id:"receiver",taxNo:"1111111111",name:"TEST Alıcı",taxOffice:"TEST",address};
const common={environment:"TEST" as const,sender,receiver,localEttn:"11111111-2222-3333-4444-555555555555",localDocumentNo:"TST2026000000001",issueTime:"10:00:00"};
const line=(description:string,quantity:string,price:string,vatRate:string,freeKind="")=>({description,quantity,price,vatRate,freeKind,unit:"C62",discountRate:"0"});
const invoice={...common,kind:"INVOICE" as const,draft:{issueDate:"2026-11-26",partyId:"receiver",scenario:"TICARIFATURA",currency:"TRY",note:"TEST & XML <NOT FOR SENDING>",lines:[line("TEST Emprime baskı","100","10","20"),line("TEST Numune","10","0","0","SAMPLE"),line("TEST Kumaş sakatı","5","0","0","FABRIC_DEFECT"),line("TEST Baskı sakatı","5","0","0","PRINT_DEFECT")]},exemptions:[1,2,3].map(lineIndex=>({lineIndex,approved:true as const,approvalRef:"test-only",code:"351",reason:"TEST bedelsiz teslim"}))};
const dispatch={...common,kind:"DISPATCH" as const,localDocumentNo:"TST2026000000002",draft:{issueDate:"2026-11-26",partyId:"receiver",scenario:"TEMELIRSALIYE",currency:"TRY",note:"NOT FOR SENDING",lines:[line("TEST Emprime baskı","5000","0","0")],deliveryAddress:"TEST Sokak 1",driver:"TEST Sürücü",plate:"34TEST001",dispatchDate:"2026-11-26",dispatchTime:"10:01"},shipment:{value:"50000.00",currency:"TRY" as const,driverFirstName:"TEST",driverLastName:"Sürücü",driverNationalityId:"00000000000",deliveryAddress:address,plate:"34TEST001"}};
test("four-line operator draft produces the same calculated amounts; explicit exemption, escaped notes, no submit",()=>{
 const r=buildTestUblFromOperatorDraft(invoice);
 assert.equal(r.net,"1000.00");assert.equal(r.vat,"200.00");assert.equal(r.total,"1200.00");
 assert.equal(r.sendAllowed,false);assert.match(r.xml,/LineCountNumeric>4</);assert.match(r.xml,/TEST &amp; XML &lt;NOT FOR SENDING&gt;/);
 assert.match(r.xml,/PayableAmount currencyID="TRY">1200.00/);
 assert.doesNotThrow(()=>requireProviderUnsignedStructure(new TextEncoder().encode(r.xml),"E_FATURA"));
 assert.throws(()=>buildTestUblFromOperatorDraft({...invoice,exemptions:[]}),/UBL_EXEMPTION_APPROVAL/);
 assert.throws(()=>buildTestUblFromOperatorDraft({...invoice,receiver:{...receiver,id:"wrong"}}),/UBL_PARTY_MISMATCH/);
 assert.throws(()=>buildTestUblFromOperatorDraft({...invoice,draft:{...invoice.draft,scenario:"EARSIVFATURA"}}),/UBL_UNSUPPORTED_SCENARIO/);
 assert.throws(()=>buildTestUblFromOperatorDraft({...invoice,draft:{...invoice.draft,lines:[{...invoice.draft.lines[0],discountRate:"10"},...invoice.draft.lines.slice(1)]}}),/UBL_DISCOUNT_REVIEW_REQUIRED/);
 const sourced=buildTestUblFromOperatorDraft({...invoice,sourceDespatches:[{documentNo:"TST2026000000003",issueDate:"2026-11-25"}]});
 assert.match(sourced.xml,/DespatchDocumentReference/);
});
test("operator dispatch includes verified shipment value and structured driver",()=>{
 const r=buildTestUblFromOperatorDraft(dispatch);
 assert.equal(r.sendAllowed,false);assert.match(r.xml,/ValueAmount currencyID="TRY">50000.00/);
 assert.match(r.xml,/DeliveredQuantity unitCode="C62">5000.000/);
 assert.doesNotThrow(()=>requireProviderUnsignedStructure(new TextEncoder().encode(r.xml),"E_IRSALIYE"));
 assert.throws(()=>buildTestUblFromOperatorDraft({...dispatch,shipment:undefined}),/UBL_SHIPMENT_REQUIRED/);
 assert.throws(()=>buildTestUblFromOperatorDraft({...dispatch,shipment:{...dispatch.shipment,driverFirstName:"wrong"}}),/UBL_DRIVER_MISMATCH/);
 assert.throws(()=>buildTestUblFromOperatorDraft({...dispatch,draft:{...dispatch.draft,dispatchTime:"09:59"}}),/UBL_DISPATCH_TIME/);
});
const S="http://schemas.xmlsoap.org/soap/envelope/",T="http://tempuri.org/",M="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model",AR="http://schemas.microsoft.com/2003/10/Serialization/Arrays";
const tagFixture=(op="GetTaxPayer")=>'<s:Envelope xmlns:s="'+S+'" xmlns:t="'+T+'" xmlns:m="'+M+'" xmlns:a="'+AR+'"><s:Body><t:'+op+'Response><t:'+op+'Result><m:Result>Success</m:Result><m:TaxPayers><m:TaxPayer><m:TaxPayerTaxCode>0000000000</m:TaxPayerTaxCode><m:InboxTagList><a:string>urn:mail:fixture@example.invalid</a:string></m:InboxTagList><m:OutboxTagList><a:string>urn:mail:sender@example.invalid</a:string></m:OutboxTagList></m:TaxPayer></m:TaxPayers></t:'+op+'Result></t:'+op+'Response></s:Body></s:Envelope>';
test("tag lookup pinned address WSDL; exact party, namespace and operation, no arbitrary TEST company",async()=>{
 const h=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("0000000000"))),n=>n.toString(16).padStart(2,"0")).join("");
 for(const kind of ["E_FATURA","E_IRSALIYE"] as const){
  const op=kind==="E_FATURA"?"GetTaxPayer":"GetDespatchTaxPayer",req=buildTestTagRequest(kind,"0000000000");
  assert.equal(req.headers.SOAPAction,'"'+T+'IAddressBookService/'+op+'"');
  assert.match(req.endpoint,/AddressBookService/);
  const r=await parseTestTagResponse(tagFixture(op),kind,h);
  assert.deepEqual(r.inboxTags,["urn:mail:fixture@example.invalid"]);assert.deepEqual(r.outboxTags,["urn:mail:sender@example.invalid"]);
  await assert.rejects(()=>parseTestTagResponse(tagFixture(op),kind,"a".repeat(64)),/TEST_TAG_IDENTITY/);
  await assert.rejects(()=>parseTestTagResponse(tagFixture(op).replace("urn:mail:fixture@example.invalid","invalid"),kind,h),/TEST_TAG_INVALID/);
 }
 let calls=0;await assert.rejects(()=>queryTestTags("E_FATURA","0000000000",async()=>{calls++;return new Response(tagFixture())}),/TEST_COMPANY_NOT_ALLOWED/);assert.equal(calls,0);
});
