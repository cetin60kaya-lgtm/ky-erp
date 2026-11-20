// KY ERP - immutable provider originals in one Google Drive-synced local folder.
// No credentials or session cookies are written. Never writes to ERP D1/R2.
import {constants} from "node:fs";
import {copyFile, mkdir, readFile, unlink, writeFile, stat} from "node:fs/promises";
import {join, resolve} from "node:path";
import {createHash, randomUUID} from "node:crypto";

export const SOURCES = Object.freeze({
  incoming_invoice:"GELEN_FATURA",
  outgoing_invoice:"GIDEN_FATURA",
  incoming_dispatch:"GELEN_IRSALIYE",
  outgoing_dispatch:"GIDEN_IRSALIYE"
});

function token(value) {
  const clean=String(value??"").normalize("NFKC").replace(/[^A-Za-z0-9_-]/g,"_").replace(/_+/g,"_").slice(0,100);
  return clean && clean!=="." && clean!==".." ? clean : "BILINMEYEN";
}
function yearFrom(value) {
  const date=String(value??"");
  const iso=date.match(/^(\d{4})[-./]\d{2}[-./]\d{2}/);
  const tr=date.match(/^\d{2}[-./]\d{2}[-./](\d{4})/);
  const year=iso?.[1]??tr?.[1];
  return year && Number(year)>=2000 && Number(year)<=2100 ? year : "TARIHSIZ";
}
export function documentDirectory(root,{sourceKey,companyId,sourceId,no,date}) {
  if(!Object.hasOwn(SOURCES,sourceKey) || !/^\d+$/.test(String(sourceId)))throw Error("BELGE_KIMLIGI_GECERSIZ");
  if(!/^\d+$/.test(String(companyId)))throw Error("FIRMA_KIMLIGI_GECERSIZ");
  return join(resolve(root), SOURCES[sourceKey], token(companyId), yearFrom(date),
    token(no)+"__"+token(sourceId));
}
export function sha256(bytes) {return createHash("sha256").update(bytes).digest("hex");}

async function immutableWrite(file,bytes) {
  const current=await readFile(file).catch(e=>{if(e?.code==="ENOENT")return null;throw e});
  if(current) {
    if(sha256(current)!==sha256(bytes))throw Error("ORIJINAL_DOSYA_CAKISMASI");
    return {state:"existing",size:current.length,sha256:sha256(current)};
  }
  const temp=file+".tmp-"+randomUUID();
  try {
    await writeFile(temp,bytes,{flag:"wx"});
    try{await copyFile(temp,file,constants.COPYFILE_EXCL);}
    catch(e){
      if(e?.code!=="EEXIST")throw e;
      const existing=await readFile(file);
      if(sha256(existing)!==sha256(bytes))throw Error("ORIJINAL_DOSYA_CAKISMASI");
      return {state:"existing",size:existing.length,sha256:sha256(existing)};
    }
    return {state:"saved",size:bytes.length,sha256:sha256(bytes)};
  } finally {await unlink(temp).catch(()=>{});}
}
function rawTag(xml,name) {
  const m=xml.match(new RegExp("<(?:[\\w.-]+:)?"+name+"(?:\\s[^>]*)?>([^<]{1,300})<\\/(?:[\\w.-]+:)?"+name+">","i"));
  return (m?.[1]??"").trim();
}
export function analyzeUbl(bytes) {
  const xml=bytes.toString("utf8").replace(/^\uFEFF/,"");
  if(/<!DOCTYPE|<!ENTITY|<html\b/i.test(xml))throw Error("XML_YAPISI_GECERSIZ");
  const kind=/<(?:[\w.-]+:)?DespatchAdvice(?:\s|>)/i.test(xml)?"IRSALIYE":
    /<(?:[\w.-]+:)?Invoice(?:\s|>)/i.test(xml)?"FATURA":"BILINMEYEN";
  return {kind,documentNo:rawTag(xml,"ID"),uuid:rawTag(xml,"UUID"),
    issueDate:rawTag(xml,"IssueDate"),currency:rawTag(xml,"DocumentCurrencyCode")};
}

/**
 * Save verified original bytes under exactly one canonical directory.
 * The metadata file stores hashes and document identifiers only, never content.
 * Missing PDF is reported; XML still survives and can be completed later.
 */
export async function archiveOriginals({root,document,companyId,xml,pdf,pdfError}) {
  if(!Buffer.isBuffer(xml))throw Error("XML_GEREKLI");
  const analysis=analyzeUbl(xml);
  const expected=document.kind==="dispatch"?"IRSALIYE":"FATURA";
  if(analysis.kind!==expected)throw Error("XML_BELGE_TURU_UYUSMUYOR");
  const dir=documentDirectory(root,{...document,companyId});
  await mkdir(dir,{recursive:true});
  const base=token(document.no||analysis.documentNo);
  const xmlFile=base+".xml",pdfFile=base+".pdf";
  const xmlSaved=await immutableWrite(join(dir,xmlFile),xml);
  let pdfSaved=null;
  if(Buffer.isBuffer(pdf))pdfSaved=await immutableWrite(join(dir,pdfFile),pdf);
  const currentMetadata=await readFile(join(dir,"kayit.json"),"utf8")
    .then(s=>JSON.parse(s)).catch(e=>{if(e.code==="ENOENT"||e instanceof SyntaxError)return {};throw e;});
  const metadata={
    schema:1,
    source:"ISNET",
    sourceKey:document.sourceKey,
    sourceId:document.sourceId,
    companyId:String(companyId),
    documentNo:document.no||analysis.documentNo,
    kind:expected,
    direction:document.direction,
    date:document.date,
    uuid:analysis.uuid||document.uuid||"",
    issueDate:analysis.issueDate,
    currency:analysis.currency,
    files:{
      xml:{name:xmlFile,sha256:xmlSaved.sha256,size:xmlSaved.size},
      ...(pdfSaved?{pdf:{name:pdfFile,sha256:pdfSaved.sha256,size:pdfSaved.size}}:currentMetadata.files?.pdf?{pdf:currentMetadata.files.pdf}:{})
    },
    status:pdfSaved||currentMetadata.files?.pdf?"XML_PDF":"PDF_EKSIK",
    lastVerifiedAt:new Date().toISOString()
  };
  // Metadata is not a duplicate of either original document.
  const tmp=join(dir,"kayit.json.tmp-"+randomUUID());
  try{await writeFile(tmp,JSON.stringify(metadata,null,2),{flag:"wx"});const {rename}=await import("node:fs/promises");await rename(tmp,join(dir,"kayit.json"));}
  finally{await unlink(tmp).catch(()=>{});}
  return {directory:dir,xml:xmlSaved.state,pdf:pdfSaved?.state||"missing",status:metadata.status,
    originalXmlSha256:xmlSaved.sha256,originalPdfSha256:pdfSaved?.sha256||null,
    note:pdfError?"PDF_ALINAMADI":null};
}
