// Gmail must use its own OAuth client. Never silently fall back to Drive.
export function gmailOAuthClientReadiness(env: Record<string, unknown> = {}) {
  const str=(v:unknown)=>v==null?"":String(v).trim();
  const gmailId=str(env.GOOGLE_MAIL_CLIENT_ID);
  const gmailSecret=str(env.GOOGLE_MAIL_CLIENT_SECRET);
  const driveId=str(env.GOOGLE_DRIVE_CLIENT_ID);
  if(!gmailId||!gmailSecret)return {
    configured:false,configurationMode:"MISSING_DEDICATED_GMAIL",
    reason:"Gmail için ayrı Google OAuth istemcisi gerekli. Cloudflare Worker'da GOOGLE_MAIL_CLIENT_ID ve GOOGLE_MAIL_CLIENT_SECRET tanımlayın; Drive yapılandırmasını değiştirmeyin."
  };
  if(driveId&&gmailId===driveId)return {
    configured:false,configurationMode:"DRIVE_CLIENT_REUSED",
    reason:"Gmail OAuth istemcisi Google Drive istemcisiyle aynı. Mail projesine ait ayrı Web OAuth istemcisi seçilmelidir."
  };
  return {configured:true,configurationMode:"DEDICATED_GMAIL",reason:""};
}
