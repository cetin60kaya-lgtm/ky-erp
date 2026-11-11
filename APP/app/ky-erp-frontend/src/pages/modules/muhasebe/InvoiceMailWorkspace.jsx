import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../../utils/api";
import { createMailDraft, listCommunicationFiles, listMailAccounts, sendMailDraft } from "../../../services/mailApi";
import { documentKey, matchingPdfFiles, matchingRecipientRoutes, makeInvoiceMailContent, parseRecipientEmails, invoiceMailEventId, INVOICE_MAIL_TEMPLATES, contactsForInvoiceRoute, routeContactRecipients } from "./invoiceMailRouting";
import "./invoiceMailWorkspace.css";

const unwrap = (value) => value?.data?.data ?? value?.data ?? value ?? [];
const emptyRoute = () => ({ id: "", customerName: "", groupCode: "", department: "", plannerName: "", plannerEmail: "", to: "", cc: "" });
const emptyContact = () => ({ id:"", firstName:"", lastName:"", email:"", phone:"", recipientKind:"TO", active:true });
const displayName = (row) => [row.customerName, row.groupCode, row.department, row.plannerName].filter(Boolean).join(" / ");
const isMailActive = (row) => String(row?.status || "").toUpperCase() === "ACTIVE" && Number(row?.provider_connected ?? row?.providerConnected ?? 0) === 1;
const stringifyEmails = (value) => (Array.isArray(value) ? value : []).join("; ");
const isOutlookActive = (row) => isMailActive(row) && String(row?.provider_type || row?.providerType || "").toUpperCase() === "MICROSOFT_365";

