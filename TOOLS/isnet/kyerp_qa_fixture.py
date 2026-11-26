"""Synthetic non-sendable KYERP XML fixtures, no real company data."""
from pathlib import Path
from decimal import Decimal
from lxml import etree as E
from uuid import uuid4
from zipfile import ZipFile
import json
import validate_gib_xml as v
BASE='urn:oasis:names:specification:ubl:schema:xsd:'
B=BASE+'CommonBasicComponents-2'
A=BASE+'CommonAggregateComponents-2'
def c(p,n,val=None,**attrs):
    t=E.SubElement(p,'{'+B+'}'+n,**attrs)
    if val is not None:t.text=str(val)
    return t
def a(p,n):return E.SubElement(p,'{'+A+'}'+n)
def address(p):
    for n,val in [('StreetName','TEST Sokak'),('BuildingNumber','1'),('CitySubdivisionName','Merkez'),('CityName','Istanbul'),('PostalZone','34000')]:c(p,n,val)
    c(a(p,'Country'),'Name','Türkiye')
def party(p,n,vkn,label):
    t=a(a(p,n),'Party')
    c(a(t,'PartyIdentification'),'ID',vkn,schemeID='VKN')
    c(a(t,'PartyName'),'Name',label)
    address(a(t,'PostalAddress'))
    c(a(a(t,'PartyTaxScheme'),'TaxScheme'),'Name','TEST')
def money(p,n,val):c(p,n,format(Decimal(val),'.2f'),currencyID='TRY')
def tax(p,rows):
    t=a(p,'TaxTotal')
    money(t,'TaxAmount',sum(Decimal(net)*rate/100 for net,rate in rows))
    for net,rate in rows:
        sub=a(t,'TaxSubtotal')
        money(sub,'TaxableAmount',net)
        money(sub,'TaxAmount',Decimal(net)*rate/100)
        c(sub,'Percent',rate)
        cat=a(sub,'TaxCategory')
        if rate==0:
            c(cat,'TaxExemptionReasonCode','351')
            c(cat,'TaxExemptionReason','Ürünler elden bedelsiz teslim edilmiştir.')
        ts=a(cat,'TaxScheme')
        c(ts,'Name','KDV')
        c(ts,'TaxTypeCode','0015')
