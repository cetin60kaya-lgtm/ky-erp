/**
 * Pure request boundary for tenant-scoped, read-only card event pagination.
 * The SQL query always binds all values; no cursor string is interpolated.
 */
const day=(value)=>typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value+"T12:00:00Z")) &&
  new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
const time=(value)=>typeof value==="string" &&
  /^([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
const id=(value)=>typeof value==="string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const v=(input,key)=>String(input?.[key]??"").trim();

export function parseCardEventQuery(input,defaultDate){
  const from=v(input,"from")||v(input,"date")||defaultDate;
  const to=v(input,"to")||from;
  if(!day(from)||!day(to)||to<from ||
    (Date.parse(to+"T12:00:00Z")-Date.parse(from+"T12:00:00Z"))/86400000>30)
    throw new Error("PDKS_CARD_EVENT_DATE_RANGE_INVALID");
  const rawLimit=v(input,"limit");
  if(rawLimit && !/^\d{1,3}$/.test(rawLimit))
    throw new Error("PDKS_CARD_EVENT_LIMIT_INVALID");
  const limit=rawLimit?Number(rawLimit):100;
  if(limit<1||limit>250)throw new Error("PDKS_CARD_EVENT_LIMIT_INVALID");
  const cursorDate=v(input,"cursorDate");
  const cursorTime=v(input,"cursorTime");
  const cursorId=v(input,"cursorId");
  const hasCursor=Boolean(cursorDate||cursorTime||cursorId);
  if(hasCursor && (!day(cursorDate)||cursorDate<from||cursorDate>to||
    !time(cursorTime)||!id(cursorId)))
    throw new Error("PDKS_CARD_EVENT_CURSOR_INVALID");
  return Object.freeze({from,to,limit,hasCursor,cursorDate,cursorTime,cursorId});
}

export function cardEventCursorSql(pagination){
  return pagination.hasCursor?
    " AND (t.work_date<? OR (t.work_date=? AND t.event_time<?) OR "+
    "(t.work_date=? AND t.event_time=? AND t.id<?))":"";
}
export function cardEventParams(company,pagination){
  const {from,to,limit,hasCursor,cursorDate,cursorTime,cursorId}=pagination;
  const args=[company,from,to];
  if(hasCursor)args.push(cursorDate,cursorDate,cursorTime,cursorDate,cursorTime,cursorId);
  args.push(limit+1);
  return args;
}
