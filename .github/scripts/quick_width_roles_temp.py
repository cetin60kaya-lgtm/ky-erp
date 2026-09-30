from pathlib import Path

jsx = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx')
css = Path('APP/app/ky-erp-frontend/src/pages/modules/ik/daily-hr-workspace-final.css')
text = jsx.read_text(encoding='utf-8')


def replace_once(old, new):
    global text
    assert old in text, f'missing source block: {old[:100]}'
    text = text.replace(old, new, 1)

replace_once(
    'const QUICK_ROW_HEIGHT_KEY = "kyerp.dailyOperations.quickRowHeight.v1";\n',
    'const QUICK_ROW_HEIGHT_KEY = "kyerp.dailyOperations.quickRowHeight.v1";\nconst QUICK_CARD_WIDTH_KEY = "kyerp.dailyOperations.quickCardWidth.v1";\n',
)

replace_once(
    'function writeQuickRowHeight(value) { try { window.localStorage.setItem(QUICK_ROW_HEIGHT_KEY, String(value)); } catch { /* optional storage */ } }\n',
    'function writeQuickRowHeight(value) { try { window.localStorage.setItem(QUICK_ROW_HEIGHT_KEY, String(value)); } catch { /* optional storage */ } }\nfunction readQuickCardWidth() { try { const value = Number(window.localStorage.getItem(QUICK_CARD_WIDTH_KEY)); return Number.isFinite(value) && value >= 210 && value <= 380 ? value : 300; } catch { return 300; } }\nfunction writeQuickCardWidth(value) { try { window.localStorage.setItem(QUICK_CARD_WIDTH_KEY, String(value)); } catch { /* optional storage */ } }\n',
)

replace_once(
    'function normalizeText(value) { return String(value || "").trim().toLocaleUpperCase("tr-TR").replace(/\\s+/g, " "); }\n',
    'function normalizeText(value) { return String(value || "").trim().toLocaleUpperCase("tr-TR").replace(/\\s+/g, " "); }\nfunction roleLabel(value) {\n  const raw = String(value || "").trim().replace(/\\s+/g, " ");\n  const key = normalizeText(raw);\n  if (["MAKİNACI", "MAKINACI"].includes(key)) return "Makinacı";\n  if (["SERİMCİ", "SERIMCI"].includes(key)) return "Serimci";\n  if (["BOYACI"].includes(key)) return "Boyacı";\n  if (["VASIFSIZ", "VASIFSİZ"].includes(key)) return "Vasıfsız";\n  return raw;\n}\n',
)

replace_once(
    'qualification: String(person.role || "").trim(), broker:',
    'qualification: roleLabel(person.role), broker:',
)

replace_once(
    '  const [quickRowHeight, setQuickRowHeight] = useState(readQuickRowHeight);\n',
    '  const [quickRowHeight, setQuickRowHeight] = useState(readQuickRowHeight);\n  const [quickCardWidth, setQuickCardWidth] = useState(readQuickCardWidth);\n',
)

replace_once(
    '  const days = useMemo(() => rangeDays(range.start, range.end), [range.end, range.start]);\n',
    '''  const days = useMemo(() => rangeDays(range.start, range.end), [range.end, range.start]);
  const roleOptions = useMemo(() => {
    const values = ["Makinacı", "Serimci", "Boyacı", "Vasıfsız", ...employees.map((person) => person.role)];
    const unique = new Map();
    values.forEach((value) => { const label = roleLabel(value); const key = normalizeText(label); if (label && key && !unique.has(key)) unique.set(key, label); });
    return [...unique.values()];
  }, [employees]);
  const askNewRole = useCallback(() => {
    const raw = window.prompt("Yeni vasıf adını yazın:");
    if (!String(raw || "").trim()) return "";
    const label = roleLabel(raw);
    return roleOptions.find((item) => normalizeText(item) === normalizeText(label)) || label;
  }, [roleOptions]);
''',
)

replace_once(
    '    if (!String(cardDialog.name || "").trim()) { setError("Ad soyad zorunludur."); return; }\n',
    '    if (!String(cardDialog.name || "").trim()) { setError("Ad soyad zorunludur."); return; }\n    if (!String(cardDialog.role || "").trim()) { setError("Vasıf seçimi zorunludur."); return; }\n',
)

replace_once(
    '    if (!String(cardEditor.name || "").trim()) { setError("Ad soyad zorunludur."); return; }\n',
    '    if (!String(cardEditor.name || "").trim()) { setError("Ad soyad zorunludur."); return; }\n    if (!String(cardEditor.role || "").trim()) { setError("Vasıf seçimi zorunludur."); return; }\n',
)

replace_once(
    'style={{ ...dialogBoxStyle(dialogSizes.quick), "--quick-row-h": `${quickRowHeight}px` }}',
    'style={{ ...dialogBoxStyle(dialogSizes.quick), "--quick-row-h": `${quickRowHeight}px`, "--quick-card-w": `${quickCardWidth}px` }}',
)

