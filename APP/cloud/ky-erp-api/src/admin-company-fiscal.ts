export function companyFiscalFields(body:Record<string, unknown>){
 const limits={legalName:250,taxNumber:11,taxOffice:150,address:1000,email:254,phone:50};
 return Object.entries(limits).map(([key,max])=>{
  if(!Object.prototype.hasOwnProperty.call(body,key))return null;
  if(typeof body[key]!=="string")throw Error("Firma bilgileri metin olmalıdır.");
  const v=String(body[key]).trim();
  if(v.length>max||key==="taxNumber"&&v&&!/^\d{10,11}$/.test(v)||key==="email"&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw Error("Vergi kimliği, e-posta veya firma bilgisi biçimi geçersiz.");
  return v;
 });
}
