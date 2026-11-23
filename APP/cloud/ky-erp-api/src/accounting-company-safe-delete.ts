import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { scanCompanyRelations } from "./accounting-company-link-scan";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const txt = (v: unknown) => v == null ? "" : String(v).trim();
const err = (code: string, message: string, detail?: unknown) => ({ ok: false, success: false, error: { code, message, ...(detail === undefined ? {} : { detail }) } });
export function companyHardDeleteAllowed(p: Row) {
  return Number(p?.blockedTotal || 0) === 0 &&
    Number(p?.currentBalance || 0) === 0 && Number(p?.openingBalance || 0) === 0;
}
async function manager(c: Context<AppEnv>, slug: string) {
  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user || !["SUPER_ADMIN", "ADMIN"].includes(txt(user.role).toUpperCase())) return null;
  const own = txt(user.mainCompanySlug || user.main_company_slug);
  if (txt(user.role).toUpperCase() !== "SUPER_ADMIN" && own.toLowerCase() !== slug.toLowerCase()) return null;
  return user;
}
async function preview(c: Context<AppEnv>, slug: string, id: string) {
  const company = await c.env.DB.prepare("SELECT id,name,updated_at,current_balance,opening_balance,is_active FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1").bind(id,slug).first<Row>();
  if (!company) return null;
  // Shared fail-closed scan used by merge and Hard Sil.
  // Any missing/unreadable table blocks the operation rather than guessing no links.
  const { blockedRelations, blockedTotal: count, aliasCount, scannedTables } =
    await scanCompanyRelations(c.env.DB, slug, id);
  const result = { companyId: txt(company.id), companyName: txt(company.name), updatedAt: txt(company.updated_at),
    currentBalance: Number(company.current_balance || 0), openingBalance: Number(company.opening_balance || 0),
    isActive: Number(company.is_active ?? 1) !== 0, blockedRelations, blockedTotal: count, aliasCount, scannedTables };
  return { ...result, canHardDelete: companyHardDeleteAllowed(result) };
}
export function registerAccountingCompanySafeDeleteRoutes(app: Hono<AppEnv>) {
  app.get("/api/muhasebe/firmalar/:id/hard-delete-preview", async (c) => {
    const slug = txt(c.req.query("mainCompanySlug") || c.req.query("mainCompanyId"));
    if (!slug || !(await manager(c,slug))) return c.json(err("MANAGER_APPROVAL_REQUIRED", "Etki raporunu yalnız yetkili yönetici görüntüleyebilir."), 403);
    try {
      const result = await preview(c,slug,txt(c.req.param("id")));
      if (!result) return c.json(err("NOT_FOUND", "Firma kartı bulunamadı."), 404);
      return c.json({ ok:true, success:true, data:result });
    } catch (cause) {
      console.error("Company deletion preflight failed",cause);
      return c.json(err("PREVIEW_FAILED", "Tüm bağlı kayıtlar doğrulanamadı; hard silme kapatıldı."), 503);
    }
  });
  app.post("/api/muhasebe/firmalar/:id/hard-delete", async (c) => {
    let body: Row;
    try { body = await c.req.json() as Row; } catch {
      return c.json(err("INVALID_REQUEST", "Yönetici onay bilgileri gerekli."), 400);
    }
    const slug = txt(body.mainCompanySlug || body.mainCompanyId);
    const approver = slug ? await manager(c,slug) : null;
    if (!approver) return c.json(err("MANAGER_APPROVAL_REQUIRED", "Kalıcı silme yalnız yetkili yöneticinin onayıyla yapılır."), 403);
    const id = txt(c.req.param("id"));
    try {
      const state = await preview(c,slug,id);
      if (!state) return c.json(err("NOT_FOUND", "Firma kartı bulunamadı."), 404);
      if (!state.canHardDelete) return c.json(err("COMPANY_LINKED", "Firma bağlı model, belge, cari veya stok kayıtları içeriyor. Yasal kayıtlar hard silinemez; firmayı pasife alın veya güvenli birleştirme yapın.",state), 409);
      if (txt(body.confirmCompanyId) !== id || txt(body.confirmName) !== state.companyName ||
          txt(body.confirmPhrase) !== "KALICI SIL" || txt(body.expectedUpdatedAt) !== state.updatedAt) {
        return c.json(err("CONFIRM_MISMATCH", "Firma adı, ID, silme ifadesi veya kayıt sürümü eşleşmiyor."), 409);
      }
      // D1 batch is transactional. Only an entirely unlinked duplicate company
      // and its non-financial aliases can be removed. Linked records NEVER cascade.
      const actor = txt(approver.email || approver.username || approver.id || approver.role);
      const statements = [
        // Remove non-financial aliases first; a foreign-key RESTRICT must not
        // prevent removal of an otherwise empty duplicate company card.
        c.env.DB.prepare(
          "DELETE FROM company_aliases WHERE main_company_slug=? AND company_id=? AND EXISTS(SELECT 1 FROM companies WHERE id=? AND main_company_slug=? AND updated_at=? AND COALESCE(current_balance,0)=0 AND COALESCE(opening_balance,0)=0 AND deleted_at IS NULL)",
        ).bind(slug,id,id,slug,state.updatedAt),
        c.env.DB.prepare(
          "DELETE FROM companies WHERE id=? AND main_company_slug=? AND updated_at=? AND COALESCE(current_balance,0)=0 AND COALESCE(opening_balance,0)=0 AND deleted_at IS NULL",
        ).bind(id,slug,state.updatedAt),
        c.env.DB.prepare(
          "INSERT INTO activity_logs (id,main_company_slug,module,entity_type,entity_id,action,action_type,description,old_value,new_value,after_data,actor,created_at) " +
          "SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM companies WHERE id=? AND main_company_slug=?)",
        ).bind(crypto.randomUUID(),slug,"MUHASEBE","COMPANY",id,"HARD_DELETE","ACCOUNTING_COMPANY_HARD_DELETE",
          "Yönetici onayıyla bağlantısız firma kartı silindi",
          JSON.stringify({name:state.companyName,removedAliases:state.aliasCount}),null,
          JSON.stringify({actorId:txt(approver.id || approver.userId),requestId:txt(c.get?.("requestId"))}),
          actor,new Date().toISOString(),id,slug),
      ];
      const results = await c.env.DB.batch(statements);
      if (!results[1]?.meta?.changes) return c.json(err("CHANGED", "Firma kaydı değişti; güvenlik için silme durduruldu."), 409);
      return c.json({ ok:true, success:true, data:{ id,deleted:true,removedAliases:state.aliasCount } });
    } catch (cause) {
      console.error("company deletion blocked",cause);
      return c.json(err("DELETE_FAILED","Silme güvenle tamamlanamadı; firma durumunu yeniden kontrol edin."), 409);
    }
  });
  // İki firma kartı birleştirme: yalnız bağlantısız ve sıfır bakiyeli
  // kaynak kartın takma adları hedefe geçer; hedef ID ve hareketleri korunur.
  app.get("/api/muhasebe/firmalar/:id/merge-preview", async (c) => {
    const slug = txt(c.req.query("mainCompanySlug") || c.req.query("mainCompanyId"));
    if (!slug || !(await manager(c, slug))) return c.json(err("MANAGER_APPROVAL_REQUIRED", "Birleştirme etki raporu için yönetici oturumu gerekir."), 403);
    const fromId = txt(c.req.param("id")), toId = txt(c.req.query("targetId"));
    if (!toId || fromId === toId) return c.json(err("TARGET_REQUIRED", "Farklı bir korunacak firma ID'si seçin."), 400);
    try {
      const [source, target] = await Promise.all([preview(c, slug, fromId), preview(c, slug, toId)]);
      if (!source || !target) return c.json(err("NOT_FOUND", "Kaynak veya hedef firma bulunamadı."), 404);
      return c.json({ ok: true, success: true, data: {
        source, target,
        canMerge: source.canHardDelete && target.isActive,
        mode: "EMPTY_SOURCE_ALIAS_MERGE",
        message: source.canHardDelete
          ? "Kaynak boş ve sıfır bakiyeli. Kaynak takma adları hedef ID'ye geçecek; hedef mali kayıtları değişmeyecek."
          : "Kaynak firma işlem/model/belge bağlantısı veya bakiye içeriyor. Birleştirme engellendi; önce ayrı denetimli kayıt eşleştirmesi gerekir.",
      } });
    } catch (cause) {
      console.error("Company merge preview failed", cause);
      return c.json(err("MERGE_PREVIEW_FAILED", "Bağlantılar tam incelenemedi. Birleştirme kapatıldı."), 503);
    }
  });

  app.post("/api/muhasebe/firmalar/:id/merge", async (c) => {
    let body: Row;
    try { body = await c.req.json() as Row; } catch { return c.json(err("INVALID_JSON", "Onay bilgisi eksik."), 400); }
    const slug = txt(body.mainCompanySlug || body.mainCompanyId);
    const approver = slug ? await manager(c, slug) : null;
    if (!approver) return c.json(err("MANAGER_APPROVAL_REQUIRED", "Birleştirme yalnız aynı ana firmanın yöneticisiyle yapılır."), 403);
    const fromId = txt(c.req.param("id")), toId = txt(body.targetId);
    if (!toId || fromId === toId) return c.json(err("INVALID_TARGET", "Kaynak ve hedef firma farklı olmalıdır."), 400);
    try {
      const [source, target] = await Promise.all([preview(c, slug, fromId), preview(c, slug, toId)]);
      if (!source || !target) return c.json(err("NOT_FOUND", "Firma kartlarından biri bulunamadı."), 404);
      if (!source.canHardDelete || !target.isActive) return c.json(err("MERGE_LINKED_BLOCKED", "Kaynak firma bağlantılı veya bakiyeli; hiçbir mali/model kaydı otomatik taşınmayacak.", { source, target }), 409);
      if (txt(body.confirmPhrase) !== "BIRLESTIR" ||
          txt(body.confirmSourceId) !== fromId || txt(body.confirmTargetId) !== toId ||
          txt(body.expectedSourceUpdatedAt) !== source.updatedAt ||
          txt(body.expectedTargetUpdatedAt) !== target.updatedAt) {
        return c.json(err("CONFIRM_MISMATCH", "İki firma ID'si, sürümleri veya BIRLESTIR onayı eşleşmiyor."), 409);
      }
      // D1 batch atomiktir. Kaynak boşsa silinir, alias hedefe taşınır,
      // denetim kayıtlı olur. Hedef şirket ID'si ve mali hareketleri değiştirilmez.
      const actions = [
        // Move harmless aliases before deleting the source identity. Financial
        // documents/movements are never transferred by this operation.
        c.env.DB.prepare(
          "UPDATE company_aliases SET company_id=?,updated_at=CURRENT_TIMESTAMP WHERE main_company_slug=? AND company_id=? AND EXISTS(SELECT 1 FROM companies WHERE id=? AND main_company_slug=? AND updated_at=? AND COALESCE(current_balance,0)=0 AND COALESCE(opening_balance,0)=0 AND deleted_at IS NULL) AND EXISTS(SELECT 1 FROM companies WHERE id=? AND main_company_slug=? AND updated_at=? AND deleted_at IS NULL AND is_active=1)",
        ).bind(toId, slug, fromId, fromId, slug, source.updatedAt, toId, slug, target.updatedAt),
        c.env.DB.prepare(
          "DELETE FROM companies WHERE id=? AND main_company_slug=? AND updated_at=? AND COALESCE(current_balance,0)=0 AND COALESCE(opening_balance,0)=0 AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM companies WHERE id=? AND main_company_slug=? AND updated_at=? AND deleted_at IS NULL AND is_active=1)",
        ).bind(fromId, slug, source.updatedAt, toId, slug, target.updatedAt),
        c.env.DB.prepare(
          "INSERT INTO activity_logs (id,main_company_slug,module,entity_type,entity_id,action,action_type,description,old_value,new_value,after_data,actor,created_at) "+
          "SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM companies WHERE id=? AND main_company_slug=?)",
        ).bind(crypto.randomUUID(),slug,"MUHASEBE","COMPANY",fromId,"MERGE","ACCOUNTING_COMPANY_SAFE_MERGE",
          "Bağlantısız kaynak firma ID hedef firmaya birleştirildi",JSON.stringify(source),
          JSON.stringify({ targetId: toId,targetName: target.companyName }),
          JSON.stringify({ actorId: txt(approver.id || approver.userId), sourceAliasCount: source.aliasCount }),
          txt(approver.email || approver.username || approver.id),new Date().toISOString(),fromId,slug),
      ];
      const done = await c.env.DB.batch(actions);
      if (!done[1]?.meta?.changes) return c.json(err("MERGE_CHANGED", "Firma bilgileri değişti; birleştirme yapılmadı. Ön kontrolü yenileyin."), 409);
      return c.json({ ok: true, success: true, data: {
        merged: true, sourceId: fromId, targetId: toId, transferredAliases: done[0]?.meta?.changes || 0,
        financialRecordsMoved: 0,
      } });
    } catch (cause) {
      console.error("Safe company merge blocked", cause);
      return c.json(err("MERGE_FAILED", "Güvenli birleştirme tamamlanamadı. İki firma kimliğini yeniden kontrol edin."), 409);
    }
  });

}
