from pathlib import Path

# Register visual-search route in Cloudflare Worker shell.
p = Path('APP/cloud/ky-erp-api/src/main.ts')
s = p.read_text(encoding='utf-8')
imp = 'import { registerDesenVisualSearchRoutes } from "./desen-visual-search";\n'
if imp not in s:
    s = s.replace('import { registerDesenWorkflowRoutes } from "./desen-workflow";\n', 'import { registerDesenWorkflowRoutes } from "./desen-workflow";\n' + imp, 1)
call = 'registerDesenVisualSearchRoutes(app);\n'
if call not in s:
    s = s.replace('registerDesenBridgeRoutes(app);\nregisterDesenWorkflowRoutes(app);', 'registerDesenBridgeRoutes(app);\nregisterDesenVisualSearchRoutes(app);\nregisterDesenWorkflowRoutes(app);', 1)
p.write_text(s, encoding='utf-8')

# Frontend service upload method.
p = Path('APP/app/ky-erp-frontend/src/services/aiApi.js')
s = p.read_text(encoding='utf-8')
s = s.replace('import { apiDelete, apiFetch, apiGet, apiPost } from "../utils/api";', 'import { apiDelete, apiFetch, apiGet, apiPost, apiUpload } from "../utils/api";')
if 'findDesignByImage' not in s:
    s += '''\nexport async function findDesignByImage(activeMainCompany, file) {\n  const form = new FormData();\n  form.append("image", file);\n  const slug = activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";\n  if (slug) form.append("mainCompanySlug", slug);\n  const payload = await apiUpload("/desen/visual-search", form, { timeoutMs: 180000 });\n  return payload?.data || payload;\n}\n'''
p.write_text(s, encoding='utf-8')

# ERP Assistant image picker and visual results.
p = Path('APP/app/ky-erp-frontend/src/pages/modules/AiAssistantPage.jsx')
s = p.read_text(encoding='utf-8')
s = s.replace(
    'Bot, Check, CircleStop, Clipboard, Cloud, CloudOff, Code2, History, LoaderCircle,\n  MessageSquarePlus, RefreshCw, Send, ShieldCheck, Sparkles, Trash2, Wrench, X,',
    'Bot, Check, CircleStop, Clipboard, Cloud, CloudOff, Code2, History, ImagePlus, LoaderCircle,\n  MessageSquarePlus, RefreshCw, SearchCheck, Send, ShieldCheck, Sparkles, Trash2, Wrench, X,',
)
s = s.replace('getAiConversations, getAiStatus, sendAiMessage,', 'findDesignByImage, getAiConversations, getAiStatus, sendAiMessage,')
api_import = 'import { apiUrl } from "../../utils/api";\n'
if api_import not in s:
    s = s.replace('} from "../../services/aiApi";\n', '} from "../../services/aiApi";\n' + api_import, 1)

marker = 'function Message({ message, onConfirm, onCancel, actionBusy }) {'
visual_component = '''function VisualSearchResults({ data }) {
  const matches = data?.matches || [];
  const best = data?.bestMatch || matches[0];
  if (!matches.length) return <section className="ai-visual-results empty"><SearchCheck size={20} /><strong>Eşleşen desen bulunamadı.</strong><span>Görseli daha yakın veya daha net çekip tekrar deneyin.</span></section>;
  const confident = Number(best?.percent || 0) >= 72;
  return (
    <section className="ai-visual-results">
      <div className="ai-visual-result-head">
        <SearchCheck size={20} />
        <div>
          <strong>{confident ? `Bu model büyük olasılıkla ${best.modelName}` : `En yakın model ${best.modelName}`}</strong>
          <span>%{best.percent} eşleşme · {best.confidence} güven · {data.totalModels || matches.length} model tarandı</span>
        </div>
      </div>
      <div className="ai-visual-grid">
        {matches.slice(0, 6).map((match, index) => (
          <article key={match.id} className={index === 0 ? "best" : ""}>
            <div className="ai-visual-thumb">
              {match.thumbnailUrl ? <img src={apiUrl(match.thumbnailUrl)} alt={match.modelName} /> : <ImagePlus size={28} />}
              <b>%{match.percent}</b>
            </div>
            <div className="ai-visual-card-copy">
              <strong>{match.modelName}</strong>
              <span>{match.companyName || "Firma bekliyor"}</span>
              {(match.matchedPantones || []).length > 0 && <small>Pantone: {match.matchedPantones.join(", ")}</small>}
              {(match.characters || []).length > 0 && <small>{match.characters.slice(0, 3).join(" · ")}</small>}
              <a href={`/desen/desen-modeller?q=${encodeURIComponent(match.modelName)}`}>Desen Havuzunda Aç</a>
            </div>
          </article>
        ))}
      </div>
      {data.query?.description && <details className="ai-visual-query"><summary>Fotoğrafta ne algılandı?</summary><p>{data.query.description}</p></details>}
    </section>
  );
}

'''
if 'function VisualSearchResults(' not in s:
    if marker not in s:
        raise SystemExit('Message component anchor missing')
    s = s.replace(marker, visual_component + marker, 1)

