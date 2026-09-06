import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMailDraft,
  getMailOverview,
  downloadMailAttachment,
  getMailAttachmentBlob,
  getMailProviders,
  listCommunicationFiles,
  listMailAccounts,
  listMailAttachments,
  listMailDrafts,
  listMailFolders,
  listMailMessages,
  pinMailMessage,
  requestMailAccount,
  runMailMessageAction,
  searchCommunicationFiles,
  sendMailDraft,
  setMailAccountDefaults,
  startGoogleMailOAuth,
  startMicrosoftMailOAuth,
  syncMailAccount,
  syncMailFolder,
} from "../../services/mailApi";
import "./CommunicationHubPage.css";

const MAIL_TABS = new Set(["mail-gelen", "mail-sabitlenen", "mail-gonderilen", "mail-taslaklar", "mail-yanit-bekleyen", "mail-sablonlar"]);

const providerLabel = (value) => ({
  MICROSOFT_365: "Microsoft 365 / Outlook",
  GMAIL: "Gmail / Google Workspace",
  JMAP: "JMAP",
  IMAP_SMTP: "Standart IMAP / SMTP",
}[String(value || "").toUpperCase()] || value || "Mail");

const statusLabel = (value) => ({
  ACTIVE: "Aktif",
  PENDING: "Onay Bekliyor",
  DISCONNECTED: "Bağlantı Bekliyor",
  REAUTH_REQUIRED: "Yeniden Bağla",
  SUSPENDED: "Askıda",
}[String(value || "").toUpperCase()] || value || "—");

function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function attachmentName(row) {
  return String(row?.file_name || row?.fileName || "Ek");
}

function attachmentPreviewKind(row) {
  const name = attachmentName(row).toLowerCase();
  const mime = String(row?.mime_type || row?.mimeType || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";
  if ((mime.startsWith("image/") && mime !== "image/svg+xml") || ["png","jpg","jpeg","gif","webp","bmp","ico","avif"].includes(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("text/") || ["txt","csv","log","md","json","xml"].includes(ext)) return "text";
  return "unsupported";
}

function initialMailPaneWidths() {
  const fallback = { mailbox: 250, list: 560 };
  try {
    const saved = JSON.parse(window.localStorage.getItem("kyerp.mailPaneWidths") || "{}");
    return {
      mailbox: Math.min(420, Math.max(190, Number(saved.mailbox) || fallback.mailbox)),
      list: Math.min(820, Math.max(300, Number(saved.list) || fallback.list)),
    };
  } catch {
    return fallback;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Dosya okunamadı."));
    reader.readAsDataURL(blob);
  });
}

function regexEscape(value) {
  return String(value || "").replace(/[|\\{}()[\]^$+*?.-]/g, "\\function initialMailPaneWidths() {
  const fallback = { mailbox: 250, list: 560 };
  try {
    const saved = JSON.parse(window.localStorage.getItem("kyerp.mailPaneWidths") || "{}");
    return {
      mailbox: Math.min(420, Math.max(190, Number(saved.mailbox) || fallback.mailbox)),
      list: Math.min(820, Math.max(300, Number(saved.list) || fallback.list)),
    };
  } catch {
    return fallback;
  }
}
");
}

function MailMessageMedia({ message }) {
  const rootRef = useRef(null);
  const [media, setMedia] = useState([]);
  const hasAttachments = Number(message?.has_attachments ?? message?.hasAttachments ?? 0) === 1;

  useEffect(() => {
    if (!message?.id || !hasAttachments) { setMedia([]); return undefined; }
    let cancelled = false;
    let objectUrls = [];
    let observer = null;

    const load = async () => {
      try {
        const rows = safeArray(await listMailAttachments(message.id));
        const images = rows.filter((row) => attachmentPreviewKind(row) === "image");
        const loaded = [];
        for (const attachment of images) {
          if (cancelled) break;
          try {
            const blob = await getMailAttachmentBlob(message.id, attachment.id);
            const url = URL.createObjectURL(blob);
            objectUrls.push(url);
            loaded.push({ id: attachment.id, name: attachmentName(attachment), url });
          } catch {}
        }
        if (!cancelled) setMedia(loaded);
      } catch {
        if (!cancelled) setMedia([]);
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      load();
    } else if (rootRef.current) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          observer = null;
          load();
        }
      }, { rootMargin: "320px 0px" });
      observer.observe(rootRef.current);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls = [];
    };
  }, [message?.id, hasAttachments]);

  return <div ref={rootRef} className="comm-message-media" aria-label="Mail görselleri">
    {media.map((item) => <img key={item.id} src={item.url} alt={item.name} loading="lazy"/>)}
  </div>;
}

function flattenFolders(rows) {
  const list = safeArray(rows);
  const byProvider = new Map(list.map((row) => [String(row.provider_folder_id || row.providerFolderId || ""), row]));
  const children = new Map();
  for (const row of list) {
    const parent = String(row.parent_folder_id || row.parentFolderId || "");
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(row);
  }
  const sorted = (items) => [...items].sort((a, b) => {
    const rank = (value) => ({ INBOX:0, DRAFTS:1, SENT:2, ARCHIVE:3, JUNK:4, TRASH:5, CUSTOM:6 }[String(value || "").toUpperCase()] ?? 9);
    return rank(a.folder_type || a.folderType) - rank(b.folder_type || b.folderType)
      || String(a.name || "").localeCompare(String(b.name || ""), "tr");
  });
  const result = [];
  const visit = (row, depth) => {
    result.push({ ...row, _depth: depth });
    const key = String(row.provider_folder_id || row.providerFolderId || "");
    for (const child of sorted(children.get(key) || [])) visit(child, depth + 1);
  };
  const roots = list.filter((row) => {
    const parent = String(row.parent_folder_id || row.parentFolderId || "");
    return !parent || !byProvider.has(parent);
  });
  for (const row of sorted(roots)) visit(row, 0);
  return result;
}

const HAKAN_DIRECT_ACCOUNTS = [
  {
    key: "HAKAN_MAIN",
    title: "Hakan Emprime Ana Mail",
    providerType: "MICROSOFT_365",
    accountType: "PERSONAL",
    emailAddress: "hkngursu@hotmail.com",
    displayName: "Hakan Emprime",
    departmentCode: "YONETIM",
    isDefaultSend: true,
    isDefaultReceive: true,
  },
  {
    key: "DESEN",
    title: "Desen Maili",
    providerType: "GMAIL",
    accountType: "DEPARTMENT",
    emailAddress: "hkndesen@gmail.com",
    displayName: "Hakan Emprime Desen",
    departmentCode: "DESEN",
    isDefaultSend: false,
    isDefaultReceive: false,
  },
];

