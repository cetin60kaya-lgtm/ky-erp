// @ts-nocheck
import type { Context } from "hono";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const MODEL="@cf/moondream/moondream3.1-9B-A2B";
const text=(v:unknown)=>v==null?"":String(v).trim();
const num=(v:unknown)=>{if(typeof v==="number")return Number.isFinite(v)?v:0;let s=text(v).replace(/[^0-9,.-]/g,"");const comma=s.lastIndexOf(","),dot=s.lastIndexOf("."),idx=Math.max(comma,dot);if(comma>=0&&dot>=0)s=`${s.slice(0,idx).replace(/[,.]/g,"")}.${s.slice(idx+1).replace(/[,.]/g,"")}`;else if(comma>=0)s=s.replace(/\./g,"").replace(",",".");const n=Number(s);return Number.isFinite(n)?n:0};
const clamp=(v:unknown,min=0,max=1)=>Math.max(min,Math.min(max,num(v)));

function base64(bytes:Uint8Array){let out="";const size=0x8000;for(let i=0;i<bytes.length;i+=size)out+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+size)));return btoa(out)}
function extractJson(value:unknown){const raw=text(value).replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/i,"");try{return JSON.parse(raw)}catch{}const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1))}catch{}}throw Object.assign(new Error("Cloudflare belge OCR sonucu yapılandırılmış JSON olarak okunamadı."),{code:"WORKERS_AI_OCR_JSON_INVALID"})}
function dateOnly(v:unknown){const raw=text(v);if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const m=raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);if(!m)return raw;return `${m[3].length===2?`20${m[3]}`:m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`}
function lotFrom(v:unknown){return text(v).match(/\b(?:LOT|PART[Iİ]|BATCH)\s*(?:NO|NUMARASI|NUMBER)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{1,50})/i)?.[1]||""}
export function workersAiAccountingDocumentStatus(env:any){return{configured:Boolean(env?.AI),provider:"CLOUDFLARE_WORKERS_AI",model:MODEL}}

function promptFor(kind:string){return `Bu görsel Türkiye'deki bir muhasebe belgesidir. Fatura veya irsaliye olabilir. Görselde olmayan bilgiyi ASLA uydurma. Yalnız geçerli JSON döndür; markdown veya açıklama yazma.
JSON şeması:
{"documentKind":"FATURA|IRSALIYE","partyName":"","partyTaxNo":"","documentNo":"","issueDate":"YYYY-MM-DD","dueDate":"YYYY-MM-DD veya boş","currency":"TRY","subtotal":0,"taxTotal":0,"discountTotal":0,"payableTotal":0,"confidence":0.0,"rawText":"belgedeki okunabilir ana metin","lines":[{"lineNo":1,"productCode":"","supplierProductCode":"","description":"","quantity":0,"unitCode":"","unitPrice":0,"taxRate":0,"taxAmount":0,"discountTotal":0,"lineTotal":0,"lotNo":"","confidence":0.0}]}
İstenen tür: ${kind||"AUTO"}. AUTO ise başlığa ve belge ibarelerine göre FATURA/IRSALIYE seç. LOT, PARTİ veya BATCH numarası varsa satırın lotNo alanına yaz. Vergi/VKN 10-11 haneli olmalı. Tutarları sayı olarak yaz.`}

function canonical(row:Row,kind:string,answer:string){const lines=(Array.isArray(row.lines)?row.lines:[]).slice(0,250).map((line:Row,index:number)=>({lineNo:Number(line.lineNo||index+1),productCode:text(line.productCode),supplierProductCode:text(line.supplierProductCode||line.productCode),description:text(line.description),quantity:num(line.quantity),unitCode:text(line.unitCode),unitPrice:num(line.unitPrice),taxRate:num(line.taxRate),taxAmount:num(line.taxAmount),discountTotal:num(line.discountTotal),lineTotal:num(line.lineTotal),lotNo:text(line.lotNo)||lotFrom(line.description),extractionConfidence:clamp(line.confidence||row.confidence||.65)}));const documentKind=/IRSALIYE|DISPATCH|DESPATCH/i.test(text(row.documentKind))?"IRSALIYE":/FATURA|INVOICE/i.test(text(row.documentKind))?"FATURA":/IRSALIYE|DISPATCH|DESPATCH/i.test(kind)?"IRSALIYE":"FATURA";const required=[text(row.partyName),text(row.partyTaxNo),text(row.documentNo),dateOnly(row.issueDate),num(row.payableTotal)>0?"1":"",lines.length?"1":""].filter(Boolean).length;const confidence=Math.max(clamp(row.confidence),Math.min(.9,.45+required*.07));return{extractor:"CLOUDFLARE_WORKERS_AI",extractorModel:MODEL,extractionConfidence:confidence,inferredDocumentKind:documentKind,partyName:text(row.partyName),partyTaxNo:text(row.partyTaxNo).replace(/\D/g,""),partyTaxOffice:"",partyIban:"",documentNo:text(row.documentNo),uuid:"",issueDate:dateOnly(row.issueDate),dueDate:dateOnly(row.dueDate),currency:text(row.currency)||"TRY",subtotal:num(row.subtotal),taxTotal:num(row.taxTotal),discountTotal:num(row.discountTotal),payableTotal:num(row.payableTotal),lines,rawText:text(row.rawText).slice(0,20000),rawResult:{providerStatus:"succeeded",modelId:MODEL,answerLength:answer.length,lineCount:lines.length}}}
export async function analyzeAccountingImageWithWorkersAi(c:Context<AppEnv>,file:File,documentKind="AUTO"){
  if(!c.env.AI)throw Object.assign(new Error("Cloudflare Workers AI belge OCR bağlantısı hazır değil."),{code:"WORKERS_AI_OCR_NOT_CONFIGURED"});
  if(!/^image\//i.test(file.type))throw Object.assign(new Error("Cloudflare belge OCR için görüntü önizlemesi gereklidir."),{code:"WORKERS_AI_IMAGE_REQUIRED"});
  if(file.size>10_000_000)throw Object.assign(new Error("OCR görüntüsü 10 MB sınırını aşıyor. PDF/görsel önizlemesini küçültün."),{code:"WORKERS_AI_IMAGE_TOO_LARGE"});
  const bytes=new Uint8Array(await file.arrayBuffer()),image=`data:${file.type||"image/jpeg"};base64,${base64(bytes)}`,slug=text(c.req?.header?.("X-KYERP-Tenant-Slug"))||"mecit-hakan";
  let result:any;try{result=await c.env.AI.run(MODEL,{task:"query",image,question:promptFor(documentKind),reasoning:false,temperature:0.05,top_p:.1,max_tokens:7000},{gateway:{id:text((c.env as any).AI_GATEWAY_ID)||"default",skipCache:true,collectLog:false,metadata:{app:"KY_ERP",tenant:slug,module:"MUHASEBE_EBELGE_OCR",requestId:text(c.get?.("requestId"))}}});}catch(error:any){throw Object.assign(new Error("Cloudflare belge OCR servisi yanıt veremedi."),{code:"WORKERS_AI_OCR_FAILED",detail:text(error?.message).slice(0,500)})}
  const answer=text(result?.answer||result?.response||result?.text);if(!answer)throw Object.assign(new Error("Cloudflare belge OCR boş sonuç döndürdü."),{code:"WORKERS_AI_OCR_EMPTY"});
  return canonical(extractJson(answer),documentKind,answer);
}