s = s.replace(
    '{message.sourceCount > 0 && <small>{message.sourceCount} kaynak kayıt incelendi</small>}',
    '{message.visualSearch && <VisualSearchResults data={message.visualSearch} />}\n        {message.sourceCount > 0 && <small>{message.sourceCount} kaynak kayıt incelendi</small>}',
    1,
)

state_anchor = '  const [assistantMode, setAssistantMode] = useState("erp");\n  const abortRef = useRef(null);\n'
state_replacement = '  const [assistantMode, setAssistantMode] = useState("erp");\n  const [imageSearching, setImageSearching] = useState(false);\n  const abortRef = useRef(null);\n  const imageInputRef = useRef(null);\n'
if state_anchor not in s:
    raise SystemExit('assistant state anchor missing')
s = s.replace(state_anchor, state_replacement, 1)

send_anchor = '  async function sendMessage(textOverride) {'
image_handler = '''  async function findModelFromImage(file) {
    if (!file || imageSearching || loading || !companySlug) return;
    if (!String(file.type || "").startsWith("image/")) {
      setError("Model araması için bir fotoğraf veya görsel seçin.");
      return;
    }
    setImageSearching(true); setError("");
    setMessages((current) => [...current, { id: newLocalId(), role: "user", content: `📷 Görselle model ara: ${file.name || "kamera görüntüsü"}` }]);
    try {
      const result = await findDesignByImage(activeMainCompany, file);
      const best = result?.bestMatch || result?.matches?.[0];
      const answer = best
        ? `${Number(best.percent || 0) >= 72 ? "Bu model büyük olasılıkla" : "En yakın eşleşme"} **${best.modelName}** (%${best.percent}). İlk ${Math.min(6, result?.matches?.length || 0)} aday aşağıda.`
        : "Fotoğraf analiz edildi ancak güvenilir bir model eşleşmesi bulunamadı.";
      setMessages((current) => [...current, { id: newLocalId(), role: "assistant", content: answer, visualSearch: result }]);
    } catch (requestError) {
      setError(requestError?.message || "Görselle model araması tamamlanamadı.");
    } finally {
      setImageSearching(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

'''
if 'async function findModelFromImage(' not in s:
    if send_anchor not in s:
        raise SystemExit('sendMessage anchor missing')
    s = s.replace(send_anchor, image_handler + send_anchor, 1)

thinking_anchor = '{loading && <div className="ai-thinking"><LoaderCircle className="spin" size={18} /><div><strong>{developmentMode ? "Uygulama kodu inceleniyor" : "KY ERP verileri inceleniyor"}</strong><span>Yetkili araçlar çalıştırılıyor…</span></div></div>}'
thinking_replacement = thinking_anchor + '\n          {imageSearching && <div className="ai-thinking ai-visual-thinking"><LoaderCircle className="spin" size={18} /><div><strong>Fotoğraf Desen Havuzuyla karşılaştırılıyor</strong><span>OCR, Pantone, figür ve AI benzerlik puanı hesaplanıyor…</span></div></div>}'
if thinking_anchor not in s:
    raise SystemExit('thinking anchor missing')
s = s.replace(thinking_anchor, thinking_replacement, 1)

old_footer = '''        <footer className="ai-composer">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} maxLength={4000} placeholder={developmentMode ? "Başkan, hatayı veya istediğiniz kod değişikliğini yazın…" : "Başkan, sorunuzu veya yapmak istediğiniz işi yazın…"} disabled={loading || status?.enabled === false} />
          {loading ? <button type="button" className="stop" onClick={stopGeneration}><CircleStop size={18} /> Durdur</button> : <button type="button" onClick={() => sendMessage()} disabled={!input.trim() || status?.enabled === false}><Send size={18} /> Gönder</button>}
          <small>{input.length}/4000 · {developmentMode ? "Kod yazımı onay ve otomatik test gerektirir." : "Yapay zekâ yanıtlarını kritik işlemlerde kontrol edin."}</small>
        </footer>'''
