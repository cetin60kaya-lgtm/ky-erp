import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../../utils/api";
import { createMailDraft, listCommunicationFiles, listMailAccounts, sendMailDraft } from "../../../services/mailApi";
import { documentKey, matchingPdfFiles, matchingRecipientRoutes, makeInvoiceMailContent, parseRecipientEmails } from "./invoiceMailRouting";
import "./invoiceMailWorkspace.css";

const unwrap = (value) => value?.data?.data ?? value?.data ?? value ?? [];
const emptyRoute = () => ({ id: "", customerName: "", groupCode: "", department: "", plannerName: "", plannerEmail: "", to: "", cc: "" });
const displayName = (row) => [row.customerName, row.groupCode, row.department, row.plannerName].filter(Boolean).join(" / ");
const isMailActive = (row) => String(row?.status || "").toUpperCase() === "ACTIVE" && Number(row?.provider_connected ?? row?.providerConnected ?? 0) === 1;
const stringifyEmails = (value) => (Array.isArray(value) ? value : []).join("; ");

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
  const [modelFiles, setModelFiles] = useState([]);
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [deliveryFiles, setDeliveryFiles] = useState([]);
  const [invoiceAssetId, setInvoiceAssetId] = useState("");
  const [deliveryAssetId, setDeliveryAssetId] = useState("");
  const [draft, setDraft] = useState(null);
  const [sent, setSent] = useState(false);
  const [working, setWorking] = useState(false);
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
      const enabled = (Array.isArray(available) ? available : []).filter(isMailActive);
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
    setModelName(String(selectedInvoice?.model_name || selectedInvoice?.modelName || ""));
    setRouteForm((current) => ({ ...current, customerName: String(selectedInvoice?.party_name || current.customerName || "") }));
    setDraft(null); setSent(false); setInvoiceAssetId(""); setDeliveryAssetId("");
  }, [selectedInvoice]);

  const invalidate = () => { setDraft(null); setSent(false); setNotice(""); };
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

  const prepare = async () => {
    if (working) return;
    setWorking(true); setError(""); setNotice("");
    try {
      if (!chosenRoute) throw new Error("Önce doğrulanmış grup ve fatura alıcısı profilini seçin.");
      if (!account || !isMailActive(account)) throw new Error("Aktif Outlook/Gmail gönderim hesabı seçilmelidir.");
      const content = makeInvoiceMailContent(modelName, invoiceNo, deliveryNo);
      if (!invoiceFiles.some((file) => file.id === invoiceAssetId) || !deliveryFiles.some((file) => file.id === deliveryAssetId)) {
        throw new Error("HKN ve DDM PDF dosyalarının ikisi de mevcut File Hub'dan seçilmelidir.");
      }
      const to = parseRecipientEmails(toText);
      const cc = String(ccText || "").trim() ? parseRecipientEmails(ccText) : [];
      const created = unwrap(await createMailDraft({
        accountId, subject: content.subject, bodyText: content.bodyText,
        recipients: { to, cc, bcc: [] },
        attachmentRefs: [{fileAssetId:invoiceAssetId}, {fileAssetId:deliveryAssetId}],
        mainCompanySlug: companySlug,
      }));
      if (!created?.id) throw new Error("Mail taslağı oluşturulduğu doğrulanamadı.");
      setDraft({ ...created, to, cc, subject: content.subject, invoiceAssetId, deliveryAssetId });
      setNotice("İki PDF eki ve alıcılarıyla taslak oluşturuldu. Gönderilmedi; onay bekliyor.");
    } catch (e) {
      setError(e?.message || "Taslak hazırlanamadı.");
    } finally { setWorking(false); }
  };

  const send = async () => {
    if (!draft?.id || working || sent) return;
    setWorking(true); setError(""); setNotice("");
    try {
      // Stable per HKN/group/account identity: a second draft cannot silently send twice.
      const logicalEventId = ["MODEL_INVOICE_MAIL", companySlug, documentKey(invoiceNo), routeId, accountId].join(":");
      const result = unwrap(await sendMailDraft(draft.id, logicalEventId));
      if (!["PROVIDER_ACCEPTED", "ACCEPTED"].includes(String(result?.status || "").toUpperCase())) {
        throw new Error("Posta sağlayıcısı gönderimi kabul ettiğini doğrulamadı; tekrar göndermeyin.");
      }
      setSent(true);
      setNotice("Posta sağlayıcısı gönderimi kabul etti. Teslim edildi anlamına gelmez; gönderilenlerden izleyin.");
    } catch (e) {
      setError((e?.message || "Gönderimin sonucu belirsiz.") + " Otomatik tekrar gönderim yapılmadı; Mail & Dosyalar'dan gönderim durumunu denetleyin.");
    } finally { setWorking(false); }
  };

  return <section className="invoice-mail-workspace">
    <header className="imw-head">
      <div><h3>Modelden Fatura / İrsaliye Maili</h3><p>İşNet belgesi → File Hub/Drive PDF → müşteri grup alıcısı → taslak → açık onay. Yapay zekâ kullanılmaz.</p></div>
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
        <option value="">Hesap seçin</option>{accounts.filter(isMailActive).map((item) => <option key={item.id} value={item.id}>{item.email_address || item.display_name}</option>)}
      </select></label>
      <label>Grup / planlamacı ve fatura alıcısı<select value={routeId} onChange={(e) => chooseRoute(e.target.value)}>
        <option value="">Alıcı profili seçin</option>{routes.map((row) => <option key={row.id} value={row.id}>{displayName(row)}</option>)}
      </select></label>
      <label>Model adı<input value={modelName} onChange={(e) => {setModelName(e.target.value);invalidate();}} placeholder="Model kartındaki ad" /></label>
      <label>HKN fatura no<input value={invoiceNo} onChange={(e) => {setInvoiceNo(e.target.value);invalidate();}} placeholder="HKN2026..." /></label>
      <label>DDM irsaliye no<input value={deliveryNo} onChange={(e) => {setDeliveryNo(e.target.value);invalidate();}} placeholder="DDM2026..." /></label>
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
    </div>

    {modelId ? <p className="imw-foot">Model kartı bağlantısı: {modelName || "Seçili model"}. Yalnız bu modele File Hub üzerinden gerçekten bağlı HKN/DDM PDF dosyaları seçilebilir.</p> : null}
    {possibleRoute.length > 1 ? <p className="imw-error">Aynı grupta birden çok kişi var; doğru planlamacı ve fatura alıcısını ayrıca kontrol edin.</p> : null}
    <div className="imw-actions">
      <button type="button" disabled={!accountId || !routeId || working || sent} onClick={prepare}>{working ? "İşleniyor..." : "PDF Ekleriyle Taslak Oluştur"}</button>
      {draft && !sent ? <button type="button" disabled={working} className="imw-send" onClick={send}>Kontrol Ettim, Maili Gönder</button> : null}
    </div>
    {draft ? <div className="imw-preview">
      <strong>{sent ? "Gönderim sağlayıcı tarafından kabul edildi" : "Gönderim onayı bekliyor"}</strong>
      <p>Hesap: {account?.email_address || "-"} · {draft.subject}</p>
      <p>TO: {draft.to.join("; ")}{draft.cc.length ? " · CC: " + draft.cc.join("; ") : ""}</p>
      <p>Ek: {invoiceFiles.find((file) => file.id === draft.invoiceAssetId)?.file_name} / {deliveryFiles.find((file) => file.id === draft.deliveryAssetId)?.file_name}</p>
    </div> : null}
    <p className="imw-foot">PDF bulunamazsa otomatik ek oluşturulmaz. Gönderim sadece yetkili posta kutusu ve açık onayla yapılır. Mevcut Mail & Dosyalar gönderim korumaları geçerlidir.</p>
  </section>;
}