export default function CommunicationHubPage({ activeTab, activeMainCompany, openModule }) {
  const isMail = MAIL_TABS.has(activeTab);
  const [overview, setOverview] = useState(null);
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [folders, setFolders] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [moveTargetId, setMoveTargetId] = useState("");
  const [mailboxRefresh, setMailboxRefresh] = useState(0);
  const [files, setFiles] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [advancedAccountOpen, setAdvancedAccountOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    providerType: "MICROSOFT_365",
    accountType: "PERSONAL",
    emailAddress: "",
    displayName: "",
    departmentCode: "",
  });
  const [draftForm, setDraftForm] = useState({ to: "", cc: "", bcc: "", subject: "", bodyText: "", replyToMessageId: "" });
  const [composeOpen, setComposeOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [paneWidths, setPaneWidths] = useState(initialMailPaneWidths);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [renderedHtml, setRenderedHtml] = useState("");
  const mailLayoutRef = useRef(null);

  const activeCompanyName = activeMainCompany?.name || activeMainCompany?.ad || activeMainCompany?.slug || "Aktif Firma";
  const activeCompanyKey = String(activeMainCompany?.slug || activeCompanyName || "").toLocaleLowerCase("tr-TR");
  const showHakanDirectAccounts = ["mecit-hakan", "main-mecit-hakan"].includes(activeCompanyKey);
  const selectedAccount = useMemo(
    () => accounts.find((row) => String(row.id) === String(selectedAccountId)) || null,
    [accounts, selectedAccountId],
  );
  const selectedProviderRuntime = useMemo(
    () => providers.find((row) => row.provider === requestForm.providerType) || null,
    [providers, requestForm.providerType],
  );
  const folderRows = useMemo(() => flattenFolders(folders), [folders]);
  const selectedFolder = useMemo(
    () => folders.find((row) => String(row.id) === String(selectedFolderId)) || null,
    [folders, selectedFolderId],
  );
  const defaultInboxFolderId = useMemo(
    () => String(folders.find((row) => String(row.folder_type || row.folderType || "").toUpperCase() === "INBOX")?.id || ""),
    [folders],
  );

  const loadBase = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      getMailOverview(),
      getMailProviders(),
      listMailAccounts(),
      listCommunicationFiles(),
    ]);
    if (results[0].status === "fulfilled") setOverview(results[0].value || null);
    if (results[1].status === "fulfilled") setProviders(safeArray(results[1].value?.providers));
    if (results[2].status === "fulfilled") {
      const rows = safeArray(results[2].value);
      setAccounts(rows);
      setSelectedAccountId((current) => rows.some((row) => String(row.id) === String(current)) ? current : String(rows[0]?.id || ""));
    }
    if (results[3].status === "fulfilled") setFiles(safeArray(results[3].value));
    const sourceNames = ["Mail özeti", "Sağlayıcı durumu", "Posta kutuları", "Firma dosyaları"];
    const failedSources = results
      .map((row, index) => row.status === "rejected" ? sourceNames[index] : "")
      .filter(Boolean);
    const schemaPending = results[0].status === "fulfilled" && results[0].value?.schemaReady === false;
    setNotice(schemaPending
      ? "Mail bağlantı servisi hazırlanıyor. Hazır olduğunda hesaplarınızı bağlayabilirsiniz."
      : failedSources.length ? `Hazır olmayan kaynak: ${failedSources.join(", ")}. Diğer bilgiler gösteriliyor.` : "");
    setLoading(false);
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    try { window.localStorage.setItem("kyerp.mailPaneWidths", JSON.stringify(paneWidths)); } catch {}
  }, [paneWidths]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, []);

  useEffect(() => () => {
    if (attachmentPreview?.url) URL.revokeObjectURL(attachmentPreview.url);
  }, [attachmentPreview?.url]);

  useEffect(() => {
    setAttachmentPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
    setContextMenu(null);
  }, [selectedMessage?.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadFolders() {
      if (!isMail || !selectedAccountId) { setFolders([]); return; }
      try {
        const rows = await listMailFolders(selectedAccountId);
        if (!cancelled) setFolders(safeArray(rows));
      } catch {
        if (!cancelled) setFolders([]);
      }
    }
    loadFolders();
    return () => { cancelled = true; };
  }, [isMail, selectedAccountId, mailboxRefresh]);

  useEffect(() => {
    setSelectedFolderId("");
    setMoveTargetId("");
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    async function loadAttachments() {
      if (!selectedMessage?.id || (!selectedFolderId && activeTab === "mail-taslaklar")) {
        setAttachments([]);
        return;
      }
      try {
        const rows = await listMailAttachments(selectedMessage.id);
        if (!cancelled) setAttachments(safeArray(rows));
      } catch {
        if (!cancelled) setAttachments([]);
      }
    }
    loadAttachments();
    return () => { cancelled = true; };
  }, [selectedMessage?.id, activeTab, selectedFolderId]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateInlineImages() {
      const html = String(selectedMessage?.body_html || selectedMessage?.bodyHtml || "");
      if (!html) { setRenderedHtml(""); return; }
      let hydrated = html;
      const inlineRows = attachments.filter((row) => attachmentPreviewKind(row) === "image" && String(row.content_id || row.contentId || "").trim());
      for (const attachment of inlineRows) {
        if (cancelled) return;
        try {
          const cid = String(attachment.content_id || attachment.contentId || "").replace(/^<|>$/g, "").trim();
          if (!cid) continue;
          const matcher = new RegExp("cid:\\s*" + regexEscape(cid), "gi");
          if (!matcher.test(hydrated)) continue;
          matcher.lastIndex = 0;
          const blob = await getMailAttachmentBlob(selectedMessage.id, attachment.id);
          const dataUrl = await blobToDataUrl(blob);
          hydrated = hydrated.replace(matcher, dataUrl);
        } catch {}
      }
      if (!cancelled) setRenderedHtml(hydrated);
    }
    hydrateInlineImages();
    return () => { cancelled = true; };
  }, [selectedMessage?.id, selectedMessage?.body_html, selectedMessage?.bodyHtml, attachments]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mailConnected") === "1") {
      const provider = String(params.get("mailProvider") || "").toUpperCase();
      setNotice(provider === "GMAIL" ? "Google / Gmail posta kutusu bağlantısı doğrulandı." : "Microsoft posta kutusu bağlantısı doğrulandı.");
    }
    if (params.get("mailError")) setNotice("Hata: Mail hesabı bağlanamadı. Hesabınızı kontrol edip yeniden bağlanmayı deneyin.");
    if (params.has("mailConnected") || params.has("mailError")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadMailbox() {
      if (!isMail || !selectedAccountId) {
        setMessages([]);
        setDrafts([]);
        return;
      }
      try {
        if (!selectedFolderId && activeTab === "mail-taslaklar") {
          const rows = await listMailDrafts();
          if (!cancelled) {
            const list = safeArray(rows).filter((row) => String(row.account_id || row.accountId) === String(selectedAccountId));
            setDrafts(list);
            setSelectedMessage((current) => list.find((row) => row.id === current?.id) || list[0] || null);
          }
          return;
        }
        const params = selectedFolderId
          ? { folderId: selectedFolderId, take: 200 }
          : activeTab === "mail-gelen" && defaultInboxFolderId
            ? { folderId: defaultInboxFolderId, take: 200 }
            : activeTab === "mail-sabitlenen"
              ? { pinned: 1, take: 200 }
              : activeTab === "mail-yanit-bekleyen"
                ? { awaitingReply: 1, take: 120 }
                : { direction: activeTab === "mail-gonderilen" ? "OUTGOING" : "INCOMING", take: 120 };
        const rows = await listMailMessages(selectedAccountId, params);
        if (!cancelled) {
          const list = safeArray(rows);
          setMessages(list);
          setSelectedMessage((current) => list.find((row) => row.id === current?.id) || list[0] || null);
        }
      } catch (error) {
        if (!cancelled) setNotice(error?.message || "Posta kutusu okunamadı.");
      }
    }
    loadMailbox();
    return () => { cancelled = true; };
  }, [activeTab, isMail, selectedAccountId, selectedFolderId, defaultInboxFolderId, mailboxRefresh]);

  function beginPaneResize(pane, event) {
    if (window.innerWidth <= 1100 || !mailLayoutRef.current) return;
    event.preventDefault();
    const rect = mailLayoutRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const start = { ...paneWidths };
    document.body.classList.add("comm-resizing");
    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      if (pane === "mailbox") {
        const maxMailbox = Math.max(240, rect.width - start.list - 430);
        setPaneWidths((current) => ({ ...current, mailbox: Math.min(Math.min(420, maxMailbox), Math.max(190, start.mailbox + dx)) }));
      } else {
        const maxList = Math.max(360, rect.width - start.mailbox - 430);
        setPaneWidths((current) => ({ ...current, list: Math.min(Math.min(820, maxList), Math.max(300, start.list + dx)) }));
      }
    };
    const stop = () => {
      document.body.classList.remove("comm-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  async function openAttachmentPreview(attachment) {
    const kind = attachmentPreviewKind(attachment);
    const name = attachmentName(attachment);
    if (attachmentPreview?.url) URL.revokeObjectURL(attachmentPreview.url);
    if (kind === "unsupported") {
      setAttachmentPreview({ attachment, kind, name, url: "", text: "" });
      return;
    }
    setPreviewLoading(true);
    try {
      const blob = await getMailAttachmentBlob(selectedMessage.id, attachment.id);
      if (kind === "text") {
        setAttachmentPreview({ attachment, kind, name, url: "", text: await blob.text() });
      } else {
        setAttachmentPreview({ attachment, kind, name, url: URL.createObjectURL(blob), text: "" });
      }
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Ek önizlemesi açılamadı."}`);
    } finally {
      setPreviewLoading(false);
    }
  }

  function closeAttachmentPreview() {
    setAttachmentPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function openMessageContextMenu(event, row) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedMessage(row);
    const width = 230;
    const height = 310;
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
      row,
    });
  }

  async function runContextAction(action) {
    const row = contextMenu?.row;
    setContextMenu(null);
    if (!row) return;
    setSelectedMessage(row);
    if (action === "REPLY") {
      const sender = row.sender_email || row.senderEmail || "";
      const subject = String(row.subject || "").trim();
      setDraftForm({ to: sender, cc: "", bcc: "", subject: /^re:/i.test(subject) ? subject : `Re: ${subject || "(Konu yok)"}`, bodyText: "", replyToMessageId: row.id || "" });
      setComposeOpen(true);
      return;
    }
    if (action === "PIN") {
      const next = Number(row.is_pinned ?? row.isPinned ?? 0) !== 1;
      setLoading(true);
      try {
        await pinMailMessage(row.id, next);
        setMailboxRefresh((value) => value + 1);
        setNotice(next ? "Mail sabitlendi." : "Mail sabitlemeden çıkarıldı.");
      } catch (error) {
        setNotice(`Hata: ${error?.message || "Sabitleme değiştirilemedi."}`);
      } finally { setLoading(false); }
      return;
    }
    const actionMap = {
      READ_TOGGLE: Number(row.is_read ?? row.isRead ?? 1) === 1 ? "MARK_UNREAD" : "MARK_READ",
      FLAG_TOGGLE: Number(row.is_flagged ?? row.isFlagged ?? 0) === 1 ? "UNFLAG" : "FLAG",
      ARCHIVE: "ARCHIVE",
      DELETE: "DELETE",
    };
    const apiAction = actionMap[action];
    if (!apiAction) return;
    setLoading(true);
    try {
      await runMailMessageAction(row.id, apiAction, {});
      setNotice(apiAction === "ARCHIVE" ? "Mail arşive taşındı." : apiAction === "DELETE" ? "Mail silinmiş öğelere taşındı." : "Mail durumu güncellendi.");
      setSelectedMessage(null);
      setMailboxRefresh((value) => value + 1);
      await loadBase();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail işlemi tamamlanamadı."}`);
    } finally { setLoading(false); }
  }

  async function submitAccountRequest(event) {
    event.preventDefault();
    setLoading(true);
    try {
      await requestMailAccount(requestForm);
      setNotice("Hesap talebi oluşturuldu. İlgili firma sahibi / işveren onayı bekleniyor.");
      setRequestOpen(false);
      setRequestForm((current) => ({ ...current, emailAddress: "", displayName: "", departmentCode: "" }));
      await loadBase();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail hesabı talebi oluşturulamadı."}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveDraft(sendNow = false) {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const created = await createMailDraft({
        accountId: selectedAccountId,
        replyToMessageId: draftForm.replyToMessageId || undefined,
        subject: draftForm.subject,
        bodyText: draftForm.bodyText,
        recipients: {
          to: draftForm.to.split(/[;,]/).map((email) => email.trim()).filter(Boolean),
          cc: draftForm.cc.split(/[;,]/).map((email) => email.trim()).filter(Boolean),
          bcc: draftForm.bcc.split(/[;,]/).map((email) => email.trim()).filter(Boolean),
        },
      });
      if (sendNow) {
        const result = await sendMailDraft(created.id);
        const providerName = providerLabel(selectedAccount?.provider_type || selectedAccount?.providerType);
        setNotice(result?.status === "PROVIDER_ACCEPTED"
          ? `${providerName} gönderim isteğini kabul etti. Teslim sonucu sağlayıcı tarafından ayrıca işlenir.`
          : "Mail gönderim işlemi tamamlandı.");
      } else {
        setNotice("Taslak kaydedildi.");
      }
      setDraftForm({ to: "", cc: "", bcc: "", subject: "", bodyText: "", replyToMessageId: "" });
      setComposeOpen(false);
      setMailboxRefresh((value) => value + 1);
      await loadBase();
    } catch (error) {
      setNotice(`Hata: ${error?.message || (sendNow ? "Mail gönderilemedi." : "Taslak kaydedilemedi.")}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitDraft(event) {
    event.preventDefault();
    await saveDraft(false);
  }

  async function addAndConnectPreset(preset) {
    const existingAccount = accounts.find((row) => String(row.email_address || row.emailAddress || "").trim().toLowerCase() === preset.emailAddress.toLowerCase());
    if (String(existingAccount?.status || "").toUpperCase() === "ACTIVE") {
      setSelectedAccountId(String(existingAccount.id));
      setSelectedFolderId("");
      setSelectedMessage(null);
      setRequestOpen(false);
      openModule?.("iletisim", { tabKey: "mail-gelen" });
      return;
    }
    setLoading(true);
    try {
      const runtime = providers.find((row) => String(row.provider || "").toUpperCase() === preset.providerType);
      if (!runtime?.adapterReady || !runtime?.configured) throw new Error("Bağlantı servisi hazırlanıyor. Lütfen daha sonra tekrar deneyin.");

      let account = accounts.find((row) => String(row.email_address || row.emailAddress || "").trim().toLowerCase() === preset.emailAddress.toLowerCase()) || null;
      let accountId = account?.id || "";
      if (!accountId) {
        const created = await requestMailAccount(preset);
        accountId = created?.accountId || "";
        if (!accountId) throw new Error("Mail hesabı kaydı oluşturulamadı.");
        if (preset.isDefaultSend || preset.isDefaultReceive) {
          await setMailAccountDefaults(accountId, {
            isDefaultSend: Boolean(preset.isDefaultSend),
            isDefaultReceive: Boolean(preset.isDefaultReceive),
          });
        }
      }

      const startOAuth = preset.providerType === "GMAIL" ? startGoogleMailOAuth : startMicrosoftMailOAuth;
      const result = await startOAuth(accountId);
      if (!result?.authorizeUrl) throw new Error("OAuth giriş adresi alınamadı.");
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail hesabı doğrudan eklenemedi."}`);
      setLoading(false);
    }
  }

  async function connectSelectedAccount() {
    if (!selectedAccountId || !selectedAccount) return;
    const provider = String(selectedAccount.provider_type || selectedAccount.providerType || "").toUpperCase();
    const startOAuth = provider === "GMAIL"
      ? startGoogleMailOAuth
      : provider === "MICROSOFT_365"
        ? startMicrosoftMailOAuth
        : null;
    if (!startOAuth) {
      setNotice("Hata: Bu posta sağlayıcısı için etkileşimli bağlantı henüz aktif değil.");
      return;
    }
    setLoading(true);
    try {
      const result = await startOAuth(selectedAccountId);
      if (!result?.authorizeUrl) throw new Error("OAuth giriş adresi alınamadı.");
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail hesabı bağlantısı başlatılamadı."}`);
      setLoading(false);
    }
  }

  function openReply() {
    if (!selectedMessage) return;
    const sender = selectedMessage.sender_email || selectedMessage.senderEmail || "";
    const subject = String(selectedMessage.subject || "").trim();
    setDraftForm({
      to: sender,
      cc: "",
      bcc: "",
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject || "(Konu yok)"}`,
      bodyText: "",
      replyToMessageId: selectedMessage.id || "",
    });
    setComposeOpen(true);
  }

  async function syncSelectedMailbox() {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const result = await syncMailAccount(selectedAccountId);
      const total = safeArray(result?.folders).reduce((sum, row) => sum + Number(row.count || 0), 0);
      setNotice(result?.partial ? `Mail senkronizasyonu kısmi tamamlandı. ${total} kayıt işlendi.` : `Mail senkronizasyonu tamamlandı. ${total} kayıt işlendi.`);
      setMailboxRefresh((value) => value + 1);
      await loadBase();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail senkronizasyonu tamamlanamadı."}`);
      setLoading(false);
    }
  }

  async function openFolder(folder) {
    if (!folder?.id || !selectedAccountId) return;
    setSelectedFolderId(String(folder.id));
    setSelectedMessage(null);
    try {
      if (String(selectedAccount?.status || "").toUpperCase() === "ACTIVE") {
        await syncMailFolder(selectedAccountId, folder.id);
      }
    } catch (error) {
      setNotice(`Klasör açıldı; sağlayıcı senkronu tamamlanamadı: ${error?.message || "Bilinmeyen hata"}`);
    } finally {
      setMailboxRefresh((value) => value + 1);
    }
  }

  async function togglePin() {
    if (!selectedMessage?.id) return;
    const next = Number(selectedMessage.is_pinned ?? selectedMessage.isPinned ?? 0) !== 1;
    setLoading(true);
    try {
      await pinMailMessage(selectedMessage.id, next);
      setSelectedMessage((current) => current ? { ...current, is_pinned: next ? 1 : 0 } : current);
      setMailboxRefresh((value) => value + 1);
      setNotice(next ? "Mail sabitlendi. Sabitlenenler bölümünde de görünecek." : "Mail sabitlemeden çıkarıldı.");
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Sabitleme değiştirilemedi."}`);
    } finally { setLoading(false); }
  }

  async function messageAction(action, values = {}) {
    if (!selectedMessage?.id) return;
    setLoading(true);
    try {
      await runMailMessageAction(selectedMessage.id, action, values);
      setNotice(action === "ARCHIVE" ? "Mail arşive taşındı." : action === "DELETE" ? "Mail silinmiş öğelere taşındı." : action === "MOVE" ? "Mail klasöre taşındı." : "Mail durumu güncellendi.");
      setSelectedMessage(null);
      setMoveTargetId("");
      setMailboxRefresh((value) => value + 1);
      await loadBase();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail işlemi tamamlanamadı."}`);
    } finally { setLoading(false); }
  }

  async function sendSelectedDraft() {
    if (!selectedMessage?.id) return;
    setLoading(true);
    try {
      const result = await sendMailDraft(selectedMessage.id);
      const providerName = providerLabel(selectedAccount?.provider_type || selectedAccount?.providerType);
      setNotice(result?.status === "PROVIDER_ACCEPTED"
        ? `${providerName} gönderim isteğini kabul etti. Bu durum teslim edildi anlamına gelmez.`
        : "Gönderim işlemi tamamlandı.");
      const rows = await listMailDrafts();
      const list = safeArray(rows).filter((row) => String(row.account_id || row.accountId) === String(selectedAccountId));
      setDrafts(list);
      setSelectedMessage(list[0] || null);
      await loadBase();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail gönderilemedi."}`);
      setLoading(false);
    }
  }

  async function runFileSearch(value) {
    setSearch(value);
    try {
      const rows = value.trim() ? await searchCommunicationFiles(value) : await listCommunicationFiles();
      setFiles(safeArray(rows));
    } catch (error) {
      setNotice(error?.message || "Dosya araması yapılamadı.");
    }
  }

  const visibleDrafts = !selectedFolderId && activeTab === "mail-taslaklar" ? drafts : [];
  const baseMessageRows = !selectedFolderId && activeTab === "mail-taslaklar" ? visibleDrafts : messages;
  const messageNeedle = messageSearch.trim().toLocaleLowerCase("tr-TR");
  const messageRows = messageNeedle
    ? baseMessageRows.filter((row) => [
        row.sender_name,
        row.sender_email,
        row.subject,
        row.body_text,
        row.bodyText,
      ].some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(messageNeedle)))
    : baseMessageRows;

  const mailViewTitle = selectedFolder?.name
    || (activeTab === "mail-sabitlenen" ? "Sabitlenenler"
      : activeTab === "mail-gonderilen" ? "Gönderilenler"
      : activeTab === "mail-taslaklar" ? "Taslaklar"
      : activeTab === "mail-yanit-bekleyen" ? "Yanıt Bekleyenler"
      : activeTab === "mail-sablonlar" ? "Şablonlar"
      : "Gelen Kutusu");

  return (
    <div className="comm-page">
      <header className="comm-header">
        <div>
          <small>KY ERP / MAIL & DOSYALAR</small>
          <h1>{isMail ? "Mail Merkezi" : "Dosya Merkezi"}</h1>
          <p><b>Aktif Firma:</b> {activeCompanyName} · Mail, firma dosyaları ve ERP ilişkileri tek çalışma alanında.</p>
        </div>
        <div className="comm-actions">
          {isMail ? <button type="button" onClick={() => setComposeOpen(true)} disabled={!selectedAccountId || loading}>+ Yeni Mail</button> : null}
          {isMail ? <button type="button" className="secondary" onClick={() => { setAdvancedAccountOpen(false); setRequestOpen(true); }}>+ Mail Hesabı</button> : null}
          <button type="button" className="secondary" onClick={loadBase} disabled={loading}>Yenile</button>
        </div>
      </header>

      {notice ? <div className={`comm-notice ${notice.startsWith("Hata:") ? "error" : ""}`}>{notice}</div> : null}

      <section className="comm-metrics" aria-label="Mail merkezi durum özeti">
        <div><span>Okunmamış</span><b>{overview?.unreadCount ?? 0}</b></div>
        <div><span>Aktif hesap</span><b>{overview?.activeAccountCount ?? 0}</b></div>
        <div><span>Onay bekleyen</span><b>{overview?.pendingAccountCount ?? 0}</b></div>
        <div><span>Firma dosyası</span><b>{files.length}</b></div>
      </section>

      {requestOpen ? (
        <div className="comm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRequestOpen(false); }}>
        <section className="comm-request-card comm-modal" role="dialog" aria-modal="true" aria-label="Mail hesabı ekleme talebi">
          <div className="comm-section-title"><div><h2>Mail Hesabı Ekle</h2><p>Outlook/Hotmail veya Gmail hesabını seçin; KY ERP sizi doğrudan sağlayıcının güvenli giriş ekranına gönderir.</p></div><button type="button" className="secondary" onClick={() => setRequestOpen(false)}>Kapat</button></div>
          {showHakanDirectAccounts ? <div className="comm-direct-mail-grid">
            {HAKAN_DIRECT_ACCOUNTS.map((preset) => {
              const runtime = providers.find((row) => String(row.provider || "").toUpperCase() === preset.providerType);
              const existing = accounts.find((row) => String(row.email_address || row.emailAddress || "").trim().toLowerCase() === preset.emailAddress.toLowerCase());
              const ready = Boolean(runtime?.adapterReady && runtime?.configured);
              const active = String(existing?.status || "").toUpperCase() === "ACTIVE";
              return <article key={preset.key} className="comm-direct-mail-card">
                <div><b>{preset.title}</b><span>{preset.emailAddress}</span><small>{providerLabel(preset.providerType)} · {preset.departmentCode === "DESEN" ? "Desen bölümü" : "Şirket ana maili"}</small></div>
                <button type="button" onClick={() => addAndConnectPreset(preset)} disabled={loading || (!active && !ready)}>{active ? "Posta Kutusunu Aç" : existing ? "Hesabı Bağla" : "Ekle & Bağla"}</button>
                <em>{active ? "Bağlı" : ready ? "Bağlantıya hazır" : "Bağlantı servisi hazırlanıyor"}</em>
              </article>;
            })}
          </div> : null}
          <button type="button" className="comm-advanced-mail-title" onClick={() => setAdvancedAccountOpen((value) => !value)}><b>+ Başka Mail Hesabı Ekle</b><span>{advancedAccountOpen ? "Gelişmiş formu kapat" : "Farklı bir Outlook / Gmail hesabı ekle"}</span></button>
          {advancedAccountOpen ? <form onSubmit={submitAccountRequest}>
            <label>Sağlayıcı<select value={requestForm.providerType} onChange={(e) => setRequestForm((v) => ({ ...v, providerType: e.target.value }))}>
              {(providers.length ? providers : [
                {provider:"MICROSOFT_365",adapterReady:true,configured:false},
                {provider:"GMAIL",adapterReady:false,configured:false},
                {provider:"JMAP",adapterReady:false,configured:false},
                {provider:"IMAP_SMTP",adapterReady:false,configured:false},
              ]).map((row) => <option key={row.provider} value={row.provider} disabled={row.adapterReady===false || row.configured===false}>{providerLabel(row.provider)}{row.adapterReady===false ? " · Yakında" : row.configured===false ? " · Hazırlanıyor" : ""}</option>)}
            </select></label>
            <label>Hesap Türü<select value={requestForm.accountType} onChange={(e) => setRequestForm((v) => ({ ...v, accountType: e.target.value }))}><option value="PERSONAL">Kişisel</option><option value="SHARED">Ortak / Shared</option><option value="DEPARTMENT">Bölüm</option></select></label>
            <label>E-posta<input type="email" required value={requestForm.emailAddress} onChange={(e) => setRequestForm((v) => ({ ...v, emailAddress: e.target.value }))} placeholder="muhasebe@firma.com"/></label>
            <label>Görünen Ad<input value={requestForm.displayName} onChange={(e) => setRequestForm((v) => ({ ...v, displayName: e.target.value }))} placeholder="Muhasebe"/></label>
            <label>Bölüm<select value={requestForm.departmentCode} onChange={(e) => setRequestForm((v) => ({ ...v, departmentCode: e.target.value }))}><option value="">Genel</option><option value="MUHASEBE">Muhasebe</option><option value="E_BELGE">e-Belge</option><option value="DESEN">Desen</option><option value="IK">İK</option><option value="YONETIM">Yönetim</option></select></label>
            <button type="submit" disabled={loading || overview?.schemaReady===false || selectedProviderRuntime?.adapterReady===false || selectedProviderRuntime?.configured===false}>Onaya Gönder</button>
            {selectedProviderRuntime && (!selectedProviderRuntime.adapterReady || !selectedProviderRuntime.configured) ? <div className="wide comm-provider-warning">Bağlantı servisi hazırlanıyor.</div> : null}
          </form> : null}
        </section>
        </div>
      ) : null}

      {composeOpen ? (
        <div className="comm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposeOpen(false); }}>
        <section className="comm-compose comm-modal comm-compose-modal" role="dialog" aria-modal="true" aria-label="Yeni mail taslağı">
          <div className="comm-section-title"><div><h2>Yeni Mail</h2><p>Maili doğrudan gönderebilir veya taslak olarak kaydedebilirsiniz. Otomatik gönderim yapılmaz.</p></div><button type="button" className="secondary" onClick={() => setComposeOpen(false)}>Kapat</button></div>
          <form onSubmit={submitDraft}>
            <label>Kimden<select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>{accounts.map((row) => <option key={row.id} value={row.id}>{row.display_name || row.displayName || row.email_address || row.emailAddress}</option>)}</select></label>
            <label>Kime<input value={draftForm.to} onChange={(e) => setDraftForm((v) => ({ ...v, to: e.target.value }))} placeholder="mail@firma.com"/></label>
            <label>CC<input value={draftForm.cc} onChange={(e) => setDraftForm((v) => ({ ...v, cc: e.target.value }))} placeholder="opsiyonel"/></label>
            <label>BCC<input value={draftForm.bcc} onChange={(e) => setDraftForm((v) => ({ ...v, bcc: e.target.value }))} placeholder="opsiyonel"/></label>
            <label className="wide">Konu<input value={draftForm.subject} onChange={(e) => setDraftForm((v) => ({ ...v, subject: e.target.value }))}/></label>
            <label className="wide">Mesaj<textarea rows={10} value={draftForm.bodyText} onChange={(e) => setDraftForm((v) => ({ ...v, bodyText: e.target.value }))}/></label>
            <div className="wide comm-compose-actions"><button type="button" onClick={() => saveDraft(true)} disabled={loading || String(selectedAccount?.status || "").toUpperCase() !== "ACTIVE"}>Gönder</button><button type="submit" className="secondary" disabled={loading}>Taslağı Kaydet</button><span>Gönderim yalnız sizin açık işleminizle yapılır.</span></div>
          </form>
        </section>
        </div>
      ) : null}

      {isMail ? (
        <section ref={mailLayoutRef} className="comm-mail-layout comm-mail-layout-resizable" style={{ "--comm-mailbox-width": `${paneWidths.mailbox}px`, "--comm-list-width": `${paneWidths.list}px` }}>
          <aside className="comm-mailboxes">
            <div className="comm-pane-title"><b>Posta Kutuları</b><small>{accounts.length} hesap</small></div>
            {accounts.length ? accounts.map((row) => (
              <button type="button" key={row.id} className={String(row.id) === String(selectedAccountId) ? "active" : ""} onClick={() => setSelectedAccountId(String(row.id))}>
                <b>{row.display_name || row.displayName || row.email_address || row.emailAddress}</b>
                <span>{row.email_address || row.emailAddress}</span>
                <em>{providerLabel(row.provider_type || row.providerType)} · {statusLabel(row.status)}</em>
              </button>
            )) : <div className="comm-empty">Henüz atanmış posta kutusu yok.<br/>“+ Mail Hesabı” ile talep oluşturabilirsiniz.</div>}
            {selectedAccount ? <div className="comm-account-tools">
              <span><b>{statusLabel(selectedAccount.status)}</b> · {providerLabel(selectedAccount.provider_type || selectedAccount.providerType)}</span>
              {["MICROSOFT_365", "GMAIL"].includes(String(selectedAccount.provider_type || selectedAccount.providerType).toUpperCase()) && String(selectedAccount.status || "").toUpperCase() !== "ACTIVE"
                ? <button type="button" onClick={connectSelectedAccount} disabled={loading}>{String(selectedAccount.provider_type || selectedAccount.providerType).toUpperCase() === "GMAIL" ? "Google Hesabını Bağla" : "Microsoft Hesabını Bağla"}</button>
                : null}
              {String(selectedAccount.status || "").toUpperCase() === "ACTIVE"
                ? <button type="button" className="secondary" onClick={syncSelectedMailbox} disabled={loading}>Postayı Senkronize Et</button>
                : null}
            </div> : null}
            {selectedAccount ? <div className="comm-folder-tree">
              <div className="comm-folder-heading"><b>Klasörler</b><small>{folders.length}</small></div>
              {folderRows.length ? folderRows.map((folder) => (
                <button type="button" key={folder.id} className={String(folder.id) === String(selectedFolderId) ? "active" : ""} style={{ paddingLeft: `${12 + Math.min(4, folder._depth || 0) * 14}px` }} onClick={() => openFolder(folder)}>
                  <span>{String(folder.folder_type || folder.folderType || "").toUpperCase() === "INBOX" ? "📥" : String(folder.folder_type || folder.folderType || "").toUpperCase() === "SENT" ? "➤" : String(folder.folder_type || folder.folderType || "").toUpperCase() === "ARCHIVE" ? "▣" : String(folder.folder_type || folder.folderType || "").toUpperCase() === "TRASH" ? "🗑" : "▱"} {folder.name || "Klasör"}</span>
                  <em>{Number(folder.unread_count || folder.unreadCount || 0) > 0 ? folder.unread_count || folder.unreadCount : ""}</em>
                </button>
              )) : <div className="comm-empty compact">Klasörler ilk senkronizasyondan sonra burada görünür.</div>}
            </div> : null}
          </aside>
          <div className="comm-pane-resizer" role="separator" aria-orientation="vertical" aria-label="Posta kutuları genişliğini ayarla" onPointerDown={(event) => beginPaneResize("mailbox", event)} />

          <main className="comm-message-list">
            <div className="comm-pane-title comm-list-toolbar"><b>{mailViewTitle}</b><div><input className="comm-message-search" type="search" value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} placeholder="Mail ara"/><small>{messageRows.length} kayıt</small></div></div>
            {activeTab === "mail-sablonlar" && !selectedFolderId ? (
              <div className="comm-empty large"><b>Kurumsal Mail Şablonları</b><span>Mevcut muhasebe şablonları bu merkeze taşınırken tek canonical şablon kaynağı korunacak.</span><button type="button" onClick={() => openModule?.("muhasebe", { tabKey: "mail-sablonlari" })}>Mevcut Şablonları Aç</button></div>
            ) : messageRows.length ? messageRows.map((row) => (
              <button type="button" key={row.id} className={`${selectedMessage?.id === row.id ? "active " : ""}${Number(row.is_read ?? row.isRead ?? 1) === 0 ? "unread " : ""}${Number(row.is_pinned ?? row.isPinned ?? 0) === 1 ? "pinned" : ""}`} onClick={() => setSelectedMessage(row)} onContextMenu={(event) => openMessageContextMenu(event, row)}>
                <div><b>{Number(row.is_pinned ?? row.isPinned ?? 0) === 1 ? "📌 " : ""}{row.sender_name || row.sender_email || row.subject || "Taslak"}</b><span>{dateText(row.received_at || row.sent_at || row.updated_at)}</span></div>
                <strong>{row.subject || "(Konu yok)"}{Number(row.is_flagged ?? row.isFlagged ?? 0) === 1 ? "  ⚑" : ""}</strong>
                <p>{row.body_text || row.bodyText || (row.body_html || row.bodyHtml ? "HTML mail içeriği" : "İçerik önizlemesi yok.")}{Number(row.has_attachments ?? row.hasAttachments ?? 0) === 1 ? " · 📎 Ek var" : ""}</p>
              </button>
            )) : <div className="comm-empty large">{selectedAccount ? "Bu görünümde mail kaydı yok." : "Önce bir posta kutusu seçin veya hesap talebi oluşturun."}</div>}
          </main>
          <div className="comm-pane-resizer" role="separator" aria-orientation="vertical" aria-label="Mail listesi genişliğini ayarla" onPointerDown={(event) => beginPaneResize("list", event)} />

          <aside className="comm-preview">
            <div className="comm-pane-title"><b>Mail Detayı</b><small>ERP Bağlamı</small></div>
            {selectedMessage && activeTab === "mail-taslaklar" && !selectedFolderId ? <>
              <h2>{selectedMessage.subject || "(Konu yok)"}</h2>
              <p><b>Durum:</b> {selectedMessage.status || "DRAFT"}</p>
              <div className="comm-body">{selectedMessage.body_text || selectedMessage.bodyText || "Taslak içeriği yok."}</div>
              <div className="comm-context-box"><b>Gönderim Güvenliği</b><span>Gönderim yalnız kullanıcı düğmeye bastığında yapılır. Provider kabulü teslimat sayılmaz.</span><button type="button" onClick={sendSelectedDraft} disabled={loading || String(selectedAccount?.status || "").toUpperCase() !== "ACTIVE"}>Gönder</button></div>
            </> : selectedMessage ? <>
              <h2>{selectedMessage.subject || "(Konu yok)"}</h2>
              <p><b>Gönderen:</b> {selectedMessage.sender_name || selectedMessage.sender_email || "—"}</p>
              <p><b>Tarih:</b> {dateText(selectedMessage.received_at || selectedMessage.sent_at)}</p>
              <div className="comm-preview-actions comm-preview-actions-wrap">
                {activeTab !== "mail-gonderilen" ? <button type="button" onClick={openReply}>Yanıtla</button> : null}
                <button type="button" className={Number(selectedMessage.is_pinned ?? selectedMessage.isPinned ?? 0) === 1 ? "pin-active" : "secondary"} onClick={togglePin}>{Number(selectedMessage.is_pinned ?? selectedMessage.isPinned ?? 0) === 1 ? "📌 Sabitten Çıkar" : "📌 Sabitle"}</button>
                <button type="button" className="secondary" onClick={() => messageAction(Number(selectedMessage.is_read ?? selectedMessage.isRead ?? 1) === 1 ? "MARK_UNREAD" : "MARK_READ")}>{Number(selectedMessage.is_read ?? selectedMessage.isRead ?? 1) === 1 ? "Okunmadı Yap" : "Okundu Yap"}</button>
                <button type="button" className="secondary" onClick={() => messageAction(Number(selectedMessage.is_flagged ?? selectedMessage.isFlagged ?? 0) === 1 ? "UNFLAG" : "FLAG")}>{Number(selectedMessage.is_flagged ?? selectedMessage.isFlagged ?? 0) === 1 ? "Bayrağı Kaldır" : "⚑ Bayrak"}</button>
                <button type="button" className="secondary" onClick={() => messageAction("ARCHIVE")}>Arşivle</button>
                <button type="button" className="danger-lite" onClick={() => messageAction("DELETE")}>Sil</button>
              </div>
              <div className="comm-move-row"><select value={moveTargetId} onChange={(event) => setMoveTargetId(event.target.value)}><option value="">Klasöre taşı…</option>{folderRows.filter((folder) => String(folder.id) !== String(selectedMessage.folder_id || selectedMessage.folderId || "")).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><button type="button" className="secondary" disabled={!moveTargetId} onClick={() => messageAction("MOVE", { folderId: moveTargetId })}>Taşı</button></div>
              {attachments.length ? <div className="comm-attachments"><div><b>Ekler</b><small>{attachments.length} dosya · tıklayınca önizleme</small></div>{attachments.map((attachment) => <div className="comm-attachment-row" key={attachment.id}><button type="button" className="comm-attachment-open" onClick={() => openAttachmentPreview(attachment)} disabled={previewLoading}><span>📎 {attachmentName(attachment)}</span><em>{Number(attachment.size_bytes || attachment.sizeBytes || 0) > 0 ? `${Math.max(1, Math.round(Number(attachment.size_bytes || attachment.sizeBytes) / 1024))} KB` : attachmentPreviewKind(attachment) === "unsupported" ? "Dosya" : "Önizle"}</em></button><button type="button" className="comm-attachment-download" title="İndir" aria-label={`${attachmentName(attachment)} indir`} onClick={() => downloadMailAttachment(selectedMessage.id, attachment.id, attachmentName(attachment))}>⇩</button></div>)}</div> : null}
              {selectedMessage.body_html || selectedMessage.bodyHtml ? <iframe className="comm-html-body" title="Mail içeriği" sandbox="" srcDoc={selectedMessage.body_html || selectedMessage.bodyHtml}/> : <div className="comm-body">{selectedMessage.body_text || selectedMessage.bodyText || "Mail gövdesi henüz senkronize edilmemiş."}</div>}
              <div className="comm-context-box"><b>KY ERP Bağlamı</b><span>Bu mail için kayıtlı ERP ilişkisi varsa firma / cari / model / desen / fatura bağlamında kullanılır; ilişki yoksa sistem tahmin üretmez.</span><span>File Hub ekleri ayrı kopya üretmeden aynı dosya kimliğiyle ilişkilendirilir.</span></div>
            </> : <div className="comm-empty large">Bir mail seçildiğinde içerik ve KY ERP ilişkileri burada açılır.</div>}
          </aside>
        </section>
      ) : (
        <section className="comm-files">
          <div className="comm-files-toolbar">
            <div><b>Firma Dosyaları</b><span>Google Drive, OneDrive, SharePoint, Yerel ve NAS tek File Hub görünümünde.</span></div>
            <input type="search" value={search} onChange={(e) => runFileSearch(e.target.value)} placeholder="Dosya, model veya klasör ara"/>
          </div>
          <div className="comm-file-table">
            <div className="head"><span>Dosya</span><span>Kaynak</span><span>Konum</span><span>Durum</span><span>Güncelleme</span></div>
            {files.length ? files.map((row) => <div className="row" key={row.id}>
              <span><b>{row.file_name || row.fileName}</b><small>{row.extension || ""}</small></span>
              <span>{row.provider_type || row.providerType || row.connection_name || "File Hub"}</span>
              <span title={row.relative_path || row.relativePath || ""}>{row.relative_path || row.relativePath || "—"}</span>
              <span>{row.status || "AVAILABLE"}</span>
              <span>{dateText(row.updated_at || row.updatedAt)}</span>
            </div>) : <div className="comm-empty large">Bu firmada indekslenmiş dosya bulunamadı.</div>}
          </div>
          <footer className="comm-files-footer">
            <span>Günlük kullanım burada; servis ekleme, OAuth, ana klasör ve bölüm atamaları Bağlantılar & Depolama bölümünde kalır.</span>
            <button type="button" className="secondary" onClick={() => openModule?.("depolama", { tabKey: "depolama-kaynaklar" })}>Bağlantılar & Depolama</button>
          </footer>
        </section>
      )}

      {contextMenu ? <div className="comm-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()} role="menu">
        {activeTab !== "mail-gonderilen" ? <button type="button" onClick={() => runContextAction("REPLY")}>↩ Yanıtla</button> : null}
        <button type="button" onClick={() => runContextAction("PIN")}>{Number(contextMenu.row?.is_pinned ?? contextMenu.row?.isPinned ?? 0) === 1 ? "📌 Sabitten Çıkar" : "📌 Sabitle"}</button>
        <button type="button" onClick={() => runContextAction("READ_TOGGLE")}>{Number(contextMenu.row?.is_read ?? contextMenu.row?.isRead ?? 1) === 1 ? "○ Okunmadı Yap" : "● Okundu Yap"}</button>
        <button type="button" onClick={() => runContextAction("FLAG_TOGGLE")}>{Number(contextMenu.row?.is_flagged ?? contextMenu.row?.isFlagged ?? 0) === 1 ? "⚑ Bayrağı Kaldır" : "⚑ Bayrak Ekle"}</button>
        <div className="comm-context-separator" />
        <button type="button" onClick={() => runContextAction("ARCHIVE")}>▣ Arşivle</button>
        <button type="button" className="danger" onClick={() => runContextAction("DELETE")}>🗑 Sil</button>
      </div> : null}

      {attachmentPreview ? <div className="comm-attachment-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAttachmentPreview(); }}>
        <section className="comm-attachment-preview" role="dialog" aria-modal="true" aria-label={`${attachmentPreview.name} önizleme`}>
          <header><div><b>{attachmentPreview.name}</b><span>{attachmentPreview.kind === "image" ? "Görsel önizleme" : attachmentPreview.kind === "pdf" ? "PDF önizleme" : attachmentPreview.kind === "text" ? "Metin önizleme" : "Önizleme desteklenmiyor"}</span></div><div><button type="button" className="secondary" onClick={() => downloadMailAttachment(selectedMessage.id, attachmentPreview.attachment.id, attachmentPreview.name)}>İndir</button><button type="button" className="secondary" onClick={closeAttachmentPreview}>Kapat</button></div></header>
          <div className="comm-attachment-preview-body">
            {attachmentPreview.kind === "image" && attachmentPreview.url ? <img src={attachmentPreview.url} alt={attachmentPreview.name}/> : null}
            {attachmentPreview.kind === "pdf" && attachmentPreview.url ? <iframe src={attachmentPreview.url} title={attachmentPreview.name}/> : null}
            {attachmentPreview.kind === "text" ? <pre>{attachmentPreview.text}</pre> : null}
            {attachmentPreview.kind === "unsupported" ? <div className="comm-empty large"><b>Bu dosya türü tarayıcı içinde güvenli önizlenemiyor.</b><span>Dosyayı indirmek için sağ üstteki İndir düğmesini kullanın.</span></div> : null}
          </div>
        </section>
      </div> : null}
    </div>
  );
}
