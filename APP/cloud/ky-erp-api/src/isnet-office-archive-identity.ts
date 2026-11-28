// Strict original identity: no synthetic XML, no guessed sender or direction.
import {parseSoapXml} from "./isnet-soap-read.ts";
import {verifyIsnetDownloadedFile} from "./isnet-file-validation.ts";
import type {Source} from "./isnet-office-read-jobs.ts";
export const OFFICE_ARCHIVE_MAX_BYTES=8*1024*1024;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const U="urn:oasis:names:specification:ubl:schema:xsd:",B=U+"CommonBasicComponents-2",A=U+"CommonAggregateComponents-2";
type N={local:string;uri:string;text:string;attrs:Record<string,string>;children:N[]};
const one=(n:N,uri:string,local:string)=>{const a=n.children.filter(x=>x.uri===uri&&x.local===local);if(a.length!==1)throw Error("UBL_IDENTITY_INVALID");return a[0]!};
const scalar=(n:N)=>{if(n.children.length)throw Error("UBL_IDENTITY_INVALID");return n.text.trim()};
export function validateOfficeArchiveXml(bytes:ArrayBuffer,entry:{source:Source;ettn:string},tax:string,from:string,to:string){
 if(bytes.byteLength<20||bytes.byteLength>OFFICE_ARCHIVE_MAX_BYTES||!UUID.test(entry.ettn)||!/^\d{10,11}$/.test(tax))throw Error("UBL_IDENTITY_INVALID");
 verifyIsnetDownloadedFile("xml",bytes,"application/xml");
 const root:N=parseSoapXml(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),dispatch=entry.source.startsWith("DISPATCH"),name=dispatch?"DespatchAdvice":"Invoice";
 if(root.local!==name||root.uri!==U+name+"-2")throw Error("UBL_KIND_MISMATCH");
 const ettn=scalar(one(root,B,"UUID")).toLowerCase(),no=scalar(one(root,B,"ID")),date=scalar(one(root,B,"IssueDate"));
 if(ettn!==entry.ettn||!/^[A-Z0-9]{3}[0-9]{13}$/.test(no)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<from||date>to||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)throw Error("UBL_IDENTITY_INVALID");
 const incoming=entry.source.endsWith("_IN"),partyName=dispatch?(incoming?"DeliveryCustomerParty":"DespatchSupplierParty"):(incoming?"AccountingCustomerParty":"AccountingSupplierParty");
 const p=one(one(root,A,partyName),A,"Party");
 const ids=p.children.filter(x=>x.uri===A&&x.local==="PartyIdentification").flatMap(x=>x.children.filter(y=>y.uri===B&&y.local==="ID"&&["VKN","TCKN"].includes(y.attrs.schemeID)));
 if(ids.length!==1||scalar(ids[0]!)!==tax)throw Error("UBL_TENANT_MISMATCH");
 return {no,date,ettn,direction:incoming?"INCOMING":"OUTGOING"};
}
