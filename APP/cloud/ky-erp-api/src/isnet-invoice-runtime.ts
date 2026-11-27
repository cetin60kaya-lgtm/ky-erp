// @ts-nocheck
import { scopedIsnetTenant } from "./isnet-tenant-guard";
import type { Context, Hono } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const DRAFT_SCOPE="ISNET_INVOICE_RUNTIME_DRAFT";
const text=(v:unknown)=>String(v??"").trim();
function slugOf(c:Context<AppEnv>){return scopedIsnetTenant(c);}
function errorBody(code:string,message:string){return {ok:false,success:false,error:{code,message}};}
async function storeGet(c:Context<AppEnv>,scope:string,fileName:string,slug:string){
 const row=await c.env.DB.prepare("SELECT id,data FROM json_store WHERE scope=? AND file_name=? AND main_company_slug=? ORDER BY updated_at DESC LIMIT 1").bind(scope,fileName,slug).first<Row>();
 if(!row)return null;try{const data=JSON.parse(text(row.data));return {...data,storeId:text(row.id),fileName};}catch{return null}
}
export function registerIsnetInvoiceRuntimeRoutes(app: Hono<AppEnv>) {
  // Retired: /api/isnet/invoice-preparation/dispatches/:sourceId/draft (canonical e-Belge only).

  app.get("/api/isnet/invoice-drafts/:id", async (c) => {
    const slug = slugOf(c); const draft = await storeGet(c, DRAFT_SCOPE, c.req.param("id"), slug);
    if (!draft) return c.json(errorBody("NOT_FOUND", "Fatura taslağı bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: draft });
  });

  // Retired: /api/isnet/invoice-drafts/:id/verify (canonical e-Belge only).

  // Retired: /api/isnet/invoice-drafts/:id/final-approval (canonical e-Belge only).

  // Retired: /api/isnet/invoice-drafts/:id/submit (canonical e-Belge only).

  // Retired: /api/isnet/invoice-drafts/:id/retry-closure (canonical e-Belge only).
}
