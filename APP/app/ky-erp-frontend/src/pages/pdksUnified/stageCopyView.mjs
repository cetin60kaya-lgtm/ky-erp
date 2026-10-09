// Only a *locally selected*, gbak-restored copy-FDB JSON snapshot.
// Kept in React memory; never posted to API, cloud, Drive or localStorage.
const day=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  !Number.isNaN(Date.parse(value+"T12:00:00Z"))&&
  new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
const time=value=>typeof value==="string"&&
  /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
const card=value=>typeof value==="string"&&/^\d{5}$/.test(value);
const text=value=>typeof value==="string"&&value.length<=150;
export function parseStageCopySnapshot(raw){
  const value=typeof raw==="string"?JSON.parse(raw):raw;
  if(!value||value.schemaVersion!==1||
    value.kind!=="KY_PDKS_FIREBIRD_STAGE_ONLY"||
    value.source!=="GBAK_RESTORED_COPY_KIMLIK_GIRCIK"||
    value.database!=="KY_PDKS_STAGE.FDB"||
    value.directionsFromGircikColumns!==true||
    !day(value.start)||!day(value.end)||value.start>value.end||
    (Date.parse(value.end)-Date.parse(value.start))/86400000>30||
    value.liveRealTime!==false||
    value.productionWritten!==false||value.physicalTerminalVerified!==false||
    value.annualTnfVerified!==false||value.cloudVerified!==false||
    !Array.isArray(value.personnel)||!Array.isArray(value.punches)||
    value.personnel.length>15000||value.punches.length>60000||
    !Number.isSafeInteger(value.invalidSourcePunchCount)||
    value.invalidSourcePunchCount<0)
    throw Error("STAGE_COPY_SOURCE_UNVERIFIED");
  const cards=new Set();
  const people=value.personnel.map(person=>{
    if(!card(person?.cardNo)||!text(person.fullName)||cards.has(person.cardNo)||
      ![null,undefined].includes(person.employmentStart)&&!day(person.employmentStart)||
      ![null,undefined].includes(person.employmentEnd)&&!day(person.employmentEnd)||
      !text(person.groupCode??"")||!text(person.legacyStatus??""))
      throw Error("STAGE_COPY_PERSON_INVALID");
    cards.add(person.cardNo);
    return Object.freeze({cardNo:person.cardNo,fullName:person.fullName,
      group:person.groupCode||"",employmentStart:person.employmentStart||null,
      employmentEnd:person.employmentEnd||null,status:person.legacyStatus||""});
  });
  const ids=new Set();
  const events=value.punches.map(punch=>{
    if(!card(punch?.cardNo)||!day(punch.workDate)||!time(punch.time)||
      punch.workDate<value.start||punch.workDate>value.end||
      !["IN","OUT"].includes(punch.direction)||
      punch.source!=="GIRCIK_STAGE"||!text(punch.eventId)||
      !punch.eventId||ids.has(punch.eventId)||!text(punch.legacyType??""))
      throw Error("STAGE_COPY_PUNCH_INVALID");
    ids.add(punch.eventId);
    return Object.freeze({
      eventId:punch.eventId,cardNo:punch.cardNo,date:punch.workDate,
      time:punch.time,direction:punch.direction,legacyType:punch.legacyType||"",
      source:"GIRCIK_STAGE",
      person:people.find(p=>p.cardNo===punch.cardNo)?.fullName||"Kart eşleşmedi",
    });
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||
    a.eventId.localeCompare(b.eventId));
  const dayCards=new Map();
  for(const event of events){
    const k=event.cardNo+"|"+event.date;
    const row=dayCards.get(k)||{cardNo:event.cardNo,date:event.date,
      name:event.person,entry:[],exit:[],legacyE:0};
    if(event.direction==="IN")row.entry.push(event.time);
    if(event.direction==="OUT")row.exit.push(event.time);
    if(event.legacyType==="E")row.legacyE++;
    dayCards.set(k,row);
  }
  const days=[...dayCards.values()].sort((a,b)=>b.date.localeCompare(a.date)||
    a.cardNo.localeCompare(b.cardNo)).map(v=>Object.freeze({
      ...v,entry:Object.freeze(v.entry),exit:Object.freeze(v.exit),
      // Absence/late never inferred without a certified working calendar,
      // shift assignment, holidays and physical device proof.
      arrivalVerified:false,lateVerified:false,
    }));
  return Object.freeze({
    source:"LOCAL_FIREBIRD_COPY_ONLY",start:value.start,end:value.end,
    generatedAt:String(value.generatedAt||""),
    sourceFdbWriteTime:String(value.snapshotFdbWriteTime||""),
    people:Object.freeze(people),events:Object.freeze(events),
    days:Object.freeze(days),
    unknownCards:events.filter(e=>!cards.has(e.cardNo)).length,
    invalidSourcePunchCount:value.invalidSourcePunchCount,
    terminalOnline:false,lateCalculable:false,
    productionWritten:false,physicalTerminalVerified:false,
  });
}
