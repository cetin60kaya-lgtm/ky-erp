import test from "node:test";
import assert from "node:assert/strict";
import { parseCanonicalEBelgeUbl } from "./e-belge-ubl.ts";

const invoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-2026-0001</cbc:ID>
  <cbc:UUID>11111111-2222-3333-4444-555555555555</cbc:UUID>
  <cbc:IssueDate>2026-09-06</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>1234567890</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Tedarikçi A</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>9876543210</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Müşteri B</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:DespatchDocumentReference><cbc:ID>IRS-100</cbc:ID></cac:DespatchDocumentReference>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">12</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="TRY">1200.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Ürün X</cbc:Name><cac:SellersItemIdentification><cbc:ID>TX-1</cbc:ID></cac:SellersItemIdentification></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="TRY">100.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:TaxTotal><cbc:TaxAmount currencyID="TRY">240.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="TRY">1200.00</cbc:TaxExclusiveAmount><cbc:PayableAmount currencyID="TRY">1440.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
</Invoice>`;

test("provider UBL parser maps incoming invoice to supplier", () => {
  const parsed = parseCanonicalEBelgeUbl(invoiceXml, "incoming");
  assert.equal(parsed.direction, "INCOMING");
  assert.equal(parsed.documentType, "GELEN_FATURA");
  assert.equal(parsed.documentNo, "INV-2026-0001");
  assert.equal(parsed.partyName, "Tedarikçi A");
  assert.equal(parsed.partyTaxNo, "1234567890");
  assert.equal(parsed.lines.length, 1);
  assert.equal(parsed.lines[0].quantity, 12);
  assert.deepEqual(parsed.rawMetadata.dispatchReferences, ["IRS-100"]);
});

test("provider UBL parser maps outgoing invoice to customer", () => {
  const parsed = parseCanonicalEBelgeUbl(invoiceXml, "outgoing");
  assert.equal(parsed.direction, "OUTGOING");
  assert.equal(parsed.documentType, "GIDEN_FATURA");
  assert.equal(parsed.partyName, "Müşteri B");
  assert.equal(parsed.partyTaxNo, "9876543210");
});


const dispatchXml = `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>IRS-2026-0099</cbc:ID>
  <cbc:UUID>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</cbc:UUID>
  <cbc:IssueDate>2026-09-06</cbc:IssueDate>
  <cac:DespatchSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>1234567890</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Kimya Tedarikçisi</cbc:Name></cac:PartyName></cac:Party></cac:DespatchSupplierParty>
  <cac:DeliveryCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>9876543210</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Alıcı Firma</cbc:Name></cac:PartyName></cac:Party></cac:DeliveryCustomerParty>
  <cac:DespatchLine>
    <cbc:ID>1</cbc:ID>
    <cbc:DeliveredQuantity unitCode="KGM">25</cbc:DeliveredQuantity>
    <cac:Item>
      <cbc:Name>White Pigment</cbc:Name>
      <cac:SellersItemIdentification><cbc:ID>WP-25</cbc:ID></cac:SellersItemIdentification>
      <cac:AdditionalItemProperty><cbc:Name>LOT NO</cbc:Name><cbc:Value>LOT-260906-A</cbc:Value></cac:AdditionalItemProperty>
    </cac:Item>
  </cac:DespatchLine>
</DespatchAdvice>`;

test("UBL irsaliye kalemi LOT bilgisini ayırır", () => {
  const parsed = parseCanonicalEBelgeUbl(dispatchXml, "incoming");
  assert.equal(parsed.documentType, "GELEN_IRSALIYE");
  assert.equal(parsed.partyName, "Kimya Tedarikçisi");
  assert.equal(parsed.lines.length, 1);
  assert.equal(parsed.lines[0].supplierProductCode, "WP-25");
  assert.equal(parsed.lines[0].quantity, 25);
  assert.equal(parsed.lines[0].unitCode, "KGM");
  assert.equal(parsed.lines[0].lotNo, "LOT-260906-A");
});
