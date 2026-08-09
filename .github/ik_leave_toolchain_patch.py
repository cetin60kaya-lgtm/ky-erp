from pathlib import Path
import subprocess

AGENT='origin/agent/uretim-tek-merkez'
FILES=[
    'APP/cloud/ky-erp-api/package.json',
    'APP/cloud/ky-erp-api/package-lock.json',
    'APP/cloud/ky-erp-api/tsconfig.json',
    'APP/cloud/ky-erp-api/worker-configuration.d.ts',
]
for name in FILES:
    content=subprocess.check_output(['git','show',f'{AGENT}:{name}'])
    Path(name).write_bytes(content)

p=Path('APP/cloud/ky-erp-api/src/ik-relational-cloud.ts')
s=p.read_text(encoding='utf-8')
old='app.post("/api/ik/advanced/leave/preview", protect(previewAdvancedLeaveV2));'
new='app.post("/api/ik/advanced/leave/preview", protect(async (c) => (await previewAdvancedLeaveV2(c)) as Response));'
if old not in s:
    raise SystemExit('preview route marker not found')
p.write_text(s.replace(old,new,1), encoding='utf-8')
print('IK worker toolchain aligned.')
