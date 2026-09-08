import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./CommunicationHubPage.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./CommunicationHubPage.css", import.meta.url), "utf8");
const api = readFileSync(new URL("../../services/mailApi.js", import.meta.url), "utf8");

test("mail workspace has resizable Outlook-style panes", () => {
  assert.match(page, /comm-mail-layout-resizable/);
  assert.match(page, /beginPaneResize/);
  assert.match(page, /comm-pane-resizer/);
  assert.match(page, /kyerp\.mailPaneWidths/);
  assert.match(css, /--comm-mailbox-width/);
  assert.match(css, /cursor:col-resize/);
});

test("mail attachments open safe preview before download", () => {
  assert.match(api, /getMailAttachmentBlob/);
  assert.match(page, /attachmentPreviewKind/);
  assert.match(page, /openAttachmentPreview/);
  assert.match(page, /Görsel önizleme/);
  assert.match(page, /PDF önizleme/);
  assert.match(page, /Metin önizleme/);
  assert.match(page, /png/);
  assert.match(page, /jpeg/);
  assert.match(page, /webp/);
  assert.match(page, /application\/pdf/);
  assert.match(css, /comm-attachment-preview-backdrop/);
});

test("mail rows expose Outlook-style context actions", () => {
  assert.match(page, /onContextMenu/);
  assert.match(page, /comm-context-menu/);
  assert.match(page, /Yanıtla/);
  assert.match(page, /Sabitle/);
  assert.match(page, /Okunmadı Yap/);
  assert.match(page, /Bayrak Ekle/);
  assert.match(page, /Arşivle/);
  assert.match(page, /Sil/);
  assert.match(css, /comm-context-menu/);
});


