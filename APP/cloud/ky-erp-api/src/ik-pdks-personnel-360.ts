// KY PDKS Personel 360: D1 personnel card ledger and File Hub document relations.
// No Firebird, TNF, terminal or physical card write occurs in these routes.
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string; pdksCompany?: string } };
type Row = Record<string, any>;
const value = (v: unknown) => v == null ? "" : String(v).trim();
const now = () => new Date().toISOString();
const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN", "OWNER", "HR_ADMIN"]);
const DOCUMENT_TYPES = new Set(["PERSONNEL_DOCUMENT", "CONTRACT"]);

function fail(c: Context<AppEnv>, status: number, code: string, message: string) {
  return c.json({ ok: false, error: { code, message } }, status as any);
}
function ok(c: Context<AppEnv>, data: unknown) {
  return c.json({ ok: true, data });
}
async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try { const p = await c.req.json(); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; }
  catch { return {}; }
}
async function access(c: Context<AppEnv>, employeeId: string, write = false) {
  const user = await getAuthenticatedUser(c);
  if (!user) return { deny: fail(c, 401, "UNAUTHORIZED", "Oturum gerekli.") };
  // The earlier personnel-control guard validates this tenant against the logged-in user.
  const company = value((c as any).get?.("pdksCompany"));
  if (!company) return { deny: fail(c, 403, "PDKS_TENANT_REQUIRED", "Doğrulanmış PDKS firma kapsamı bulunamadı.") };
  const [scope, person] = await Promise.all([
    c.env.DB.prepare("SELECT scope FROM ik_user_hr_scope WHERE main_company_id=? AND user_id=? LIMIT 1")
      .bind(company, user.id).first<Row>().catch(() => null),
    c.env.DB.prepare("SELECT id,full_name FROM hr_monthly_employees WHERE main_company_id=? AND id=? LIMIT 1")
      .bind(company, employeeId).first<Row>(),
  ]);
  const role = value(user.role).toUpperCase();
  if (value(scope?.scope).toUpperCase() === "AUDIT" || role === "DENETIM" ||
      value(user.username).toLocaleLowerCase("tr-TR") === "denetim")
    return { deny: fail(c, 403, "PDKS_AUDIT_READ_ONLY", "Denetim hesabı kişisel kart ve evrak kayıtlarına erişemez.") };
  if (!person) return { deny: fail(c, 404, "PERSON_NOT_FOUND", "Bu firmada personel bulunamadı.") };
  if (write && !ADMIN_ROLES.has(role))
    return { deny: fail(c, 403, "PDKS_PERSONNEL_ADMIN_REQUIRED", "Bu işlem personel yöneticisi yetkisi gerektirir.") };
  return { user, company, person };
}
const assignmentHistory = (c: Context<AppEnv>, company: string, employeeId: string) =>
  c.env.DB.prepare(`SELECT id,old_value AS oldCardNo,new_value AS newCardNo,effective_date AS effectiveDate,
     note,created_at AS createdAt FROM ik_employee_change_history
     WHERE main_company_id=? AND employee_id=? AND field_name='cardNo'
     ORDER BY created_at DESC LIMIT 100`).bind(company, employeeId).all<Row>();

