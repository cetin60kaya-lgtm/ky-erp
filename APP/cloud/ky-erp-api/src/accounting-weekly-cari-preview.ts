// Salt-okunur haftalık cari XLSX/CSV önizlemesi. Muhasebe/ödeme/mail kaydı yaratmaz.
import type { Hono,Context } from "hono";
import * as XLSX from "xlsx";
import { getAuthenticatedUser } from "./auth-cloud";
import { parseStatementTables,compareWeeklyStatements } from "./accounting-weekly-cari-core";
type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const txt=(v:unknown)=>v==null?"":String(v).trim();
const up=(v:unknown)=>txt(v).toLocaleUpperCase("tr-TR");
const failed=(c:Context<AppEnv>,code:string,message:string,status=422)=>c.json({ok:false,error:{code,message}},status as any);
async function parseWorkbook(file:File){
 const ext=txt(file.name).split(".").pop()?.toLowerCase();
 if(!["xlsx","xls","csv"].includes(ext||"")||file.size<1||file.size>6*1024*1024)throw new Error("XLSX/XLS/CSV belgesi 6 MB sınırında olmalıdır.");
 const bytes=new Uint8Array(await file.arrayBuffer());
 const book=XLSX.read(bytes,{type:"array",cellDates:false,raw:true});
 if(!book.SheetNames.length||book.SheetNames.length>10)throw new Error("Dosyada 1-10 çalışma sayfası bulunmalıdır.");
 const tables=book.SheetNames.map(name=>XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:"",raw:true}) as unknown[][]);
 return parseStatementTables(tables);
}
export function registerWeeklyCariPreviewRoutes(app:Hono<AppEnv>){
 app.post("/api/muhasebe/weekly-cari-preview",async c=>{
  const user=await getAuthenticatedUser(c) as Row|null;
  if(!user?.id)return failed(c,"UNAUTHORIZED","Oturum gerekli.",401);
  const elevated=["SUPER_ADMIN","ADMIN","COMPANY_ADMIN","COMPANY_OWNER","OWNER"].includes(up(user.role));
  const allowed=elevated||(Array.isArray(user.permissions)&&user.permissions.some((p:Row)=>up(p.moduleKey||p.module_key)==="MUHASEBE"&&Boolean(p.canView??p.can_view)));
  if(!allowed)return failed(c,"ACCOUNTING_FORBIDDEN","Muhasebe okuma yetkisi gereklidir.",403);
  const body=await c.req.parseBody({all:true}).catch(()=>({} as Row));
  const slug=txt(body.mainCompanySlug||c.req.header("X-KYERP-Tenant-Slug"));
  const own=txt(user.mainCompanySlug||user.main_company_slug||user.security?.main_company_slug);
  if(!slug||(!elevated&&own!==slug))return failed(c,"TENANT_FORBIDDEN","Ana firma yetkisi doğrulanamadı.",403);
  const companyId=txt(body.companyId);
  const company=companyId?await c.env.DB.prepare("SELECT id,name FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1").bind(companyId,slug).first<Row>():null;
  if(!company)return failed(c,"COMPANY_REQUIRED","Karşılaştırılacak mevcut cari seçilmelidir.",422);
  const current=body.currentFile,previous=body.previousFile;
  if(!(current instanceof File))return failed(c,"CURRENT_STATEMENT_REQUIRED","Yeni haftanın XLSX/CSV dosyası gereklidir.",422);
  if(previous!==undefined&&!(previous instanceof File))return failed(c,"PREVIOUS_STATEMENT_INVALID","Önceki hafta dosyası geçersiz.",422);
  try{
   const now=await parseWorkbook(current);
   const old=previous instanceof File?await parseWorkbook(previous):{lines:[],ignoredRows:0,ambiguousRows:0,sheets:0};
   if(!now.lines.length)return failed(c,"HKN_NOT_FOUND","Ekstrede HKN belge numarası bulunamadı. Sütunları ve dosya dönemini kontrol edin.",422);
   const all=[...new Set([...old.lines,...now.lines].map(x=>x.invoiceNo))];
   const matched=new Set<string>();
   for(let offset=0;offset<all.length;offset+=100){
    const chunk=all.slice(offset,offset+100);
    const sql="SELECT document_no FROM accounting_documents WHERE main_company_slug=? AND party_company_id=? AND deleted_at IS NULL AND direction='OUTGOING' AND document_type LIKE '%FATURA%' AND UPPER(document_no) IN ("+chunk.map(()=>"?").join(",")+")";
    const docs=(await c.env.DB.prepare(sql).bind(slug,companyId,...chunk).all<Row>()).results||[];
    for(const d of docs)matched.add(up(d.document_no).replace(/\s+/g,""));
   }
   const report=compareWeeklyStatements(old.lines,now.lines,matched);
   return c.json({ok:true,data:{companyId,companyName:txt(company.name),summary:report.summary,groups:report.groups,rows:report.rows,
    source:{currentName:txt(current.name),previousName:previous instanceof File?txt(previous.name):null,currentSheets:now.sheets,previousSheets:old.sheets,currentAmbiguousRows:now.ambiguousRows,previousAmbiguousRows:old.ambiguousRows,onlyPreview:true},
    note:"Cari ekstresinde bulunmamak ödeme kanıtı değildir. Eski dönem, mahsup, toplu ödeme ve revizyonlar manuel kontrol gerektirir. Hiçbir kayıt/gönderim yapılmadı."}});
  }catch(e:any){return failed(c,"WEEKLY_STATEMENT_PARSE_FAILED",txt(e?.message)||"Belge karşılaştırılamadı.",422);}
 });
}
