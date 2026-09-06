// @ts-nocheck
import { Hono } from "hono";
import { cors } from "hono/cors";
import base from "./main-entry";
import { ensureMailCommunicationCore0050 } from "./runtime-migration-0050";
import { ensureMailWorkspaceUx } from "./runtime-migration-mail-ux";
import { registerMailProviderOverlayRoutes } from "./mail-provider-overlay";
import { registerGoogleMailRoutes } from "./mail-google-gmail";

type Env = { Bindings: Cloudflare.Env };
type Row = Record<string, any>;

const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toUpperCase().replace(/İ/g,"I");
const LIVE_ORIGINS=new Set(["https://kyerp.net","https://www.kyerp.net","https://app.kyerp.net"]);
const LOCAL=/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?$/i;
const PREVIEW=/^https:\/\/[a-z0-9-]+\.ky-erp-frontend\.pages\.dev$/i;
const allowedOrigin=(origin:string)=>LIVE_ORIGINS.has(origin)||LOCAL.test(origin)||PREVIEW.test(origin)?origin:undefined;

const overlay=new Hono<Env>();
overlay.use("/api/*",cors({origin:allowedOrigin,allowMethods:["GET","POST","PATCH","PUT","DELETE","HEAD","OPTIONS"],allowHeaders:["Accept","Authorization","Content-Type","X-KYERP-Tenant-Slug","X-KYERP-Device"],exposeHeaders:["Content-Length","Content-Type","ETag","X-Request-Id"],maxAge:86400,credentials:true}));
registerMailProviderOverlayRoutes(overlay);
registerGoogleMailRoutes(overlay);

function normalizedProvider(value:unknown){
  const p=upper(value).replace(/[\s-]+/g,"_");
  if(["GOOGLE","GOOGLE_WORKSPACE"].includes(p))return"GMAIL";
  if(["MICROSOFT","OUTLOOK","OFFICE365"].includes(p))return"MICROSOFT_365";
  return p;
}
async function providerForAccount(env:Cloudflare.Env,id:string){
  const row=await env.DB.prepare("SELECT provider_type FROM mail_accounts WHERE id=? LIMIT 1").bind(id).first<Row>();
  return normalizedProvider(row?.provider_type);
}
async function providerForDraft(env:Cloudflare.Env,id:string){
  const row=await env.DB.prepare("SELECT a.provider_type FROM mail_drafts d JOIN mail_accounts a ON a.id=d.account_id AND a.main_company_slug=d.main_company_slug WHERE d.id=? LIMIT 1").bind(id).first<Row>();
  return normalizedProvider(row?.provider_type);
}
async function providerForMessage(env:Cloudflare.Env,id:string){
  const row=await env.DB.prepare("SELECT a.provider_type FROM mail_messages m JOIN mail_accounts a ON a.id=m.account_id AND a.main_company_slug=m.main_company_slug WHERE m.id=? LIMIT 1").bind(id).first<Row>();
  return normalizedProvider(row?.provider_type);
}
function rewritePath(request:Request,path:string){const url=new URL(request.url);url.pathname=path;return new Request(url.toString(),request);}

export default {
  async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
    const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
    const mailPath=path.startsWith("/api/mail/");
    const googleCallback=path==="/api/auth/mail/oauth/google/callback";
    if(mailPath||googleCallback) await ensureMailCommunicationCore0050(env.DB);
    if(mailPath) await ensureMailWorkspaceUx(env.DB);

    if(path==="/api/mail/providers"&&method==="GET")return overlay.fetch(request,env,ctx);
    if(path==="/api/mail/accounts/request"&&method==="POST"){
      const body=await request.clone().json().catch(()=>({})) as Row;
      if(normalizedProvider(body?.providerType||body?.provider)==="GMAIL")return overlay.fetch(request,env,ctx);
      return base.fetch(request,env,ctx);
    }
    if(/^\/api\/mail\/accounts\/[^/]+\/defaults$/.test(path)&&method==="PUT")return overlay.fetch(request,env,ctx);
    if(googleCallback||/\/oauth\/google\/start$/.test(path)||/\/sync\/google$/.test(path)||/\/send\/google$/.test(path))return overlay.fetch(request,env,ctx);

    const syncMatch=path.match(/^\/api\/mail\/accounts\/([^/]+)\/sync$/);
    if(method==="POST"&&syncMatch&&await providerForAccount(env,decodeURIComponent(syncMatch[1]))==="GMAIL"){
      return overlay.fetch(rewritePath(request,`/api/mail/accounts/${encodeURIComponent(decodeURIComponent(syncMatch[1]))}/sync/google`),env,ctx);
    }
    const folderSyncMatch=path.match(/^\/api\/mail\/accounts\/([^/]+)\/folders\/([^/]+)\/sync$/);
    if(method==="POST"&&folderSyncMatch){
      const accountId=decodeURIComponent(folderSyncMatch[1]),folderId=decodeURIComponent(folderSyncMatch[2]),provider=await providerForAccount(env,accountId);
      if(provider==="GMAIL")return overlay.fetch(rewritePath(request,`/api/mail/accounts/${encodeURIComponent(accountId)}/folders/${encodeURIComponent(folderId)}/sync/google`),env,ctx);
      if(provider==="MICROSOFT_365")return base.fetch(rewritePath(request,`/api/mail/accounts/${encodeURIComponent(accountId)}/folders/${encodeURIComponent(folderId)}/sync/microsoft`),env,ctx);
    }

    const messageActionMatch=path.match(/^\/api\/mail\/messages\/([^/]+)\/action$/);
    if(method==="POST"&&messageActionMatch){
      const messageId=decodeURIComponent(messageActionMatch[1]),provider=await providerForMessage(env,messageId);
      if(provider==="GMAIL")return overlay.fetch(rewritePath(request,`/api/mail/messages/${encodeURIComponent(messageId)}/action/google`),env,ctx);
      if(provider==="MICROSOFT_365")return base.fetch(rewritePath(request,`/api/mail/messages/${encodeURIComponent(messageId)}/action/microsoft`),env,ctx);
    }

    const sendMatch=path.match(/^\/api\/mail\/drafts\/([^/]+)\/send$/);
    if(method==="POST"&&sendMatch&&await providerForDraft(env,decodeURIComponent(sendMatch[1]))==="GMAIL"){
      return overlay.fetch(rewritePath(request,`/api/mail/drafts/${encodeURIComponent(decodeURIComponent(sendMatch[1]))}/send/google`),env,ctx);
    }
    return base.fetch(request,env,ctx);
  },
};
