/** Browser-local output: never execute embedded XSLT (Chrome removes it in v158). */
const child=(el,name)=>Array.from(el?.children||[]).find(x=>x.localName===name)||null;
const any=(el,name)=>Array.from(el?.getElementsByTagName("*")||[]).find(x=>x.localName===name)||null;
const value=(el,name)=>String(any(el,name)?.textContent||"").trim();
const direct=(el,name)=>String(child(el,name)?.textContent||"").trim();
const money=(n)=>Number(n||0).toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2});
function party(root,name){
 const p=child(child(root,name),"Party");
 return {name:value(p,"RegistrationName")||value(p,"Name"),
   tax:value(p,"ID").replace(/\D/g,""),
   address:["StreetName","CitySubdivisionName","CityName","PostalZone"].map(x=>value(p,x)).filter(Boolean).join(" ")};
}
function imgs(root){
 const node=any(root,"EmbeddedDocumentBinaryObject");
 let source="";
 try{source=atob(String(node?.textContent||"").trim())}catch{return {logo:null,qr:null}}
 const pictures=Array.from(source.matchAll(/data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=]+/ig)).map(m=>m[0]);
 return {logo:pictures.length>=2?pictures[pictures.length-1]:null,
   // QR is read from this DOCUMENT, not reused from a saved sample.
   qr:pictures.length===3?pictures[1]:pictures.length>=4?pictures[2]:null};
}
export function parseUblForVisualOutput(raw){
 if(raw.length>20*1024*1024||/<!DOCTYPE\b|<!ENTITY\b/i.test(raw))throw Error("Güvensiz veya çok büyük XML.");
 const tree=new DOMParser().parseFromString(raw,"application/xml");
 if(any(tree,"parsererror"))throw Error("XML ayrıştırılamadı.");
 const r=tree.documentElement,kind=r?.localName==="Invoice"?"INVOICE":r?.localName==="DespatchAdvice"?"DISPATCH":null;
 if(!kind)throw Error("UBL Invoice/DespatchAdvice bekleniyor.");
 const supplier=party(r,kind==="INVOICE"?"AccountingSupplierParty":"DespatchSupplierParty");
 const customer=party(r,kind==="INVOICE"?"AccountingCustomerParty":"DeliveryCustomerParty");
 const number=direct(r,"ID"),date=direct(r,"IssueDate"),uuid=direct(r,"UUID");
 if(!number||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{10}(?:\d)?$/.test(supplier.tax))throw Error("Belge numarası/tarihi/düzenleyen kimliği eksik.");
 const lineTag=kind==="INVOICE"?"InvoiceLine":"DespatchLine";
 const lines=Array.from(r.children).filter(x=>x.localName===lineTag).map((x,i)=>({
  index:i+1,description:value(child(x,"Item"),"Name")||"Kalem",
  quantity:value(x,kind==="INVOICE"?"InvoicedQuantity":"DeliveredQuantity"),
  unit:any(x,kind==="INVOICE"?"InvoicedQuantity":"DeliveredQuantity")?.getAttribute("unitCode")||"",
  price:value(child(x,"Price"),"PriceAmount"),
  total:direct(x,"LineExtensionAmount")
 }));
 if(!lines.length)throw Error("Belge kalemleri boş.");
 const totalNode=child(r,"LegalMonetaryTotal");
 return {kind,supplier,customer,number,date,uuid,lines,currency:direct(r,"DocumentCurrencyCode")||"TRY",
  subtotal:direct(totalNode,"TaxExclusiveAmount")||direct(totalNode,"LineExtensionAmount"),
  tax:value(child(r,"TaxTotal"),"TaxAmount"),
  total:direct(totalNode,"PayableAmount")||direct(totalNode,"TaxInclusiveAmount"),
  notes:Array.from(r.children).filter(x=>x.localName==="Note").map(x=>x.textContent.trim()).join("\n").slice(0,1500),
  images:imgs(r)};
}
function layoutOf(p={}){
 const n=(field,def,min,max)=>Number.isFinite(Number(p[field]))&&Number(p[field])>=min&&Number(p[field])<=max?Number(p[field]):def;
 return {top:n("marginTop",30,0,150),side:n("marginSide",26,0,120),
  font:n("fontSize",9,6,18),table:n("tableFontSize",8,5,16),
  logo:n("logoWidth",135,0,240),showQr:p.showQr!==false,
  headerGap:n("headerGap",18,0,60),companyGap:n("companyGap",20,0,80),
  tableGap:n("tableGap",14,0,65),totalsWidth:n("totalsWidth",190,110,280),
  cellPadding:n("cellPadding",4,1,14),titleSize:n("titleSize",16,10,28),qrWidth:n("qrWidth",82,40,140)};
}
export function makeVisualPdfDefinition(d,p={}){
 const c=layoutOf(p);
 const sellers=[{text:d.supplier.name,bold:true},{text:d.supplier.address},{text:"VKN/TCKN: "+d.supplier.tax}];
 const buyers=[{text:d.customer.name,bold:true},{text:d.customer.address},{text:"VKN/TCKN: "+d.customer.tax}];
 const headings=["Sıra","Mal / Hizmet","Miktar","Birim Fiyat","Tutar"].map(x=>({text:x,bold:true,fillColor:"#e9eff4"}));
 const rows=[headings].concat(d.lines.map(x=>[
  String(x.index),x.description,x.quantity+" "+x.unit,d.kind==="INVOICE"?money(x.price):"-",money(x.total)]));
 const pictures=[];
 if(d.images.logo&&c.logo>0)pictures.push({image:d.images.logo,width:c.logo,alignment:"right"});
 if(d.images.qr&&c.showQr)pictures.push({image:d.images.qr,width:c.qrWidth,alignment:"right",margin:[0,8,0,0]});
 return {pageSize:"A4",pageMargins:[c.side,c.top,c.side,32],
  defaultStyle:{font:"Roboto",fontSize:c.font},
  content:[
   {columns:[{width:"*",stack:[
     {text:d.kind==="INVOICE"?"e-FATURA":"e-İRSALİYE",fontSize:c.titleSize,bold:true},
     {text:"Belge No: "+d.number},{text:"Tarih: "+d.date},
     {text:"ETTN: "+d.uuid,fontSize:7}]},{width:"auto",stack:pictures}],margin:[0,0,0,c.headerGap]},
   {columns:[{width:"*",stack:[{text:"DÜZENLEYEN",bold:true,color:"#34485d"}].concat(sellers)},
     {width:"*",stack:[{text:"ALICI",bold:true,color:"#34485d"}].concat(buyers)}],
     columnGap:20,margin:[0,0,0,c.companyGap]},
   {table:{headerRows:1,widths:[28,"*",64,66,70],body:rows},
     fontSize:c.table,layout:{hLineColor:"#b7c0c8",vLineColor:"#b7c0c8",paddingLeft:()=>c.cellPadding,paddingRight:()=>c.cellPadding,paddingTop:()=>c.cellPadding/2,paddingBottom:()=>c.cellPadding/2},
     margin:[0,0,0,c.tableGap]},
   {columns:[{width:"*",text:d.notes,fontSize:c.font-1},
     {width:c.totalsWidth,stack:[
       {columns:[{text:"Ara Toplam"},{text:money(d.subtotal)+" "+d.currency,alignment:"right"}]},
       {columns:[{text:"KDV"},{text:money(d.tax)+" "+d.currency,alignment:"right"}]},
       {columns:[{text:"TOPLAM",bold:true},{text:money(d.total)+" "+d.currency,alignment:"right",bold:true}]}
     ]}]}
  ]};
}
async function createPdf(parsed,layout) {
 const [pdfLib,fonts]=await Promise.all([import("pdfmake/build/pdfmake"),import("pdfmake/build/vfs_fonts")]);
 const pdfMake=pdfLib.default||pdfLib, fontData=fonts.default?.pdfMake?.vfs||fonts.pdfMake?.vfs||fonts.default||fonts;
 pdfMake.vfs=fontData;
 return new Promise((resolve,reject)=>{
  try{pdfMake.createPdf(makeVisualPdfDefinition(parsed,layout)).getBlob(resolve)}
  catch(e){reject(e)}
 });
}
export async function renderUblOutput(xml,layout,format="PDF"){
 const parsed=parseUblForVisualOutput(xml);
 const pdf=await createPdf(parsed,layout),choice=String(format).toUpperCase();
 const file=parsed.number.replace(/[^a-z0-9_-]/ig,"_").slice(0,80);
 if(choice==="PDF")return {blob:pdf,name:file+".pdf",parsed};
 if(!["PNG","JPEG"].includes(choice))throw Error("Yalnız PDF/JPEG/PNG çıktı alınabilir.");
 const [lib,worker]=await Promise.all([import("pdfjs-dist/build/pdf.mjs"),import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
 lib.GlobalWorkerOptions.workerSrc=worker.default;
 const source=await lib.getDocument({data:new Uint8Array(await pdf.arrayBuffer())}).promise;
 if(source.numPages!==1)throw Error("Çok sayfalı belgeleri JPEG/PNG olarak eksik aktarmayız; PDF seçin.");
 const page=await source.getPage(1),viewport=page.getViewport({scale:2});
 const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 const context=canvas.getContext("2d",{alpha:false});if(!context)throw Error("Görsel alanı açılamadı.");
 await page.render({canvasContext:context,viewport}).promise;
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Görsel oluşturulamadı.")),choice==="PNG"?"image/png":"image/jpeg",0.94));
 return {blob,name:file+(choice==="PNG"?".png":".jpg"),parsed};
}
