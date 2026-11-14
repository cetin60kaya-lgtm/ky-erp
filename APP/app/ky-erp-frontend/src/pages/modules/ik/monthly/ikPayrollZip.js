/**
 * Extract only workbook members from an accountant ZIP.
 * PDF slips remain in the original ZIP; no PDF or private source data is uploaded
 * by this helper. Browser-native DEFLATE avoids an additional dependency.
 */
const u16=(d,o)=>d.getUint16(o,true),u32=(d,o)=>d.getUint32(o,true);
const MAX_ZIP=35*1024*1024,MAX_BOOK=15*1024*1024,MAX_ENTRIES=100;
const isWorkbook=(name)=>/\.(xlsx|xls)$/i.test(name)&&!/(^|\/)~\$/.test(name);
const utf8=new TextDecoder("utf-8");
function crc32(bytes){
 let crc=-1;
 for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}
 return(crc^(-1))>>>0;
}
export async function expandAccountantPayrollFiles(sourceFiles){
 const files=[],supplementalPdfs=[];
 for(const file of Array.from(sourceFiles||[])){
  if(isWorkbook(file.name)){if(file.size>MAX_BOOK)throw Error("Excel bordrosu en fazla 15 MB olabilir.");files.push(file);continue;}
  if(!/\.zip$/i.test(file.name))throw Error("Yalnız XLS/XLSX veya bordro ZIP paketi kabul edilir.");
  if(file.size>MAX_ZIP)throw Error("Muhasebe ZIP paketi 35 MB sınırını aşıyor.");
  const bytes=new Uint8Array(await file.arrayBuffer());
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(u32(data,at)===0x06054b50){end=at;break;}
  if(end<0)throw Error("Bordro ZIP son kaydı okunamadı.");
  const entries=u16(data,end+10),centralOffset=u32(data,end+16);
  if(entries>MAX_ENTRIES||entries===0||centralOffset>=bytes.length)throw Error("ZIP giriş sayısı veya boyutu uygun değil.");
  let at=centralOffset;
  const seen=new Set();
  for(let index=0;index<entries;index++){
   if(at+46>bytes.length||u32(data,at)!==0x02014b50)throw Error("ZIP merkez dizini bozuk.");
   const flags=u16(data,at+8),method=u16(data,at+10),expectedCrc=u32(data,at+16);
   const packed=u32(data,at+20),unpacked=u32(data,at+24);
   const nameLen=u16(data,at+28),extraLen=u16(data,at+30),commentLen=u16(data,at+32),localOffset=u32(data,at+42);
   const endEntry=at+46+nameLen+extraLen+commentLen;
   if(endEntry>bytes.length)throw Error("ZIP giriş başlığı eksik.");
   const rawName=utf8.decode(bytes.subarray(at+46,at+46+nameLen));at=endEntry;
   const name=rawName.split("/").pop()||"";
   if(rawName.includes("..")||rawName.includes("\\")||rawName.startsWith("/"))throw Error("ZIP içinde geçersiz dosya yolu var.");
   if(/\.pdf$/i.test(name)){supplementalPdfs.push(name);continue;}
   if(!isWorkbook(name))continue;
   if(flags&1||unpacked>MAX_BOOK||packed>MAX_BOOK||packed===0)throw Error("Excel üyesi şifreli, boş veya çok büyük.");
   if(localOffset+30>bytes.length||u32(data,localOffset)!==0x04034b50)throw Error("ZIP dosya başlığı bozuk.");
   const dataStart=localOffset+30+u16(data,localOffset+26)+u16(data,localOffset+28);
   if(dataStart+packed>bytes.length)throw Error("ZIP veri aralığı geçersiz.");
   if(method!==0&&method!==8)throw Error("ZIP sıkıştırma yöntemi desteklenmiyor.");
   let payload=bytes.slice(dataStart,dataStart+packed);
   if(method===8){
    if(typeof DecompressionStream==="undefined")throw Error("Tarayıcı ZIP açmayı desteklemiyor. Excel dosyalarını ayrı seçin.");
    try{
     const stream=new Blob([payload]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
     payload=new Uint8Array(await new Response(stream).arrayBuffer());
    }catch{throw Error("ZIP içindeki Excel çıkarılamadı. Paket hasarlı olabilir.");}
   }
   if(payload.length!==unpacked||crc32(payload)!==expectedCrc)throw Error("ZIP Excel bütünlük doğrulaması başarısız.");
   const key=name.toLocaleLowerCase("tr-TR");
   if(seen.has(key))throw Error("ZIP içinde aynı isimli bordro dosyası tekrar ediyor.");
   seen.add(key);
   files.push(new File([payload],name,{type:"application/octet-stream"}));
  }
 }
 if(!files.length)throw Error("Paket içinde okunabilir XLS/XLSX bordrosu bulunamadı.");
 if(files.length>24)throw Error("Bir seferde en fazla 24 bordro dosyası alınabilir.");
 return {files,supplementalPdfs};
}
