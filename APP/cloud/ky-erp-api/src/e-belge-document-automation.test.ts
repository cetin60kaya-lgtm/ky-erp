import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveDocumentIdentity, modelHintFromArchiveName, chooseCanonicalDocumentModels,
  packageWeightFromItem, dispatchInvoiceQuantity } from "./e-belge-document-automation.ts";
import { parseCanonicalEBelgeUbl } from "./e-belge-ubl.ts";

test("DDM/HKN filenames: exact model name and document number, no copy duplicate",()=>{
  assert.deepEqual(modelHintFromArchiveName("DDM2026000000046 ECITIR.pdf"),
    {series:"DDM",documentNo:"DDM2026000000046",modelName:"ECITIR"});
  assert.equal(modelHintFromArchiveName("HKN2026000000807 KEGINEZ - Kopya.pdf")?.modelName,"KEGINEZ");
  assert.equal(modelHintFromArchiveName("SLV2026000004125_several.pdf"),null);
  assert.deepEqual(archiveDocumentIdentity("HKN2026000000946.pdf"),{series:"HKN",documentNo:"HKN2026000000946",modelName:""});
  assert.equal(modelHintFromArchiveName("HKN2026000000946.pdf"),null);
  assert.deepEqual(archiveDocumentIdentity("DDM2026000000933.pdf"),{series:"DDM",documentNo:"DDM2026000000933",modelName:""});
});

test("canonical model: company + exact name; no cross-company or duplicate guess",()=>{
  const models=[{id:"one",model_name:"ECITIR",company_id:"c1"},
    {id:"other",model_name:"ECITIR",company_id:"c2"}];
  const input={models,lines:[{description:"PRINT TEXT",quantity:100}],
    fileName:"DDM2026000000046 ECITIR.pdf",documentNo:"DDM2026000000046",companyId:"c1"};
  const matched=chooseCanonicalDocumentModels(input);
  assert.equal(matched.modelId,"one");
  assert.equal(matched.models[0].source,"FILE_NAME_EXACT");
  assert.equal(chooseCanonicalDocumentModels({...input,companyId:"c3"}).modelId,"");
  assert.equal(chooseCanonicalDocumentModels({...input,companyId:""}).status,"AMBIGUOUS");
});

test("canonical model: conflicting file and exact line never auto-merge",()=>{
  const data={models:[{id:"a",model_name:"MODEL A"},{id:"b",model_name:"MODEL B"}],
    lines:[{description:"MODEL B"}],fileName:"HKN2026000000845 MODEL A.pdf",documentNo:"HKN2026000000845"};
  assert.equal(chooseCanonicalDocumentModels(data).status,"CONFLICT");
  assert.equal(chooseCanonicalDocumentModels(data).modelId,"");
});

test("modelsiz HKN PDF'de yalnız belgede açık yazılı model adına göre bağlanır",()=>{
  const m=chooseCanonicalDocumentModels({models:[{id:"x",model_name:"MODEL X",company_id:"taha"}],
    lines:[{description:"BASKI HİZMETİ"}],companyId:"taha",
    documentNo:"HKN2026000000946",fileName:"HKN2026000000946.pdf",explicitModelName:"MODEL X"});
  assert.equal(m.modelId,"x");
});

test("invoice may contain multiple model lines; keep independent line IDs",()=>{
  const rows=chooseCanonicalDocumentModels({models:[{id:"a",model_name:"MODEL A"},{id:"b",model_name:"MODEL B"}],
    lines:[{description:"MODEL A"},{description:"MODEL B"}]});
  assert.equal(rows.multipleModels,true);
  assert.equal(rows.modelId,"");
  assert.deepEqual(rows.models.map(x=>x.id),["a","b"]);
});

test("packaged chemical quantity keeps invoice packages; derived kg shown separately",()=>{
  assert.deepEqual(packageWeightFromItem("S 20 WHITE ( 40 Kg) ZDHC Level 3",2,"C62"),
    {packageWeightKg:40,packageCount:2,calculatedKg:80,requiresStockUnitReview:true});
  assert.equal(packageWeightFromItem("BASİT ÜRÜN",2,"C62").calculatedKg,0);
});

test("dispatch is billing authority, not production quantity",()=>{
  const a=dispatchInvoiceQuantity(3500,2000,3550);
  assert.equal(a.remaining,1500);assert.equal(a.productionDifference,50);
  assert.equal(a.status,"PARTIAL");
  const b=dispatchInvoiceQuantity(3500,3600,3490);
  assert.equal(b.overInvoiced,100);assert.equal(b.status,"EXTRA_DISPATCH_REQUIRED");
  assert.equal(dispatchInvoiceQuantity(3500,3500,1000).remaining,0);
});

test("UBL incoming chemical: LOT, quantity, address and supplier contact extracted",()=>{
  const xml=`<?xml version="1.0" encoding="utf-8"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:ID>SLV2026000000001</cbc:ID><cbc:IssueDate>2026-11-01</cbc:IssueDate>
<cac:AccountingSupplierParty><cac:Party>
<cac:PartyIdentification><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:PartyIdentification>
<cac:PartyName><cbc:Name>TEST KİMYA LTD</cbc:Name></cac:PartyName>
<cac:PostalAddress><cbc:StreetName>ÖRNEK CADDE</cbc:StreetName><cbc:CityName>İSTANBUL</cbc:CityName></cac:PostalAddress>
<cac:Contact><cbc:Telephone>02120000000</cbc:Telephone><cbc:ElectronicMail>test@example.invalid</cbc:ElectronicMail></cac:Contact>
</cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>ALICI</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">2</cbc:InvoicedQuantity><cac:Item><cbc:Name>S 20 WHITE (40 Kg)</cbc:Name><cac:ItemInstance><cac:LotIdentification><cbc:LotNumberID>LOT123</cbc:LotNumberID></cac:LotIdentification></cac:ItemInstance></cac:Item></cac:InvoiceLine>
</Invoice>`;
  const result=parseCanonicalEBelgeUbl(xml,"INCOMING");
  assert.equal(result.lines[0].lotNo,"LOT123");
  assert.equal(result.lines[0].quantity,2);
  assert.equal(result.lines[0].calculatedKg,80);
  assert.equal(result.rawMetadata.supplierDetails.phone,"02120000000");
  assert.match(result.rawMetadata.supplierDetails.address,/ÖRNEK CADDE/);
});
