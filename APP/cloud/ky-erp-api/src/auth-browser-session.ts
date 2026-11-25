// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";
const ORIGIN_KEYS = new Map([["https://kyerp.net","main"],["https://www.kyerp.net","www"],["https://security.kyerp.net","security"]]);
export function browserCookieName(origin: string) {
  const key=ORIGIN_KEYS.get(origin);
  return key ? "__Host-kyerp-browser-"+key : "";
}
export function browserCookie(name:string, token:string, seconds:number) {
  return name+"="+token+"; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age="+Math.max(0,Math.floor(seconds));
}
function tokenOf(c:any,name:string) {
  const values=String(c.req.header("Cookie")||"").split(";").map(x=>x.trim()).filter(x=>x.startsWith(name+"="));
  return values.length===1?values[0].slice(name.length+1):"";
}
function bearer(c:any){return String(c.req.header("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1]||"";}
function denied(c:any,code:string,status=401){return c.json({ok:false,error:{code,message:"Tarayıcı oturumu doğrulanamadı."}},status);}
export function registerBrowserSessionRoutes(app:any,sanitizeUser:(u:any)=>any){
  // Cookies are accepted only at these explicit auth endpoints, not business APIs.
  app.post("/api/auth/browser-session/bind",async(c:any)=>{
    const name=browserCookieName(String(c.req.header("Origin")||""));
    if(!name)return denied(c,"BROWSER_ORIGIN_FORBIDDEN",403);
    const token=bearer(c),current=await getAuthenticatedUser(c,token);
    if(!current)return denied(c,"SESSION_INVALID");
    const seconds=Math.min(36000,Math.floor((Date.parse(current.session.expires_at)-Date.now())/1000));
    if(!(seconds>0))return denied(c,"SESSION_EXPIRED");
    c.header("Set-Cookie",browserCookie(name,token,seconds));
    return c.json({ok:true,expiresAt:current.session.expires_at});
  });
  app.post("/api/auth/browser-session/restore",async(c:any)=>{
    const name=browserCookieName(String(c.req.header("Origin")||""));
    if(!name)return denied(c,"BROWSER_ORIGIN_FORBIDDEN",403);
    const token=tokenOf(c,name),current=await getAuthenticatedUser(c,token);
    if(!current)return denied(c,"SESSION_INVALID");
    const {security,session,...user}=current;void security;
    return c.json({ok:true,stage:"AUTHENTICATED",token,user:sanitizeUser(user),expiresAt:session.expires_at});
  });
  app.post("/api/auth/browser-session/close",async(c:any)=>{
    const name=browserCookieName(String(c.req.header("Origin")||""));
    if(!name)return denied(c,"BROWSER_ORIGIN_FORBIDDEN",403);
    const token=tokenOf(c,name),supplied=bearer(c);
    const current=await getAuthenticatedUser(c,supplied),stored=await getAuthenticatedUser(c,token);
    if(stored&&supplied!==token&&(!current||current.id!==stored.id))return denied(c,"BROWSER_SESSION_CHANGED",409);
    const actor=current||stored,ids=[...new Set([current?.session?.id,stored?.session?.id].filter(Boolean))];
    if(actor&&ids.length){
      const timestamp=new Date().toISOString(),db=c.env.DB;
      await db.batch(ids.flatMap(id=>[
        db.prepare("UPDATE auth_sessions SET revoked_at=?,revoked_by=? WHERE id=? AND user_id=? AND revoked_at IS NULL").bind(timestamp,actor.id,id,actor.id),
        db.prepare("INSERT INTO auth_security_audit(id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,actor.id,actor.mainCompanySlug||null,"SESSION_LOGOUT",id,null,JSON.stringify({source:"BROWSER_SESSION"}),timestamp)
      ]));
    }
    c.header("Set-Cookie",browserCookie(name,"",0));
    return c.json({ok:true});
  });
}
