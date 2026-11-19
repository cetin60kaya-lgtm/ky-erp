// Only bounded classifications may leave the Gmail adapter. Never propagate
// provider error descriptions, headers, message ids, token data or mail text.
export const GMAIL_SYNC_STAGES = new Set([
  "GMAIL_TOKEN","GMAIL_LABELS","FOLDER_DISCOVERY","GMAIL_PAGES",
  "CURSOR_CHECKPOINT","SYNC_SUMMARY","GMAIL_HISTORY"
]);
export function gmailSafeStage(stage:unknown):string {
  const value=String(stage||"");
  return GMAIL_SYNC_STAGES.has(value)?value:"UNKNOWN";
}
export function gmailSafeFailure(error:unknown):string {
  const e=(error&&typeof error==="object"?error:{}) as Record<string,unknown>;
  const code=String(e.code||"");
  const providerCode=String(e.providerCode||"");
  const status=Number(e.status||0);
  if(code==="MAIL_REAUTH_REQUIRED")return "GMAIL_REAUTH_REQUIRED";
  if(code==="GOOGLE_MAIL_CONFIG_MISSING")return "GMAIL_OAUTH_CONFIG_MISSING";
  if(code==="GOOGLE_TOKEN_FAILED")return ["invalid_client","unauthorized_client"].includes(providerCode)
    ?"GMAIL_OAUTH_CLIENT_INVALID":"GMAIL_TOKEN_REFRESH_FAILED";
  if(code==="GOOGLE_GMAIL_API_DISABLED")return "GMAIL_API_DISABLED";
  if(status===429)return "GMAIL_RATE_LIMITED";
  if(status===401||status===403)return "GMAIL_PROVIDER_ACCESS_REJECTED";
  if(status>=500&&status<=599)return "GMAIL_PROVIDER_UNAVAILABLE";
  const message=String(e.message||"");
  if(/D1_ERROR|Too many (?:API requests|queries)|D1 queries exceeded|SQLITE_TOOBIG/i.test(message))
    return "GMAIL_D1_LIMIT_OR_DATABASE_ERROR";
  if(code==="GMAIL_FOLDER_MISSING")return "GMAIL_FOLDER_MISSING";
  if(code==="GMAIL_HISTORY_CURSOR_INVALID")return "GMAIL_HISTORY_CURSOR_INVALID";
  return "GMAIL_SYNC_STEP_FAILED";
}
export function gmailCronVisibleState(raw:unknown){
  let obj:Record<string,unknown>={};
  try{
    if(typeof raw==="string")obj=JSON.parse(raw)||{};
    else if(raw&&typeof raw==="object")obj=raw as Record<string,unknown>;
  }catch{}
  return {
    status:obj.state==="ERROR"?"ERROR":obj.state==="OK"?"OK":"UNKNOWN",
    reason:typeof obj.reason==="string"&&/^GMAIL_[A-Z0-9_]{1,65}$/.test(obj.reason)?obj.reason:"",
    stage:gmailSafeStage(obj.stage),
    lastFolder:typeof obj.lastFolder==="string"?obj.lastFolder.slice(0,100):"",
    processed:Math.max(0,Math.trunc(Number(obj.processed)||0)),
    completed:Math.max(0,Math.trunc(Number(obj.completed)||0)),
    total:Math.max(0,Math.trunc(Number(obj.total)||0))
  };
}
