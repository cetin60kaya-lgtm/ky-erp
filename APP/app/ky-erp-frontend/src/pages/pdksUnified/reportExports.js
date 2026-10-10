/** KY PDKS report exports. Entirely client-side, no persistence or finance writes. */
import {csvForTable,safeFileNameSegment} from "./productData.js";

const encode=new TextEncoder();
const escapeXml=value=>String(value??"").slice(0,32767)
 .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/&/g,"&amp;")
 .replace(/</g,"&lt;").replace(/>/g,"&gt;")
 .replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const uint16=(array,value)=>array.push(value&255,(value>>>8)&255);
const uint32=(array,value)=>{uint16(array,value>>>0);uint16(array,value>>>16);};
function crc32(bytes){
 let crc=0xffffffff;
 for(const byte of bytes){
  crc^=byte;
  for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}
function zipStored(files){
 const local=[],directory=[];
 let offset=0;
 for(const [name,contents] of Object.entries(files)){
  const nameBytes=encode.encode(name),bytes=encode.encode(contents),crc=crc32(bytes);
  const header=[];uint32(header,0x04034b50);uint16(header,20);
  uint16(header,0x0800);uint16(header,0);uint16(header,0);uint16(header,0);
  uint32(header,crc);uint32(header,bytes.length);uint32(header,bytes.length);
  uint16(header,nameBytes.length);uint16(header,0);
  local.push(new Uint8Array(header),nameBytes,bytes);
  const entry=[];uint32(entry,0x02014b50);uint16(entry,20);uint16(entry,20);
  uint16(entry,0x0800);uint16(entry,0);uint16(entry,0);uint16(entry,0);
  uint32(entry,crc);uint32(entry,bytes.length);uint32(entry,bytes.length);
  uint16(entry,nameBytes.length);uint16(entry,0);uint16(entry,0);
  uint16(entry,0);uint16(entry,0);uint32(entry,0);uint32(entry,offset);
  directory.push(new Uint8Array(entry),nameBytes);
  offset+=header.length+nameBytes.length+bytes.length;
 }
 const directorySize=directory.reduce((n,x)=>n+x.length,0);
 const end=[];uint32(end,0x06054b50);uint16(end,0);uint16(end,0);
 uint16(end,Object.keys(files).length);uint16(end,Object.keys(files).length);
 uint32(end,directorySize);uint32(end,offset);uint16(end,0);
 const parts=[...local,...directory,new Uint8Array(end)];
 const total=parts.reduce((n,x)=>n+x.length,0),result=new Uint8Array(total);
 let cursor=0;for(const part of parts){result.set(part,cursor);cursor+=part.length;}
 return result;
}
const columnName=index=>{
 let result="";
 for(let num=index+1;num>0;num=Math.floor((num-1)/26))
  result=String.fromCharCode(65+(num-1)%26)+result;
 return result;
};
const numericColumns=new Set(["Maaş","Yol","Ek Yol","Yemek","%50 Saat","%50 Tutar",
 "%100 Saat","%100 Tutar","Mesai","Avans","Kesinti","Net","Brüt","Toplam",
 "Banka","Elden","Tutar","Süre","Kanıt","Gün","İzin","Çalışılan","Eksik"]);
const sheetCell=(address,value,heading)=>{
 const string=String(value??"");
 if(numericColumns.has(heading) && /^-?\\d+(?:\\.\\d+)?$/.test(string) &&
    Number.isFinite(Number(string)))
   return `<c r="${address}" t="n"><v>${string}</v></c>`;
 // Formula-like values must be stored as inline strings; never executable Excel formulas.
 return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(string)}</t></is></c>`;
};
export function xlsxReportBytes(columns,rows,{sheetName="KY PDKS"}={}){
 if(!Array.isArray(columns)||!Array.isArray(rows)||columns.length<1||columns.length>120||
    rows.length>50000)throw Error("PDKS_EXPORT_KAPSAM_GECERSIZ");
 const values=[columns,...rows.map(row=>columns.map(key=>row?.[key]??""))];
 const body=values.map((cells,index)=>`<row r="${index+1}">${cells.map(
  (v,i)=>sheetCell(columnName(i)+(index+1),v,columns[i])).join("")}</row>`).join("");
 const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>${body}</sheetData></worksheet>`;
 const book=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(String(sheetName).slice(0,31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
 return zipStored({
  "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  "_rels/.rels":'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  "xl/workbook.xml":book,
  "xl/_rels/workbook.xml.rels":'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  "xl/worksheets/sheet1.xml":sheet,
 });
}
export function reportFileName(tabId,year,month,extension){
 if(!["csv","xlsx","pdf"].includes(extension))throw Error("PDKS_EXPORT_FORMAT_INVALID");
 return `KY_PDKS_${safeFileNameSegment(tabId)}_${year}-${String(month).padStart(2,"0")}.${extension}`;
}
export function reportCsv(columns,rows){return csvForTable(columns,rows);}
export function triggerFileDownload(bytes,mime,name){
 const blob=new Blob([bytes],{type:mime}),url=URL.createObjectURL(blob);
 try{const link=document.createElement("a");link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
 }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export async function downloadReportPdf(columns,rows,{title,period,fileName}){
 if(!columns.length||!rows.length)throw Error("PDKS_PDF_KAYIT_YOK");
 // pdfmake ships with the frontend already; never load a third-party URL.
 const [module,fonts]=await Promise.all([
   import("pdfmake/build/pdfmake"),import("pdfmake/build/vfs_fonts"),
 ]);
 const pdf=module.default||module;
 pdf.vfs=fonts.default?.pdfMake?.vfs||fonts.pdfMake?.vfs||fonts.default||fonts;
 const header=columns.map(value=>({text:String(value),bold:true,fillColor:"#EEEEEE"}));
 const body=[header,...rows.map(row=>columns.map(col=>String(row[col]??"")))];
 pdf.createPdf({
   pageSize:"A4",pageOrientation:columns.length>5?"landscape":"portrait",
   pageMargins:[24,35,24,35],
   content:[{text:String(title),bold:true,fontSize:12,margin:[0,0,0,5]},
     {text:String(period)+" · Taslak / Kaynak doğrulama koşulludur",fontSize:9,margin:[0,0,0,10]},
     {table:{headerRows:1,widths:columns.map(()=>"*"),body},
      layout:{hLineColor:()=>"#888888",vLineColor:()=>"#BBBBBB",
        fillColor:()=>null}}],
   defaultStyle:{font:"Roboto",fontSize:columns.length>10?5:8,color:"#000000"},
   footer:(current,pageCount)=>({text:`${current} / ${pageCount}`,fontSize:8,alignment:"right",margin:[0,4,24,0]}),
 }).download(fileName);
}
