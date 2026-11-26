// TEST-only document identity check. This is not a replacement for real GIB validation,
// provider tag lookup, authorization or the persistent send claim.
import {parseSoapXml} from "./isnet-soap-read.ts";
const U="urn:oasis:names:specification:ubl:schema:xsd:",B=U+"CommonBasicComponents-2",A=U+"CommonAggregateComponents-2";
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const TEST_HASHES=new Set(["f3306c3496174ee9c78d01e972aea1eb980899e5aa846f8b8124b40e25aea7a8","3a306629b054cc57550db3937e31b0c42c0a287a4a68e3c2c04230070496de2b"]);
export function isIsnetTestCompanyHash(hash:string){return TEST_HASHES.has(hash);}
type Node={uri:string;local:string;text:string;attrs:Record<string,string>;children:Node[]};
type Kind="E_FATURA"|"E_IRSALIYE";
type Evidence={tenant:string;environment:"TEST";kind:Kind;senderHash:string;receiverHash:string;receiverTag:string;verifiedAt:string;providerVerified:true};
const one=(node:Node,uri:string,local:string)=>{const matches=node.children.filter(x=>x.uri===uri&&x.local===local);if(matches.length!==1)throw Error("TEST_UBL_IDENTITY_FIELD");return matches[0];};
const scalar=(node:Node)=>{if(node.children.length)throw Error("TEST_UBL_IDENTITY_FIELD");return node.text.trim();};
const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))),n=>n.toString(16).padStart(2,"0")).join("");
async function partyHash(root:Node,name:string){
 const party=one(one(root,A,name),A,"Party");
 const ids=party.children.filter(x=>x.uri===A&&x.local==="PartyIdentification").flatMap(x=>x.children.filter(id=>id.uri===B&&id.local==="ID"&&id.attrs.schemeID==="VKN"));
 if(ids.length!==1)throw Error("TEST_UBL_PARTY_IDENTITY");
 const id=scalar(ids[0]);if(!/^\d{10}$/.test(id))throw Error("TEST_UBL_PARTY_IDENTITY");
 return hash(id);
}
/** Pure identity extraction; provider authorization remains a separate server-owned gate. */
export async function readTestUblIdentity(bytes:Uint8Array,kind:Kind,expectedEttn:string){
 if(!UUID.test(expectedEttn)||!["E_FATURA","E_IRSALIYE"].includes(kind)||bytes.byteLength>10000000)throw Error("TEST_UBL_IDENTITY_INVALID");
 const xml=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 if(/urn:kyerp:qa:never-send|UNSIGNED_TEST_ONLY|NOT FOR SENDING|GONDERILMEYECEK/i.test(xml))throw Error("TEST_UBL_FIXTURE_NOT_SENDABLE");
 const inv=kind==="E_FATURA",name=inv?"Invoice":"DespatchAdvice",root:Node=parseSoapXml(xml);
 if(root.local!==name||root.uri!==U+name+"-2")throw Error("TEST_UBL_KIND_MISMATCH");
 const ettn=scalar(one(root,B,"UUID")),documentNo=scalar(one(root,B,"ID"));
 if(ettn.toLowerCase()!==expectedEttn.toLowerCase()||!UUID.test(ettn)||!/^[A-Z0-9]{3}[0-9]{13}$/.test(documentNo))throw Error("TEST_UBL_DOCUMENT_IDENTITY");
 const senderHash=await partyHash(root,inv?"AccountingSupplierParty":"DespatchSupplierParty");
 const receiverHash=await partyHash(root,inv?"AccountingCustomerParty":"DeliveryCustomerParty");
 return {ettn,documentNo,senderHash,receiverHash};
}
export async function requireVerifiedTestUblIdentity(input:{bytes:Uint8Array;kind:Kind;tenant:string;ettn:string;senderHash:string;receiverTag:string;evidence:Evidence;now:number}){
 const actual=await readTestUblIdentity(input.bytes,input.kind,input.ettn),e=input.evidence;
 if(!isIsnetTestCompanyHash(actual.senderHash)||!isIsnetTestCompanyHash(actual.receiverHash)||actual.senderHash===actual.receiverHash||!HASH.test(input.senderHash)||input.senderHash!==actual.senderHash)throw Error("TEST_UBL_COMPANY_NOT_ALLOWED");
 const age=input.now-Date.parse(e?.verifiedAt||"");
 if(!e||e.providerVerified!==true||e.environment!=="TEST"||e.kind!==input.kind||e.tenant!==input.tenant||e.senderHash!==actual.senderHash||e.receiverHash!==actual.receiverHash||e.receiverTag!==input.receiverTag||!/^urn:mail:[^\s<>]{1,490}$/i.test(e.receiverTag)||!Number.isFinite(age)||age<0||age>15*60000)throw Error("TEST_UBL_TAG_EVIDENCE_REQUIRED");
 return actual;
}
