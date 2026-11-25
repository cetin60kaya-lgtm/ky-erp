// Read-only İşNet TEST SOAP adapter; derive document/literal binding from the
// provider's inline WSDL. No production endpoint, password, or sending methods.
// @ts-nocheck
import {SOAP_TEST_ENDPOINTS} from "./isnet-soap-test-contract.ts";
const W="http://schemas.xmlsoap.org/wsdl/",X="http://www.w3.org/2001/XMLSchema",S11="http://schemas.xmlsoap.org/wsdl/soap/",S12="http://schemas.xmlsoap.org/wsdl/soap12/",E11="http://schemas.xmlsoap.org/soap/envelope/",E12="http://www.w3.org/2003/05/soap-envelope";
const fail=code=>{throw Object.assign(Error(code),{code})};
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
function unescape(s){return s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g,m=>{const named={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"};if(named[m])return named[m];const n=m.startsWith("&#x")?parseInt(m.slice(3,-1),16):Number(m.slice(2,-1));if(!Number.isInteger(n)||n<1||n>0x10ffff)fail("XML_ENTITY");return String.fromCodePoint(n);});}
export function parseSoapXml(xml){
 if(typeof xml!=="string"||xml.length>12000000||/<!DOCTYPE|<!ENTITY/i.test(xml))fail("XML_LIMIT");
 const doc={children:[],ns:{xml:"http://www.w3.org/XML/1998/namespace"},text:""},stack=[doc];
 const token=/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/[A-Za-z_][\w.:-]*\s*>|<[A-Za-z_][\w.:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>|[^<]+/gy;
 let pos=xml.charCodeAt(0)===0xfeff?1:0,count=0;
 while(pos<xml.length){token.lastIndex=pos;const m=token.exec(xml);if(!m)fail("XML_SYNTAX");pos=token.lastIndex;const t=m[0],parent=stack.at(-1);
  if(t.startsWith("<!--")||t.startsWith("<?"))continue;
  if(t.startsWith("<![CDATA[")){parent.text+=t.slice(9,-3);continue;}
  if(t.startsWith("</")){if(stack.length===1||parent.raw!==t.slice(2,-1).trim())fail("XML_CLOSE");stack.pop();continue;}
  if(!t.startsWith("<")){parent.text+=unescape(t);continue;}
  if(++count>120000||stack.length>80)fail("XML_LIMIT");
  const tag=t.match(/^<([A-Za-z_][\w.:-]*)/),raw=tag[1],tail=t.slice(tag[0].length,t.endsWith("/>")?-2:-1),attrs={},ns={...parent.ns};
  const ar=/\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gy;let at=0;
  while(at<tail.length){if(!tail.slice(at).trim())break;ar.lastIndex=at;const a=ar.exec(tail);if(!a||Object.hasOwn(attrs,a[1]))fail("XML_ATTR");at=ar.lastIndex;attrs[a[1]]=unescape(a[2]??a[3]);if(a[1]==="xmlns")ns[""]=attrs[a[1]];else if(a[1].startsWith("xmlns:"))ns[a[1].slice(6)]=attrs[a[1]];}
  const parts=raw.split(":");if(parts.length>2||(parts.length===2&&!ns[parts[0]]))fail("XML_NAMESPACE");
  const node={raw,local:parts.at(-1),uri:ns[parts.length===2?parts[0]:""]||"",attrs,ns,text:"",children:[]};parent.children.push(node);if(!t.endsWith("/>"))stack.push(node);
 }
 if(stack.length!==1||doc.children.length!==1||doc.text.trim())fail("XML_ROOT");return doc.children[0];
}
const children=(n,uri,local)=>n?.children.filter(c=>c.uri===uri&&c.local===local)||[];
const one=(xs)=>{if(xs.length!==1)fail("WSDL_AMBIGUOUS");return xs[0]};
const qname=(n,q)=>{const p=String(q||"").split(":");if(!q||p.length>2||p.length===2&&!n.ns[p[0]])fail("WSDL_QNAME");return{local:p.at(-1),uri:n.ns[p.length===2?p[0]:""]||""}};
const scalar=(n,k)=>{const x=n?.children.filter(c=>c.local===k)||[];if(x.length>1)fail("SOAP_AMBIGUOUS");return x[0]?.text.trim()||""};
const pick=(n,k)=>{const x=n?.children.filter(c=>c.local===k)||[];if(x.length!==1)fail("SOAP_FIELD_MISSING");return x[0]};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const opInfo=kind=>kind==="INVOICE"?{op:"SearchInvoice",direction:"InvoiceDirection",min:"MinInvoiceDate",max:"MaxInvoiceDate",detail:"IsInvoiceDetailIncluded",list:"Invoices",number:"InvoiceNumber",date:"InvoiceDate",xml:"InvoiceXml",pdf:"InvoicePdf"}:kind==="DISPATCH"?{op:"SearchDespatchAdvice",direction:"DespatchAdviceDirection",min:"MinDespatchAdviceDate",max:"MaxDespatchAdviceDate",detail:"IsDespatchAdviceDetailIncluded",list:"DespatchAdvices",number:"DespatchAdviceNumber",date:"DespatchAdviceDate",xml:"DespatchAdviceXml",pdf:"DespatchAdvicePdf"}:fail("KIND_INVALID");
export function validateReadQuery(q){
 const info=opInfo(q.kind);if(!["INCOMING","OUTGOING"].includes(q.direction))fail("DIRECTION_INVALID");
 if(!/^\d{10}$/.test(q.companyTaxCode))fail("TEST_COMPANY_REQUIRED");
 const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))fail("DATE_INVALID");const n=Date.parse(v+"T00:00:00Z");if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==v)fail("DATE_INVALID");return n};
 const span=date(q.to)-date(q.from);if(span<0||span>30*86400000)fail("DATE_RANGE_MAX_31_DAYS");
 const page=Number(q.page??1);if(!Number.isInteger(page)||page<1||page>10000)fail("PAGE_INVALID");
 const ettn=String(q.ettn||"");if(ettn&&!uuid.test(ettn))fail("ETTN_INVALID");if(!["","XML","PDF"].includes(q.file||"")||q.file&&!ettn)fail("FILE_REQUIRES_ETTN");
 return {info,page,ettn};
}
export function buildReadRequest(wsdl,q){
 const {info,page,ettn}=validateReadQuery(q),root=parseSoapXml(wsdl);if(root.uri!==W||root.local!=="definitions")fail("NOT_WSDL");
 const endpoint=SOAP_TEST_ENDPOINTS.InvoiceService,tns=root.attrs.targetNamespace;
 const services=children(root,W,"service"),ports=services.flatMap(s=>children(s,W,"port"));
 const candidates=ports.flatMap(port=>[S11,S12].flatMap(s=>children(port,s,"address").filter(a=>a.attrs.location===endpoint).map(()=>({port,s}))));
 // Prefer a single SOAP 1.1 document/literal port; reject ambiguous contracts.
 const preferred=candidates.filter(v=>v.s===S11),{port,s}=one(preferred.length?preferred:candidates);
 const bq=qname(port,port.attrs.binding);if(bq.uri!==tns)fail("WSDL_EXTERNAL_BINDING");
 const binding=one(children(root,W,"binding").filter(n=>n.attrs.name===bq.local)),sb=one(children(binding,s,"binding"));
 if(sb.attrs.style&&sb.attrs.style!=="document")fail("WSDL_STYLE");
 const bo=one(children(binding,W,"operation").filter(n=>n.attrs.name===info.op)),action=one(children(bo,s,"operation")).attrs.soapAction;
 if(!/^https?:\/\/[^\s"<>]+$/.test(action||""))fail("WSDL_ACTION");
 const body=one(children(one(children(bo,W,"input")),s,"body"));if(body.attrs.use!=="literal")fail("WSDL_NOT_LITERAL");
 // A binding requiring headers / WS-Addressing needs an explicitly reviewed adapter.
 if(children(one(children(bo,W,"input")),s,"header").length||binding.children.some(n=>/Policy|Addressing/.test(n.local)))fail("WSDL_POLICY_UNSUPPORTED");
 const pq=qname(binding,binding.attrs.type);if(pq.uri!==tns)fail("WSDL_EXTERNAL_PORTTYPE");
 const pt=one(children(root,W,"portType").filter(n=>n.attrs.name===pq.local)),po=one(children(pt,W,"operation").filter(n=>n.attrs.name===info.op));
 const messageQ=dir=>{const qn=qname(one(children(po,W,dir)),one(children(po,W,dir)).attrs.message);if(qn.uri!==tns)fail("WSDL_EXTERNAL_MESSAGE");const msg=one(children(root,W,"message").filter(n=>n.attrs.name===qn.local));const part=one(children(msg,W,"part"));return qname(part,part.attrs.element)};
 const schemas=children(root,W,"types").flatMap(n=>children(n,X,"schema"));
 const lookup=(q,kind)=>{const hits=schemas.filter(s=>s.attrs.targetNamespace===q.uri).flatMap(s=>children(s,X,kind).filter(e=>e.attrs.name===q.local).map(n=>({n,s})));return one(hits)};
 const typeOf=(n,s)=>{const inline=children(n,X,"complexType");return inline.length?{n:one(inline),s}:lookup(qname(n,n.attrs.type),"complexType")};
 const typeFields=(ty,depth=0)=>{if(depth>8)fail("WSDL_INHERITANCE_LIMIT");let parent=[],container=ty.n;const complex=children(ty.n,X,"complexContent");if(complex.length){const ext=one(children(one(complex),X,"extension")),base=lookup(qname(ext,ext.attrs.base),"complexType");parent=typeFields(base,depth+1);container=ext;}const sequences=children(container,X,"sequence");const own=sequences.length?children(one(sequences),X,"element").map(e=>({n:e,s:ty.s,local:e.attrs.name,uri:e.attrs.form==="qualified"||e.attrs.form!=="unqualified"&&ty.s.attrs.elementFormDefault==="qualified"?ty.s.attrs.targetNamespace||"":"",required:e.attrs.minOccurs!=="0"})):[];if(container.children.some(n=>n.uri===X&&["choice","all","group"].includes(n.local)))fail("WSDL_SCHEMA_UNSUPPORTED");const combined=[...parent,...own];if(combined.some(x=>!x.local)||new Set(combined.map(x=>x.local)).size!==combined.length)fail("WSDL_FIELD_AMBIGUOUS");return combined;};
 const fields=(n,s)=>typeFields(typeOf(n,s));
 const wrap=messageQ("input"),out=messageQ("output"),global=lookup(wrap,"element");
 const req=one(fields(global.n,global.s));if(!req.local)fail("WSDL_REQUEST");
 const vals={CompanyTaxCode:q.companyTaxCode,[info.direction]:q.direction==="INCOMING"?"Incoming":"Outgoing",[info.min]:q.from+"T00:00:00",[info.max]:q.to+"T23:59:59",ResultSet:{[info.detail]:Boolean(ettn),IsXMLIncluded:q.file==="XML",IsPDFIncluded:q.file==="PDF",IsArchiveIncluded:false,IsAttachmentIncluded:false,IsHtmlIncluded:false,...(q.kind==="INVOICE"?{IsAdditionalTaxIncluded:false,IsExternalUrlIncluded:false}:{})},PagingRequest:{PageNumber:page,RecordsPerPage:ettn?1:20},...(ettn?{Ettn:ettn}:{})};
 const emit=(local,uri,inner)=>{if(!/^[A-Za-z_][\w.-]*$/.test(local||""))fail("WSDL_FIELD");return "<"+local+' xmlns="'+esc(uri)+'">'+inner+"</"+local+">"};
 function encode(fs,values){for(const key of Object.keys(values))if(!fs.some(f=>f.local===key))fail("WSDL_FIELD_UNSUPPORTED:"+key);return fs.map(f=>{if(!Object.hasOwn(values,f.local)){if(f.required)fail("WSDL_REQUIRED_FIELD:"+f.local);return ""}const v=values[f.local];let inner;if(v!==null&&typeof v==="object")inner=encode(fields(f.n,f.s),v);else{if(f.local===info.direction){const t=qname(f.n,f.n.attrs.type);if(t.uri===X&&["int","integer"].includes(t.local))inner=v==="Incoming"?"1":"2";else{const en=lookup(t,"simpleType");const allowed=children(one(children(en.n,X,"restriction")),X,"enumeration").map(x=>x.attrs.value);if(!allowed.includes(v))fail("WSDL_DIRECTION_ENUM");inner=esc(v);}}else inner=esc(v);}return emit(f.local,f.uri,inner)}).join("")}
 const payload=emit(wrap.local,wrap.uri,emit(req.local,req.uri,encode(fields(req.n,req.s),vals))),env=s===S11?E11:E12;
 return{endpoint,out,env,headers:s===S11?{"Content-Type":"text/xml; charset=utf-8",SOAPAction:'"'+action+'"'}:{"Content-Type":'application/soap+xml; charset=utf-8; action="'+action+'"'},body:'<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="'+env+'"><s:Body>'+payload+'</s:Body></s:Envelope>'};
}

/** Pinned read-only SOAP 1.1 contract, verified against supplied InvoiceService
 * singleWsdl SHA256 d728e3eea7c05acb1c5ca2db85ec6741e9eff9aa19880d358f02e87a35aca67e
 * and four successful Windows TEST search calls. No WSDL fetch on each request.
 * Do not use for production or send operations. */
export function buildVerifiedTestReadRequest(q){
 const {info,page,ettn}=validateReadQuery(q);
 const ns="http://tempuri.org/",model="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model";
 const field=(name,value)=>"<m:"+name+">"+esc(value)+"</m:"+name+">";
 const flags=q.kind==="INVOICE"?["IsAdditionalTaxIncluded","IsArchiveIncluded","IsAttachmentIncluded","IsExternalUrlIncluded","IsHtmlIncluded","IsInvoiceDetailIncluded","IsPDFIncluded","IsXMLIncluded"]:["IsArchiveIncluded","IsAttachmentIncluded","IsDespatchAdviceDetailIncluded","IsExternalUrlIncluded","IsHtmlIncluded","IsPDFIncluded","IsXMLIncluded"];
 const values={[info.detail]:true,IsXMLIncluded:q.file==="XML",IsPDFIncluded:q.file==="PDF"};
 const fields=field("CompanyTaxCode",q.companyTaxCode)+(q.kind==="INVOICE"&&ettn?field("Ettn",ettn):"")+field(info.direction,q.direction==="INCOMING"?"Incoming":"Outgoing")+(q.kind==="DISPATCH"&&ettn?field("Ettn",ettn):"")+field(info.max,q.to+"T23:59:59")+field(info.min,q.from+"T00:00:00")+"<m:PagingRequest>"+field("PageNumber",page)+field("RecordsPerPage",ettn?1:20)+"</m:PagingRequest><m:ResultSet>"+flags.map(name=>field(name,Boolean(values[name]))).join("")+"</m:ResultSet>";
 return {endpoint:SOAP_TEST_ENDPOINTS.InvoiceService,out:{uri:ns,local:info.op+"Response"},env:E11,headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:'"'+ns+"IInvoiceService/"+info.op+'"'},body:'<s:Envelope xmlns:s="'+E11+'" xmlns:m="'+model+'"><s:Body><'+info.op+' xmlns="'+ns+'"><request>'+fields+'</request></'+info.op+'></s:Body></s:Envelope>'};
}

export function readSearchResponse(xml,request,q){
 const {info,page,ettn}=validateReadQuery(q),root=parseSoapXml(xml);if(root.local!=="Envelope"||root.uri!==request.env)fail("SOAP_ENVELOPE");
 const body=one(children(root,request.env,"Body"));if(body.children.some(n=>n.local==="Fault"))fail("SOAP_FAULT");
 const out=one(children(body,request.out.uri,request.out.local)),result=one(out.children),status=scalar(result,"Result");
 if(!["Success","0"].includes(status))fail("PROVIDER_REJECTED");
 const list=pick(result,info.list),paging=pick(result,"PagingResponse");
 const count=k=>{const v=scalar(paging,k);if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v)))fail("PAGING_INVALID");return Number(v)};
 const pages=count("TotalNumberOfPages"),total=count("TotalNumberOfRecords"),actualPage=count("PageNumber"),perPage=count("RecordsPerPage");if(actualPage!==page||perPage<1||perPage>(ettn?1:20)||list.children.length>perPage||pages!==Math.ceil(total/perPage)||list.children.length>total)fail("PAGING_MISMATCH");
 const seen=new Set(),rows=list.children.map(n=>{const id=scalar(n,"ETTN"),number=scalar(n,info.number);if(!uuid.test(id)||!number||seen.has(id.toLowerCase())||(ettn&&id.toLowerCase()!==ettn.toLowerCase()))fail("DOCUMENT_IDENTITY");seen.add(id.toLowerCase());return{ettn:id,number,date:scalar(n,info.date),status:scalar(n,"Status"),amount:q.kind==="INVOICE"?scalar(n,"TotalPayableAmount"):"",currency:scalar(n,"CurrencyCode")};});
 let file=null;if(q.file){if(rows.length!==1)fail("DOCUMENT_NOT_FOUND");const b64=scalar(list.children[0],q.file==="XML"?info.xml:info.pdf).replace(/\s/g,"");if(!b64||b64.length>10000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)||b64.length%4!==0)fail("FILE_UNAVAILABLE");const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));if(q.file==="PDF"){if(new TextDecoder().decode(bytes.subarray(0,5))!=="%PDF-")fail("PDF_INVALID");}else{const doc=parseSoapXml(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),kind=q.kind==="INVOICE"?"Invoice":"DespatchAdvice";if(doc.local!==kind||doc.uri!=="urn:oasis:names:specification:ubl:schema:xsd:"+kind+"-2"||scalar(doc,"UUID").toLowerCase()!==ettn.toLowerCase())fail("XML_IDENTITY");}file={base64:b64,format:q.file,ettn:rows[0].ettn};}
 return{rows,page,total,pages,perPage,file,environment:"TEST",providerRead:true,officialSent:false};
}
async function boundedText(response,limit){const reader=response.body?.getReader();if(!reader)fail("RESPONSE_EMPTY");let size=0,s="",d=new TextDecoder();try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit){await reader.cancel();fail("RESPONSE_LIMIT")}s+=d.decode(r.value,{stream:true})}return s+d.decode()}finally{reader.releaseLock()}}
export async function searchSoapTest(q,fetcher=fetch){
 const req=buildVerifiedTestReadRequest(q),ep=req.endpoint;
 let response;try{response=await fetcher(ep,{method:"POST",headers:req.headers,body:req.body,redirect:"error",signal:AbortSignal.timeout(25000)})}catch(e){fail(e?.name==="TimeoutError"||e?.name==="AbortError"?"SOAP_TIMEOUT":"SOAP_NETWORK_UNAVAILABLE")}
 if(!response.ok)fail("SOAP_HTTP_"+response.status);
 return readSearchResponse(await boundedText(response,12000000),req,q);
}
