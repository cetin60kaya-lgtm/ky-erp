from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")


def replace_once(content, old, new, label):
    if old not in content:
        raise RuntimeError(f"PATCH_ANCHOR_MISSING: {label}")
    return content.replace(old, new, 1)


# main.ts: register Gmail and protect every Muhasebe route with the same fail-closed guard.
p = "APP/cloud/ky-erp-api/src/main.ts"
s = read(p)
if 'registerGoogleMailRoutes' not in s:
    s = replace_once(
        s,
        'import { registerMailCommunicationRoutes } from "./mail-communication-core";\nimport { registerMicrosoftMailRoutes } from "./mail-microsoft-graph";',
        'import { registerMailCommunicationRoutes } from "./mail-communication-core";\nimport { registerGoogleMailRoutes } from "./mail-google-gmail";\nimport { registerMicrosoftMailRoutes } from "./mail-microsoft-graph";',
        "gmail import",
    )
    s = replace_once(
        s,
        "registerMailCommunicationRoutes(app);\nregisterMicrosoftMailRoutes(app);",
        "registerMailCommunicationRoutes(app);\nregisterGoogleMailRoutes(app);\nregisterMicrosoftMailRoutes(app);",
        "gmail register",
    )
s = s.replace(
    '// Müşteri irsaliye/fatura kontrolü canonical Muhasebe verisini kullanır ve aynı tenant/yetki kilidine tabidir.\nshell.use("/api/muhasebe/customer-dispatches*", enforceAccountingTenant);',
    '// Tüm Muhasebe endpointleri aynı tenant/yetki kilidine tabidir; tenant yoksa fail-closed çalışır.\nshell.use("/api/muhasebe/*", enforceAccountingTenant);',
    1,
)
write(p, s)

# Workspace: remove silent tenant fallback and make optional live-revision triggers best-effort.
p = "APP/cloud/ky-erp-api/src/accounting-workspace-core.ts"
s = read(p)
s = s.replace(
    'const slugOf = (c: Context<AppEnv>) => text(c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || c.req.header("X-KYERP-Tenant-Slug") || "mecit-hakan");',
    'const slugOf = (c: Context<AppEnv>) => text(c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || c.req.header("X-KYERP-Tenant-Slug"));',
    1,
)
s = s.replace('  app.use("/api/muhasebe/workspace/*", enforceAccountingTenant);\n', "", 1)
pattern = re.compile(r'  for \(const row of existing\.results \|\| \[\]\) \{.*?\n  \}\n  schemaReady = true;', re.S)
match = pattern.search(s)
if not match:
    raise RuntimeError("PATCH_ANCHOR_MISSING: workspace live trigger block")
replacement = r'''  for (const row of existing.results || []) {
    const table = text(row.name);
    if (!table || table === "accounting_live_revision") continue;
    try {
      const columns = await c.env.DB.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all<Row>();
      if (!(columns.results || []).some((column) => text(column.name) === "main_company_slug")) continue;
      const base = table.replace(/[^A-Za-z0-9_]/g, "_");
      for (const [event, ref] of [["INSERT", "NEW"], ["UPDATE", "NEW"], ["DELETE", "OLD"]] as const) {
        const trigger = `trg_${base}_accounting_live_${event.toLowerCase()}`;
        try {
          await c.env.DB.exec(`CREATE TRIGGER IF NOT EXISTS ${trigger} AFTER ${event} ON "${table}"
            WHEN ${ref}.main_company_slug IS NOT NULL AND TRIM(${ref}.main_company_slug) <> ''
            BEGIN
              INSERT INTO accounting_live_revision(main_company_slug,revision,updated_at)
              VALUES(${ref}.main_company_slug,1,CURRENT_TIMESTAMP)
              ON CONFLICT(main_company_slug) DO UPDATE SET revision=revision+1,updated_at=CURRENT_TIMESTAMP;
            END;`);
        } catch (error) {
          console.warn("KY ERP accounting live trigger skipped", { table, event, error: String(error) });
        }
      }
    } catch (error) {
      console.warn("KY ERP accounting live table inspection skipped", { table, error: String(error) });
    }
  }
  schemaReady = true;'''
s = s[: match.start()] + replacement + s[match.end() :]
if 'MAIN_COMPANY_REQUIRED", "Muhasebe için ana firma' not in s:
    s = replace_once(
        s,
        "  const slug = slugOf(c);\n  let row = await c.env.DB.prepare(",
        '  const slug = slugOf(c);\n  if (!slug) return fail(c, 400, "MAIN_COMPANY_REQUIRED", "Muhasebe için ana firma seçimi zorunludur.");\n  let row = await c.env.DB.prepare(',
        "live-state tenant check",
    )
write(p, s)

