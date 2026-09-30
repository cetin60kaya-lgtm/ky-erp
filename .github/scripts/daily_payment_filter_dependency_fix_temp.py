from pathlib import Path
p=Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
s=p.read_text(encoding='utf-8')
old='  }, [companyId, paymentPoolRange.end, paymentPoolRange.start, range.end, range.start, view]);\n  useEffect(() => { void loadPayments(); }, [loadPayments]);\n'
new='  }, [companyId, paymentPoolRange, range, view]);\n  useEffect(() => { void loadPayments(); }, [loadPayments]);\n'
if s.count(old)!=1:
    raise SystemExit(f'payment loader dependency anchor expected once, found {s.count(old)}')
p.write_text(s.replace(old,new,1),encoding='utf-8')
print('payment loader hook dependency normalized')
