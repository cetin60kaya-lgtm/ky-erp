/**
 * KY PDKS — deterministic, evidence-preserving attendance evaluation core.
 *
 * Pure computation only: NEVER updates terminal RAW, FDB, annual TNF or D1.
 * Every input comes from an authoritative external source. No synthetic
 * entry/exit time or automatic "approved punch" is produced.
 *
 * Local wall timestamps require an explicit company timezone. This first
 * certified evaluator currently accepts Europe/Istanbul (no DST). More time
 * zones require separate DST policy and acceptance tests.
 */
const validDate=(raw)=>{
  const s=String(raw??"");
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(!match)return false;
  const [y,m,d]=match.slice(1).map(Number);
  const a=new Date(Date.UTC(y,m-1,d));
  return a.getUTCFullYear()===y&&a.getUTCMonth()+1===m&&a.getUTCDate()===d;
};
const minuteValue=(raw)=>{
  const s=String(raw??"");
  const match=/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if(!match||!validDate(match[1]))throw new Error("INVALID_ATTENDANCE_TIMESTAMP");
  const [year,month,day]=match[1].split("-").map(Number);
  return Date.UTC(year,month-1,day,Number(match[2]),Number(match[3]))/60000;
};
const minuteDiff=(a,b)=>minuteValue(b)-minuteValue(a);
const localDate=(timestamp)=>String(timestamp??"").slice(0,10);
const asBool=(value)=>value===true;
const error=(code)=>{throw new Error(code)};
const compare=(a,b)=>a.timestamp.localeCompare(b.timestamp);
const evidenceKey=(event)=>[event.source,event.eventId].join("|");