replace_once(
    '<label className="quick-row-height" title="Excel satır yüksekliği gibi hızlı giriş personel satırlarını sıkıştırır veya açar"><span>Satır</span><input type="range" min="30" max="48" step="1" value={quickRowHeight} onChange={(e) => { const value = Number(e.target.value); setQuickRowHeight(value); writeQuickRowHeight(value); }}/><b>{quickRowHeight}px</b></label><div>',
    '<label className="quick-row-height" title="Excel satır yüksekliği gibi hızlı giriş personel satırlarını sıkıştırır veya açar"><span>Satır</span><input type="range" min="30" max="48" step="1" value={quickRowHeight} onChange={(e) => { const value = Number(e.target.value); setQuickRowHeight(value); writeQuickRowHeight(value); }}/><b>{quickRowHeight}px</b></label><label className="quick-card-width" title="Kişi kartı genişliği. Daralttıkça kartlar otomatik daha fazla sütuna yerleşir"><span>Kart En</span><input type="range" min="210" max="380" step="10" value={quickCardWidth} onChange={(e) => { const value = Number(e.target.value); setQuickCardWidth(value); writeQuickCardWidth(value); }}/><b>{quickCardWidth}px</b></label><div>',
)

modal_old = '<label>Vasıf<input value={cardDialog.role} onChange={(e) => setCardDialog({ ...cardDialog, role: e.target.value })}/></label>'
modal_new = '<div className="gop-role-field"><label>Vasıf<select value={cardDialog.role} onChange={(e) => setCardDialog({ ...cardDialog, role: e.target.value })}><option value="">Vasıf seçin</option>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><button type="button" onClick={() => { const role = askNewRole(); if (role) setCardDialog({ ...cardDialog, role }); }}><Plus size={13}/> Vasıf Ekle</button></div>'
replace_once(modal_old, modal_new)

editor_old = '<label>Vasıf<input value={cardEditor.role} onChange={(e) => setCardEditor({ ...cardEditor, role: e.target.value })}/></label>'
editor_new = '<div className="gop-role-field"><label>Vasıf<select value={cardEditor.role} onChange={(e) => setCardEditor({ ...cardEditor, role: e.target.value })}><option value="">Vasıf seçin</option>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><button type="button" onClick={() => { const role = askNewRole(); if (role) setCardEditor({ ...cardEditor, role }); }}><Plus size={13}/> Vasıf Ekle</button></div>'
replace_once(editor_old, editor_new)

bulk_old = '<input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkMode === "role-set" ? "Yeni vasıf" : bulkMode === "percent" ? "+10 veya -5" : "Tutar"}/>'
bulk_new = '{bulkMode === "role-set" ? <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}><option value="">Vasıf seçin</option>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select> : <input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkMode === "percent" ? "+10 veya -5" : "Tutar"}/>}'
replace_once(bulk_old, bulk_new)

jsx.write_text(text, encoding='utf-8')

style = css.read_text(encoding='utf-8')
marker = '/* QUICK-ENTRY-WIDTH-AND-ROLE-CONTROL-2026-09-30 */'
assert marker not in style
style += '''

/* QUICK-ENTRY-WIDTH-AND-ROLE-CONTROL-2026-09-30 */
.gop-quick-dialog{--quick-card-w:300px}
.gop-quick-dialog .quick-person-grid{grid-template-columns:repeat(auto-fit,minmax(var(--quick-card-w),1fr))!important}
.quick-card-width{display:inline-flex;align-items:center;gap:5px;border:1px solid #d5deeb;border-radius:7px;background:#f8fafc;padding:3px 6px;color:#60748c;font-size:7px;font-weight:900;white-space:nowrap}
.quick-card-width input{width:92px;accent-color:#2563eb}
.quick-card-width b{min-width:34px;color:#17385f;font-size:8px}
.gop-role-field{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;align-items:end;min-width:0}
.gop-role-field label{display:grid;gap:4px;font-size:8px;font-weight:900;color:#52677f;min-width:0}
.gop-role-field select,.gop-person-dialog .gop-form-grid select,.gop-inline-person-form select{width:100%;height:31px;border:1px solid #d7e1ec;border-radius:7px;background:#fff;color:#17324e;padding:0 7px;font-size:9px;font-weight:800}
.gop-role-field button{height:31px;border:1px solid #cbd8e7;border-radius:7px;background:#fff;color:#24507b;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;gap:4px;font-size:8px;font-weight:900;white-space:nowrap;cursor:pointer}
.gop-role-field button:hover{background:#f1f6fb}
@media(max-width:650px){.quick-card-width{display:none}.gop-role-field{grid-template-columns:1fr}.gop-role-field button{width:100%}}
'''
css.write_text(style, encoding='utf-8')
print('quick card width + controlled role selectors applied')
