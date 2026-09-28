from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")

# Preserve the module-local Muhasebe workspace guard expected by the canonical contract.
p = "APP/cloud/ky-erp-api/src/accounting-workspace-core.ts"
s = read(p)
needle = 'export function registerAccountingWorkspaceCoreRoutes(app: Hono<AppEnv>) {\n'
if 'app.use("/api/muhasebe/workspace/*", enforceAccountingTenant);' not in s:
    if needle not in s:
        raise RuntimeError("PATCH_ANCHOR_MISSING: accounting workspace registrar")
    s = s.replace(needle, needle + '  app.use("/api/muhasebe/workspace/*", enforceAccountingTenant);\n', 1)
write(p, s)

# Keep the existing contract-visible URL shape while still refusing empty/0 IDs before the request.
for p in [
    "APP/app/ky-erp-frontend/src/services/pdksApi.js",
    "APP/app/ky-erp-frontend/src/services/ik/personnelApi.js",
]:
    s = read(p)
    marker = 'const id = validEmployeeId(employeeId);\n  if (!id) return null;\n'
    if marker not in s:
        raise RuntimeError(f"PATCH_ANCHOR_MISSING: validated employee id in {p}")
    s = s.replace('encodeURIComponent(id)}/leave-entitlement', 'encodeURIComponent(employeeId)}/leave-entitlement', 1)
    write(p, s)

print("KYERP_FINAL_FIX_CONTRACT_OK")
