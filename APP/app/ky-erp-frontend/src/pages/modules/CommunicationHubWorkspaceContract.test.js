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