# Finance core: fail closed tenant and debit/credit XOR validation.
p = "APP/cloud/ky-erp-api/src/accounting-finance-core.ts"
s = read(p)
s = s.replace('  c.req.header("X-KYERP-Tenant-Slug") || "mecit-hakan",', '  c.req.header("X-KYERP-Tenant-Slug"),', 1)
if "LEDGER_SIDE_INVALID" not in s:
    s = replace_once(
        s,
        '  app.post("/api/muhasebe/defter", async (c) => {\n    const body = await bodyOf(c), slug = slugOf(c, body), id = crypto.randomUUID(), timestamp = now();\n    await c.env.DB.prepare(`INSERT INTO accounting_ledger_entries',
        '  app.post("/api/muhasebe/defter", async (c) => {\n    const body = await bodyOf(c), slug = slugOf(c, body), id = crypto.randomUUID(), timestamp = now();\n    const debit = num(body.debit), credit = num(body.credit);\n    if ((debit > 0 && credit > 0) || (debit <= 0 && credit <= 0)) {\n      return c.json(error("LEDGER_SIDE_INVALID", "Defter kaydında yalnız borç veya yalnız alacak tutarı girilmelidir."), 400);\n    }\n    await c.env.DB.prepare(`INSERT INTO accounting_ledger_entries',
        "ledger xor",
    )
    s = s.replace('      num(body.debit), num(body.credit), text(body.currency) || "TRY",', '      debit, credit, text(body.currency) || "TRY",', 1)
write(p, s)

# Accounting operations: no tenant fallback and idempotent payment-plan posting.
p = "APP/cloud/ky-erp-api/src/accounting-operations.ts"
s = read(p)
s = s.replace('||c.req.header("X-KYERP-Tenant-Slug")||"mecit-hakan");', '||c.req.header("X-KYERP-Tenant-Slug"));', 1)
s = s.replace('const slug=text(form.mainCompanySlug||c.req.header("X-KYERP-Tenant-Slug")||"mecit-hakan")', 'const slug=text(form.mainCompanySlug||c.req.header("X-KYERP-Tenant-Slug"))', 1)
if "PAYPLAN:" not in s:
    pattern = re.compile(r' app\.post\("/api/muhasebe/odeme-plani/:id/paid",async c=>\{.*?\}\);\n app\.get\("/api/muhasebe/hatirlatmalar"', re.S)
    match = pattern.search(s)
    if not match:
        raise RuntimeError("PATCH_ANCHOR_MISSING: payment-plan paid")
    endpoint = r''' app.post("/api/muhasebe/odeme-plani/:id/paid",async c=>{
   const b=await bodyOf(c),slug=slugOf(c,b),id=c.req.param("id"),ts=now();
   const plan=await c.env.DB.prepare(`SELECT * FROM accounting_payment_plans WHERE id=? AND main_company_slug=? LIMIT 1`).bind(id,slug).first<Row>();
   if(!plan)return c.json(err("NOT_FOUND","Ödeme planı bulunamadı."),404);
   const planAmount=num(plan.amount),paid=num(b.paidAmount||b.amount||planAmount);
   if(paid<=0||paid>planAmount)return c.json(err("PAID_AMOUNT_INVALID","Ödenen tutar sıfırdan büyük ve plan tutarını aşmayacak şekilde olmalıdır."),400);
   const posted=await c.env.DB.prepare(`SELECT COALESCE(SUM(debit),0) total FROM accounting_ledger_entries WHERE main_company_slug=? AND source_payment_plan_id=? AND deleted_at IS NULL`).bind(slug,id).first<Row>();
   const alreadyPosted=num(posted?.total),status=paid>=planAmount?"PAID":"PARTIAL";
   if(alreadyPosted>=paid){
     if(num(plan.paid_amount)!==paid||text(plan.status)!==status)await c.env.DB.prepare(`UPDATE accounting_payment_plans SET paid_amount=?,status=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(paid,status,ts,id,slug).run();
     return c.json({ok:true,data:{id,status,paidAmount:paid,idempotent:true}});
   }
   const delta=paid-alreadyPosted,ledgerId=`PAYPLAN:${id}:${paid.toFixed(2)}`;
   await c.env.DB.batch([
     c.env.DB.prepare(`UPDATE accounting_payment_plans SET paid_amount=?,status=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(paid,status,ts,id,slug),
     c.env.DB.prepare(`INSERT OR IGNORE INTO accounting_ledger_entries(id,main_company_slug,entry_date,entry_type,record_scope,company_id,company_name,description,debit,credit,currency,payment_method,bank_account_id,source_document_id,source_payment_plan_id,file_asset_id,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ledgerId,slug,text(b.paymentDate)||ts.slice(0,10),"ODEME","OFFICIAL",text(plan.counterparty_id)||null,text(plan.counterparty_name),text(b.description)||text(plan.description)||"Planlanan ödeme",delta,0,text(plan.currency)||"TRY",text(b.paymentMethod||plan.payment_method)||null,text(b.bankAccountId||plan.bank_account_id)||null,text(plan.source_document_id)||null,id,text(b.fileAssetId)||null,text(b.note)||null,text(b.createdBy)||null,ts,ts)
   ]);
   return c.json({ok:true,data:{id,status,paidAmount:paid,postedAmount:delta,ledgerEntryId:ledgerId,idempotent:false}});
 });
 app.get("/api/muhasebe/hatirlatmalar"'''
    s = s[: match.start()] + endpoint + s[match.end() :]
