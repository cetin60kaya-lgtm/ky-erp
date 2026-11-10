import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../../utils/api";
import { createMailDraft, listCommunicationFiles, listMailAccounts, sendMailDraft } from "../../../services/mailApi";
import { documentKey, matchingPdfFiles, matchingRecipientRoutes, makeInvoiceMailContent, parseRecipientEmails, invoiceMailEventId } from "./invoiceMailRouting";
import "./invoiceMailWorkspace.css";

const unwrap = (value) => value?.data?.data ?? value?.data ?? value ?? [];
const emptyRoute = () => ({ id: "", customerName: "", groupCode: "", department: "", plannerName: "", plannerEmail: "", to: "", cc: "" });
const displayName = (row) => [row.customerName, row.groupCode, row.department, row.plannerName].filter(Boolean).join(" / ");
const isMailActive = (row) => String(row?.status || "").toUpperCase() === "ACTIVE" && Number(row?.provider_connected ?? row?.providerConnected ?? 0) === 1;
const stringifyEmails = (value) => (Array.isArray(value) ? value : []).join("; ");
const isOutlookActive = (row) => isMailActive(row) && String(row?.provider_type || row?.providerType || "").toUpperCase() === "MICROSOFT_365";

export default function InvoiceMailWorkspace({ activeMainCompany, selectedInvoice = null }) {
  const companySlug = activeMainCompany?.slug || "";
  const modelId = selectedInvoice?.model_id || selectedInvoice?.modelId || "";
  const [routes, setRoutes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [routeForm, setRouteForm] = useState(emptyRoute);
  const [manage, setManage] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [modelName, setModelName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [deliveryNo, setDeliveryNo] = useState("");
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [bccText, setBccText] = useState("");
  const [subjectOverride, setSubjectOverride] = useState(null);
  const [bodyOverride, setBodyOverride] = useState(null);
  const [modelFiles, setModelFiles] = useState([]);
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [deliveryFiles, setDeliveryFiles] = useState([]);
  const [invoiceAssetId, setInvoiceAssetId] = useState("");
  const [deliveryAssetId, setDeliveryAssetId] = useState("");
  const [draft, setDraft] = useState(null);
  const [sent, setSent] = useState(false);
  const [mailHistory, setMailHistory] = useState([]);
  const [working, setWorking] = useState(false);
  const [dispatchLocked, setDispatchLocked] = useState(false);
  const [phase, setPhase] = useState("IDLE");
  const actionGuard = useRef(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!companySlug) return;
    try {
      const [saved, mailAccounts] = await Promise.all([
        apiGet("/muhasebe/invoice-mail-routes", { mainCompanySlug: companySlug }),
        listMailAccounts(),
      ]);
      const loaded = unwrap(saved);
      const available = unwrap(mailAccounts);
      setRoutes(Array.isArray(loaded) ? loaded : []);
      setAccounts(Array.isArray(available) ? available : []);
      const enabled = (Array.isArray(available) ? available : []).filter(isOutlookActive);
      const preferred = enabled.find((row) => Number(row.is_default_send ?? row.isDefaultSend ?? 0) === 1) || enabled[0];
      setAccountId((current) => enabled.some((row) => row.id === current) ? current : preferred?.id || "");
      setError("");
    } catch (e) {
      setError(e?.message || "Alıcı profilleri veya posta kutuları okunamadı.");
    }
  }, [companySlug]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let cancelled=false;
    setModelFiles([]);
    if (!modelId || !companySlug) return undefined;
    listCommunicationFiles({q:modelId,take:200}).then((result) => {
      if (!cancelled) setModelFiles(Array.isArray(unwrap(result)) ? unwrap(result) : []);
    }).catch((e) => { if (!cancelled) setError(e?.message || "Model kartı dosya ilişkileri doğrulanamadı."); });
    return () => {cancelled=true;};
  }, [modelId,companySlug]);
  useEffect(() => {
    setInvoiceNo(String(selectedInvoice?.document_no || selectedInvoice?.invoiceNo || ""));
    setDeliveryNo(String(selectedInvoice?.delivery_no || selectedInvoice?.deliveryNo || ""));
    setModelName(String(selectedInvoice?.model_name || selectedInvoice?.modelName || ""));
    setRouteForm((current) => ({ ...current, customerName: String(selectedInvoice?.party_name || current.customerName || "") }));
    setDraft(null); setSent(false); setInvoiceAssetId(""); setDeliveryAssetId("");
    setSubjectOverride(null); setBodyOverride(null); setBccText("");
    setDispatchLocked(false); setPhase("IDLE");
  }, [selectedInvoice]);

  const suggested = useMemo(() => {
    try { return makeInvoiceMailContent(modelName, invoiceNo, deliveryNo); }
    catch { return { subject: "", bodyText: "" }; }
  }, [modelName, invoiceNo, deliveryNo]);
  const subject = subjectOverride === null ? suggested.subject : subjectOverride;
  const bodyText = bodyOverride === null ? suggested.bodyText : bodyOverride;
  const invalidate = () => { setDraft(null); setSent(false); setNotice(""); setPhase("IDLE"); };
  const invalidateDocument = () => { invalidate(); setSubjectOverride(null); setBodyOverride(null); };
  useEffect(() => {
    let cancelled=false;
    const invoice=documentKey(invoiceNo);
    if (!modelId && !/^HKN[0-9]{8,18}$/.test(invoice)) {setMailHistory([]);return undefined;}
    const timer=window.setTimeout(async () => {
      try {
        const params={mainCompanySlug:companySlug};
        if (/^HKN[0-9]{8,18}$/.test(invoice)) params.invoiceNo=invoice;
        if (modelId) params.modelId=modelId;
        const result=unwrap(await apiGet("/muhasebe/invoice-mail-links",params));
        if (!cancelled) setMailHistory(Array.isArray(result)?result:[]);
      } catch {if(!cancelled)setMailHistory([]);}
    },300);
    return ()=>{cancelled=true;window.clearTimeout(timer);};
  },[companySlug,invoiceNo,modelId,sent]);
  const chosenRoute = routes.find((row) => row.id === routeId);
  const account = accounts.find((row) => row.id === accountId);
  const possibleRoute = useMemo(() =>
    chosenRoute ? matchingRecipientRoutes(routes, chosenRoute.groupCode, chosenRoute.plannerName) : [],
  [routes, chosenRoute]);

  function chooseRoute(id) {
    setRouteId(id);
    const row = routes.find((item) => item.id === id);
    setToText(stringifyEmails(row?.to));
    setCcText(stringifyEmails(row?.cc));
    setBccText("");
    invalidate();
  }

  useEffect(() => {
    let cancelled = false;
    const wanted = documentKey(invoiceNo);
    setInvoiceFiles([]); setInvoiceAssetId("");
    if (!/^HKN[0-9]{8,18}$/.test(wanted) || !companySlug) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        const result = unwrap(await listCommunicationFiles({ q: wanted, take: 100 }));
        if (cancelled) return;
        const matches = matchingPdfFiles(result, wanted, "HKN").filter((file) => !modelId || modelFiles.some((related) => related.id === file.id));
        setInvoiceFiles(matches);
        if (matches.length === 1) setInvoiceAssetId(matches[0].id);
      } catch (e) { if (!cancelled) setError(e?.message || "HKN dosyaları aranamadı."); }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [invoiceNo, companySlug, modelId, modelFiles]);

  useEffect(() => {
    let cancelled = false;
    const wanted = documentKey(deliveryNo);
    setDeliveryFiles([]); setDeliveryAssetId("");
    if (!/^DDM[0-9]{8,18}$/.test(wanted) || !companySlug) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        const result = unwrap(await listCommunicationFiles({ q: wanted, take: 100 }));
        if (cancelled) return;
        const matches = matchingPdfFiles(result, wanted, "DDM").filter((file) => !modelId || modelFiles.some((related) => related.id === file.id));
        setDeliveryFiles(matches);
        if (matches.length === 1) setDeliveryAssetId(matches[0].id);
      } catch (e) { if (!cancelled) setError(e?.message || "DDM dosyaları aranamadı."); }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [deliveryNo, companySlug, modelId, modelFiles]);

  const editRoute = (row) => {
    setRouteForm({ id: row.id, customerName: row.customerName, groupCode: row.groupCode,
      department: row.department || "", plannerName: row.plannerName,
      plannerEmail: row.plannerEmail || "", to: stringifyEmails(row.to), cc: stringifyEmails(row.cc) });
    setManage(true);
  };

  const saveRoute = async () => {
    if (savingRoute) return;
    setSavingRoute(true); setError(""); setNotice("");
    try {
      const payload = {
        ...routeForm, mainCompanySlug: companySlug,
        to: parseRecipientEmails(routeForm.to),
        cc: String(routeForm.cc || "").trim() ? parseRecipientEmails(routeForm.cc) : [],
      };
      const saved = unwrap(await apiPost("/muhasebe/invoice-mail-routes", payload));
      setRouteForm(emptyRoute());
      setNotice("Grup ve alıcı profili KY ERP'ye kaydedildi.");
      await refresh();
      if (saved?.id) { setRouteId(saved.id); setToText(stringifyEmails(saved.to)); setCcText(stringifyEmails(saved.cc)); invalidate(); }
    } catch (e) {
      setError(e?.message || "Alıcı profili kaydedilemedi.");
    } finally { setSavingRoute(false); }
  };

  const removeRoute = async (row) => {
    if (!window.confirm(displayName(row) + " için alıcı profilini kaldırmak istiyor musunuz? Mevcut e-postalar silinmez.")) return;
    setError("");
    try {
      await apiDelete("/muhasebe/invoice-mail-routes/" + encodeURIComponent(row.id), { mainCompanySlug: companySlug });
      if (routeId === row.id) chooseRoute("");
      await refresh();
      setNotice("Alıcı profili kaldırıldı; geçmiş e-postalar korunur.");
    } catch (e) { setError(e?.message || "Alıcı profili kaldırılamadı."); }
  };

  const createVerifiedDraft = async () => {
    if (!chosenRoute) throw new Error("Önce doğrulanmış grup ve fatura alıcısı profilini seçin.");
    if (!account || !isOutlookActive(account)) throw new Error("Aktif Microsoft Outlook gönderim hesabı seçin.");
    const content = makeInvoiceMailContent(modelName, invoiceNo, deliveryNo);
    if (!invoiceFiles.some((file) => file.id === invoiceAssetId) || !deliveryFiles.some((file) => file.id === deliveryAssetId)) {
      throw new Error("HKN ve DDM PDF dosyalarının ikisi de mevcut File Hub'dan seçilmelidir.");
    }
    const to = parseRecipientEmails(toText);
    const cc = String(ccText || "").trim() ? parseRecipientEmails(ccText) : [];
    const bcc = String(bccText || "").trim() ? parseRecipientEmails(bccText) : [];
    const finalSubject = String(subjectOverride === null ? content.subject : subjectOverride).trim();
    const finalBody = String(bodyOverride === null ? content.bodyText : bodyOverride).trim();
    if (!finalSubject || finalSubject.length > 250 || !finalBody || finalBody.length > 20000)
      throw new Error("Mail konusu ve mesajı zorunludur.");
    const logicalEventId = invoiceMailEventId(companySlug, invoiceNo, deliveryNo);
    const verified = unwrap(await apiPost("/muhasebe/invoice-mail-preflight", {
      mainCompanySlug: companySlug, accountId, routeId, modelId,
      invoiceNo: documentKey(invoiceNo), deliveryNo: documentKey(deliveryNo),
      invoiceAssetId, deliveryAssetId, subject: finalSubject, bodyText: finalBody,
      to, cc, bcc,
    }));
    if (verified?.verified !== true || verified?.logicalEventId !== logicalEventId)
      throw new Error("ERP gönderim ön kontrolü doğrulanamadı; mail gönderilmedi.");
    const created = unwrap(await createMailDraft({
      accountId, subject: finalSubject, bodyText: finalBody,
      recipients: { to, cc, bcc },
      attachmentRefs: [{ fileAssetId: invoiceAssetId }, { fileAssetId: deliveryAssetId }],
      mainCompanySlug: companySlug,
    }));
    if (!created?.id) throw new Error("Posta taslağı KY ERP'de doğrulanamadı.");
    const prepared = { ...created, to, cc, bcc, subject: finalSubject, invoiceAssetId, deliveryAssetId };
    setDraft(prepared);
    return prepared;
  };

  // A click on Gönder is the explicit send action. The provider draft remains
  // an invisible technical detail; Taslak Kaydet never initiates dispatch.
  const processMail = async (sendNow) => {
    if (actionGuard.current || working || dispatchLocked || sent) return;
    actionGuard.current = true;
    let submitStarted = false;
    setWorking(true); setError(""); setNotice(""); setPhase("PREPARING");
    try {
      const prepared = draft || await createVerifiedDraft();
      if (!sendNow) {
        setPhase("DRAFT_SAVED");
        setNotice("Taslak KY ERP'de kaydedildi. Mail gönderilmedi.");
        return;
      }
      const logicalEventId = invoiceMailEventId(companySlug, invoiceNo, deliveryNo);
      setDispatchLocked(true); setPhase("SENDING"); submitStarted = true;
      const result = unwrap(await sendMailDraft(prepared.id, logicalEventId));
      if (!["PROVIDER_ACCEPTED", "ACCEPTED"].includes(String(result?.status || "").toUpperCase()))
        throw new Error("Microsoft Graph gönderimi kabul ettiğini doğrulamadı.");
      setSent(true); setPhase("ACCEPTED");
      try {
        await apiPost("/muhasebe/invoice-mail-links", {
          mainCompanySlug: companySlug, draftId: prepared.id,
          invoiceNo: documentKey(invoiceNo), deliveryNo: documentKey(deliveryNo),
          modelId, modelName, routeId,
        });
        setNotice("Microsoft gönderim isteğini kabul etti. İki PDF, alıcılar ve model ilişkisi kaydedildi; teslim/okundu kanıtı değildir.");
      } catch (linkError) {
        setNotice("Microsoft gönderimi kabul etti; ancak ERP yazışma ilişkisi kaydedilemedi: " +
          (linkError?.message || "Kayıt doğrulanamadı") + ". Maili yeniden göndermeyin.");
      }
    } catch (e) {
      if (submitStarted) {
        setPhase("UNKNOWN_REVIEW_REQUIRED");
        setError((e?.message || "Gönderim sonucu belirsiz.") +
          " Tekrar gönderim kilitlendi. Mail & Dosyalar gönderim geçmişinden sonucu denetleyin.");
      } else {
        setPhase("ERROR");
        setError(e?.message || "Mail hazırlığı tamamlanamadı; herhangi bir gönderim başlatılmadı.");
      }
    } finally {
      actionGuard.current = false;
      setWorking(false);
    }
  };

  return <section className="invoice-mail-workspace">
    <header className="imw-head">
      <div><h3>Modelden Fatura / İrsaliye Maili</h3><p>İşNet belgesi → File Hub PDF → Outlook/Graph. Gönder tek tıkla ERP içinde çalışır; Taslak Kaydet ayrı işlemdir.</p></div>
      <button type="button" onClick={() => setManage((value) => !value)}>{manage ? "Alıcı Düzenini Kapat" : "Grup / Kişi Tanımları"}</button>
    </header>

    {error ? <p role="alert" className="imw-error">{error}</p> : null}
    {notice ? <p role="status" className="imw-notice">{notice}</p> : null}

    {manage ? <section className="imw-directory">
      <h4>Grup ve fatura alıcıları</h4>
      <p>Planlamacı (modeli atayan kişi) ile faturayı işleyen kişi aynı olmak zorunda değildir. Alt grup ve departman bilgisini ayrı kaydedin.</p>
      <div className="imw-form-grid">
        <label>Müşteri / cari firma<input value={routeForm.customerName} onChange={(e) => setRouteForm({...routeForm,customerName:e.target.value})} placeholder="Müşteri firma" /></label>
        <label>Grup / alt ekip<input value={routeForm.groupCode} onChange={(e) => setRouteForm({...routeForm,groupCode:e.target.value})} placeholder="165-6" /></label>
        <label>Departman<input value={routeForm.department} onChange={(e) => setRouteForm({...routeForm,department:e.target.value})} placeholder="Pijama / CK1" /></label>
        <label>Modeli atayan planlamacı<input value={routeForm.plannerName} onChange={(e) => setRouteForm({...routeForm,plannerName:e.target.value})} placeholder="İsim soyisim" /></label>
        <label>Planlamacı e-postası<input type="email" value={routeForm.plannerEmail} onChange={(e) => setRouteForm({...routeForm,plannerEmail:e.target.value})} placeholder="İsteğe bağlı" /></label>
        <label>Fatura alıcıları (TO)<input value={routeForm.to} onChange={(e) => setRouteForm({...routeForm,to:e.target.value})} placeholder="mail1@firma.com; mail2@firma.com" /></label>
        <label>Bilgi (CC)<input value={routeForm.cc} onChange={(e) => setRouteForm({...routeForm,cc:e.target.value})} placeholder="İsteğe bağlı" /></label>
      </div>
      <div className="imw-actions"><button type="button" disabled={savingRoute} onClick={saveRoute}>{savingRoute ? "Kaydediliyor..." : routeForm.id ? "Alıcı Profilini Güncelle" : "Alıcı Profili Ekle"}</button><button type="button" onClick={() => setRouteForm(emptyRoute())}>Yeni / Temizle</button></div>
      <div className="imw-directory-list">{routes.map((row) => <div key={row.id}><strong>{displayName(row)}</strong><small>{stringifyEmails(row.to)}{row.cc?.length ? " · CC: " + stringifyEmails(row.cc) : ""}</small><span><button type="button" onClick={() => editRoute(row)}>Düzenle</button><button type="button" onClick={() => void removeRoute(row)}>Çıkar</button></span></div>)}{!routes.length ? <p>Henüz kayıtlı grup/alıcı profili yok.</p> : null}</div>
    </section> : null}

    <div className="imw-form-grid">
      <label>Gönderici posta hesabı<select value={accountId} onChange={(e) => { setAccountId(e.target.value); invalidate(); }}>
        <option value="">Hesap seçin</option>{accounts.filter(isOutlookActive).map((item) => <option key={item.id} value={item.id}>{item.email_address || item.display_name}</option>)}
      </select></label>
      <label>Grup / planlamacı ve fatura alıcısı<select value={routeId} onChange={(e) => chooseRoute(e.target.value)}>
        <option value="">Alıcı profili seçin</option>{routes.map((row) => <option key={row.id} value={row.id}>{displayName(row)}</option>)}
      </select></label>
      <label>Model adı<input value={modelName} onChange={(e) => {setModelName(e.target.value);invalidateDocument();}} placeholder="Model kartındaki ad" /></label>
      <label>HKN fatura no<input value={invoiceNo} onChange={(e) => {setInvoiceNo(e.target.value);invalidateDocument();}} placeholder="HKN2026..." /></label>
      <label>DDM irsaliye no<input value={deliveryNo} onChange={(e) => {setDeliveryNo(e.target.value);invalidateDocument();}} placeholder="DDM2026..." /></label>
      <label>HKN fatura PDF<select value={invoiceAssetId} onChange={(e) => {setInvoiceAssetId(e.target.value);invalidate();}}>
        <option value="">{invoiceFiles.length ? "PDF seçin" : "Tam HKN numarasıyla File Hub'da dosya aranıyor / bulunamadı"}</option>
        {invoiceFiles.map((file) => <option key={file.id} value={file.id}>{file.file_name} · {file.provider_type || "Dosya"}</option>)}
      </select></label>
      <label>DDM irsaliye PDF<select value={deliveryAssetId} onChange={(e) => {setDeliveryAssetId(e.target.value);invalidate();}}>
        <option value="">{deliveryFiles.length ? "PDF seçin" : "Tam DDM numarasıyla File Hub'da dosya aranıyor / bulunamadı"}</option>
        {deliveryFiles.map((file) => <option key={file.id} value={file.id}>{file.file_name} · {file.provider_type || "Dosya"}</option>)}
      </select></label>
      <label>Faturayı alanlar (TO)<textarea value={toText} onChange={(e) => {setToText(e.target.value);invalidate();}} rows={2} placeholder="Alıcı profili seçildiğinde doldurulur, değiştirilebilir" /></label>
      <label>Bilgi alıcıları (CC)<textarea value={ccText} onChange={(e) => {setCcText(e.target.value);invalidate();}} rows={2} placeholder="Gerekli diğer alıcılar" /></label>
      <label>Gizli bilgi (BCC)<textarea value={bccText} onChange={(e) => {setBccText(e.target.value);invalidate();}} rows={2} placeholder="İsteğe bağlı" /></label>
      <label>Mail konusu<input value={subject} maxLength={250} onChange={(e) => {setSubjectOverride(e.target.value);invalidate();}} placeholder="Konu" /></label>
      <label className="imw-wide">Mail mesajı<textarea value={bodyText} rows={5} onChange={(e) => {setBodyOverride(e.target.value);invalidate();}} placeholder="Alıcıya iletilecek mesaj" /></label>
    </div>

    {modelId ? <p className="imw-foot">Model kartı bağlantısı: {modelName || "Seçili model"}. Yalnız bu modele File Hub üzerinden gerçekten bağlı HKN/DDM PDF dosyaları seçilebilir.</p> : null}
    {possibleRoute.length > 1 ? <p className="imw-error">Aynı grupta birden çok kişi var; doğru planlamacı ve fatura alıcısını ayrıca kontrol edin.</p> : null}
    <div className="imw-preview">
      <strong>{phase === "ACCEPTED" ? "Microsoft gönderim isteğini kabul etti" : phase === "DRAFT_SAVED" ? "Taslak kaydedildi — gönderilmedi" : "Gönderim önizlemesi"}</strong>
      <p>Hesap: {account?.email_address || "Henüz seçilmedi"} · Konu: {subject || "Eksik"}</p>
      <p>TO: {toText || "Eksik"}{ccText ? " · CC: " + ccText : ""}{bccText ? " · BCC: " + bccText : ""}</p>
      <p>Ek: {invoiceFiles.find((file) => file.id === invoiceAssetId)?.file_name || "HKN PDF seçilmedi"} / {deliveryFiles.find((file) => file.id === deliveryAssetId)?.file_name || "DDM PDF seçilmedi"}</p>
    </div>
    <div className="imw-actions">
      <button type="button" disabled={!accountId || !routeId || working || dispatchLocked || sent} onClick={() => void processMail(false)}>Taslak Kaydet</button>
      <button type="button" disabled={!accountId || !routeId || working || dispatchLocked || sent} className="imw-send" onClick={() => void processMail(true)}>
        {phase === "PREPARING" ? "Hazırlanıyor..." : phase === "SENDING" ? "Gönderiliyor..." : phase === "ACCEPTED" ? "İstek kabul edildi" : "Gönder"}
      </button>
    </div>
    {phase === "UNKNOWN_REVIEW_REQUIRED" ? <p className="imw-error" role="alert">Gönderim sonucu belirsiz. Bu ekranda yeniden gönderme kapalıdır; önce kayıtları uzlaştırın.</p> : null}
    {mailHistory.length ? <section className="imw-history"><strong>Fatura / model yazışma geçmişi</strong>{mailHistory.map((item) => <div key={item.draftId}><span>{item.invoiceNo} · {item.modelName || modelName} · {item.recordedAt ? new Date(item.recordedAt).toLocaleDateString("tr-TR") : ""}</span><small>{Array.isArray(item.to) ? item.to.join("; ") : ""} · Microsoft sağlayıcı kabulü; teslim kanıtı değil</small></div>)}</section> : null}
    <p className="imw-foot">PDF kaynakları önce File Hub ve model bağıyla denetlenir. Taslak hiçbir zaman e-Fatura/e-İrsaliye resmî gönderimi değildir. Tekrar gönderim iş anahtarıyla engellenir.</p>
  </section>;
}
