/**
 * KY PDKS source-backed report projections.
 * Read-only. D1 payroll amounts are NOT proof of a settled payment,
 * an approved puantaj, a Firebird/TNF reconciliation or a signature.
 */
const shown = (v) => v === null || v === undefined || v === "" ? "—" : String(v);
const cents = (v) => v === null || v === undefined || v === "" ||
  !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100);
const periodOf = (year,month) => `${year}-${String(month).padStart(2,"0")}`;
const dateOk = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value??""))) return false;
  const date=new Date(value+"T00:00:00Z");
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
};
const clock = (raw) => {
  const s=String(raw??"").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : "";
};
const get = (row,key) => shown(row?.[key]);
const sourceStatus = "D1 ön görünümü · onaylı FDB/TNF puantajı yok";

export function paymentBalance(row) {
  const bank=cents(row.bankAmount),cash=cents(row.cashAmount),total=cents(row.totalAmount);
  if ([bank,cash,total].some(value=>value===null))return "Ödeme dengesi doğrulanamadı";
  return bank+cash===total ?
    "Plan tutarlı · ödeme dekontu doğrulanmadı" :
    "TUTARSIZ: banka + elden, toplamla eşleşmiyor";
}

export function payrollRowsForTab(id,payload,{year,month}={}) {
  year ??= payload?.year;
  month ??= payload?.month;
  if (!Array.isArray(payload?.lines) ||
      !Number.isInteger(Number(year)) || !Number.isInteger(Number(month)) ||
      Number(year)<2020 || Number(month)<1 || Number(month)>12 ||
      Number(payload?.year)!==Number(year) || Number(payload?.month)!==Number(month))
    return {rows:[],supported:false};
  const seen=new Set(),period=periodOf(year,month),rows=[];
  for (const line of payload.lines) {
    const key=String(line?.employeeId??"").trim();
    if (!key || seen.has(key) || !String(line?.fullName??"").trim())
      return {rows:[],supported:false};
    seen.add(key);
    const common={
      _id:key,"Personel":get(line,"fullName"),"Kart No":get(line,"cardNo"),
      "Dönem":period,"Maaş":get(line,"salary"),
      "Yol":get(line,"roadAllowance"),"Yemek":get(line,"mealAmount"),
      "Mesai":get(line,"overtimeAmount"),"Avans":get(line,"advanceAmount"),
      "Kesinti":get(line,"deductionAmount"),"İcra/Haciz":get(line,"garnishmentAmount"),
      "BES":get(line,"besAmount"),"Banka":get(line,"bankAmount"),
      "Elden":get(line,"cashAmount"),"Toplam":get(line,"totalAmount"),
      "Net":get(line,"totalAmount"),"Brüt":get(line,"grossAmount"),
      "Durum":sourceStatus,"Ödeme":paymentBalance(line),
      "Tutar":get(line,"totalAmount"),"Belge":"Taslak · ödeme fişi kanıtı yok",
      "İmza":"", "Rapor":"Bordro ön kontrolü",
    };
    // No actual payment receipt, signature or gross-wage proof is inferred.
    if (id==="receipts") common["Durum"]="İmza/ödeme kanıtı bekleniyor";
    rows.push(common);
  }
  return {rows,supported:true,scope:"authorized-d1-payroll-unreconciled"};
}

/**
 * Only explicit missing-punch evidence creates a blank signature request.
 * The existing recorded side is shown as evidence, NEVER as a fabricated
 * timestamp for the missing side. E/manual corrections stay visibly distinct.
 */
export function signatureRowsFromDays(person,days,{year,month}={}) {
  if (!Array.isArray(days) || !person?.id)
    throw Error("PDKS_IMZA_KAYNAK_GECERSIZ");
  const p=periodOf(year,month),rows=[],seen=new Set();
  for (const day of days) {
    const date=String(day?.date??day?.workDate??"");
    if (!dateOk(date) || !date.startsWith(p+"-") || seen.has(date))
      throw Error("PDKS_IMZA_TARIH_KAPSAM_HATASI");
    seen.add(date);
    const status=String(day?.status??"").toUpperCase();
    if (!["KART_YOK","EKSIK_BASIM"].includes(status) && day?.missingPunch!==true)
      continue;
    const entry=clock(day?.entry),exit=clock(day?.exit);
    const observed=[entry?`Okunan giriş: ${entry}`:"",exit?`Okunan çıkış: ${exit}`:""].filter(Boolean).join(" / ")||"—";
    const base={
      "Tarih":date,"Personel":shown(person.fullName),"Kart No":shown(person.cardNo),
      "Saat":observed,"İmza":"","Durum":"İmza bekliyor · kaynak D1, FDB/TNF kontrolü yok",
    };
    const sides= !entry&&!exit?["Sabah giriş","Akşam çıkış"]:
      !entry?["Sabah giriş"]:!exit?["Akşam çıkış"]:["Eksik hareket (yön belirsiz)"];
    for (const side of sides)rows.push({
      ...base,_id:`${person.id}|${date}|${side}`,"Eksik Hareket":side,
    });
  }
  return rows;
}
