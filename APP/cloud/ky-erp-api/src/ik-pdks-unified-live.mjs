/**
 * KY PDKS: daily roster projection from existing, tenant-scoped D1 events.
 * A D1 record is NOT automatically a verified physical terminal RAW record.
 * No automatic IN/OUT inferred from AUTO, ordering or an expected shift.
 * Statuses are provisional until separate terminal/FDB/TNF reconciliation.
 */
const value=(v)=>String(v??"").trim();
const time=(v)=>{
  const m=/^([01]\d|2[0-3]):([0-5]\d)(?::\d\d)?$/.exec(value(v));
  return m ? Number(m[1])*60+Number(m[2]) : null;
};
const clock=(v)=>time(v)===null?"":value(v).slice(0,5);
const dir=(v)=>{
  const d=value(v).toUpperCase();
  return ["IN","GIRIS","GİRİŞ","G"].includes(d)?"IN":
    ["OUT","CIKIS","ÇIKIŞ","C"].includes(d)?"OUT":"UNKNOWN";
};
const activeAt=(p,date)=>!((value(p.hireDate)&&value(p.hireDate).slice(0,10)>date)||
  (value(p.exitDate)&&value(p.exitDate).slice(0,10)<date));
const validDate=(date)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const d=new Date(date+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===date;
};
const safeList=(v,name)=>{if(!Array.isArray(v))throw new Error("PDKS_LIVE_"+name+"_NOT_ARRAY");return v;};

/** All rows are tenant-filtered at the endpoint, never client-supplied. */
export function buildLiveSnapshot({date,asOf,people,events,leaves=[],shifts=[]}){
  if(!validDate(date))throw new Error("PDKS_LIVE_DATE_INVALID");
  const personnel=safeList(people,"ROSTER");
  const readings=safeList(events,"EVENTS");
  const permissions=safeList(leaves,"LEAVES");
  const plans=safeList(shifts,"SHIFTS");
  if(personnel.length>1000||readings.length>30000)throw new Error("PDKS_LIVE_LIMIT_EXCEEDED");
  const shiftsByPerson=new Map(plans.map(p=>[value(p.employeeId),p]));
  const leaveByPerson=new Map(permissions.filter(p=>Number(p.leaveFraction??1)>=1)
    .map(p=>[value(p.employeeId),p]));
  const grouped=new Map();
  for(const event of readings){
    if(value(event.workDate).slice(0,10)!==date)continue;
    const id=value(event.employeeId);
    if(!id||time(event.eventTime)===null)continue;
    if(!grouped.has(id))grouped.set(id,[]);
    grouped.get(id).push(event);
  }
  const roster=[];
  const metrics={total:0,arrived:0,inside:0,exited:0,late:0,noRecord:0,
    unknownDirection:0,leave:0,missingExit:0};
  for(const person of personnel){
    const id=value(person.id),cardNo=value(person.cardNo);
    if(!id||!cardNo||!activeAt(person,date))continue;
    const readingsFor=(grouped.get(id)||[]).sort((a,b)=>value(a.eventTime)
      .localeCompare(value(b.eventTime)));
    const verified=readingsFor.filter(e=>dir(e.direction)!=="UNKNOWN");
    const arrivals=verified.filter(e=>dir(e.direction)==="IN");
    const departures=verified.filter(e=>dir(e.direction)==="OUT");
    const entry=arrivals.length?clock(arrivals[0].eventTime):"";
    const exit=departures.length?clock(departures.at(-1).eventTime):"";
    const last=verified.at(-1);
    const lastDirection=last?dir(last.direction):"UNKNOWN";
    const shift=shiftsByPerson.get(id);
    const expected=time(shift?.entryTime);
    const tolerance=Number(shift?.lateTolerance);
    // Explicitly assigned active work group only. No default 08:30 guess.
    const lateMinutes=entry&&shift?.active===true&&expected!==null&&
      Number.isFinite(tolerance)&&tolerance>=0&&tolerance<=240
      ? Math.max(0,time(entry)-expected-tolerance):null;
    const leave=leaveByPerson.get(id);
    let status="KART_KAYDI_YOK";
    if(leave&&!readingsFor.length)status="IZINLI";
    else if(readingsFor.length&&!verified.length)status="YON_BELIRSIZ";
    else if(lastDirection==="OUT")status="CIKIS_KAYDI";
    else if(lastDirection==="IN")status=lateMinutes>0?"GEC_GIRIS":"GIRIS_KAYDI";
    // A solitary IN is NOT missing exit until the verified shift end passes.
    const nowTime=asOf?.slice(11,16)||"";
    const noExit=lastDirection==="IN"&&departures.length===0&&
      shift?.active===true&&time(shift.exitTime)!==null&&
      time(nowTime)!==null&&date===asOf?.slice(0,10)&&
      time(nowTime)>time(shift.exitTime)+Number(shift.earlyTolerance??0);
    if(noExit)status="CIKIS_KAYDI_YOK";
    if(lateMinutes>0 && lastDirection==="OUT")status="GEC_GIRIS_CIKTI";
    metrics.total++;
    if(status==="IZINLI")metrics.leave++;
    else if(!readingsFor.length)metrics.noRecord++;
    else if(!verified.length)metrics.unknownDirection++;
    else {
      if(arrivals.length)metrics.arrived++;
      if(lastDirection==="IN")metrics.inside++;
      if(lastDirection==="OUT")metrics.exited++;
      if(noExit)metrics.missingExit++;
      if(lateMinutes>0)metrics.late++;
    }
    roster.push({
      employeeId:id,fullName:value(person.fullName),cardNo,department:value(person.department),
      entry,exit,lastTime:clock(readingsFor.at(-1)?.eventTime),
      direction:lastDirection,eventCount:readingsFor.length,
      lateMinutes,status,leaveType:value(leave?.leaveTypeCode||leave?.recordType),
      source:readingsFor.length?[...new Set(readingsFor.map(e=>value(e.source)).filter(Boolean))].join(", "):"",
      reconciliation:"D1_ONLY_UNVERIFIED",
    });
  }
  return {date,asOf,metrics,roster,source:"D1_CARD_EVENTS_UNRECONCILED",
    complete:true,terminalVerified:false,fdbVerified:false,tnfVerified:false};
}
