from pathlib import Path

code=Path('.github/scripts/daily_payments_ledger_final_v3.py').read_text(encoding='utf-8')
needle="source=Path('.github/scripts/daily_payments_ledger_final.py').read_text(encoding='utf-8')\n"
replacement=needle+"source=source.replace(\"new_render=r'''\", \"new_render='''\", 1)\n"
if needle not in code:
    raise SystemExit('v3 source anchor missing')
code=code.replace(needle,replacement,1)
exec(compile(code,'daily_payments_ledger_final_v4_exec.py','exec'))