test("opening a mail marks it read and destructive actions remove it from current view", () => {
  assert.match(page, /async function selectMessage/);
  assert.match(page, /runMailMessageAction\(messageId, "MARK_READ"/);
  assert.match(page, /applyMessageActionLocally/);
  assert.match(page, /current\.filter\(\(item\) => item\.id !== messageId\)/);
  assert.match(page, /defaultInboxFolderId/);
  assert.match(page, /folderId: defaultInboxFolderId/);
});

test("visible message rows render all image attachments lazily and cid images hydrate in HTML", () => {
  assert.match(page, /function MailMessageMedia/);
  assert.match(page, /IntersectionObserver/);
  assert.match(page, /listMailAttachments\(message\.id\)/);
  assert.match(page, /getMailAttachmentBlob\(message\.id, attachment\.id\)/);
  assert.match(page, /hydrateInlineImages/);
  assert.match(page, /content_id/);
  assert.match(page, /srcDoc=\{renderedHtml/);
  assert.match(css, /comm-message-media/);
});


test("the detail pane also marks the initially opened unread mail as read", () => {
  assert.match(page, /selectedMessage\?\.id/);
  assert.match(page, /runMailMessageAction\(messageId, "MARK_READ", \{\}\)\.catch/);
  assert.match(page, /unreadCount: Math\.max\(0/);
});


test("partial Gmail sync is shown as a usable warning and refreshes successful records", () => {
  assert.match(page, /result\?\.partial/);
  assert.match(page, /Mail senkronizasyonu tamamlandı/);
  assert.match(page, /MAIL_SYNC_PARTIAL/);
  assert.match(page, /kalanlar sonraki senkronizasyonda tekrar denenecek/);
  assert.match(page, /syncMailFolder/);
});


test("incoming view waits for the canonical INBOX and hydrated HTML is keyed to the selected mail", () => {
  assert.match(page, /activeTab === "mail-gelen" && !defaultInboxFolderId/);
  assert.match(page, /setSelectedMessage\(null\)/);
  assert.match(page, /renderedHtmlMessageId/);
  assert.match(page, /renderedHtmlMessageId === String\(selectedMessage\.id\)/);
});


test("attachments expose explicit preview controls and download-all", () => {
  assert.match(page, /downloadAllAttachments/);
  assert.match(page, /Tümünü İndir/);
  assert.match(page, /comm-attachment-preview-btn/);
  assert.match(page, /attachmentPreviewKind/);
  assert.match(page, /kind === "image"/);
  assert.match(page, /kind === "pdf"/);
  assert.match(page, /png/);
  assert.match(page, /jpg/);
  assert.match(page, /jpeg/);
  assert.match(css, /comm-download-all/);
  assert.match(css, /comm-attachment-preview-btn/);
});


test("mail attachment download-all is a single zip and external OneDrive links can escape safely", () => {
  assert.match(page, /function zipStore/);
  assert.match(page, /application\/zip/);
  assert.match(page, /Tümünü İndir/);
  assert.match(page, /mailHtmlWithExternalLinks/);
  assert.match(page, /base\.target = "_blank"/);
  assert.match(page, /allow-popups allow-popups-to-escape-sandbox allow-downloads/);
  assert.match(page, /referrerPolicy="no-referrer"/);
});

test("mail preview supports browser-native audio and video in addition to image pdf and text", () => {
  assert.match(page, /return "audio"/);
  assert.match(page, /return "video"/);
  assert.match(page, /<audio controls/);
  assert.match(page, /<video controls/);
  assert.match(css, /comm-attachment-preview-body audio/);
  assert.match(css, /comm-attachment-preview-body video/);
});


test("mail regex escape helper stays syntactically intact", () => {
  assert.match(page, /function regexEscape\(value\)/);
  assert.match(page, /replace\(\/\[\.\*\+\?\^\$\{\}\(\)\|\[\\\]\\\\\]\/g, "\\\\$&"\)/);
  assert.doesNotMatch(page, /\\function regexEscape/);
});


test("Gmail mailbox refreshes silently without page reload and keeps folder UX Gmail-like", () => {
  assert.match(page, /window\.setInterval\(run, 20_000\)/);
  assert.match(page, /visibilitychange/);
  assert.match(page, /syncMailFolder\(selectedAccountId, folderId, \{ quick: true \}\)/);
  assert.match(page, /defaultSentFolderId/);
  assert.match(page, /folderDisplayName/);
  assert.match(page, /Gelen Kutusu/);
  assert.match(page, /Gönderilmiş Postalar/);
  assert.match(page, /Çöp Kutusu/);
  assert.match(page, /Kategoriler/);
  assert.match(page, /Etiketler/);
  assert.match(css, /comm-folder-group/);
  assert.match(css, /comm-folder-subheading/);
});


test("trash and spam are visually excluded from unread badges and unsafe delete controls", () => {
  assert.match(page, /selectedFolderIsTrash/);
  assert.match(page, /selectedFolderIsJunk/);
  assert.match(page, /selectedFolderCountsUnread/);
  assert.match(page, /!selectedFolderIsTrash && !selectedFolderIsJunk/);
  assert.match(page, /\["TRASH","JUNK"\]\.includes\(folderType\(folder\)\)/);
  assert.match(page, /!selectedFolderIsTrash \? <button type="button" className="danger-lite"/);
  assert.match(page, /onClick=\{\(\) => messageAction\("DELETE"\)\}>Sil<\/button>/);
});


test("unread UX is inbox-scoped, immediate and visually explicit", () => {
  assert.match(page, /selectedInboxUnreadCount/);
  assert.match(page, /activeUnreadFolderId/);
  assert.match(page, /adjustInboxUnreadCount/);
  assert.match(page, /selectedFolderCountsUnread = \(!selectedFolderId && activeTab === "mail-gelen"\)/);
  assert.match(page, /provider === "UNREAD"\) return "●"/);
  assert.match(page, /comm-unread-metric/);
  assert.match(page, /aria-label=\{\`\$\{Number\(row\.is_read/);
  assert.match(css, /comm-message-list>button\.unread::before/);
  assert.match(css, /comm-unread-metric>span>i/);
  assert.match(css, /comm-folder-group>button em:not\(:empty\)/);
});

test("mailbox refresh no longer auto-opens the first message", () => {
  assert.match(page, /setSelectedMessage\(\(current\) => list\.find\(\(row\) => row\.id === current\?\.id\) \|\| null\)/);
});
