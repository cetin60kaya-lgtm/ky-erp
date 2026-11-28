// Fixed production read methods. Never sends or modifies official documents.
// XML parser shared by extraction from existing bounded SOAP implementation.
import {LIVE_ENDPOINTS,LIVE_NOT_BEFORE} from "./live-wsdl-probe.mjs";
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

const S="http://schemas.xmlsoap.org/soap/envelope/",T="http://tempuri.org/",M="http://schemas.datacontract.org/2004/07/EInvoice.Service.Model",W="http://schemas.xmlsoap.org/wsdl/",X="http://www.w3.org/2001/XMLSchema",B="http://schemas.xmlsoap.org/wsdl/soap/";
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const defs={INVOICE_IN:["SearchInvoice","Invoice","Incoming","Invoices","InvoiceDate"],INVOICE_OUT:["SearchInvoice","Invoice","Outgoing","Invoices","InvoiceDate"],ARCHIVE_OUT:["SearchArchiveInvoice","Invoice",null,"ArchiveInvoices","InvoiceDate"],DISPATCH_IN:["SearchDespatchAdvice","DespatchAdvice","Incoming","DespatchAdvices","DespatchAdviceDate"],DISPATCH_OUT:["SearchDespatchAdvice","DespatchAdvice","Outgoing","DespatchAdvices","DespatchAdviceDate"]};
const nodes=(n,l,u)=>n?.children.filter(c=>c.local===l&&(!u||c.uri===u))||[];
const one=(n,l,u)=>{const a=nodes(n,l,u);if(a.length!==1)fail("SOAP_FIELD_INVALID");return a[0]};
const scalar=(n,l,u)=>{const a=one(n,l,u);if(a.children.length)fail("SOAP_SCALAR_INVALID");return a.text.trim()};
const descendants=(n,l,u)=>[...nodes(n,l,u),...n.children.flatMap(c=>descendants(c,l,u))];
const qlocal=s=>String(s||"").split(":").at(-1);
function boundedDate(s){if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+"T00:00:00Z").toISOString().slice(0,10)!==s)fail("DATE_INVALID");return Date.parse(s+"T00:00:00Z")}
async function responseText(response,limit){if(response.status!==200||!response.body)fail("NETWORK_HTTP_ERROR");const reader=response.body.getReader();const parts=[];let size=0;try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit){await reader.cancel();fail("SIZE_LIMIT")}parts.push(Buffer.from(r.value))}}finally{reader.releaseLock()}return new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(parts))}
let cached=null,cachedAt=0;
async function contract(fetcher){if(cached&&Date.now()-cachedAt<600000)return cached;const xml=await responseText(await fetcher(LIVE_ENDPOINTS.InvoiceService+"?singleWsdl",{method:"GET",redirect:"error",signal:AbortSignal.timeout(15000)}),4000000);const root=parseSoapXml(xml);if(root.local!=="definitions"||root.uri!==W)fail("WSDL_INVALID");cached=root;cachedAt=Date.now();return root}
function verifyOperation(root,op,fields){
 const actions=descendants(root,"operation",W).filter(n=>n.attrs.name===op).flatMap(n=>nodes(n,"operation",B)).map(n=>n.attrs.soapAction);
 if(!actions.length||actions.some(a=>a!==T+"IInvoiceService/"+op))fail("WSDL_ACTION_CHANGED");
 const schemas=descendants(root,"schema",X),wrapper=schemas.filter(n=>n.attrs.targetNamespace===T).flatMap(n=>nodes(n,"element",X)).filter(n=>n.attrs.name===op);
 if(wrapper.length!==1)fail("WSDL_WRAPPER_CHANGED");
 const req=descendants(wrapper[0],"element",X).find(n=>n.attrs.name==="request");
 const model=schemas.filter(n=>n.attrs.targetNamespace===M);
 const types=model.flatMap(n=>nodes(n,"complexType",X)).filter(n=>n.attrs.name===qlocal(req?.attrs.type));
 if(types.length!==1)fail("WSDL_REQUEST_CHANGED");
 const ordered=descendants(types[0],"element",X).map(n=>n.attrs.name);
 let i=-1;for(const f of fields){const k=ordered.indexOf(f);if(k<=i)fail("WSDL_FIELD_ORDER_CHANGED");i=k;}
 const required=descendants(types[0],"element",X).filter(n=>n.attrs.minOccurs!=="0"&&!fields.includes(n.attrs.name));
 if(required.length)fail("WSDL_REQUIRED_FIELD_CHANGED");
}
function envelope(op,body){return '<s:Envelope xmlns:s="'+S+'"><s:Body><'+op+' xmlns="'+T+'"><request xmlns:a="'+M+'">'+body+'</request></'+op+'></s:Body></s:Envelope>'}
const el=(k,v)=>"<a:"+k+">"+esc(v)+"</a:"+k+">";
async function soap(fetcher,op,body,limit=4000000){const r=await fetcher(LIVE_ENDPOINTS.InvoiceService,{method:"POST",redirect:"error",signal:AbortSignal.timeout(20000),headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:'"'+T+'IInvoiceService/'+op+'"'},body:envelope(op,body)});const root=parseSoapXml(await responseText(r,limit));if(root.local!=="Envelope"||root.uri!==S)fail("SOAP_ENVELOPE_INVALID");const bodyNode=one(root,"Body",S);if(bodyNode.children.length!==1)fail("SOAP_BODY_INVALID");const result=one(one(bodyNode,op+"Response",T),op+"Result",T);if(scalar(result,"Result",M)!=="Success")fail("PROVIDER_READ_FAILED");return result}
export async function readOfficeTask(task,fetcher=fetch){
 const {jobId,source,page,from,to,taxCode,fence}=task||{};
 const out={jobId,source,page,fence,ok:false};
 try{
  if(Date.now()<LIVE_NOT_BEFORE||!UUID.test(jobId||"")||!UUID.test(fence||"")||!/^\d{10,11}$/.test(taxCode||"")||!Number.isInteger(page)||page<1||page>250||boundedDate(to)-boundedDate(from)<0||boundedDate(to)-boundedDate(from)>30*86400000)fail("SOURCE_INVALID");
  const wsdl=await contract(fetcher);
  if(source==="COMPANY"){
   verifyOperation(wsdl,"GetCompany",["CompanyTaxCode"]);
   const r=await soap(fetcher,"GetCompany",el("CompanyTaxCode",taxCode));
   if(scalar(r,"VknTckn",M)!==taxCode)fail("COMPANY_IDENTITY_UNVERIFIED");
   return {...out,ok:true,companyVerified:true};
  }
  const d=defs[source];if(!d)fail("SOURCE_INVALID");
  const [op,base,direction,listName,dateName]=d,dir=base+"Direction",max="Max"+base+"Date",min="Min"+base+"Date";
  verifyOperation(wsdl,op,["CompanyTaxCode",...(direction?[dir]:[]),max,min,"PagingRequest","ResultSet"]);
  const body=el("CompanyTaxCode",taxCode)+(direction?el(dir,direction):"")+el(max,to+"T23:59:59.999+03:00")+el(min,from+"T00:00:00+03:00")+"<a:PagingRequest>"+el("PageNumber",page)+el("RecordsPerPage",20)+"</a:PagingRequest><a:ResultSet>"+el("IsPDFIncluded","false")+el("IsXMLIncluded","false")+"</a:ResultSet>";
  const r=await soap(fetcher,op,body);
  // Some archive contracts use Invoices rather than ArchiveInvoices; no other fallback.
  const lists=r.children.filter(c=>c.uri===M&&[listName,...(source==="ARCHIVE_OUT"?["Invoices"]:[])].includes(c.local));
  if(lists.length!==1)fail("SOAP_LIST_INVALID");
  const list=lists[0],rows=list.children,pg=nodes(r,"PagingResponse",M);
  // Empty result without paging is only accepted when an explicit list is present and empty.
  if(pg.length!==1||!pg[0].children.length){if(source==="ARCHIVE_OUT"&&page===1&&!rows.length)return {...out,ok:true,total:0,ids:[]};fail("PAGING_MISSING")}
  const p=pg[0],readNum=k=>{const v=scalar(p,k,M);if(!/^\d+$/.test(v))fail("PAGING_INVALID");return Number(v)};
  const total=readNum("TotalNumberOfRecords"),pages=readNum("TotalNumberOfPages");
  if(readNum("PageNumber")!==page||readNum("RecordsPerPage")!==20||total>5000||pages!==Math.ceil(total/20)||rows.length!==Math.min(20,Math.max(0,total-(page-1)*20)))fail("PAGING_INCONSISTENT");
  const ids=rows.map(n=>{const id=scalar(n,"ETTN",M).toLowerCase(),date=scalar(n,dateName,M).slice(0,10);if(!UUID.test(id)||date<from||date>to)fail("DOCUMENT_IDENTITY_INVALID");return id;});
  if(new Set(ids).size!==ids.length)fail("PAGING_DUPLICATE");
  return {...out,ok:true,total,ids};
 }catch(e){const code=String(e?.code||e?.message||"");return {...out,error:/^(?:PROVIDER|SOAP|WSDL|PAGING|XML|DATE|COMPANY|DOCUMENT|NETWORK|SIZE|SOURCE|IDENTITY|RESPONSE)_[A-Z0-9_]{1,60}$/.test(code)?code:"PROVIDER_READ_FAILED"}}
}