function checkEvidence(events){
  if(!Array.isArray(events))error("ATTENDANCE_EVENTS_REQUIRED");
  const keys=new Set();
  return events.map((event)=>{
    const item={...event};
    minuteValue(item.timestamp);
    if(!["PHYSICAL_RAW","ADMIN_E"].includes(item.source))error("INVALID_EVIDENCE_SOURCE");
    if(!item.eventId||!String(item.eventId).trim())error("EVENT_ID_REQUIRED");
    const key=evidenceKey(item);
    if(keys.has(key))error("DUPLICATE_EVIDENCE_ID");
    keys.add(key);
    if(item.direction!==undefined&&item.direction!==null&&
       !["IN","OUT"].includes(item.direction))error("INVALID_PUNCH_DIRECTION");
    if(item.source==="ADMIN_E" && (!item.approvalId || !item.approvedBy))
      item.isApprovedE=false;
    else item.isApprovedE=item.source==="ADMIN_E";
    return Object.freeze(item);
  }).sort(compare);
}
function validateShifts(shifts,date){
  if(!Array.isArray(shifts))error("ATTENDANCE_SHIFTS_REQUIRED");
  const ids=new Set();
  const normalized=shifts.map((shift)=>{
    if(!shift.id||ids.has(String(shift.id)))error("INVALID_SHIFT_ID");
    ids.add(String(shift.id));
    const start=minuteValue(shift.startAt),end=minuteValue(shift.endAt);
    if(start>=end || end-start>24*60)error("INVALID_SHIFT_SPAN");
    if(localDate(shift.startAt)!==date)error("SHIFT_NOT_IN_WORK_DAY");
    const late=shift.lateToleranceMinutes;
    const early=shift.earlyToleranceMinutes;
    if(!Number.isInteger(late)||late<0||late>240 ||
       !Number.isInteger(early)||early<0||early>240)
      error("INVALID_SHIFT_TOLERANCE");
    return Object.freeze({...shift,
      startMinute:start,endMinute:end,scheduledMinutes:end-start});
  }).sort((a,b)=>a.startMinute-b.startMinute);
  for(let i=1;i<normalized.length;i++){
    if(normalized[i].startMinute<normalized[i-1].endMinute)
      error("OVERLAPPING_SHIFTS");
  }
  return normalized;
}
function halted(status,events,problems=[]){
  return Object.freeze({status,workMinutes:null,daysCredited:null,
    shifts:Object.freeze([]),warnings:Object.freeze(problems),
    evidence:Object.freeze(events),rawCount:events.filter((x)=>x.source==="PHYSICAL_RAW").length,
    eCount:events.filter((x)=>x.source==="ADMIN_E").length,
    localReconciled:false,approvedForPayroll:false});
}
function shiftEvaluate(shift,events,options){
  const notices=[];
  const approvedEvents=events.filter((e)=>e.source==="PHYSICAL_RAW"||e.isApprovedE);
  if(approvedEvents.length!==events.length)notices.push("UNAPPROVED_E_EVENT");
  const inbound=approvedEvents.filter((e)=>e.direction==="IN");
  const outbound=approvedEvents.filter((e)=>e.direction==="OUT");
  const withoutDirection=approvedEvents.filter((e)=>!e.direction);
  let arrival=null,departure=null,inferred=false;
  if(withoutDirection.length){
    if(options.allowPairByOrder===true && approvedEvents.length===2 &&
       withoutDirection.length===2 && events.length===2){
      // Two undirected punches can only be proposed, not finalised.
      arrival=approvedEvents[0];departure=approvedEvents[1];inferred=true;
      notices.push("INFERRED_DIRECTION_NEEDS_APPROVAL");
    } else notices.push("UNCLASSIFIED_PUNCH_DIRECTION");
  }else{
    if(inbound.length>1||outbound.length>1)notices.push("MULTIPLE_PUNCH_DIRECTIONS");
    if(inbound.length===1)arrival=inbound[0];
    if(outbound.length===1)departure=outbound[0];
  }
  if(arrival&&departure&&arrival.timestamp>=departure.timestamp){
    notices.push("OUT_BEFORE_IN");arrival=null;departure=null;
  }
  if(!arrival)notices.push("MISSING_ENTRY");
  if(!departure)notices.push("MISSING_EXIT");
  const verified=Boolean(arrival&&departure&&!inferred&&!notices.includes("MULTIPLE_PUNCH_DIRECTIONS") &&
    !notices.includes("UNAPPROVED_E_EVENT"));
  const workMinutes=verified?minuteDiff(arrival.timestamp,departure.timestamp):null;
  if(workMinutes!==null && workMinutes>24*60){
    notices.push("IMPOSSIBLE_DURATION");
  }
  const lateMinutes=arrival?Math.max(0,minuteValue(arrival.timestamp)-
    shift.startMinute-shift.lateToleranceMinutes):null;
  const earlyMinutes=departure?Math.max(0,shift.endMinute-
    shift.earlyToleranceMinutes-minuteValue(departure.timestamp)):null;
  return Object.freeze({
    id:shift.id,
    startAt:shift.startAt,endAt:shift.endAt,
    entry:arrival?.timestamp??null,exit:departure?.timestamp??null,
    entrySource:arrival?.source??null,exitSource:departure?.source??null,
    rawCount:events.filter((e)=>e.source==="PHYSICAL_RAW").length,
    eCount:events.filter((e)=>e.source==="ADMIN_E").length,
    workMinutes:workMinutes!==null && workMinutes<=24*60?workMinutes:null,
    scheduledMinutes:shift.scheduledMinutes,
    lateMinutes,earlyMinutes,
    verified:verified && workMinutes!==null && workMinutes<=24*60,
    warnings:Object.freeze(notices),
  });
}

