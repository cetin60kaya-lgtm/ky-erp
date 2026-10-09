/** Presentation-only validation of an offline, UNTRUSTED diagnostics file.
 * This is neither a signed acceptance receipt nor a physical punch source.
 */
export function parseTerminalDiagnosticReport(input,expectedTerminalId){
  const data=typeof input==="string"?JSON.parse(input):input;
  const keys=["inspected","acceptedPending","signedQrPending","unsignedUsbPending",
    "matchedReference","notInReference","ambiguousDuplicateMinute",
    "rejectedFacts","referenceRows","rejectedReferenceRows"];
  if(!data||data.schemaVersion!==1||
    data.mode!=="READ_ONLY_TNF_REFERENCE_PREVIEW"||
    data.status!=="REQUIRES_APPROVED_SOURCE_RECONCILIATION"||
    data.terminalId!==expectedTerminalId||
    data.physicalAttendanceConfirmed!==false||
    data.safeToApply!==false||data.terminalRawCertified!==false||
    data.firebirdVerified!==false||data.tnfApplied!==false||
    data.cloudApplied!==false||data.annualTnfWritten!==false||
    !keys.every(k=>Number.isSafeInteger(data[k])&&data[k]>=0)||
    data.inspected!==data.acceptedPending+data.rejectedFacts||
    data.acceptedPending!==data.signedQrPending+data.unsignedUsbPending||
    data.acceptedPending!==data.matchedReference+data.notInReference+
      data.ambiguousDuplicateMinute)
    throw new Error("TERMINAL_REPORT_NOT_VERIFIABLE");
  // A daily aggregate is optional in legacy diagnostics, but if supplied it
  // must reconcile exactly to the summary. No employee/card/token fields pass.
  const batches=data.dailyBatches??[];
  if(!Array.isArray(batches)||batches.length>366||
    (data.dailyBatches!==undefined&&
      data.batchState!=="REVIEW_ONLY_NO_APPROVED_TRANSFER"))
    throw new Error("TERMINAL_REPORT_BATCH_UNVERIFIED");
  const seen=new Set(),totals={
    inspected:0,matched:0,unmatched:0,ambiguous:0,rejected:0,
    signedQr:0,unsignedUsb:0,
  };
  const safeBatches=batches.map(batch=>{
    const date=batch?.date;
    if(typeof date!=="string"||
      !(date==="BILINMIYOR"||(/^\\d{4}-\\d{2}-\\d{2}$/.test(date)&&
        new Date(date+"T12:00:00Z").toISOString().slice(0,10)===date))||
      seen.has(date)||!Object.keys(totals).every(k=>
        Number.isSafeInteger(batch[k])&&batch[k]>=0)||
      batch.inspected!==batch.matched+batch.unmatched+
        batch.ambiguous+batch.rejected||
      batch.inspected!==batch.signedQr+batch.unsignedUsb+
        batch.rejected)
      throw new Error("TERMINAL_REPORT_BATCH_UNVERIFIED");
    seen.add(date);
    for(const k of Object.keys(totals))totals[k]+=batch[k];
    return Object.freeze({date,inspected:batch.inspected,matched:batch.matched,
      unmatched:batch.unmatched,ambiguous:batch.ambiguous,
      rejected:batch.rejected,signedQr:batch.signedQr,unsignedUsb:batch.unsignedUsb});
  });
  if(data.dailyBatches!==undefined &&
    (totals.inspected!==data.inspected||
     totals.matched!==data.matchedReference||
     totals.unmatched!==data.notInReference||
     totals.ambiguous!==data.ambiguousDuplicateMinute||
     totals.rejected!==data.rejectedFacts||
     totals.signedQr!==data.signedQrPending||
     totals.unsignedUsb!==data.unsignedUsbPending))
    throw new Error("TERMINAL_REPORT_BATCH_TOTALS_MISMATCH");
  // Whitelist counts only; never render names, keys, card IDs or arbitrary JSON.
  return Object.freeze({
    terminalId:data.terminalId,
    inspected:data.inspected,
    matched:data.matchedReference,
    unmatched:data.notInReference,
    ambiguous:data.ambiguousDuplicateMinute,
    invalid:data.rejectedFacts,
    unsigned:data.unsignedUsbPending,
    rejectedReference:data.rejectedReferenceRows,
    referenceRows:data.referenceRows,
    dailyBatches:Object.freeze(safeBatches),
    terminalRawCertified:false,
    source:"UNSIGNED_LOCAL_DIAGNOSTICS",
  });
}
