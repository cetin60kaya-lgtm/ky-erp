/** Approximate visual measurements from PDF text geometry. Not a fidelity certification.
 * Reference pages may be scanned or use drawn outlines: in such cases fail
 * visibly and require manual PDF comparison instead of inventing coordinates.
 */
const bounded=(v,min,max)=>Math.max(min,Math.min(max,Math.round(v*10)/10));
const percentile=(numbers,p)=>{
 const a=[...numbers].sort((x,y)=>x-y);
 return a.length?a[Math.min(a.length-1,Math.floor(p*(a.length-1)))]:0;
};
export function suggestVisualLayoutFromPdfText(items,pageHeight){
 const rows=(items||[]).map(item=>({
  text:String(item?.str||"").trim(),
  x:Number(item?.transform?.[4]),y:Number(item?.transform?.[5]),
  size:Math.abs(Number(item?.transform?.[3]||item?.height||0)),
 })).filter(x=>x.text&&Number.isFinite(x.x)&&Number.isFinite(x.y)&&Number.isFinite(x.size)&&x.size>3&&x.size<40);
 if(rows.length<8||!Number.isFinite(pageHeight)||pageHeight<200)throw Error("PDF metin konumu otomatik ölçülemedi. Taranmış PDF ise değerleri elle düzenleyin.");
 const left=percentile(rows.filter(x=>x.x>=2&&x.x<250).map(x=>x.x),.16);
 const top=Math.max(...rows.map(x=>x.y));
 const body=rows.filter(x=>x.size<=15).map(x=>x.size);
 const title=rows.filter(x=>/e[-\s]?fatura|irsaliye/i.test(x.text)).map(x=>x.size);
 return {
  marginSide:bounded(left||26,10,120),
  marginTop:bounded(pageHeight-top-5,0,150),
  fontSize:bounded(percentile(body,.55)||9,6,18),
  titleSize:bounded(percentile(title,.8)||16,10,28),
  tableFontSize:bounded(percentile(body,.3)||8,5,16),
 };
}