write(p, s)

# HR backend: employee 0/empty is a controlled client error.
p = "APP/cloud/ky-erp-api/src/ik-pdks-modern.ts"
s = read(p)
old = 'app.get("/api/ik/personnel-control/people/:employeeId/leave-entitlement",async(c)=>{const auth=await authContext(c);if(!auth)return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı.");await seedCompany(c,auth.company);const data=await entitlementLedger(c,auth.company,text(c.req.param("employeeId")));return data?ok(c,data):fail(c,404,"NOT_FOUND","Personel bulunamadı.");});'
new = 'app.get("/api/ik/personnel-control/people/:employeeId/leave-entitlement",async(c)=>{const auth=await authContext(c);if(!auth)return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı.");const employeeId=text(c.req.param("employeeId"));if(!employeeId||employeeId==="0")return fail(c,400,"EMPLOYEE_ID_INVALID","Geçerli bir personel seçilmelidir.");await seedCompany(c,auth.company);const data=await entitlementLedger(c,auth.company,employeeId);return data?ok(c,data):fail(c,404,"NOT_FOUND","Personel bulunamadı.");});'
if old in s:
    s = s.replace(old, new, 1)
elif "EMPLOYEE_ID_INVALID" not in s:
    raise RuntimeError("PATCH_ANCHOR_MISSING: leave entitlement")
write(p, s)

# HR frontend: do not issue request for invalid selection.
for p, name in [
    ("APP/app/ky-erp-frontend/src/services/pdksApi.js", "getPdksLeaveEntitlement"),
    ("APP/app/ky-erp-frontend/src/services/ik/personnelApi.js", "getIkControlLeaveEntitlement"),
]:
    s = read(p)
    if "function validEmployeeId(" not in s:
        anchor = '''function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}
'''
        s = replace_once(s, anchor, anchor + '\nfunction validEmployeeId(value) {\n  const id = String(value ?? "").trim();\n  return id && id !== "0" ? id : "";\n}\n', p + " helper")
    if name == "getPdksLeaveEntitlement":
        old = '''export async function getPdksLeaveEntitlement(employeeId, params = {}) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/leave-entitlement`, params));
}'''
        new = '''export async function getPdksLeaveEntitlement(employeeId, params = {}) {
  const id = validEmployeeId(employeeId);
  if (!id) return null;
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(id)}/leave-entitlement`, params));
}'''
    else:
        old = '''export async function getIkControlLeaveEntitlement(employeeId, params = {}) {
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(employeeId)}/leave-entitlement`, params));
}'''
        new = '''export async function getIkControlLeaveEntitlement(employeeId, params = {}) {
  const id = validEmployeeId(employeeId);
  if (!id) return null;
  return unwrap(await apiGet(`/ik/personnel-control/people/${encodeURIComponent(id)}/leave-entitlement`, params));
}'''
    if old in s:
        s = s.replace(old, new, 1)
    elif "if (!id) return null;" not in s:
        raise RuntimeError("PATCH_ANCHOR_MISSING: " + name)
    write(p, s)

# DESEN compatibility endpoint expected by deployed UI.
p = "APP/cloud/ky-erp-api/src/desen-storage.ts"
s = read(p)
if '/api/storage/desen-images' not in s:
    anchor = '''  app.get("/api/desen/havuz/storage-durum", async (c) => {
    return c.json({ ok: true, success: true, data: await storageStatus(c, slugOf(c)) });
  });'''
    compat = '''  app.get("/api/storage/desen-images", async (c) => {
    const slug = slugOf(c);
    if (!slug) return c.json({ ok: false, success: false, error: { code: "MAIN_COMPANY_REQUIRED", message: "Desen havuzu için ana firma seçimi zorunludur." } }, 400);
    const limit = Math.min(500, Math.max(1, Number(c.req.query("limit") || 300) || 300));
    const prefixes = [`desen/inbox/${slug}/`, `desen/models/${slug}/`, `desen/processed/${slug}/`, `desen/archive/${slug}/`];
    const files: Row[] = [];
    try {
      for (const prefix of prefixes) {
        if (files.length >= limit) break;
        const listed = await (c.env.FILES as any).list({ prefix, limit: Math.max(1, limit - files.length) });
        for (const object of Array.isArray(listed?.objects) ? listed.objects : []) {
          const key = text(object?.key);
          if (!key || key.endsWith("/")) continue;
          files.push({ id: key, key, storageKey: key, fileName: key.split("/").pop() || key, size: Number(object?.size || 0), uploadedAt: object?.uploaded || null });
          if (files.length >= limit) break;
        }
      }
      return c.json({ ok: true, success: true, data: files, items: files, files });
    } catch (error) {
      return c.json({ ok: false, success: false, error: { code: "DESEN_STORAGE_UNAVAILABLE", message: "Desen görselleri şu anda okunamadı." } }, 503);
    }
  });

'''
    s = replace_once(s, anchor, compat + anchor, "desen images")
write(p, s)

print("KYERP_FINAL_FIX_PATCH_OK")
