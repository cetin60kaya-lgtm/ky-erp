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
    terminalRawCertified:false,
    source:"UNSIGNED_LOCAL_DIAGNOSTICS",
  });
}
