/**
 * Read-only KY PDKS Cloud command/outbox projection.
 * This is Cloud delivery state ONLY, not a terminal presence or FDB/TNF proof.
 * Never return payload JSON, device secret, employee id or raw ACK data.
 */
const upper=v=>String(v??"").trim().toUpperCase();
const states=new Set(["PENDING","CLAIMED","ACKED","FAILED"]);
const cleanId=v=>String(v??"").trim().slice(0,128);
const date=v=>{
  if(typeof v!=="string"||!Number.isFinite(Date.parse(v)))return null;
  return v.slice(0,35);
};
export function projectUnifiedSyncStatus({company,counts,rows,devices,asOf}){
  if(typeof company!=="string"||!/^[A-Za-z0-9._:-]{3,100}$/.test(company)||
    !Array.isArray(counts)||!Array.isArray(rows)||!Array.isArray(devices)||
    rows.length>75||devices.length>1000||!date(asOf))
    throw Error("PDKS_SYNC_STATUS_SHAPE_INVALID");
  const status={PENDING:0,CLAIMED:0,ACKED:0,FAILED:0};
  for(const value of counts){
    const state=upper(value?.state);
    const number=Number(value?.total);
    if(!states.has(state)||!Number.isSafeInteger(number)||number<0)
      throw Error("PDKS_SYNC_STATUS_COUNT_INVALID");
    status[state]+=number;
  }
  const items=rows.map(row=>{
    if(String(row?.main_company_id)!==company||!states.has(upper(row.state))||
      !Number.isSafeInteger(Number(row.delivery_attempts))||
      Number(row.delivery_attempts)<0)
      throw Error("PDKS_SYNC_STATUS_TENANT_OR_ROW_INVALID");
    const reason=upper(row.last_error);
    return Object.freeze({
      id:cleanId(row.id),eventType:cleanId(row.event_type),
      action:cleanId(row.action),state:upper(row.state),
      attempts:Number(row.delivery_attempts),
      createdAt:date(row.created_at),
      nextAttemptAt:date(row.next_attempt_at),
      leaseUntil:date(row.lease_until),
      acknowledgedAt:date(row.acknowledged_at),
      // Agent errors can include free text. Expose codes only.
      errorCode:/^[A-Z][A-Z0-9_:-]{0,79}$/.test(reason)?reason:
        reason?"DETAIL_REDACTED":null,
    });
  });
  const deviceStats={registered:devices.length,enabled:0};
  for(const value of devices){
    if(String(value?.main_company_id)!==company||
      ![0,1].includes(Number(value.active)))
      throw Error("PDKS_SYNC_STATUS_DEVICE_TENANT_INVALID");
    if(Number(value.active)===1)deviceStats.enabled++;
  }
  return Object.freeze({
    asOf,source:"D1_UNIFIED_OUTBOX_ONLY",totalCommands:Object.values(status)
      .reduce((a,b)=>a+b,0),status:Object.freeze(status),
    devices:Object.freeze(deviceStats),recent:Object.freeze(items),
    localAgentOnline:false,terminalRawCertified:false,
    firebirdVerified:false,annualTnfVerified:false,
    sourceReconciled:false,productionApproved:false,
    complete:true,
  });
}
