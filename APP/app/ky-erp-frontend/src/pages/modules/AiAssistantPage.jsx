import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, Check, CircleStop, Clipboard, Cloud, CloudOff, Code2, History, ImagePlus, LoaderCircle,
  MessageSquarePlus, RefreshCw, SearchCheck, Send, ShieldCheck, Sparkles, Trash2, Wrench, X,
} from "lucide-react";
import {
  cancelAiAction, confirmAiAction, deleteAiConversation, getAiConversation,
  findDesignByImage, getAiConversations, getAiStatus, sendAiMessage,
} from "../../services/aiApi";
import { apiUrl } from "../../utils/api";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";
import "./AiAssistantPage.css";

const QUICK_QUESTIONS = [
  "Bugünkü sistem özetini göster",
  "İşNet bağlantısını ve son hataları kontrol et",
  "Bu ay kesilmeyen irsaliyeleri bul",
  "İrsaliye ve faturaları karşılaştır",
  "Cari bakiyeleri özetle",
  "Bu ayın KDV durumunu göster",
  "Personel ödeme özetini getir",
  "İmalat kayıtlarındaki eksikleri bul",
  "Boyahane iş ve stok özetini getir",
  "Model Takip durum özetini getir",
  "Son yapılan işlemleri göster",
];

const DEVELOPMENT_QUESTIONS = [
  "Son backend ve frontend hatalarını incele",
  "Hataları incele, güvenli düzeltme planını ve gerekli onayları hazırla",
  "Bu ekranın kodunu bul ve yapısını açıkla",
  "Yeni bir sekme eklemek için gereken dosyaları belirle",
  "Frontend lint ve build durumunu kontrol et",
  "Backend AI testlerini ve build kontrolünü çalıştır",
  "Uygulamada iyileştirilmesi gereken teknik noktaları listele",
];

const newLocalId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function StatusPill({ status }) {
  const online = status?.enabled === true;
  return (
    <span className={`ai-status-pill ${online ? "online" : "offline"}`}>
      {online ? <Cloud size={14} /> : <CloudOff size={14} />}
      {online ? `${status.model} bağlı` : "Yapılandırma gerekli"}
    </span>
  );
}

function ActionCard({ action, onConfirm, onCancel, busy }) {
  const finished = ["EXECUTED", "CANCELLED"].includes(action.status);
  return (
    <section className="ai-action-card">
      <div><ShieldCheck size={18} /><strong>İşlem onayı gerekiyor</strong></div>
      <p>{action.summary}</p>
      <details><summary>İşlem detayını aç</summary><pre>{JSON.stringify(action.payload, null, 2)}</pre></details>
      {finished ? (
        <span className={`ai-action-result ${action.status.toLowerCase()}`}>{action.status === "EXECUTED" ? "Onaylandı ve tamamlandı" : "İptal edildi"}</span>
      ) : (
        <div className="ai-action-buttons">
          <button type="button" onClick={() => onConfirm(action)} disabled={busy}><Check size={15} /> Onayla</button>
          <button type="button" className="secondary" onClick={() => onCancel(action)} disabled={busy}><X size={15} /> İptal et</button>
        </div>
      )}
    </section>
  );
}

function MessageText({ content }) {
  const lines = String(content || "").split("\n");
  const formatLine = (line) => line.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part,
  );
  return <>{lines.map((line, index) => {
    const heading = /^###\s+/.test(line);
    const text = heading ? line.replace(/^###\s+/, "") : line;
    return <span key={`${index}-${line}`} className={heading ? "ai-message-heading" : undefined}>{formatLine(text)}{index < lines.length - 1 && <br />}</span>;
  })}</>;
}

