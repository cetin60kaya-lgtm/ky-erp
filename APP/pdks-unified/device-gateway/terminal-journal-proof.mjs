import {createHmac,timingSafeEqual} from "node:crypto";
const ok=(value)=>typeof value==="string"&&Buffer.byteLength(value,"utf8")>=32;
const contents=(event)=>{
  if(!event||typeof event!=="object"||Array.isArray(event))
    throw new Error("TERMINAL_JOURNAL_FACT_INVALID");
  // Sorted all top-level facts: journal MAC covers card, company, direction,
  // event time and pending/non-certified flags, not only replay sourceKey.
  const keys=Object.keys(event).filter(k=>k!=="journalMac").sort();
  return "KY_PDKS_QR_JOURNAL_V1\n"+JSON.stringify(keys.map(k=>[k,event[k]]));
};
const mac=(event,key)=>createHmac("sha256",key).update(contents(event)).digest("hex");
export function sealTerminalJournalFact(event,operatorKey){
  if(!ok(operatorKey)||event?.journalMac!==undefined)
    throw new Error("TERMINAL_JOURNAL_KEY_OR_FACT_INVALID");
  return Object.freeze({...event,journalMac:mac(event,operatorKey)});
}
export function verifyTerminalJournalFact(event,operatorKey){
  if(!ok(operatorKey)||!event||!/^[a-f0-9]{64}$/.test(event.journalMac??""))
    return false;
  let expected;
  try{expected=mac(event,operatorKey);}catch{return false;}
  return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(event.journalMac,"hex"));
}
