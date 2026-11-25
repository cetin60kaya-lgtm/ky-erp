import test from "node:test";
import assert from "node:assert/strict";
import {SOAP_TEST_ENDPOINTS,SOAP_DOCUMENTED_OPERATIONS,soapResultState} from "./isnet-soap-test-contract.ts";
test("only two supplied TEST service URLs; e-MM has no SOAP",()=>{assert.equal(Object.keys(SOAP_TEST_ENDPOINTS).length,2);assert.ok(Object.values(SOAP_TEST_ENDPOINTS).every(u=>new URL(u).hostname==="einvoiceservicetest.isnet.net.tr"));assert.equal(SOAP_DOCUMENTED_OPERATIONS.emm.write.length,0);assert.equal(SOAP_DOCUMENTED_OPERATIONS.product.service,null);});
test("provider success is not final GIB acceptance",()=>{assert.equal(soapResultState("Success"),"RECEIVED_NOT_FINAL");assert.equal(soapResultState(0),"RECEIVED_NOT_FINAL");assert.equal(soapResultState("0","COMPLETED_VERIFIED"),"COMPLETED");assert.equal(soapResultState("Failed","COMPLETED_VERIFIED"),"NOT_ACCEPTED");assert.equal(soapResultState(1),"NOT_ACCEPTED");assert.equal(soapResultState(null),"NOT_ACCEPTED");});