export function registerIkPdksPersonnel360Routes(app: Hono<AppEnv>) {
  app.get("/api/ik/personnel-control/people/:employeeId/card-assignment", async (c) => {
    const employeeId = value(c.req.param("employeeId"));
    const auth = await access(c, employeeId);
    if ("deny" in auth) return auth.deny;
    const [card, history] = await Promise.all([
      c.env.DB.prepare("SELECT card_no AS cardNo,updated_at AS updatedAt FROM ik_person_card_settings WHERE main_company_id=? AND employee_id=? LIMIT 1")
        .bind(auth.company, employeeId).first<Row>(),
      assignmentHistory(c, auth.company, employeeId),
    ]);
    return ok(c, { employeeId, cardNo: value(card?.cardNo), history: history.results || [],
      terminalWritten: false, source: "D1_PERSONNEL_CARD" });
  });

  app.post("/api/ik/personnel-control/people/:employeeId/card-assignment", async (c) => {
    const employeeId = value(c.req.param("employeeId"));
    const auth = await access(c, employeeId, true);
    if ("deny" in auth) return auth.deny;
    const body = await bodyOf(c);
    const next = value(body.cardNo);
    const expected = value(body.expectedCardNo);
    const reason = value(body.reason);
    const effectiveDate = value(body.effectiveDate);
    if (!Object.prototype.hasOwnProperty.call(body, "expectedCardNo"))
      return fail(c, 428, "EXPECTED_CARD_REQUIRED", "Önceki kart numarası doğrulanmalıdır.");
    if (next && !/^[A-Za-z0-9-]{1,32}$/.test(next))
      return fail(c, 400, "INVALID_CARD_NO", "Kart numarası 1–32 karakter, harf/rakam/tire olmalıdır.");
    if (reason.length < 5 || reason.length > 240)
      return fail(c, 400, "CARD_REASON_REQUIRED", "Kart değişim gerekçesi 5–240 karakter olmalıdır.");
    const parsedDate = new Date(effectiveDate + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
        Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== effectiveDate)
      return fail(c, 400, "CARD_DATE_INVALID", "Geçerli işlem tarihi zorunludur.");
    const current = await c.env.DB.prepare("SELECT card_no AS cardNo FROM ik_person_card_settings WHERE main_company_id=? AND employee_id=?")
      .bind(auth.company, employeeId).first<Row>();
    if (!current) return fail(c, 503, "PDKS_CARD_ROW_NOT_READY", "Personel kart ayar kaydı eksik; otomatik kayıt oluşturulmadı.");
    if (value(current.cardNo) !== expected)
      return fail(c, 409, "CARD_STALE", "Kart başka bir işlemde değişmiş. Önce yenileyin.");
    if (next === expected) return ok(c, { changed: false, cardNo: next, terminalWritten: false });
    const changedAt = now();
    const results = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE ik_person_card_settings SET card_no=?,updated_at=?
        WHERE main_company_id=? AND employee_id=? AND COALESCE(TRIM(card_no),'')=?
          AND (?='' OR NOT EXISTS(
            SELECT 1 FROM ik_person_card_settings
            WHERE main_company_id=? AND employee_id<>? AND TRIM(COALESCE(card_no,''))=?
          ))`)
        .bind(next || null, changedAt, auth.company, employeeId, expected, next, auth.company, employeeId, next),
      c.env.DB.prepare(`INSERT INTO ik_employee_change_history
        (id,main_company_id,employee_id,change_type,field_name,old_value,new_value,effective_date,note,actor_user_id,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1`)
        .bind(crypto.randomUUID(), auth.company, employeeId, "CARD_ASSIGNMENT", "cardNo",
          expected, next, effectiveDate, reason, auth.user.id, changedAt),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1)
      return fail(c, 409, "CARD_CONFLICT", "Kart başka bir personele atanmış veya eşzamanlı değişiklik var.");
    if (Number(results[1]?.meta?.changes || 0) !== 1)
      return fail(c, 500, "CARD_HISTORY_UNVERIFIED", "Kart geçmişi doğrulanamadı; kayıt incelenmelidir.");
    return ok(c, { changed: true, employeeId, cardNo: next, previousCardNo: expected,
      effectiveDate, terminalWritten: false, localReconciled: false,
      warning: "Yalnız KY ERP D1 kart eşlemesi değişti; fiziksel terminal/FDB/TNF eşitlemesi doğrulanmadı." });
  });

  app.get("/api/ik/personnel-control/people/:employeeId/documents", async (c) => {
    const employeeId = value(c.req.param("employeeId"));
    const auth = await access(c, employeeId);
    if ("deny" in auth) return auth.deny;
    try {
      const result = await c.env.DB.prepare(`SELECT r.id,r.file_asset_id AS assetId,
        r.relation_type AS documentType,r.metadata,r.created_at AS createdAt,
        a.file_name AS fileName,a.status,a.size_bytes AS sizeBytes
        FROM file_hub_relations r JOIN file_hub_assets a ON a.id=r.file_asset_id
           AND a.main_company_slug=r.main_company_slug
        WHERE r.main_company_slug=? AND r.entity_type='IK_PERSONNEL'
          AND r.entity_id=? AND r.relation_type IN ('PERSONNEL_DOCUMENT','CONTRACT')
        ORDER BY r.created_at DESC LIMIT 150`).bind(auth.company, employeeId).all<Row>();
      return ok(c, (result.results || []).map((row) => {
        let metadata: Row = {};
        try { metadata = JSON.parse(value(row.metadata) || "{}"); } catch {}
        return { id: row.id, assetId: row.assetId, documentType: row.documentType,
          note: value(metadata.note), fileName: row.fileName, status: row.status,
          sizeBytes: row.sizeBytes, createdAt: row.createdAt, physicalFileDeleted: false };
      }));
    } catch {
      return fail(c, 503, "PERSONNEL_FILE_HUB_NOT_READY", "File Hub şeması/bağlantısı henüz kullanılamıyor.");
    }
  });

  app.get("/api/ik/personnel-control/people/:employeeId/document-candidates", async (c) => {
    const employeeId = value(c.req.param("employeeId"));
    const auth = await access(c, employeeId, true);
    if ("deny" in auth) return auth.deny;
    try {
      const result = await c.env.DB.prepare(`SELECT DISTINCT a.id,a.file_name AS fileName,a.status,a.updated_at AS updatedAt
        FROM file_hub_assets a
        JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug
        JOIN file_hub_bindings b ON b.storage_connection_id=l.storage_connection_id
          AND b.main_company_slug=a.main_company_slug
        WHERE a.main_company_slug=? AND b.module_code='IK'
          AND b.purpose_code IN ('PERSONNEL_DOCUMENT','CONTRACT')
          AND b.read_enabled=1 AND l.is_available=1 AND a.status='AVAILABLE'
        ORDER BY a.updated_at DESC LIMIT 50`).bind(auth.company).all<Row>();
      return ok(c, result.results || []);
    } catch {
      return fail(c, 503, "PERSONNEL_FILE_HUB_NOT_READY", "Özlük evrakları için File Hub bağlantısı hazır değil.");
    }
  });

  app.post("/api/ik/personnel-control/people/:employeeId/documents", async (c) => {
    const employeeId = value(c.req.param("employeeId"));
    const auth = await access(c, employeeId, true);
    if ("deny" in auth) return auth.deny;
    const body = await bodyOf(c);
    const assetId = value(body.assetId);
    const documentType = value(body.documentType).toUpperCase();
    const note = value(body.note);
    if (!assetId || !DOCUMENT_TYPES.has(documentType) || note.length > 240)
      return fail(c, 400, "PERSONNEL_DOCUMENT_INVALID", "Geçerli File Hub dosyası ve evrak türü seçilmelidir.");
    const file = await c.env.DB.prepare(`SELECT a.id FROM file_hub_assets a
      JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug
      JOIN file_hub_bindings b ON b.storage_connection_id=l.storage_connection_id AND b.main_company_slug=a.main_company_slug
      WHERE a.id=? AND a.main_company_slug=? AND a.status='AVAILABLE' AND l.is_available=1
        AND b.module_code='IK' AND b.purpose_code IN ('PERSONNEL_DOCUMENT','CONTRACT') AND b.read_enabled=1 LIMIT 1`)
      .bind(assetId, auth.company).first<Row>().catch(() => null);
    if (!file) return fail(c, 409, "PERSONNEL_DOCUMENT_ASSET_NOT_READY", "Seçili dosya yetkili İK File Hub alanında bulunamadı.");
    const relationId = crypto.randomUUID(), timestamp = now();
    const results = await c.env.DB.batch([
      c.env.DB.prepare(`INSERT OR IGNORE INTO file_hub_relations
        (id,main_company_slug,file_asset_id,entity_type,entity_id,relation_type,is_primary,confidence,source,metadata,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(relationId, auth.company, assetId, "IK_PERSONNEL", employeeId, documentType,
          0, 1, "PDKS_PERSONNEL_360", JSON.stringify({ note }), timestamp, timestamp),
      c.env.DB.prepare(`INSERT INTO ik_employee_change_history
        (id,main_company_id,employee_id,change_type,field_name,old_value,new_value,effective_date,note,actor_user_id,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1`)
        .bind(crypto.randomUUID(), auth.company, employeeId, "DOCUMENT_LINK", "fileHubAsset",
          "", assetId, timestamp.slice(0, 10), documentType + (note ? " - " + note : ""), auth.user.id, timestamp),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1)
      return fail(c, 409, "PERSONNEL_DOCUMENT_DUPLICATE", "Evrak bağlantısı zaten mevcut.");
    return ok(c, { id: relationId, assetId, employeeId, documentType, storedIn: "FILE_HUB",
      physicalFileCopied: false });
  });

  app.post("/api/ik/personnel-control/people/:employeeId/documents/:relationId/unlink", async (c) => {
    const employeeId = value(c.req.param("employeeId"));
    const auth = await access(c, employeeId, true);
    if ("deny" in auth) return auth.deny;
    const relationId = value(c.req.param("relationId"));
    const body = await bodyOf(c);
    const reason = value(body.reason);
    if (reason.length < 5 || reason.length > 240)
      return fail(c, 400, "DOCUMENT_UNLINK_REASON_REQUIRED", "Evrak ayırma gerekçesi gereklidir.");
    const existing = await c.env.DB.prepare(`SELECT id,file_asset_id,relation_type
      FROM file_hub_relations WHERE id=? AND main_company_slug=?
        AND entity_type='IK_PERSONNEL' AND entity_id=?
        AND relation_type IN ('PERSONNEL_DOCUMENT','CONTRACT') LIMIT 1`)
      .bind(relationId, auth.company, employeeId).first<Row>();
    if (!existing) return fail(c, 404, "DOCUMENT_RELATION_NOT_FOUND", "Personel evrak bağlantısı bulunamadı.");
    const timestamp = now();
    const results = await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM file_hub_relations WHERE id=? AND main_company_slug=?
        AND entity_type='IK_PERSONNEL' AND entity_id=?`)
        .bind(relationId, auth.company, employeeId),
      c.env.DB.prepare(`INSERT INTO ik_employee_change_history
        (id,main_company_id,employee_id,change_type,field_name,old_value,new_value,effective_date,note,actor_user_id,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1`)
        .bind(crypto.randomUUID(), auth.company, employeeId, "DOCUMENT_UNLINK", "fileHubAsset",
          value(existing.file_asset_id), "", timestamp.slice(0, 10), reason, auth.user.id, timestamp),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1)
      return fail(c, 409, "DOCUMENT_RELATION_CHANGED", "Evrak bağlantısı eşzamanlı değiştirildi.");
    return ok(c, { unlinked: true, physicalFileDeleted: false,
      message: "Dosya silinmedi; yalnız personel-evrak bağlantısı kaldırıldı." });
  });
}
