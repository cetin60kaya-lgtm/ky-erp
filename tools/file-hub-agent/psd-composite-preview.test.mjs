import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { deflateSync, inflateSync } from 'node:zlib';
import { renderPsdComposite } from './psd-composite-preview.mjs';
const u16 = n => { const b=Buffer.alloc(2);b.writeUInt16BE(n);return b; };
const u32 = n => { const b=Buffer.alloc(4);b.writeUInt32BE(n);return b; };
function fixture({psb=false,mode=3,depth=8,compression=0,width=2,height=1,channels=4,planes,resource=Buffer.alloc(0)}) {
  const h=Buffer.alloc(26);
  h.write('8BPS',0);h.writeUInt16BE(psb?2:1,4);h.writeUInt16BE(channels,12);h.writeUInt32BE(height,14);h.writeUInt32BE(width,18);h.writeUInt16BE(depth,22);h.writeUInt16BE(mode,24);
  let encoded=[];const rows=planes.flatMap(ch=>Array.from({length:height},(_,y)=>ch.subarray(y*width*(depth/8),(y+1)*width*(depth/8))));
  if (compression === 0) encoded = rows;
  if (compression === 1) encoded = rows.map(row=>Buffer.concat([Buffer.from([row.length-1]),row]));
  if (compression === 2) encoded = [deflateSync(Buffer.concat(rows))];
  if (compression === 3) {
    encoded=[deflateSync(Buffer.concat(rows.map(row=>{
      const copy=Buffer.from(row);
      if (depth===16) {
        const sh=Buffer.alloc(copy.length);for(let x=0;x<width;x++){sh[x]=copy[x*2];sh[width+x]=copy[x*2+1];} sh.copy(copy);
      }
      for(let i=copy.length-1;i>=1;i--)copy[i]=(copy[i]-copy[i-1]+256)%256;
      return copy;
    })))];
  }
  let table = Buffer.alloc(0);
  if(compression===1)table=Buffer.concat(encoded.map(e=>psb?u32(e.length):u16(e.length)));
  return Buffer.concat([h,u32(0),u32(resource.length),resource,psb?Buffer.alloc(8):u32(0),u16(compression),table,...encoded]);
}
function imagePixels(png) {
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const w=png.readUInt32BE(16),h=png.readUInt32BE(20);
  const dat=[];let pos=8;
  while(pos<png.length){const n=png.readUInt32BE(pos),t=png.toString('ascii',pos+4,pos+8);if(t==='IDAT')dat.push(png.subarray(pos+8,pos+8+n));pos+=n+12;}
  const pixels=inflateSync(Buffer.concat(dat));
  assert.equal(pixels[0],0);
  return {w,h,px:Array.from(pixels.subarray(1,1+w*4))};
}
for(const psb of [false,true]) for(const compression of [0,1,2,3]) for(const depth of [8,16]) {
 test((psb?'PSB':'PSD')+' compression '+compression+' depth '+depth,async()=>{
  const dup=depth/8;
  const planes=[[255,0],[0,255],[0,0],[255,128]].map(values=>Buffer.from(values.flatMap(x=>dup===1?[x]:[x,0])));
  const dir=await mkdtemp(path.join(os.tmpdir(),'ky-psd-'));
  try{
   const file=path.join(dir,psb?'fixture.psb':'fixture.psd');await writeFile(file,fixture({psb,compression,depth,planes}));
   const result=await renderPsdComposite(file);
   assert.deepEqual(imagePixels(result.png),{w:2,h:1,px:[255,0,0,255,0,255,0,128]});
  }finally{await rm(dir,{recursive:true,force:true})}
 });
}
test('malformed input rejected without modifying file',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ky-psd-'));const file=path.join(dir,'bad.psd');
 try{await writeFile(file,'not a PSD');await assert.rejects(renderPsdComposite(file),/PSD_TRUNCATED/);}finally{await rm(dir,{recursive:true,force:true})}
});

test('screen printing spot inks use Photoshop DisplayInfo preview colours',async()=>{
  const spotInfo = Buffer.alloc(4 + 2*13); spotInfo.writeUInt32BE(1,0);
  for (const [i,hue] of [0,2/3].entries()) {
    const off=4+i*13;
    spotInfo.writeUInt16BE(1,off); // Photoshop HSB colour space
    spotInfo.writeUInt16BE(Math.round(hue*65535),off+2);
    spotInfo.writeUInt16BE(65535,off+4);
    spotInfo.writeUInt16BE(65535,off+6);
    spotInfo.writeUInt16BE(100,off+10);spotInfo[off+12]=2;
  }
  const resource=Buffer.concat([Buffer.from('8BIM'),u16(1077),Buffer.from([0,0]),u32(spotInfo.length),spotInfo,Buffer.alloc(spotInfo.length%2)]);
  const dir=await mkdtemp(path.join(os.tmpdir(),'ky-psd-'));
  try {
    const file=path.join(dir,'spots.psd');
    await writeFile(file,fixture({mode:7,channels:2,compression:1,planes:[Buffer.from([0,255]),Buffer.from([255,0])],resource}));
    const result=await renderPsdComposite(file);
    assert.deepEqual(imagePixels(result.png),{w:2,h:1,px:[255,0,0,255,0,0,255,255]});
  } finally { await rm(dir,{recursive:true,force:true}); }
});
