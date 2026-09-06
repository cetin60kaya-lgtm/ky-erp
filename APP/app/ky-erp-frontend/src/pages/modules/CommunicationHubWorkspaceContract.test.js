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
