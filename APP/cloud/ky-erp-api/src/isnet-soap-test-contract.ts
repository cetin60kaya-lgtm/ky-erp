// Official PDFs supplied 2026-11-25; exact operation casing still subject to WSDL.
// No credentials, live URL or production transport.
export const SOAP_TEST_HOST="einvoiceservicetest.isnet.net.tr";
export const SOAP_TEST_ENDPOINTS=Object.freeze({InvoiceService:"https://einvoiceservicetest.isnet.net.tr/InvoiceService/ServiceContract/InvoiceService.svc",AddressBookService:"https://einvoiceservicetest.isnet.net.tr/AddressBookService/ServiceContract/AddressBookService.svc"});
export const SOAP_DOCUMENTED_OPERATIONS={
  "invoice": {
    "service": "InvoiceService",
    "read": [
      "SearchInvoice",
      "SearchAllInvoice",
      "SearchExternalInvoice",
      "GetDocumentViewerLink"
    ],
    "write": [
      "SendInvoice",
      "SendInvoiceXml",
      "SendInvoiceXmlWithoutInvoiceNumber",
      "SendInvoiceReply",
      "UpdateInvoiceState",
      "DirectInvoice",
      "ArchiveInvoice",
      "DeArchiveInvoice"
    ]
  },
  "despatch": {
    "service": "InvoiceService",
    "read": [
      "SearchDespatchAdvice",
      "SearchReceiptAdvice"
    ],
    "write": [
      "SendDespatchAdvice",
      "SendDespatchAdviceXML",
      "SendDespatchAdviceXmlWithoutDespatchAdviceNumber",
      "SendReceiptAdvice",
      "SendReceiptAdviceXML",
      "SendReceiptAdviceXmlWithoutReceiptAdviceNumber"
    ]
  },
  "archive": {
    "service": null,
    "read": [
      "SearchArchiveInvoice",
      "SearchArchiveInvoiceReport",
      "GetDocumentViewerLink"
    ],
    "write": [
      "SendArchiveInvoice",
      "SendArchiveInvoiceXml",
      "SendArchiveInvoiceXmlWithoutInvoiceNumber",
      "CancelArchiveInvoice",
      "SendArchiveInvoiceReport",
      "SendArchiveInvoiceMail"
    ]
  },
  "address": {
    "service": "AddressBookService",
    "read": [
      "GetAddressBook",
      "GetTaxPayer",
      "GetDespatchTaxPayer",
      "GetReceiverInboxTags",
      "GetSenderUnitTags",
      "GetTaxOfficeList",
      "GetCityList",
      "GetTownList",
      "GetAllBySearchTaxOfficeNameAndCityCode"
    ],
    "write": [
      "SaveAddressBookEntry",
      "DeleteAddressBookEntry"
    ]
  },
  "product": {
    "service": null,
    "read": [
      "GetProduct"
    ],
    "write": [
      "SaveProduct",
      "DeleteProduct"
    ]
  },
  "company": {
    "service": null,
    "read": [
      "GetCompanyBalance",
      "GetCompanyVendor"
    ],
    "write": []
  },
  "esmm": {
    "service": null,
    "read": [
      "SearchESMM"
    ],
    "write": [
      "SendESMM",
      "SendESMMXml",
      "CancelESMM"
    ]
  },
  "currency": {
    "service": null,
    "read": [],
    "write": [
      "SendCurrencyInvoice"
    ]
  },
  "emm": {
    "service": null,
    "read": [],
    "write": []
  }
} as const;
export function soapResultState(result:unknown,detail?:string){if(result!=="Success"&&result!==0&&result!=="0")return "NOT_ACCEPTED";return detail==="COMPLETED_VERIFIED"?"COMPLETED":"RECEIVED_NOT_FINAL";}