export default function InvoiceMailWorkspace({ activeMainCompany, selectedInvoice = null }) {
  const companySlug = activeMainCompany?.slug || "";
  const modelId = selectedInvoice?.model_id || selectedInvoice?.modelId || "";
  const [routes, setRoutes] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [contactForm, setContactForm] = useState(emptyContact);
  const [savingContact, setSavingContact] = useState(false);
  const [templateId, setTemplateId] = useState("STANDARD");
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
  const [acceptedDraft, setAcceptedDraft] = useState(null);
  const [linkNeedsRepair, setLinkNeedsRepair] = useState(false);
  const [linkRevision, setLinkRevision] = useState(0);
  const [remoteAttempt, setRemoteAttempt] = useState(null);
  const [phase, setPhase] = useState("IDLE");
  const actionGuard = useRef(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!companySlug) return;
    try {
      const [saved, mailAccounts, savedContacts] = await Promise.all([
        apiGet("/muhasebe/invoice-mail-routes", { mainCompanySlug: companySlug }),
        listMailAccounts(),
        apiGet("/muhasebe/invoice-mail-contacts", { mainCompanySlug: companySlug }),
      ]);
      const loaded = unwrap(saved);
      const available = unwrap(mailAccounts);
      const directory = unwrap(savedContacts);
      setRoutes(Array.isArray(loaded) ? loaded : []);
      setContacts(Array.isArray(directory) ? directory : []);
      setAccounts(Array.isArray(available) ? available : []);
      const enabled = (Array.isArray(available) ? available : []).filter(isOutlookActive);
      const preferred = enabled.find((row) => Number(row.is_default_send ?? row.isDefaultSend ?? 0) === 1) || enabled[0];
      setAccountId((current) => enabled.some((row) => row.id === current) ? current : preferred?.id || "");
      setError("");
    } catch (e) {
      setError(e?.message || "Alıcı profilleri, kişi listesi veya posta kutuları okunamadı.");
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
    setAcceptedDraft(null); setLinkNeedsRepair(false); setRemoteAttempt(null);
  }, [selectedInvoice]);

  const suggested = useMemo(() => {
    try { return makeInvoiceMailContent(modelName, invoiceNo, deliveryNo, templateId); }
    catch { return { subject: "", bodyText: "" }; }
  }, [modelName, invoiceNo, deliveryNo, templateId]);
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
  },[companySlug,invoiceNo,modelId,sent,linkRevision]);
  // The persisted job, not the browser state, owns post-reload send status.
  useEffect(() => {
    let cancelled = false;
    const hkn = documentKey(invoiceNo), ddm = documentKey(deliveryNo);
    if (!companySlug || !/^HKN[0-9]{8,18}$/.test(hkn) || !/^DDM[0-9]{8,18}$/.test(ddm)) {
      setRemoteAttempt(null);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = unwrap(await apiGet("/muhasebe/invoice-mail-dispatch-status", {
          mainCompanySlug: companySlug, invoiceNo: hkn, deliveryNo: ddm,
        }));
        if (cancelled) return;
        setRemoteAttempt(result);
        if (result?.status && result.status !== "NOT_STARTED") {
          setDispatchLocked(true);
          if (result.providerAccepted) {
            setSent(true); setPhase("ACCEPTED");
            if (!result.linked && result.draftId) {
              setAcceptedDraft({
                id: result.draftId, invoiceNo: hkn, deliveryNo: ddm,
                modelId, modelName, routeId,
              });
              setLinkNeedsRepair(true);
            } else {
              setLinkNeedsRepair(false);
            }
          } else {
            setPhase("UNKNOWN_REVIEW_REQUIRED");
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Gönderim geçmişi okunamadı; gönderim güvenle doğrulanamıyor.");
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [companySlug, invoiceNo, deliveryNo, modelId, modelName, routeId, sent, linkRevision]);

  const chosenRoute = routes.find((row) => row.id === routeId);
  const account = accounts.find((row) => row.id === accountId);
  const possibleRoute = useMemo(() =>
    chosenRoute ? matchingRecipientRoutes(routes, chosenRoute.groupCode, chosenRoute.plannerName) : [],
  [routes, chosenRoute]);

  function chooseRoute(id) {
    setRouteId(id);
    const row = routes.find((item) => item.id === id);
    const recipients = routeContactRecipients(contacts, row);
    setToText(stringifyEmails(recipients.to));
    setCcText(stringifyEmails(recipients.cc));
    setBccText("");
    setContactForm(emptyContact());
    invalidate();
  }
  const roster = useMemo(() => contactsForInvoiceRoute(contacts, chosenRoute), [contacts, chosenRoute]);
  const selectedAddresses = useMemo(() =>
    new Set([toText, ccText].flatMap((value) => String(value || "").split(/[,;\n]+/))
      .map((email) => email.trim().toLowerCase()).filter(Boolean)), [toText, ccText]);
  function toggleContact(person, enabled) {
    const email=String(person.email||"").toLowerCase();
    const split=(value)=>String(value||"").split(/[,;\n]+/).map((v)=>v.trim()).filter(Boolean);
    const to=split(toText).filter((v)=>v.toLowerCase()!==email);
    const cc=split(ccText).filter((v)=>v.toLowerCase()!==email);
    if(enabled && person.active!==false && email){
      (String(person.recipientKind||"TO").toUpperCase()==="CC"?cc:to).push(email);
    }
    setToText([...new Set(to)].join("; "));
    setCcText([...new Set(cc)].join("; "));
    invalidate();
  }
  async function saveContact() {
    if(savingContact || !chosenRoute)return;
    setSavingContact(true);setError("");setNotice("");
    try {
      await apiPost("/muhasebe/invoice-mail-contacts",{
        ...contactForm,mainCompanySlug:companySlug,customerName:chosenRoute.customerName,
        groupCode:chosenRoute.groupCode,
      });
      const fresh=unwrap(await apiGet("/muhasebe/invoice-mail-contacts",{mainCompanySlug:companySlug}));
      const next=Array.isArray(fresh)?fresh:[];
      setContacts(next);
      const recipients=routeContactRecipients(next,chosenRoute);
      setToText(stringifyEmails(recipients.to));
      setCcText(stringifyEmails(recipients.cc));
      setContactForm(emptyContact());
      invalidate();
      setNotice("Kişi kaydedildi; departmanın aktif alıcı listesi yenilendi.");
    } catch(e){setError(e?.message||"Kişi kaydedilemedi.");}
    finally{setSavingContact(false);}
  }
  function editContact(person){
    setContactForm({id:person.id,firstName:person.firstName,lastName:person.lastName,
      email:person.email,phone:person.phone||"",recipientKind:person.recipientKind||"TO",active:person.active!==false});
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
    const content = makeInvoiceMailContent(modelName, invoiceNo, deliveryNo, templateId);
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
    const prepared = { ...created, to, cc, bcc, subject: finalSubject, invoiceAssetId, deliveryAssetId,
      invoiceNo: documentKey(invoiceNo), deliveryNo: documentKey(deliveryNo), modelId, modelName, routeId };
    setDraft(prepared);
    return prepared;
  };

  const persistInvoiceMailLink = (prepared) => apiPost("/muhasebe/invoice-mail-links", {
    mainCompanySlug: companySlug, draftId: prepared.id,
    invoiceNo: prepared.invoiceNo, deliveryNo: prepared.deliveryNo,
    modelId: prepared.modelId, modelName: prepared.modelName, routeId: prepared.routeId,
  });

  const repairLink = async () => {
    if (!acceptedDraft?.id || !linkNeedsRepair || working || actionGuard.current) return;
    actionGuard.current = true; setWorking(true); setError("");
    try {
      await persistInvoiceMailLink(acceptedDraft);
      setLinkNeedsRepair(false);
      setLinkRevision((current) => current + 1);
      setNotice("Mevcut mailin ERP yazışma bağı doğrulandı. Yeni e-posta gönderilmedi.");
    } catch (e) {
      setError((e?.message || "Yazışma bağı doğrulanamadı.") + " E-posta yeniden gönderilmedi.");
    } finally {
      actionGuard.current = false; setWorking(false);
    }
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
      setSent(true); setPhase("ACCEPTED"); setAcceptedDraft(prepared);
      try {
        await persistInvoiceMailLink(prepared);
        setLinkNeedsRepair(false);
        setLinkRevision((current) => current + 1);
        setNotice("Microsoft gönderim isteğini kabul etti. İki PDF, alıcılar ve model ilişkisi kaydedildi; teslim/okundu kanıtı değildir.");
      } catch (linkError) {
        setLinkNeedsRepair(true);
        setNotice("Microsoft isteği kabul etti; ERP yazışma bağı henüz doğrulanamadı: " +
          (linkError?.message || "Kayıt hatası") + ". Yalnız bağlantı kaydını yeniden doğrulayabilirsiniz; maili tekrar göndermeyin.");
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

      <h4>Departmanın kişi listesi</h4>
      <p>Her kişi aynı firma içinde yalnız bir gruba bağlıdır. İzne çıkan kişiyi pasifleştirin; kaydı ve geçmiş yazışmaları silinmez.</p>
      <label>Firma / departman
        <select value={routeId} onChange={(e)=>chooseRoute(e.target.value)}>
          <option value="">Önce kayıtlı departmanı seçin</option>
          {routes.map((item)=><option key={item.id} value={item.id}>{displayName(item)}</option>)}
        </select>
      </label>
      {chosenRoute ? <>
        <div className="imw-form-grid">
          <label>Ad<input value={contactForm.firstName} onChange={(e)=>setContactForm({...contactForm,firstName:e.target.value})} /></label>
          <label>Soyad<input value={contactForm.lastName} onChange={(e)=>setContactForm({...contactForm,lastName:e.target.value})} /></label>
          <label>E-posta<input type="email" value={contactForm.email} onChange={(e)=>setContactForm({...contactForm,email:e.target.value})} /></label>
          <label>Telefon / iletişim<input value={contactForm.phone} onChange={(e)=>setContactForm({...contactForm,phone:e.target.value})} /></label>
          <label>Alıcı türü<select value={contactForm.recipientKind} onChange={(e)=>setContactForm({...contactForm,recipientKind:e.target.value})}><option value="TO">Kime (TO)</option><option value="CC">Bilgi (CC)</option></select></label>
          <label><input type="checkbox" checked={contactForm.active} onChange={(e)=>setContactForm({...contactForm,active:e.target.checked})} /> Aktif alıcı</label>
        </div>
        <div className="imw-actions">
          <button type="button" disabled={savingContact} onClick={()=>void saveContact()}>{savingContact?"Kaydediliyor...":contactForm.id?"Kişiyi Güncelle":"Kişi Ekle"}</button>
          <button type="button" onClick={()=>setContactForm(emptyContact())}>Yeni Kişi</button>
        </div>
        <div className="imw-directory-list">{roster.map((person)=><div key={person.id}>
          <strong>{person.firstName} {person.lastName} · {person.recipientKind==="CC"?"CC":"TO"} {person.active===false?"(Pasif)":""}</strong>
          <small>{person.email}{person.phone?" · "+person.phone:""}</small>
          <span><button type="button" onClick={()=>editContact(person)}>Düzenle</button></span>
        </div>)}{!roster.length?<p>Bu departmanda henüz kişi yok.</p>:null}</div>
      </>:null}

    </section> : null}

    <div className="imw-form-grid">
      <label>Gönderici posta hesabı<select disabled={working || dispatchLocked} value={accountId} onChange={(e) => { setAccountId(e.target.value); invalidate(); }}>
        <option value="">Hesap seçin</option>{accounts.filter(isOutlookActive).map((item) => <option key={item.id} value={item.id}>{item.email_address || item.display_name}</option>)}
      </select></label>
      <label>Grup / planlamacı ve fatura alıcısı<select disabled={working || dispatchLocked} value={routeId} onChange={(e) => chooseRoute(e.target.value)}>
        <option value="">Alıcı profili seçin</option>{routes.map((row) => <option key={row.id} value={row.id}>{displayName(row)}</option>)}
      </select></label>
      <label>Model adı<input disabled={working || dispatchLocked} value={modelName} onChange={(e) => {setModelName(e.target.value);invalidateDocument();}} placeholder="Model kartındaki ad" /></label>
      <label>HKN fatura no<input disabled={working || dispatchLocked} value={invoiceNo} onChange={(e) => {setInvoiceNo(e.target.value);invalidateDocument();}} placeholder="HKN2026..." /></label>
      <label>DDM irsaliye no<input disabled={working || dispatchLocked} value={deliveryNo} onChange={(e) => {setDeliveryNo(e.target.value);invalidateDocument();}} placeholder="DDM2026..." /></label>
      <label>HKN fatura PDF<select disabled={working || dispatchLocked} value={invoiceAssetId} onChange={(e) => {setInvoiceAssetId(e.target.value);invalidate();}}>
        <option value="">{invoiceFiles.length ? "PDF seçin" : "Tam HKN numarasıyla File Hub'da dosya aranıyor / bulunamadı"}</option>
        {invoiceFiles.map((file) => <option key={file.id} value={file.id}>{file.file_name} · {file.provider_type || "Dosya"}</option>)}
      </select></label>
      <label>DDM irsaliye PDF<select disabled={working || dispatchLocked} value={deliveryAssetId} onChange={(e) => {setDeliveryAssetId(e.target.value);invalidate();}}>
        <option value="">{deliveryFiles.length ? "PDF seçin" : "Tam DDM numarasıyla File Hub'da dosya aranıyor / bulunamadı"}</option>
        {deliveryFiles.map((file) => <option key={file.id} value={file.id}>{file.file_name} · {file.provider_type || "Dosya"}</option>)}
      </select></label>
      <label>Faturayı alanlar (TO)<textarea disabled={working || dispatchLocked} value={toText} onChange={(e) => {setToText(e.target.value);invalidate();}} rows={2} placeholder="Alıcı profili seçildiğinde doldurulur, değiştirilebilir" /></label>
      <label>Bilgi alıcıları (CC)<textarea disabled={working || dispatchLocked} value={ccText} onChange={(e) => {setCcText(e.target.value);invalidate();}} rows={2} placeholder="Gerekli diğer alıcılar" /></label>
      <label>Gizli bilgi (BCC)<textarea disabled={working || dispatchLocked} value={bccText} onChange={(e) => {setBccText(e.target.value);invalidate();}} rows={2} placeholder="İsteğe bağlı" /></label>
      {chosenRoute && roster.length ? <div className="imw-wide">
        <strong>Departman alıcıları — tek tıkla seç / çıkar</strong>
        <div className="imw-directory-list">{roster.map((person)=>
          <label key={person.id}>
            <input type="checkbox" disabled={working || dispatchLocked || person.active===false}
              checked={person.active!==false && selectedAddresses.has(String(person.email||"").toLowerCase())}
              onChange={(e)=>toggleContact(person,e.target.checked)} />
            {" "}{person.firstName} {person.lastName} · {person.email} ({person.recipientKind||"TO"}) {person.active===false?"— İzinli / pasif":""}
          </label>)}</div>
      </div> : null}
      <label>Hazır konu ve mesaj şablonu
        <select disabled={working || dispatchLocked} value={templateId} onChange={(e)=>{setTemplateId(e.target.value);setSubjectOverride(null);setBodyOverride(null);invalidate();}}>
          {INVOICE_MAIL_TEMPLATES.map((t)=><option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <label>Mail konusu<input disabled={working || dispatchLocked} value={subject} maxLength={250} onChange={(e) => {setSubjectOverride(e.target.value);invalidate();}} placeholder="Konu" /></label>
      <label className="imw-wide">Mail mesajı<textarea disabled={working || dispatchLocked} value={bodyText} rows={5} onChange={(e) => {setBodyOverride(e.target.value);invalidate();}} placeholder="Alıcıya iletilecek mesaj" /></label>
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
    {linkNeedsRepair && acceptedDraft?.id ? <div className="imw-actions">
      <button type="button" disabled={working} onClick={() => void repairLink()}>ERP Gönderim Kaydını Onar (mail göndermez)</button>
    </div> : null}
    {remoteAttempt?.status === "ACCEPTED" && !remoteAttempt?.linked && !remoteAttempt?.draftId ?
      <p className="imw-foot">Önceki gönderim kabul edilmiş ancak ilişki kaydı eksik. Bu gönderimi başlatan kullanıcı veya yönetici ilişkiyi doğrulamalıdır.</p> : null}
    {phase === "UNKNOWN_REVIEW_REQUIRED" ? <p className="imw-error" role="alert">Gönderim sonucu belirsiz. Bu ekranda yeniden gönderme kapalıdır; önce kayıtları uzlaştırın.</p> : null}
    {mailHistory.length ? <section className="imw-history"><strong>Fatura / model yazışma geçmişi</strong>{mailHistory.map((item) => <div key={item.draftId}><span>{item.invoiceNo} · {item.modelName || modelName} · {item.recordedAt ? new Date(item.recordedAt).toLocaleDateString("tr-TR") : ""}</span><small>{Array.isArray(item.to) ? item.to.join("; ") : ""} · Microsoft sağlayıcı kabulü; teslim kanıtı değil</small></div>)}</section> : null}
    <p className="imw-foot">PDF kaynakları önce File Hub ve model bağıyla denetlenir. Taslak hiçbir zaman e-Fatura/e-İrsaliye resmî gönderimi değildir. Tekrar gönderim iş anahtarıyla engellenir.</p>
  </section>;
}