new_footer = '''        <footer className={`ai-composer${!developmentMode ? " visual-search-enabled" : ""}`}>
          {!developmentMode && <>
            <input ref={imageInputRef} className="ai-visual-file" type="file" accept="image/*" onChange={(event) => findModelFromImage(event.target.files?.[0])} />
            <button type="button" className="ai-image-search" onClick={() => imageInputRef.current?.click()} disabled={imageSearching || loading || !companySlug} title="Kameradan veya galeriden görsel seçip modeli bul"><ImagePlus size={18} /> {imageSearching ? "Aranıyor" : "Görselle Bul"}</button>
          </>}
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} maxLength={4000} placeholder={developmentMode ? "Başkan, hatayı veya istediğiniz kod değişikliğini yazın…" : "Başkan, sorunuzu yazın veya Görselle Bul ile fotoğraf çekin…"} disabled={loading || imageSearching || status?.enabled === false} />
          {loading ? <button type="button" className="stop" onClick={stopGeneration}><CircleStop size={18} /> Durdur</button> : <button type="button" onClick={() => sendMessage()} disabled={!input.trim() || imageSearching || status?.enabled === false}><Send size={18} /> Gönder</button>}
          <small>{input.length}/4000 · {developmentMode ? "Kod yazımı onay ve otomatik test gerektirir." : "Fotoğrafla model bulma, OCR + Pantone + figür + AI benzerliği kullanır."}</small>
        </footer>'''
if old_footer not in s:
    raise SystemExit('composer anchor missing')
s = s.replace(old_footer, new_footer, 1)
p.write_text(s, encoding='utf-8')

# Desen Havuzu result links can open with model name already searched.
p = Path('APP/app/ky-erp-frontend/src/pages/desen/DesenModeller.jsx')
s = p.read_text(encoding='utf-8')
old = '  const [filters, setFilters] = useState({ q: "", companyId: "", status: "", printAreaCode: "", placementStatus: "", dateField: "createdAt", dateFrom: "", dateTo: "", sort: "created_desc" });'
new = '  const [filters, setFilters] = useState({ q: new URLSearchParams(window.location.search).get("q") || "", companyId: "", status: "", printAreaCode: "", placementStatus: "", dateField: "createdAt", dateFrom: "", dateTo: "", sort: "created_desc" });'
if old in s:
    s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# Assistant visual result styling, including mobile camera workflow.
p = Path('APP/app/ky-erp-frontend/src/pages/modules/AiAssistantPage.css')
s = p.read_text(encoding='utf-8')
css = '''
.ai-visual-file{display:none}.ai-composer.visual-search-enabled textarea{padding-left:144px}.ai-composer>button.ai-image-search{left:calc(clamp(16px,4vw,54px) + 10px);right:auto;top:24px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8}.ai-composer>button.ai-image-search:hover{background:#dbeafe}.ai-visual-thinking{margin-top:10px}.ai-visual-results{margin-top:11px;padding:12px;border:1px solid #bfdbfe;border-radius:14px;background:#f8fbff}.ai-visual-results.empty{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#475569}.ai-visual-result-head{display:flex;align-items:flex-start;gap:9px;margin-bottom:11px;color:#1d4ed8}.ai-visual-result-head>div{display:grid;gap:2px}.ai-visual-result-head strong{font-size:14px;color:#0f172a}.ai-visual-result-head span{font-size:11px;color:#64748b}.ai-visual-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ai-visual-grid article{min-width:0;overflow:hidden;border:1px solid #dbe6f0;border-radius:10px;background:#fff}.ai-visual-grid article.best{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.08)}.ai-visual-thumb{position:relative;height:116px;display:grid;place-items:center;overflow:hidden;background:#f8fafc;color:#94a3b8}.ai-visual-thumb img{width:100%;height:100%;object-fit:contain}.ai-visual-thumb b{position:absolute;right:6px;top:6px;padding:4px 6px;border-radius:999px;background:rgba(15,23,42,.82);color:#fff;font-size:10px}.ai-visual-card-copy{padding:8px;display:grid;gap:3px}.ai-visual-card-copy>strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;font-size:12px}.ai-visual-card-copy>span,.ai-visual-card-copy>small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#64748b;font-size:10px}.ai-visual-card-copy>a{margin-top:4px;color:#1d4ed8;font-size:10px;font-weight:800;text-decoration:none}.ai-visual-query{margin-top:9px;color:#64748b;font-size:11px}.ai-visual-query p{margin:7px 0 0;line-height:1.45}
@media(max-width:900px){.ai-composer.visual-search-enabled textarea{padding-left:126px}.ai-composer>button.ai-image-search{left:19px;top:20px;padding:10px}.ai-visual-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.ai-visual-grid{grid-template-columns:1fr 1fr}.ai-visual-thumb{height:105px}.ai-composer>button.ai-image-search{font-size:0}.ai-composer>button.ai-image-search svg{width:18px}.ai-composer.visual-search-enabled textarea{padding-left:58px}}
'''
if '.ai-visual-results{' not in s:
    s += css
p.write_text(s, encoding='utf-8')
