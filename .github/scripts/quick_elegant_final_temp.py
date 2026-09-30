from pathlib import Path

jsx = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
css = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/daily-hr-workspace-final.css')
text = jsx.read_text(encoding='utf-8')

old_header = '''<p>Bu pencerede yalnız seçili gün ve seçili vardiya değişir.</p></div><button type="button" onClick={() => setQuick(null)}><X size={19}/></button></header>'''
new_header = '''<p>Bu pencerede yalnız seçili gün ve seçili vardiya değişir.</p></div><div className="quick-header-actions"><span className={`quick-safety-chip ${quick.shift}`}>Tek Gün · {dateText(quick.date, true)} · {quick.shift === "day" ? "Gündüz" : "Gece"}</span><button type="button" onClick={() => setQuick(null)}><X size={19}/></button></div></header>'''
assert old_header in text, 'quick header source not found'
text = text.replace(old_header, new_header, 1)

old_warning = '''        <div className="quick-warning"><strong>Yalnız {longDateText(quick.date)} — {quick.shift === "day" ? "Gündüz" : "Gece"}</strong><span>Başka bir gün veya vardiya bu kayıt sırasında değiştirilemez.</span></div>\n'''
assert old_warning in text, 'quick warning source not found'
text = text.replace(old_warning, '', 1)
jsx.write_text(text, encoding='utf-8')

style = css.read_text(encoding='utf-8')
marker = '/* QUICK-ENTRY-ELEGANT-GRID-FINAL-2026-09-30 */'
assert marker not in style, 'elegant marker already exists'
style += r'''

/* QUICK-ENTRY-ELEGANT-GRID-FINAL-2026-09-30 */
.gop-quick-dialog>header{align-items:center!important}
.quick-header-actions{display:flex;align-items:center;gap:7px;margin-left:auto;flex:0 0 auto}
.quick-header-actions>button{width:30px!important;height:30px!important;min-height:30px!important;padding:0!important}
.quick-safety-chip{display:inline-flex;align-items:center;justify-content:center;height:22px;padding:0 8px;border-radius:999px;font-size:7px;font-weight:950;white-space:nowrap;letter-spacing:.02em}
.quick-safety-chip.day{background:#fff7ed;border:1px solid #fed7aa;color:#9a4d08}.quick-safety-chip.night{background:#f5f3ff;border:1px solid #ddd6fe;color:#4c1d95}
.gop-quick-dialog .quick-kpis{margin-top:3px!important}
.gop-quick-dialog .quick-kpis .gop-stat{min-height:50px;padding:6px 8px}
.gop-quick-dialog .quick-person-grid{align-items:stretch!important;grid-auto-rows:minmax(var(--quick-row-h),auto)!important}
.gop-quick-dialog .quick-person{display:grid!important;grid-template-columns:minmax(0,1fr) 24px!important;min-width:0!important;min-height:var(--quick-row-h)!important;border-color:#e5ebf2!important;background:#fff!important;box-shadow:none!important}
.gop-quick-dialog .quick-person.selected{background:#fffaf5!important;border-color:#fed7aa!important;box-shadow:inset 2px 0 0 #f97316!important}
.gop-quick-dialog .quick-person.checked{background:#f6fdf8!important;border-color:#d7f2df!important;box-shadow:inset 2px 0 0 #22a65a!important}
.gop-quick-dialog .quick-main-toggle{display:grid!important;grid-template-columns:20px minmax(0,1fr) 62px 34px!important;column-gap:5px!important;align-items:center!important;min-width:0!important;padding:2px 4px!important;min-height:var(--quick-row-h)!important;text-align:left!important}
.gop-quick-dialog .quick-avatar{width:18px!important;height:18px!important;border-radius:5px!important;font-size:8px!important}
.gop-quick-dialog .quick-person-text{min-width:0!important;overflow:hidden!important}
.gop-quick-dialog .quick-person-text strong,.gop-quick-dialog .quick-person-text small{display:block!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
.gop-quick-dialog .quick-person-text strong{font-size:7.5px!important;line-height:1.1!important}.gop-quick-dialog .quick-person-text small{font-size:6.5px!important;line-height:1.1!important;margin-top:1px!important;color:#7b8da1!important}
.gop-quick-dialog .quick-main-toggle>b{width:62px!important;text-align:right!important;font-size:6.5px!important;white-space:nowrap!important;color:#17385f!important}
.gop-quick-dialog .quick-main-toggle>em{width:34px!important;text-align:center!important;font-size:6.5px!important;font-style:normal!important;white-space:nowrap!important;color:#b45309!important}
.gop-quick-dialog .quick-check-button{width:24px!important;min-width:24px!important;max-width:24px!important;padding:0!important;border:0!important;border-left:1px solid #edf1f5!important;background:transparent!important;color:#a6b2c0!important;display:grid!important;place-items:center!important}
.gop-quick-dialog .quick-check-button:not(:disabled):hover{background:#f7fafc!important;color:#5f7187!important}
.gop-quick-dialog .quick-check-button.is-checked{background:transparent!important;color:#159447!important;border-left-color:#d7f2df!important}
.gop-quick-dialog .quick-check-button:disabled{opacity:.28!important}
.gop-quick-dialog .quick-check-mark{display:grid!important;place-items:center!important;width:17px!important;height:17px!important;border:1.2px solid currentColor!important;border-radius:4px!important;font-size:10px!important;font-weight:950!important;line-height:1!important;background:#fff!important}
.gop-quick-dialog .quick-check-button.is-checked .quick-check-mark{background:#eaf9ef!important;border-color:#22a65a!important;color:#168443!important}
.gop-quick-dialog .quick-group-head{border-bottom-color:#dbe5f0!important}
@media (max-width:1366px), (max-height:820px){
  .gop-quick-dialog>header{padding:5px 8px!important}
  .quick-safety-chip{height:20px;padding:0 7px;font-size:6.5px}
  .quick-header-actions>button{width:27px!important;height:27px!important;min-height:27px!important}
  .gop-quick-dialog .quick-kpis{margin-top:2px!important}
  .gop-quick-dialog .quick-kpis .gop-stat{min-height:44px!important;padding:4px 6px!important}
  .gop-quick-dialog .quick-main-toggle{grid-template-columns:18px minmax(0,1fr) 58px 30px!important;column-gap:4px!important;padding:1px 3px!important}
  .gop-quick-dialog .quick-main-toggle>b{width:58px!important}.gop-quick-dialog .quick-main-toggle>em{width:30px!important}
  .gop-quick-dialog .quick-person{grid-template-columns:minmax(0,1fr) 22px!important}.gop-quick-dialog .quick-check-button{width:22px!important;min-width:22px!important;max-width:22px!important}.gop-quick-dialog .quick-check-mark{width:15px!important;height:15px!important;font-size:9px!important}
}
@media (max-width:760px){.quick-safety-chip{display:none}.gop-quick-dialog .quick-main-toggle{grid-template-columns:18px minmax(0,1fr) 54px 28px!important}.gop-quick-dialog .quick-main-toggle>b{width:54px!important}.gop-quick-dialog .quick-main-toggle>em{width:28px!important}}
'''
css.write_text(style, encoding='utf-8')
print('elegant quick entry layout applied')
