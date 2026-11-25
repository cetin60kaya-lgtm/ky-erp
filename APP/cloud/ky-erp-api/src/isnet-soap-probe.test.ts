import test from "node:test";import assert from "node:assert/strict";import {wsdlSummary,probeInvoiceHealth,safeNetworkStatus} from "./isnet-soap-probe.ts";
test("HTML, DTD ve yanlış namespace WSDL sayılmaz",()=>{assert.equal(wsdlSummary("<html>Service</html>").status,"NOT_WSDL");assert.equal(wsdlSummary("<!DOCTYPE definitions><definitions/>").status,"INVALID_WSDL");assert.equal(wsdlSummary('<definitions xmlns="wrong"><portType/></definitions>').status,"NOT_WSDL");});
test("fixture WSDL portType operation keşfi",()=>{assert.deepEqual(wsdlSummary("<?xml version=\"1.0\"?><wsdl:definitions xmlns:wsdl=\"http://schemas.xmlsoap.org/wsdl/\"><wsdl:portType name=\"I\"><wsdl:operation name=\"SearchInvoice\"/><wsdl:operation name=\"SendInvoiceXml\"/></wsdl:portType></wsdl:definitions>").operations,["SearchInvoice","SendInvoiceXml"]);});

test("real health method shape, no metadata request",async()=>{
 const response='<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><HealthCheckResponse xmlns="http://tempuri.org/"><HealthCheckResult>OK</HealthCheckResult></HealthCheckResponse></s:Body></s:Envelope>';
 const result=await probeInvoiceHealth(async(url,opts)=>{assert.ok(url.endsWith(".svc"));assert.equal(opts.method,"POST");assert.equal(opts.headers.SOAPAction,'"http://tempuri.org/IInvoiceService/HealthCheck"');return new Response(response)});
 assert.equal(result.status,"SOAP_RESPONSE_VERIFIED");
 assert.equal((await probeInvoiceHealth(async()=>new Response("<html/>"))).status,"SOAP_RESPONSE_INVALID");
 assert.equal((await probeInvoiceHealth(async()=>new Response("",{status:403}))).httpStatus,403);
 assert.equal(safeNetworkStatus({name:"TimeoutError"}),"TIMEOUT");
 assert.equal(safeNetworkStatus(new Error("DNS lookup failed")),"DNS_ERROR");
});
