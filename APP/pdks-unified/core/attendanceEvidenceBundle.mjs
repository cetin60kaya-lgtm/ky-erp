import {evaluateAttendanceDay} from "./attendanceRules.mjs";

/* Pure, read-only source comparison. A user-selected file is not a certified
 * device connection or a payroll approval, even when all three sources agree.
 */
const fail=code=>{throw new Error(code);};
const validDate=value=>{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const valueMs=Date.parse(value+"T12:00:00Z");
  return Number.isFinite(valueMs)&&new Date(valueMs).toISOString().slice(0,10)===value;
};
const validStamp=(stamp,withSeconds)=>{
  if(typeof stamp!=="string")return false;
  const match=(withSeconds?/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/:/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/).exec(stamp);
  return Boolean(match&&validDate(match[1]));
};
const dateAfter=date=>new Date(Date.parse(date+"T12:00:00Z")+86400000).toISOString().slice(0,10);
const validCard=card=>typeof card==="string"&&/^\d{5}$/.test(card);
const expectedSource={raw:"DEVICE_RAW",firebird:"FIREBIRD_GIRCIK_COPY",tnf:"ANNUAL_TNF",adminE:"ADMIN_E_APPROVAL"};
const pairKey=item=>item.timestamp+"|"+item.direction;
const minuteKey=item=>item.timestamp.slice(0,16);
const sameMultiset=(first,second,key)=>{
  if(first.length!==second.length)return false;
  const counts=new Map();
  for(const item of first){const k=key(item);counts.set(k,(counts.get(k)||0)+1);}
  for(const item of second){const k=key(item);const n=counts.get(k)||0;if(n===0)return false;counts.set(k,n-1);}
  return [...counts.values()].every(n=>n===0);
};
function validateRecords(day,source,ids){
  const rows=day[source];
  if(!Array.isArray(rows)||rows.length>100)fail("EVIDENCE_SOURCE_ARRAY_REQUIRED");
  return rows.map(item=>{
    if(!item||item.source!==expectedSource[source]||typeof item.eventId!=="string"||
      !item.eventId.trim()||item.eventId.length>160)fail("EVIDENCE_SOURCE_ID_INVALID");
    const id=source+"|"+item.eventId;
    if(ids.has(id))fail("EVIDENCE_DUPLICATE_SOURCE_ID");
    ids.add(id);
    if(!validStamp(item.timestamp,source!=="tnf"))fail("EVIDENCE_TIMESTAMP_INVALID");
    if(![day.date,dateAfter(day.date)].includes(item.timestamp.slice(0,10)))
      fail("EVIDENCE_PUNCH_OUTSIDE_DAY_WINDOW");
    if(source==="raw"||source==="firebird"||source==="adminE"){
      if(!["IN","OUT"].includes(item.direction))fail("EVIDENCE_DIRECTION_REQUIRED");
    }
    if(source==="firebird"&&typeof item.legacyType!=="string")fail("EVIDENCE_LEGACY_TYPE_REQUIRED");
    if(source==="raw"||source==="adminE"){
      if(typeof item.shiftId!=="string"||!item.shiftId.trim())
        fail("EVIDENCE_SHIFT_ASSIGNMENT_REQUIRED");
    }
    if(source==="adminE"&&(!item.approvalId||!item.approvedBy))
      fail("EVIDENCE_E_APPROVAL_REQUIRED");
    return item;
  });
}
function evaluateOne(record,person,ids){
  const sets={};
  for(const source of Object.keys(expectedSource))sets[source]=validateRecords(record,source,ids);
  const physicalFdb=sets.firebird.filter(item=>item.legacyType.toUpperCase()!=="E");
  const eFdb=sets.firebird.filter(item=>item.legacyType.toUpperCase()==="E");
  const matchingPhysical=sameMultiset(sets.raw,physicalFdb,pairKey);
  const matchingAdminE=sameMultiset(sets.adminE,eFdb,pairKey);
  // TNF has no IN/OUT direction and minute precision only. Compare exact
  // cardinality by minute; never infer a missing side from TNF order.
  const matchingTnf=sameMultiset([...sets.raw,...sets.adminE],sets.tnf,minuteKey);
  const warnings=[];
  if(!matchingPhysical)warnings.push("RAW_FIREBIRD_MISMATCH");
  if(!matchingAdminE)warnings.push("E_FIREBIRD_MISMATCH");
  if(!matchingTnf)warnings.push("TNF_MISMATCH");
  if(record.leave?.approved===true&&(!record.leave.approvalId||!record.leave.approvedBy))
    warnings.push("LEAVE_APPROVAL_UNPROVEN");
  if(record.holiday?.explicitWorkApproval===true&&
     (!record.holiday.approvalId||!record.holiday.approvedBy))
    warnings.push("HOLIDAY_WORK_APPROVAL_UNPROVEN");
  const events=[...sets.raw.map(item=>({eventId:item.eventId,
    source:"PHYSICAL_RAW",timestamp:item.timestamp.slice(0,16),
    direction:item.direction,shiftId:item.shiftId})),
    ...sets.adminE.map(item=>({eventId:item.eventId,source:"ADMIN_E",
      timestamp:item.timestamp.slice(0,16),direction:item.direction,
      shiftId:item.shiftId,approvalId:item.approvalId,approvedBy:item.approvedBy}))];
  const calculation=evaluateAttendanceDay({date:record.date,
    timezone:"Europe/Istanbul",events,
    shifts:record.shifts,employment:person.employment,workDays:person.workDays,
    requirePunch:person.requirePunch,leave:record.leave,
    holiday:record.holiday,restDayWorkApproved:record.restDayWorkApproved===true});
  const compared=warnings.length===0;
  const paired=compared&&calculation.status==="D1_EVIDENCE_PAIR_COMPLETE";
  return Object.freeze({cardNo:record.cardNo,date:record.date,fullName:person.fullName,
    status:!compared?"SOURCE_EVIDENCE_MISMATCH":calculation.status,
    matchedSources:compared,paired,rawCount:sets.raw.length,
    fdbCount:sets.firebird.length,tnfCount:sets.tnf.length,eCount:sets.adminE.length,
    reviewMinutes:paired?calculation.workMinutes:null,
    shifts:calculation.shifts,
    warnings:Object.freeze([...warnings,...calculation.warnings]),
    independentlyCertified:false,localReconciled:false,approvedForPayroll:false});
}
export function evaluateAttendanceEvidenceBundle(input,{companyId=null,period=null}={}){
  const doc=typeof input==="string"?JSON.parse(input):input;
  if(!doc||doc.kind!=="KY_PDKS_ATTENDANCE_EVIDENCE_V1"||doc.schemaVersion!==1||
     doc.timezone!=="Europe/Istanbul"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(doc.period||"")||
     !doc.companyId||typeof doc.companyId!=="string"||doc.companyId.length>100||
     companyId!==null&&doc.companyId!==companyId||period!==null&&doc.period!==period||
     !Array.isArray(doc.personnel)||!Array.isArray(doc.days)||
     doc.personnel.length<1||doc.personnel.length>500||doc.days.length>16000)
    fail("EVIDENCE_BUNDLE_CONTRACT_INVALID");
  const people=new Map();
  for(const person of doc.personnel){
    if(!validCard(person?.cardNo)||people.has(person.cardNo)||
       typeof person.fullName!=="string"||person.fullName.length>150||
       !person.fullName.trim()||typeof person.requirePunch!=="boolean"||
       !Array.isArray(person.workDays)||person.workDays.some(d=>!Number.isInteger(d)||d<0||d>6)||
       !person.employment||typeof person.employment!=="object"||
       person.employment.startDate!=null&&!validDate(person.employment.startDate)||
       person.employment.exitDate!=null&&!validDate(person.employment.exitDate))
      fail("EVIDENCE_PERSON_INVALID");
    people.set(person.cardNo,person);
  }
  const ids=new Set(),days=[],uniqueDays=new Set();
  for(const record of doc.days){
    if(!record||!validCard(record.cardNo)||!people.has(record.cardNo)||
       !validDate(record.date)||record.date.slice(0,7)!==doc.period||
       !Array.isArray(record.shifts)||record.shifts.length>2)
      fail("EVIDENCE_DAY_INVALID");
    const key=record.cardNo+"|"+record.date;
    if(uniqueDays.has(key))fail("EVIDENCE_DUPLICATE_PERSON_DAY");
    uniqueDays.add(key);
    days.push(evaluateOne(record,people.get(record.cardNo),ids));
  }
  days.sort((a,b)=>a.date.localeCompare(b.date)||a.cardNo.localeCompare(b.cardNo));
  const [year,month]=doc.period.split("-").map(Number);
  const calendarDays=new Date(Date.UTC(year,month,0)).getUTCDate();
  const monthly=[...people.values()].map(person=>{
    const rows=days.filter(d=>d.cardNo===person.cardNo);
    const paired=rows.filter(d=>d.paired);
    const unresolved=rows.filter(d=>!d.paired&&
      !["APPROVED_LEAVE","OFFICIAL_HOLIDAY","WEEKLY_REST","HALF_DAY_OFF",
        "OUTSIDE_EMPLOYMENT","PUNCH_EXEMPT"].includes(d.status)&&d.warnings.length===0);
    return Object.freeze({cardNo:person.cardNo,fullName:person.fullName,
      coveredDays:rows.length,missingCalendarDays:calendarDays-rows.length,
      pairedDays:paired.length,reviewDays:unresolved.length,
      approvedLeaveDays:rows.filter(d=>d.status==="APPROVED_LEAVE").length,
      holidayDays:rows.filter(d=>d.status==="OFFICIAL_HOLIDAY").length,
      doubleShiftDays:paired.filter(d=>d.shifts.length===2).length,
      matchedReviewMinutes:paired.reduce((sum,d)=>sum+d.reviewMinutes,0),
      sourceComparisonComplete:rows.length===calendarDays&&unresolved.length===0&&
        rows.every(d=>d.matchedSources),
      approvedForPayroll:false});
  });
  return Object.freeze({kind:"KY_PDKS_ATTENDANCE_REVIEW_ONLY",companyId:doc.companyId,
    period:doc.period,days:Object.freeze(days),monthly:Object.freeze(monthly),
    sourceComparisonComplete:monthly.every(p=>p.sourceComparisonComplete),
    independentlyCertified:false,localReconciled:false,approvedForPayroll:false,
    note:"Local file cross-check only: sources, approvals and employee identity are not independently authenticated."});
}
