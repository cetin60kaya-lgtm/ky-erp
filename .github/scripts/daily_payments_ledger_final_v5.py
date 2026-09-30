from pathlib import Path

code=Path('.github/scripts/daily_payments_ledger_final_v3.py').read_text(encoding='utf-8')
needle="source=Path('.github/scripts/daily_payments_ledger_final.py').read_text(encoding='utf-8')\n"
replacement=needle+"source=source.replace(\"new_render=r'''\", \"new_render='''\", 1).replace(\"receipt_func=r'''\", \"receipt_func='''\", 1)\n"
if needle not in code:
    raise SystemExit('v3 source anchor missing')
code=code.replace(needle,replacement,1)
old="pay_payload=m.group(1)"
new="import ast\npay_payload=ast.literal_eval(\"'''\"+m.group(1)+\"'''\")"
if old not in code:
    raise SystemExit('v3 pay payload anchor missing')
code=code.replace(old,new,1)
exec(compile(code,'daily_payments_ledger_final_v5_exec.py','exec'))
