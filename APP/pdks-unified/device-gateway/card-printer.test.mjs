import test from "node:test";
import assert from "node:assert/strict";
import {buildCardPrintHtml} from "./card-printer.mjs";
test("test card previews locally and cannot send a silent print job",()=>{
  const html=buildCardPrintHtml();
  assert.match(html,/TEST KARTI/);
  assert.match(html,/window\.print\(\)/);
  assert.doesNotMatch(html,/<script|fetch\(|postMessage\(|autoPrint/i);
  assert.match(html,/@page\{size:86mm 54mm/);
});
test("personnel badge needs explicit operator approval and verified mapping",()=>{
  const source={type:"personnel",companyName:"Kaya PDKS",
    personnelName:"Ayşe Test",employeeId:"stage-27",cardNo:"00027"};
  assert.throws(()=>buildCardPrintHtml(source),/APPROVAL_REQUIRED/);
  assert.throws(()=>buildCardPrintHtml({...source,mappingVerified:true}),/APPROVAL_REQUIRED/);
  assert.throws(()=>buildCardPrintHtml({...source,mappingVerified:true,operatorApproved:true,cardNo:"27"}),/FIVE_DIGIT/);
  const html=buildCardPrintHtml({...source,mappingVerified:true,operatorApproved:true});
  assert.match(html,/00027/);
  assert.match(html,/Ayşe Test/);
});
test("HTML injection cannot escape badge data",()=>{
  const html=buildCardPrintHtml({type:"personnel",
    mappingVerified:true,operatorApproved:true,employeeId:"stage-1",
    companyName:"<script>alert(1)</script>",
    personnelName:'"><img src=x onerror=alert(1)>',cardNo:"00001"});
  assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;script&gt;/);
});
