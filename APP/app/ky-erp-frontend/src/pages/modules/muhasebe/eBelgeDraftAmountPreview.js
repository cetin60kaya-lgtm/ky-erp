// Non-authoritative display only. Same integer scales and half-up rounding as the Worker.
const digits=(v,scale,maxWhole)=>{
 const s=String(v??"").trim().replace(",",".");
 if(!new RegExp("^\\d{1,"+maxWhole+"}(?:\\.\\d{1,"+scale+"})?$").test(s))throw Error("invalid");
 const [whole,fraction=""]=s.split(".");return BigInt(whole+fraction.padEnd(scale,"0"));
};
const round=(n,d)=>(n+d/2n)/d;
const decimal=n=>{const s=n.toString().padStart(3,"0");return s.slice(0,-2)+"."+s.slice(-2)};
export function draftAmountPreview(lines){
 if(!Array.isArray(lines)||!lines.length||lines.length>200)return null;
 try{
  let grossSum=0n,discountSum=0n,net=0n,vat=0n;
  const items=lines.map(l=>{
   if(!String(l.description??"").trim()||!String(l.unit??"").trim())throw Error("incomplete");
   const q=digits(l.quantity,3,7),p=digits(l.price,4,7),r=digits(l.vatRate,2,3),d=digits(l.discountRate??"0",2,3);
   if(q<=0n||r>10000n||d>10000n||l.freeKind&&(p!==0n||r!==0n||d!==0n))throw Error("invalid");
   const gross=round(q*p,100000n),discount=round(gross*d,10000n),n=gross-discount,v=round(n*r,10000n);
   grossSum+=gross;discountSum+=discount;net+=n;vat+=v;
   return {net:decimal(n),vat:decimal(v),total:decimal(n+v)};
  });
  return {gross:decimal(grossSum),discount:decimal(discountSum),net:decimal(net),vat:decimal(vat),total:decimal(net+vat),items};
 }catch{return null;}
}
