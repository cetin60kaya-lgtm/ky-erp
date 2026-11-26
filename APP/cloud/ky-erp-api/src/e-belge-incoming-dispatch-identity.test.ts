import test from "node:test";
import assert from "node:assert/strict";
import {compareIncomingDispatchIdentity,dispatchPartyRole,extractLabeledEttn} from "./e-belge-incoming-dispatch-identity.ts";
const ettn="ABCD1234-1234-4234-9234-123456789ABC";
const pdf={tenant:"fixture",issuerTax:"1234567890",recipientTax:"9876543210",documentNo:"ABC2026000000001",issueDate:"25-11-2026",ettn,direction:"INCOMING",kind:"DISPATCH"};
const xml={...pdf,issueDate:"2026-11-25",ettn:ettn.toLowerCase()};
test("extract only one labelled ETTN, not an unrelated UUID",()=>{assert.equal(extractLabeledEttn("Header\nETTN: "+ettn.toLowerCase()),ettn);assert.equal(extractLabeledEttn("Unrelated: "+ettn),"");assert.equal(extractLabeledEttn("ETTN: "+ettn+"\nETTN: 00000000-0000-4000-8000-000000000001"),"")});
test("mail PDF and official XML same issuer, recipient, direction, date and ETTN",()=>{assert.equal(compareIncomingDispatchIdentity(pdf,xml),"SAME_ETTN");assert.equal(compareIncomingDispatchIdentity(pdf,{...xml,tenant:"other"}),"DIFFERENT_SCOPE");assert.equal(compareIncomingDispatchIdentity(pdf,{...xml,issuerTax:"2222222222"}),"IDENTITY_CONFLICT");assert.equal(compareIncomingDispatchIdentity(pdf,{...xml,ettn:"00000000-0000-4000-8000-000000000001"}),"IDENTITY_CONFLICT")});
test("manual number-only match requires review, not an automatic duplicate",()=>{assert.equal(compareIncomingDispatchIdentity({...pdf,ettn:""},xml),"SAME_NUMBER_REVIEW");assert.equal(compareIncomingDispatchIdentity({...pdf,issuerTax:""},xml),"REVIEW_REQUIRED");assert.equal(compareIncomingDispatchIdentity(pdf,{...xml,direction:"OUTGOING"}),"DIFFERENT_SCOPE")});
test("history infers unknown role, preserves card and flags contradictory or dual role",()=>{assert.deepEqual(dispatchPartyRole("",3,0),{group:"CUSTOMER",source:"VERIFIED_SALES_HISTORY"});assert.equal(dispatchPartyRole("",0,3).group,"SUPPLIER");assert.equal(dispatchPartyRole("",0,0).group,"UNCLASSIFIED");assert.equal(dispatchPartyRole("SUPPLIER",1,0).group,"BOTH");assert.equal(dispatchPartyRole("CUSTOMER",1,1).group,"BOTH");assert.equal(dispatchPartyRole("CUSTOMER",0,0).group,"CUSTOMER")});

import {equalSourceLines} from "./e-belge-incoming-dispatch-identity.ts";
test("PDF/XML exact line comparison preserves colour, unit, individual quantity",()=>{
 const line={productCode:"fixture",description:"Model X Red",unitCode:"ADET",quantity:8373};
 assert.equal(equalSourceLines([line],[{product_code:"fixture",description:"model x red",unit_code:"C62",quantity:8373}]),true);
 assert.equal(equalSourceLines([line],[{...line,quantity:8372}]),false);
 assert.equal(equalSourceLines([line],[{...line,description:"Model X Blue"}]),false);
 assert.equal(equalSourceLines([],[]),false);
 assert.equal(equalSourceLines([line],[{...line,quantity:4000},{...line,quantity:4373}]),false);
});

import {incomingDispatchKey} from "./e-belge-incoming-dispatch-identity.ts";
test("PDF/XML concurrency uses same tenant-scoped complete source key",()=>{
 assert.equal(incomingDispatchKey(pdf),incomingDispatchKey(xml));
 assert.notEqual(incomingDispatchKey(pdf),incomingDispatchKey({...xml,tenant:"other"}));
 assert.equal(incomingDispatchKey({...pdf,recipientTax:""}),"");
 assert.notEqual(incomingDispatchKey(pdf),incomingDispatchKey({...xml,documentNo:"OTHER"}));
});
