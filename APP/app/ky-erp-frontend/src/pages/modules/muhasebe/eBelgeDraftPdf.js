// A4 local working-draft export only. It never represents an original provider PDF.
const fmt=value=>Number(value).toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2});
const unit=value=>({C62:"ADET",KGM:"KG",MTR:"METRE",MTK:"M²"}[value]||String(value||""));
export function operatorDraftPdfDefinition({draft,companyName}){
 if(!draft||!["INVOICE","DISPATCH"].includes(draft.kind)||!draft.payload||!Array.isArray(draft.payload.lines))throw Error("Kaydedilmiş taslak gerekli.");
 const p=draft.payload,invoice=draft.kind==="INVOICE";
 const lineRows=p.lines.map(l=>[{text:[l.description,l.note].filter(Boolean).join("\n")},{text:String(l.quantity)+" "+unit(l.unit),alignment:"right"},...(invoice?[{text:fmt(l.price),alignment:"right"},{text:fmt(l.net),alignment:"right"},{text:fmt(l.vat),alignment:"right"}]:[])]);
 return {pageSize:"A4",pageMargins:[35,36,35,40],defaultStyle:{fontSize:10},content:[
  {text:"TASLAK • RESMÎ BELGE DEĞİLDİR",alignment:"center",bold:true,color:"#52677d",fontSize:16,margin:[0,0,0,16]},
  {text:invoice?"FATURA TASLAĞI":"İRSALİYE TASLAĞI",bold:true,fontSize:19,margin:[0,0,0,10]},
  {text:String(companyName||""),bold:true},{text:"Cari: "+String(p.partyName||"")},{text:"Tarih: "+p.issueDate+"  |  Senaryo: "+p.scenario},{text:"Resmî numara / ETTN: —",margin:[0,0,0,12]},
  {table:{headerRows:1,widths:invoice?["*","auto","auto","auto","auto"]:["*","auto"],body:[(invoice?["Mal / Hizmet","Miktar","Birim fiyat","Matrah","KDV"]:["Mal / Hizmet","Miktar"]).map(text=>({text,bold:true,fillColor:"#eef3f8"})),...lineRows]},layout:"lightHorizontalLines"},
  ...(invoice?[{text:"Matrah: "+fmt(p.net)+" "+p.currency+"\nKDV: "+fmt(p.vat)+" "+p.currency+"\nGenel toplam: "+fmt(p.total)+" "+p.currency,alignment:"right",bold:true,margin:[0,12,0,8]}]:[{text:"Sevk: "+p.dispatchDate+" "+p.dispatchTime+"\nTeslim adresi: "+p.deliveryAddress+"\nSürücü: "+p.driver+"  |  Plaka: "+p.plate+"\nTaşıyıcı: "+p.carrier,margin:[0,12,0,8]}]),
  {text:String(p.note||"")},...(p.warnings||[]).map(text=>({text,color:"#785820",fontSize:9,margin:[0,5,0,0]})),
  {text:"KYERP • Çalışma taslağı / sürüm "+draft.version+" • Resmî gönderim veya GİB onayı değildir.",fontSize:9,margin:[0,16,0,0],color:"#52677d"}
 ]};
}
export async function downloadOperatorDraftPdf(args){
 const definition=operatorDraftPdfDefinition(args);
 const [pdfModule,fontModule]=await Promise.all([import("pdfmake/build/pdfmake.js"),import("pdfmake/build/vfs_fonts.js")]);
 const pdfMake=pdfModule.default||pdfModule,fonts=fontModule.default||fontModule;
 const vfs=fonts.pdfMake?.vfs||fonts;
 if(typeof pdfMake.addVirtualFileSystem==="function")pdfMake.addVirtualFileSystem(vfs);else pdfMake.vfs=vfs;
 const filename="KYERP-TASLAK-"+String(args.draft.id).replace(/[^a-zA-Z0-9-]/g,"")+".pdf";
 await new Promise((resolve,reject)=>{try{pdfMake.createPdf(definition).download(filename,resolve)}catch(e){reject(e)}});
}
