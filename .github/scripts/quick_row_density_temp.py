from pathlib import Path

jsx = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
css = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/daily-hr-workspace-final.css')

text = jsx.read_text(encoding='utf-8')
old = 'const DIALOG_SIZE_KEY = "kyerp.dailyOperations.dialogSizes.v1";\n'
new = old + 'const QUICK_ROW_HEIGHT_KEY = "kyerp.dailyOperations.quickRowHeight.v1";\n'
assert old in text and 'QUICK_ROW_HEIGHT_KEY' not in text
text = text.replace(old, new, 1)

old = 'function writeDialogSizes(value) { try { window.localStorage.setItem(DIALOG_SIZE_KEY, JSON.stringify(value)); } catch { /* optional storage */ } }\n'
new = old + 'function readQuickRowHeight() { try { const value = Number(window.localStorage.getItem(QUICK_ROW_HEIGHT_KEY)); return Number.isFinite(value) && value >= 30 && value <= 48 ? value : 34; } catch { return 34; } }\nfunction writeQuickRowHeight(value) { try { window.localStorage.setItem(QUICK_ROW_HEIGHT_KEY, String(value)); } catch { /* optional storage */ } }\n'
assert old in text
text = text.replace(old, new, 1)

old = '  const [dialogSizes, setDialogSizes] = useState(readDialogSizes);\n'
new = old + '  const [quickRowHeight, setQuickRowHeight] = useState(readQuickRowHeight);\n'
assert old in text
text = text.replace(old, new, 1)

old = 'style={dialogBoxStyle(dialogSizes.quick)}'
new = 'style={{ ...dialogBoxStyle(dialogSizes.quick), "--quick-row-h": `${quickRowHeight}px` }}'
assert old in text
text = text.replace(old, new, 1)

old = '<footer className="quick-footer"><DialogSizer kind="quick" size={dialogSizes.quick} onResize={resizeDialog}/><div><strong>{quickDirty ? "Kaydedilmemiş seçimler var." : "Kayıtlı seçimler yüklendi."}</strong>'
new = '<footer className="quick-footer"><DialogSizer kind="quick" size={dialogSizes.quick} onResize={resizeDialog}/><label className="quick-row-height" title="Excel satır yüksekliği gibi hızlı giriş personel satırlarını sıkıştırır veya açar"><span>Satır</span><input type="range" min="30" max="48" step="1" value={quickRowHeight} onChange={(e) => { const value = Number(e.target.value); setQuickRowHeight(value); writeQuickRowHeight(value); }}/><b>{quickRowHeight}px</b></label><div><strong>{quickDirty ? "Kaydedilmemiş seçimler var." : "Kayıtlı seçimler yüklendi."}</strong>'
assert old in text
text = text.replace(old, new, 1)
jsx.write_text(text, encoding='utf-8')

style = css.read_text(encoding='utf-8')
marker = '/* QUICK-ENTRY-ROW-DENSITY-2026-09-30 */'
assert marker not in style
style += '''\n\n/* QUICK-ENTRY-ROW-DENSITY-2026-09-30 */\n.gop-quick-dialog{--quick-row-h:34px}\n.gop-quick-dialog .quick-groups{gap:4px!important;padding-bottom:5px!important}\n.gop-quick-dialog .quick-group-head{min-height:28px!important;padding:3px 6px!important}\n.gop-quick-dialog .quick-group-head button{min-height:22px!important;padding:0 6px!important}\n.gop-quick-dialog .quick-main-toggle{min-height:var(--quick-row-h)!important;height:var(--quick-row-h)!important;padding:2px 5px!important;gap:4px!important}\n.gop-quick-dialog .quick-check-button{min-height:var(--quick-row-h)!important;height:var(--quick-row-h)!important}\n.gop-quick-dialog .quick-avatar{width:20px!important;height:20px!important;font-size:8px!important;border-radius:5px!important}\n.gop-quick-dialog .quick-person-text strong{font-size:7.5px!important;line-height:1.05!important}\n.gop-quick-dialog .quick-person-text small{font-size:6.5px!important;line-height:1.05!important;margin-top:1px!important}\n.gop-quick-dialog .quick-main-toggle b,.gop-quick-dialog .quick-main-toggle em{font-size:6.5px!important}\n.quick-row-height{display:inline-flex;align-items:center;gap:5px;border:1px solid #d5deeb;border-radius:7px;background:#f8fafc;padding:3px 6px;color:#60748c;font-size:7px;font-weight:900;white-space:nowrap}\n.quick-row-height input{width:92px;accent-color:#2563eb}\n.quick-row-height b{min-width:30px;color:#17385f;font-size:8px}\n@media(max-width:650px){.quick-row-height{display:none}}\n'''
css.write_text(style, encoding='utf-8')
print('quick entry row density control applied')