export function evaluateAttendanceDay(input){
  const date=String(input?.date??"");
  if(!validDate(date))error("INVALID_WORK_DATE");
  if(input.timezone!=="Europe/Istanbul")error("UNVERIFIED_TIMEZONE_POLICY");
  const events=checkEvidence(input.events||[]);
  const shifts=validateShifts(input.shifts||[],date);
  if(input.employment?.startDate && date<input.employment.startDate)
    return halted("OUTSIDE_EMPLOYMENT",events,events.length?["EVENT_OUTSIDE_EMPLOYMENT"]:[]);
  if(input.employment?.exitDate && date>input.employment.exitDate)
    return halted("OUTSIDE_EMPLOYMENT",events,events.length?["EVENT_OUTSIDE_EMPLOYMENT"]:[]);
  if(input.leave?.approved===true)
    return halted("APPROVED_LEAVE",events,events.length?["EVENT_DURING_APPROVED_LEAVE"]:[]);
  const holiday=input.holiday||{kind:"NONE"};
  if(!["NONE","FULL","HALF"].includes(holiday.kind))error("INVALID_HOLIDAY_RULE");
  if(holiday.kind==="FULL" && !asBool(holiday.explicitWorkApproval))
    return halted("OFFICIAL_HOLIDAY",events,events.length?["HOLIDAY_EVENT_REQUIRES_REVIEW"]:[]);
  if(holiday.kind==="HALF"){
    if(!["WORK","OFF"].includes(holiday.workDecision))
      return halted("HALF_DAY_DECISION_REQUIRED",events);
    if(holiday.workDecision==="OFF")
      return halted("HALF_DAY_OFF",events,events.length?["EVENT_ON_HALF_DAY_OFF"]:[]);
    if(!holiday.closingAt||localDate(holiday.closingAt)!==date)
      return halted("HALF_DAY_CLOSING_TIME_REQUIRED",events);
    const close=minuteValue(holiday.closingAt);
    if(shifts.some((shift)=>shift.endMinute>close))
      return halted("HALF_DAY_SHIFT_CONFLICT",events);
  }
  const weekday=new Date(Date.parse(date+"T12:00:00Z")).getUTCDay();
  const weekDays=input.workDays||[1,2,3,4,5];
  if(!Array.isArray(weekDays)||weekDays.some((d)=>!Number.isInteger(d)||d<0||d>6))
    error("INVALID_WORKDAYS");
  if(!weekDays.includes(weekday)&&input.restDayWorkApproved!==true)
    return halted("WEEKLY_REST",events,events.length?["REST_DAY_EVENT_REQUIRES_REVIEW"]:[]);
  if(input.requirePunch===false)
    return halted("PUNCH_EXEMPT",events,events.length?["EXEMPT_PERSON_PUNCHED"]:[]);
  if(shifts.length===0)return halted("NO_APPROVED_SHIFT",events);
  // Two shifts require a source-authorized shiftId per event.
  const uncertainShift=shifts.length>1 && events.some((event)=>!event.shiftId);
  if(uncertainShift)return halted("SHIFT_ASSIGNMENT_UNCERTAIN",events);
  const unknownShift=events.some((event)=>event.shiftId&&
    !shifts.some((shift)=>String(shift.id)===String(event.shiftId)));
  if(unknownShift)return halted("UNKNOWN_SHIFT_EVENT",events);
  const results=shifts.map((shift)=>{
    const records=events.filter((item)=>shifts.length===1 ?
      !item.shiftId||String(item.shiftId)===String(shift.id) :
      String(item.shiftId)===String(shift.id));
    return shiftEvaluate(shift,records,input);
  });
  const complete=results.every((r)=>r.verified);
  const unknown=results.some((r)=>r.warnings.includes("UNCLASSIFIED_PUNCH_DIRECTION")||
    r.warnings.includes("INFERRED_DIRECTION_NEEDS_APPROVAL"));
  const status=complete?"D1_EVIDENCE_PAIR_COMPLETE":
    unknown?"PUNCH_DIRECTION_REVIEW":"MISSING_OR_CONFLICTING_EVIDENCE";
  const minutes=complete?results.reduce((sum,r)=>sum+r.workMinutes,0):null;
  return Object.freeze({
    status,workMinutes:minutes,daysCredited:null,
    shifts:Object.freeze(results),warnings:Object.freeze([...new Set(results.flatMap((r)=>r.warnings))]),
    evidence:Object.freeze(events),
    rawCount:events.filter((x)=>x.source==="PHYSICAL_RAW").length,
    eCount:events.filter((x)=>x.source==="ADMIN_E").length,
    localReconciled:false,approvedForPayroll:false,
  });
}
