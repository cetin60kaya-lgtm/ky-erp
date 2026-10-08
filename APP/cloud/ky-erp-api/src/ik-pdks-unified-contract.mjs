/**
 * One pure command validation contract shared by Cloud Worker and unit tests.
 * No IO, no implicit default punches, no side effects.
 */
export const commandValue=(v)=>v==null?"":String(v).trim();
const val=commandValue;
export const commandFold=(v)=>val(v).toLocaleUpperCase("tr-TR");
const fold=commandFold;
const isoDate=(v)=>{
  const s=val(v);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error("INVALID_DATE");
  const [y,m,d]=s.split("-").map(Number),dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()+1!==m||dt.getUTCDate()!==d)
    throw new Error("INVALID_DATE");
  return s;
};
const time=(v)=>{
  const s=val(v);
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw new Error("INVALID_TIME");
  return s;
};
const note=(v)=>{
  const s=val(v);
  if(s.length<8||s.length>900)throw new Error("PDKS_REASON_REQUIRED");
  return s;
};
const code=(v)=>{
  const s=fold(v);
  if(!/^[A-Z0-9ÇĞİÖŞÜ_-]{2,40}$/.test(s))throw new Error("PDKS_CODE_INVALID");
  return s;
};
const name=(v)=>{
  const s=val(v);
  if(s.length<2||s.length>150)throw new Error("PDKS_NAME_REQUIRED");
  return s;
};
const amount=(v)=>{
  const n=Number(v);
  if(!Number.isFinite(n)||n<=0||n>1e9||Math.abs(Math.round(n*100)-n*100)>1e-7)
    throw new Error("PDKS_AMOUNT_INVALID");
  return n;
};
const count=(v,max)=>{
  const n=Number(v);
  if(!Number.isInteger(n)||n<0||n>max)throw new Error("PDKS_COUNT_INVALID");
  return n;
};
function normalized(action,p){
  const personId=()=>{const id=val(p.employeeId);if(!id||id.length>120)throw new Error("PERSON_REQUIRED");return id;};
  const reason=()=>note(p.reason||p.note);
  switch(action){
    case "work-group":return {code:code(p.code),name:name(p.name),
      entryTime:time(p.entryTime),exitTime:time(p.exitTime),
      lateTolerance:count(p.lateTolerance,240),
      earlyTolerance:count(p.earlyTolerance,240),reason:reason()};
    case "personnel-group":
      if(!["BLUE_COLLAR","WHITE_COLLAR","CUSTOM"].includes(val(p.personnelClass)))
        throw new Error("PERSONNEL_CLASS_INVALID");
      if(typeof p.requirePunch!=="boolean")throw new Error("PUNCH_POLICY_REQUIRED");
      return {code:code(p.code),name:name(p.name),
        personnelClass:p.personnelClass,requirePunch:p.requirePunch,reason:reason()};
    case "service":return {code:code(p.code),name:name(p.name),
      routeNote:val(p.routeNote).slice(0,900),reason:reason()};
    case "assign-work-group":return {employeeId:personId(),groupId:val(p.groupId),reason:reason()};
    case "assign-personnel-group":return {employeeId:personId(),
      personnelGroupId:val(p.personnelGroupId),reason:reason()};
    case "assign-service":return {employeeId:personId(),serviceId:val(p.serviceId),reason:reason()};
    case "holiday":{
      const halfDay=p.halfDay===true;
      const n=reason();
      if(halfDay && n.length<20)throw new Error("HALF_DAY_DECISION_REQUIRED");
      return {date:isoDate(p.date),name:name(p.name),halfDay,note:n};
    }
    case "leave":{
      const startDate=isoDate(p.startDate),endDate=isoDate(p.endDate);
      if(startDate>endDate || (Date.parse(endDate)-Date.parse(startDate))>367*86400000)
        throw new Error("LEAVE_RANGE_INVALID");
      if(!["YILLIK","MAZERET","RAPOR"].includes(fold(p.recordType)))
        throw new Error("LEAVE_TYPE_INVALID");
      return {employeeId:personId(),startDate,endDate,
        recordType:fold(p.recordType),note:reason()};
    }
    case "advance":return {employeeId:personId(),date:isoDate(p.date),
      amount:amount(p.amount),note:reason()};
    case "deduction":return {employeeId:personId(),date:isoDate(p.date),
      amount:amount(p.amount),note:reason()};
    case "overtime":{
      const adjustmentType=val(p.adjustmentType);
      if(!["Hafta İçi Mesai","Hafta Sonu Mesai","Resmi Tatil Mesai"].includes(adjustmentType))
        throw new Error("OVERTIME_TYPE_INVALID");
      const hours=Number(p.hourOrDay);
      if(!Number.isFinite(hours)||hours<=0||hours>24)throw new Error("OVERTIME_HOURS_INVALID");
      const match=/Mesai oranı: %(50|100) \| (.+)/.exec(val(p.note));
      if(!match||match[2].length<8)throw new Error("OVERTIME_APPROVED_RATE_REQUIRED");
      const paymentMethod=val(p.paymentMethod);
      if(!["Bordro","Elden"].includes(paymentMethod))throw new Error("PAYMENT_METHOD_INVALID");
      return {employeeId:personId(),date:isoDate(p.date),adjustmentType,
        hourOrDay:hours,amount:amount(p.amount),paymentMethod,
        note:`Mesai oranı: %${match[1]} | ${note(match[2])}`};
    }
    default:throw new Error("PDKS_ACTION_NOT_SUPPORTED");
  }
}
export function validateUnifiedCommand(action,payload){
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    throw new Error("PDKS_PAYLOAD_INVALID");
  return Object.freeze(normalized(action,payload));
}
