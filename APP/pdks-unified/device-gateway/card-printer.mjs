/**
 * Windows-driver card printing: generates a browser print layout only.
 * NO silent spooler commands or writes to a physical terminal/RFID chip.
 * A real personnel card requires an explicit verified mapping and consent.
 */
const text=v=>String(v??"").trim();
const escapeHtml=v=>text(v).replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
})[c]);
const fit=(v,max,name)=>{
  const s=text(v);
  if(!s||s.length>max||/[\x00-\x1f\x7f]/.test(s))
    throw Error(name);
  return s;
};
export function buildCardPrintHtml({
  type="test",companyName="KY PDKS",personnelName="",cardNo="",
  employeeId="",mappingVerified=false,operatorApproved=false,
}={}){
  if(!["test","personnel"].includes(type))
    throw Error("CARD_PRINT_TYPE_INVALID");
  const company=fit(companyName,90,"CARD_PRINT_COMPANY_INVALID");
  let label="TEST KARTI",number="00000",caption="TEST — PERSONEL KARTI DEĞİLDİR";
  if(type==="personnel"){
    if(mappingVerified!==true||operatorApproved!==true)
      throw Error("CARD_PRINT_APPROVAL_REQUIRED");
    label=fit(personnelName,90,"CARD_PRINT_NAME_INVALID");
    fit(employeeId,100,"CARD_PRINT_EMPLOYEE_ID_REQUIRED");
    number=fit(cardNo,10,"CARD_PRINT_NUMBER_INVALID");
    if(!/^\d{5}$/.test(number))
      throw Error("CARD_PRINT_FIVE_DIGIT_NUMBER_REQUIRED");
    caption="KY PDKS · PERSONEL KARTI";
  }
  return `<!doctype html><html lang="tr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KY PDKS Kart Baskı Önizleme</title><style>
@page{size:86mm 54mm;margin:0}
*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#142b40}
.card{width:86mm;height:54mm;border:1px solid #bbc8d0;padding:5mm;
display:flex;flex-direction:column;justify-content:space-between;background:#fff}
.company{font-size:10pt;font-weight:bold}.person{font-size:16pt;font-weight:bold;
overflow-wrap:anywhere}.number{font-size:15pt;letter-spacing:3px;font-weight:bold}
.note{font-size:6.5pt;color:#415262}
.controls{padding:12px;background:#eee;text-align:center}
button{font:16px Arial;padding:10px 18px;cursor:pointer}
@media print{.controls{display:none}.card{border:0}}
</style></head><body><div class="controls"><button type="button"
onclick="window.print()">Yazdırma penceresini aç</button>
<p>Windows'ta kurulu kart yazıcısını seçin. Baskı otomatik başlatılmaz.</p></div>
<div class="card"><div class="company">${escapeHtml(company)}</div>
<div class="person">${escapeHtml(label)}</div>
<div class="number">${escapeHtml(number)}</div>
<div class="note">${escapeHtml(caption)}</div></div></body></html>`;
}
