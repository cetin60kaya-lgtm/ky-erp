from pathlib import Path
import traceback
try:
    code=Path('.github/scripts/daily_payments_ledger_final_v2.py').read_text(encoding='utf-8')
    exec(compile(code,'daily_payments_ledger_final_v2.py','exec'))
except BaseException:
    Path('.github/payment_patch_error.txt').write_text(traceback.format_exc(),encoding='utf-8')
    raise