function VisualSearchResults({ data }) {
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

function Message({ message, onConfirm, onCancel, actionBusy }) {
  const assistant = message.role === "assistant";
  return (
    <article className={`ai-message ${assistant ? "assistant" : "user"}`}>
      <div className="ai-message-avatar">{assistant ? <Bot size={17} /> : "Siz"}</div>
      <div className="ai-message-body">
        <div className="ai-message-copy"><MessageText content={message.content} /></div>
        {message.visualSearch && <VisualSearchResults data={message.visualSearch} />}
        {message.sourceCount > 0 && <small>{message.sourceCount} kaynak kayıt incelendi</small>}
        {(message.actions || []).map((action) => <ActionCard key={action.id} action={action} onConfirm={onConfirm} onCancel={onCancel} busy={actionBusy === action.id} />)}
        {assistant && (
          <button className="ai-copy" type="button" onClick={() => navigator.clipboard?.writeText(message.content)}><Clipboard size={13} /> Kopyala</button>
        )}
      </div>
    </article>
  );
}

export default function AiAssistantPage({ activeMainCompany, moduleActionContext, modal = false, onClose }) {
  const [status, setStatus] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [assistantMode, setAssistantMode] = useState("erp");
  const [imageSearching, setImageSearching] = useState(false);
  const abortRef = useRef(null);
  const imageInputRef = useRef(null);
  const messagesRef = useRef(null);
  const companySlug = activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";

  const pageContext = useMemo(() => ({
    module: moduleActionContext?.sourceModule || moduleActionContext?.module || "asistan",
    route: moduleActionContext?.sourceRoute || window.location.pathname,
    mainCompanySlug: companySlug,
    assistantMode: assistantMode === "development" ? "development" : "erp",
  }), [assistantMode, companySlug, moduleActionContext]);

  const refreshSidebar = useCallback(async () => {
    try {
      const result = await loadModuleData({
        scope: `ai:${companySlug || "main"}:sidebar`,
        sources: {
          conversations: { critical: true, load: () => getAiConversations() },
          status: { fallback: null, load: () => getAiStatus() },
        },
      });
      if (result.states.status.status !== "error") setStatus(result.data.status);
      if (result.states.conversations.status !== "error") {
        setConversations(result.data.conversations?.conversations || []);
      }
      setError(moduleLoadMessage(
        result,
        "Asistan konuşma geçmişi alınamadı; son başarılı geçmiş korunuyor.",
        "Asistan servis durumu geçici olarak yenilenemedi; konuşmalar kullanılabilir.",
      ));
    } catch (requestError) { setError(requestError?.message || "Asistan durumu alınamadı."); }
    finally { setHistoryLoading(false); }
  }, [companySlug]);

  useEffect(() => { refreshSidebar(); }, [refreshSidebar]);
  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);
  useEffect(() => {
    if (!modal) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !loading) onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [loading, modal, onClose]);
  useEffect(() => {
    const suggested = String(moduleActionContext?.message || moduleActionContext?.prompt || "").trim();
    if (suggested) setInput(suggested);
  }, [moduleActionContext]);

  async function openConversation(id) {
    setError(""); setHistoryLoading(true);
    try {
      const payload = await getAiConversation(id); setConversationId(id);
      setMessages((payload?.conversation?.messages || []).filter((row) => row.role !== "tool"));
    } catch (requestError) { setError(requestError?.message || "Konuşma açılamadı."); }
    finally { setHistoryLoading(false); }
  }

  function newConversation() { abortRef.current?.abort(); setConversationId(""); setMessages([]); setInput(""); setError(""); }

  function changeAssistantMode(nextMode) {
    if (nextMode === assistantMode) return;
    newConversation();
    setAssistantMode(nextMode);
  }

  function prepareErrorReview() {
    changeAssistantMode("development");
    setInput("Son backend ve frontend hatalarını incele. Güvenli düzeltme planını çıkar; değişiklik gerekiyorsa önce onay kartı hazırla.");
  }

  async function removeConversation(id) {
    if (!window.confirm("Bu konuşma geçmişi silinsin mi? ERP kayıtları etkilenmez.")) return;
    try { await deleteAiConversation(id); if (id === conversationId) newConversation(); await refreshSidebar(); }
    catch (requestError) { setError(requestError?.message || "Konuşma silinemedi."); }
  }

  async function findModelFromImage(file) {
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

  async function sendMessage(textOverride) {
    const text = String(textOverride ?? input).trim();
    if (!text || loading || !companySlug) return;
    const userMessage = { id: newLocalId(), role: "user", content: text };
    setMessages((current) => [...current, userMessage]); setInput(""); setLoading(true); setError("");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await sendAiMessage({ message: text, conversationId: conversationId || undefined, pageContext, mainCompanySlug: companySlug }, controller.signal);
      setConversationId(response.conversationId);
      setMessages((current) => [...current, { id: newLocalId(), role: "assistant", content: response.answer, actions: response.actions || [], sourceCount: response.sourceCount || 0, usage: response.usage }]);
      await refreshSidebar();
    } catch (requestError) {
      if (requestError?.name !== "AbortError") setError(requestError?.message || "Mesaj gönderilemedi.");
    } finally { setLoading(false); abortRef.current = null; }
  }

  function stopGeneration() { abortRef.current?.abort(); setLoading(false); setError("Yanıt oluşturma kullanıcı tarafından durduruldu."); }
  async function confirmAction(action) {
    setActionBusy(action.id); setError("");
    try {
      await confirmAiAction(action.id, action.confirmationToken);
      setMessages((current) => current.map((message) => ({ ...message, actions: (message.actions || []).map((item) => item.id === action.id ? { ...item, status: "EXECUTED" } : item) })));
    } catch (requestError) { setError(requestError?.message || "İşlem onaylanamadı."); }
    finally { setActionBusy(""); }
  }
  async function cancelAction(action) {
    setActionBusy(action.id); setError("");
    try {
      await cancelAiAction(action.id);
      setMessages((current) => current.map((message) => ({ ...message, actions: (message.actions || []).map((item) => item.id === action.id ? { ...item, status: "CANCELLED" } : item) })));
    } catch (requestError) { setError(requestError?.message || "İşlem iptal edilemedi."); }
    finally { setActionBusy(""); }
  }
  const retryLast = () => {
    const last = [...messages].reverse().find((row) => row.role === "user");
    if (last) sendMessage(last.content);
  };
  const developmentEnabled = status?.developerMode?.enabled === true;
  const developmentMode = assistantMode === "development" && developmentEnabled;
  const quickQuestions = developmentMode ? DEVELOPMENT_QUESTIONS : QUICK_QUESTIONS;

  return (
    <main className={`ai-page${modal ? " ai-page--modal" : ""}`}>
      <aside className="ai-history">
        <div className="ai-history-head"><div><History size={18} /><strong>Konuşmalar</strong></div><button type="button" onClick={newConversation} title="Yeni sohbet"><MessageSquarePlus size={18} /></button></div>
        <button className="ai-new-chat" type="button" onClick={newConversation}><Sparkles size={16} /> Yeni sohbet</button>
        <div className="ai-history-list">
          {historyLoading && <span>Yükleniyor…</span>}
          {!historyLoading && !conversations.length && <span>Henüz konuşma yok.</span>}
          {conversations.map((row) => <div key={row.id} className={row.id === conversationId ? "active" : ""}><button type="button" onClick={() => openConversation(row.id)}><strong>{row.title}</strong><small>{row.messageCount} mesaj</small></button><button type="button" className="delete" onClick={() => removeConversation(row.id)} title="Konuşmayı sil"><Trash2 size={14} /></button></div>)}
        </div>
      </aside>

      <section className="ai-workspace">
        <header className="ai-header">
          <div className="ai-title-mark"><Bot size={24} /></div>
          <div className="ai-header-copy"><span>KY ERP</span><h1>Asistan</h1><p>{developmentMode ? "Frontend ve backend kodunu güvenli onay akışıyla geliştirir." : "İş, İşNet ve sistem verilerinizi yetkiniz kapsamında analiz eder."}</p></div>
          {developmentEnabled && <div className="ai-mode-switch" aria-label="Asistan modu"><button type="button" className={assistantMode === "erp" ? "active" : ""} onClick={() => changeAssistantMode("erp")}><Sparkles size={14} /> ERP</button><button type="button" className={developmentMode ? "active" : ""} onClick={() => changeAssistantMode("development")}><Code2 size={14} /> Geliştirme</button></div>}
          {developmentEnabled && <button className="ai-error-review" type="button" onClick={prepareErrorReview}><Wrench size={15} /> Hataları İncele</button>}
          <StatusPill status={status} />
          {modal && <button className="ai-dialog-close" type="button" onClick={onClose} aria-label="Asistan penceresini kapat" title="Kapat"><X size={18} /></button>}
        </header>

        <div className="ai-messages" ref={messagesRef}>
          {!messages.length && (
            <section className="ai-welcome">
              <div>{developmentMode ? <Wrench size={26} /> : <Sparkles size={26} />}</div><h2>{developmentMode ? "Başkan, uygulamada ne geliştirelim?" : "Başkan, nasıl yardımcı olayım?"}</h2>
              <p>{developmentMode ? "Frontend ve backend kodunu inceleyebilirim. Kod değişiklikleri açık onayınızdan sonra uygulanır; test başarısızsa otomatik geri alınır." : "Gerçek KY ERP kayıtlarını güvenli araçlarla incelerim. Veri değiştiren işlemler için önce açık onayınızı isterim."}</p>
              <div className="ai-quick-grid">{quickQuestions.map((question) => <button key={question} type="button" onClick={() => sendMessage(question)}>{question}</button>)}</div>
            </section>
          )}
          {messages.map((message) => <Message key={message.id} message={message} onConfirm={confirmAction} onCancel={cancelAction} actionBusy={actionBusy} />)}
          {loading && <div className="ai-thinking"><LoaderCircle className="spin" size={18} /><div><strong>{developmentMode ? "Uygulama kodu inceleniyor" : "KY ERP verileri inceleniyor"}</strong><span>Yetkili araçlar çalıştırılıyor…</span></div></div>}
          {imageSearching && <div className="ai-thinking ai-visual-thinking"><LoaderCircle className="spin" size={18} /><div><strong>Fotoğraf Desen Havuzuyla karşılaştırılıyor</strong><span>OCR, Pantone, figür ve AI benzerlik puanı hesaplanıyor…</span></div></div>}
          {error && <div className="ai-error"><span>{error}</span><button type="button" onClick={retryLast}><RefreshCw size={14} /> Yeniden dene</button></div>}
        </div>

        <footer className={`ai-composer${!developmentMode ? " visual-search-enabled" : ""}`}>
          {!developmentMode && <>
            <input ref={imageInputRef} className="ai-visual-file" type="file" accept="image/*" onChange={(event) => findModelFromImage(event.target.files?.[0])} />
            <button type="button" className="ai-image-search" onClick={() => imageInputRef.current?.click()} disabled={imageSearching || loading || !companySlug} title="Kameradan veya galeriden görsel seçip modeli bul"><ImagePlus size={18} /> {imageSearching ? "Aranıyor" : "Görselle Bul"}</button>
          </>}
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} maxLength={4000} placeholder={developmentMode ? "Başkan, hatayı veya istediğiniz kod değişikliğini yazın…" : "Başkan, sorunuzu yazın veya Görselle Bul ile fotoğraf çekin…"} disabled={loading || imageSearching || status?.enabled === false} />
          {loading ? <button type="button" className="stop" onClick={stopGeneration}><CircleStop size={18} /> Durdur</button> : <button type="button" onClick={() => sendMessage()} disabled={!input.trim() || imageSearching || status?.enabled === false}><Send size={18} /> Gönder</button>}
          <small>{input.length}/4000 · {developmentMode ? "Kod yazımı onay ve otomatik test gerektirir." : "Fotoğrafla model bulma, OCR + Pantone + figür + AI benzerliği kullanır."}</small>
        </footer>
      </section>
    </main>
  );
}
