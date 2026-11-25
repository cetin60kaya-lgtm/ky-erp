export function quantityPlan(lines, amounts, prices, taxes) {
  if(!Array.isArray(lines)||!lines.length)throw Error("Kaynak kalem yok.");
  const result=lines.map(line=>{
    const parse=(v)=>{if(v===""||v==null)return NaN;return Number(v)};
    const available=parse(line.remaining),quantity=parse(amounts[line.id]??0);
    if(!Number.isFinite(available)||available<0||!Number.isFinite(quantity)||quantity<0||quantity>available)throw Error("Sevk miktarı kalan miktarı aşamaz.");
    if(quantity===0)return {...line,quantity,after:available,net:0,vat:0,total:0};
    const price=parse(prices[line.id]),tax=parse(taxes[line.id]??20);
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(tax)||tax<0||tax>100)throw Error("Birim fiyat ve KDV oranını kontrol edin.");
    const round=n=>Math.round((n+Number.EPSILON)*100)/100;
    const net=round(quantity*price),vat=round(net*tax/100);
    return {...line,quantity,after:Math.max(0,Number((available-quantity).toFixed(6))),price,tax,net,vat,total:round(net+vat)};
  });
  if(!result.some(x=>x.quantity>0))throw Error("En az bir sevk kalemi seçin.");
  const sum=k=>Math.round(result.reduce((s,x)=>s+x[k],0)*100)/100;
  return {lines:result,net:sum("net"),vat:sum("vat"),total:sum("total")};
}