def build(kind):
    inv=kind=='Invoice'
    r=E.Element('{'+BASE+kind+'-2}'+kind,nsmap={None:BASE+kind+'-2','cbc':B,'cac':A})
    ext=BASE+'CommonExtensionComponents-2'
    e=E.SubElement(E.SubElement(E.SubElement(r,'{'+ext+'}UBLExtensions'),'{'+ext+'}UBLExtension'),'{'+ext+'}ExtensionContent')
    E.SubElement(e,'{urn:kyerp:qa:never-send}UnsignedFixture').text='NOT FOR SENDING'
    fields=[('UBLVersionID','2.1'),('CustomizationID','TR1.2.1'),('ProfileID','TICARIFATURA' if inv else 'TEMELIRSALIYE'),('ID','TST2026000000001' if inv else 'TST2026000000002'),('CopyIndicator','false'),('UUID',str(uuid4())),('IssueDate','2026-11-26'),('IssueTime','10:00:00'),('InvoiceTypeCode' if inv else 'DespatchAdviceTypeCode','SATIS' if inv else 'SEVK'),('Note','KYERP sentetik QA; GONDERILMEYECEK')]
    for n,val in fields:c(r,n,val)
    lines=[('TEST Emprime baskı',100,10,20),('TEST Numune',10,0,0),('TEST Kumaş sakatı',5,0,0),('TEST Baskı sakatı',5,0,0)] if inv else [('TEST Emprime baskı',5000,0,0)]
    if inv:
        c(r,'DocumentCurrencyCode','TRY')
        c(r,'LineCountNumeric',len(lines))
    sig=a(r,'Signature')
    c(sig,'ID','0000000000',schemeID='VKN_TCKN')
    sp=a(sig,'SignatoryParty')
    c(a(sp,'PartyIdentification'),'ID','0000000000',schemeID='VKN')
    address(a(sp,'PostalAddress'))
    c(a(a(sig,'DigitalSignatureAttachment'),'ExternalReference'),'URI','#UNSIGNED_TEST_ONLY')
    party(r,'AccountingSupplierParty' if inv else 'DespatchSupplierParty','0000000000','TEST Tedarikçi')
    party(r,'AccountingCustomerParty' if inv else 'DeliveryCustomerParty','1111111111','TEST Alıcı')
    if inv:
        tax(r,[(1000,20),(0,0)])
        t=a(r,'LegalMonetaryTotal')
        for n,val in [('LineExtensionAmount',1000),('TaxExclusiveAmount',1000),('TaxInclusiveAmount',1200),('PayableAmount',1200)]:money(t,n,val)
    else:
        sh=a(r,'Shipment')
        c(sh,'ID','1')
        st=a(sh,'ShipmentStage')
        m=a(a(st,'TransportMeans'),'RoadTransport')
        c(m,'LicensePlateID','34TEST001',schemeID='PLAKA')
        driver=a(st,'DriverPerson')
        c(driver,'FirstName','TEST')
        c(driver,'FamilyName','Sürücü')
        c(driver,'NationalityID','00000000000')
        delivery=a(sh,'Delivery')
        address(a(delivery,'DeliveryAddress'))
        disp=a(delivery,'Despatch')
        c(disp,'ActualDespatchDate','2026-11-26')
        c(disp,'ActualDespatchTime','10:01:00')
    for i,(name,qty,price,rate) in enumerate(lines,1):
        l=a(r,'InvoiceLine' if inv else 'DespatchLine')
        c(l,'ID',i)
        c(l,'InvoicedQuantity' if inv else 'DeliveredQuantity',qty,unitCode='C62')
        if inv:
            money(l,'LineExtensionAmount',qty*price)
            tax(l,[(qty*price,rate)])
        else:c(a(l,'OrderLineReference'),'LineID',i)
        c(a(l,'Item'),'Name',name)
        if inv:money(a(l,'Price'),'PriceAmount',price)
    return E.tostring(r,encoding='UTF-8',xml_declaration=True)
if __name__=='__main__':
    p=Path(__file__).parent
    u=p/'UBL-TR1.2.1_Paketi.zip';g=p/'e-FaturaPaketi.zip'
    for kind in ['Invoice','DespatchAdvice']:
        xml=build(kind)
        (p/('QA-'+kind+'.xml')).write_bytes(xml)
        res=v.validate(xml,u,g,p/'iso')
        print(kind,json.dumps(res),flush=True)
        assert res['localValidationPassed'], kind
        if kind=='Invoice':
            broken=E.fromstring(xml)
            for t in broken.findall('.//{'+B+'}TaxExemptionReasonCode')+broken.findall('.//{'+B+'}TaxExemptionReason'):
                t.getparent().remove(t)
            bad=v.validate(E.tostring(broken),u,g,p/'iso')
            print('NEGATIVE_EXEMPTION',json.dumps(bad),flush=True)
            assert not bad['localValidationPassed'] and bad['schemaVerified']
        else:
            broken=E.fromstring(xml)
            for t in broken.findall('.//{'+A+'}DriverPerson'):
                t.getparent().remove(t)
            bad=v.validate(E.tostring(broken),u,g,p/'iso')
            print('NEGATIVE_DRIVER',json.dumps(bad),flush=True)
            assert not bad['localValidationPassed']
    with ZipFile(u) as z:
        xml=z.read('UBLTR_1.2.1_Paketi/xml/TicariFaturaOrnegi.xml')
    doc=E.fromstring(xml)
    doc.find('{'+B+'}ID').text='INVALID'
    bad=v.validate(E.tostring(doc),u,g,p/'iso')
    good=v.validate(xml,u,g,p/'iso')
    print('NEGATIVE_ID',json.dumps(bad),flush=True)
    print('POSITIVE_SAMPLE',json.dumps(good),flush=True)
    assert bad['schemaVerified'] and not bad['localValidationPassed']
    assert good['localValidationPassed']
    print('QA_ASSERTIONS_PASS',flush=True)