function decodeFile(value){if(typeof value!=="string"||!value.length)return null;const s=value.replace(/\s/g,"");if(s.length>11000000||!(/^[A-Za-z0-9+/]*={0,2}$/.test(s))||s.length%4!==0)fail("DOCUMENT_ENCODING_INVALID");const b=Buffer.from(s,"base64");if(b.toString("base64")!==s)fail("DOCUMENT_ENCODING_INVALID");return b}
export async function readOfficeArchiveTask(task,fetcher=fetch){
 const form=new FormData();for(const k of ["jobId","source","ettn","fence"])form.set(k,String(task?.[k]||""));
 try{
  const {source,ettn,from,to,taxCode,jobId,fence}=task||{},d=defs[source];
  if(!d||!UUID.test(ettn||"")||!UUID.test(jobId||"")||!UUID.test(fence||"")||!/^\d{10,11}$/.test(taxCode||"")||boundedDate(to)-boundedDate(from)<0||boundedDate(to)-boundedDate(from)>30*86400000)fail("SOURCE_INVALID");
  const [op,base,direction,listName,dateName]=d,dir=base+"Direction",max="Max"+base+"Date",min="Min"+base+"Date",wsdl=await contract(fetcher);
  verifyOperation(wsdl,op,["CompanyTaxCode","Ettn",...(direction?[dir]:[]),max,min,"PagingRequest","ResultSet"]);
  const body=el("CompanyTaxCode",taxCode)+el("Ettn",ettn)+(direction?el(dir,direction):"")+el(max,to+"T23:59:59.999+03:00")+el(min,from+"T00:00:00+03:00")+"<a:PagingRequest>"+el("PageNumber",1)+el("RecordsPerPage",1)+"</a:PagingRequest><a:ResultSet>"+el("IsPDFIncluded","true")+el("IsXMLIncluded","true")+"</a:ResultSet>";
  const r=await soap(fetcher,op,body,12000000);
  const lists=r.children.filter(c=>c.uri===M&&[listName,...(source==="ARCHIVE_OUT"?["Invoices"]:[])].includes(c.local));
  if(lists.length!==1||lists[0].children.length!==1)fail("DOCUMENT_IDENTITY_INVALID");
  const n=lists[0].children[0],date=scalar(n,dateName,M).slice(0,10);
  if(scalar(n,"ETTN",M).toLowerCase()!==ettn||date<from||date>to)fail("DOCUMENT_IDENTITY_INVALID");
  const xb=decodeFile(scalar(n,base+"Xml",M));if(!xb||xb.length>8*1024*1024)fail("DOCUMENT_XML_MISSING");
  const root=parseSoapXml(new TextDecoder("utf-8",{fatal:true}).decode(xb)),ubl="urn:oasis:names:specification:ubl:schema:xsd:",type=source.startsWith("DISPATCH")?"DespatchAdvice":"Invoice";
  if(root.local!==type||root.uri!==ubl+type+"-2"||scalar(root,"UUID",ubl+"CommonBasicComponents-2").toLowerCase()!==ettn)fail("DOCUMENT_IDENTITY_INVALID");
  form.set("xml",new Blob([xb],{type:"application/xml"}),"original.xml");
  let pb=null;try{pb=decodeFile(scalar(n,base+"Pdf",M))}catch{/* An absent/invalid PDF never becomes an original. */}
  if(pb&&pb.length+xb.length<=8*1024*1024&&/^%PDF-\d\.\d/.test(pb.subarray(0,8).toString("ascii")))form.set("pdf",new Blob([pb],{type:"application/pdf"}),"original.pdf");
  form.set("result","OK");
 }catch(e){form.delete("xml");form.delete("pdf");form.set("result","FAILED");const code=String(e?.code||e?.message||"");form.set("errorCode",/^(?:PROVIDER|SOAP|WSDL|PAGING|XML|DATE|COMPANY|DOCUMENT|NETWORK|SIZE|SOURCE|IDENTITY|RESPONSE)_[A-Z0-9_]{1,60}$/.test(code)?code:"DOCUMENT_READ_FAILED")}
 return form;
}
