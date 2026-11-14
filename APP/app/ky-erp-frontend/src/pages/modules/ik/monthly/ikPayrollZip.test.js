import test from "node:test";
import assert from "node:assert/strict";
import { File } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import { expandAccountantPayrollFiles } from "./ikPayrollZip.js";

const crc32=(bytes)=>{let x=-1;for(const b of bytes){x^=b;for(let i=0;i<8;i++)x=x&1?(x>>>1)^0xedb88320:x>>>1;}return(x^(-1))>>>0;};
function zip(records, compressed=true){
 const locals=[],central=[];let offset=0;
 for(const [name,plain] of records){
  const nb=Buffer.from(name),payload=Buffer.from(plain),packed=compressed?deflateRawSync(payload):payload;
  const m=compressed?8:0,crc=crc32(payload);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);
  h.writeUInt16LE(m,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(packed.length,18);
  h.writeUInt32LE(payload.length,22);h.writeUInt16LE(nb.length,26);
  locals.push(h,nb,packed);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);
  c.writeUInt16LE(m,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);
  c.writeUInt32LE(payload.length,24);c.writeUInt16LE(nb.length,28);c.writeUInt32LE(offset,42);
  central.push(c,nb);offset+=h.length+nb.length+packed.length;
 }
 const directory=Buffer.concat(central);const e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);
 e.writeUInt16LE(records.length,8);e.writeUInt16LE(records.length,10);
 e.writeUInt32LE(directory.length,12);e.writeUInt32LE(offset,16);
 return new File([Buffer.concat([...locals,directory,e])],"muhasebe-ornek.zip",{type:"application/zip"});
}
test("monthly accountant ZIP extracts two XLS workbooks but never uploads PDF slips",async()=>{
 const sample=zip([["BORDRO 1.xls","legacy-sample-A"],["BORDRO 2.xls","legacy-sample-B"],["PUSULA 1.pdf","private-pdf-sample"]]);
 const result=await expandAccountantPayrollFiles([sample]);
 assert.deepEqual(result.files.map(f=>f.name),["BORDRO 1.xls","BORDRO 2.xls"]);
 assert.deepEqual(result.supplementalPdfs,["PUSULA 1.pdf"]);
 assert.equal(await result.files[0].text(),"legacy-sample-A");
 assert.equal(await result.files[1].text(),"legacy-sample-B");
});
test("uncompressed ZIP and direct XLSX supported",async()=>{
 const source=new File(["workbook"],"BORDRO.xlsx");
 const result=await expandAccountantPayrollFiles([zip([["ALT.xls","sample"]],false),source]);
 assert.deepEqual(result.files.map(f=>f.name),["ALT.xls","BORDRO.xlsx"]);
});
test("ZIP path traversal and repeated member names are not accepted",async()=>{
 await assert.rejects(()=>expandAccountantPayrollFiles([zip([["../secret.xls","data"]])]),/geçersiz dosya yolu/);
 await assert.rejects(()=>expandAccountantPayrollFiles([zip([["A.xls","a"],["A.xls","b"]])]),/aynı isimli/);
});
