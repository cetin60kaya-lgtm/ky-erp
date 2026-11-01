import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FILE_TABS, fileName, filePreviewType, fileScope, fileSize, fileViewTitle,
  recentFileIds, recordRecentFile, visibleCommunicationFiles,
} from "./communicationFiles.js";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
test("File Hub daily tabs are separate from storage administration", () => {
  assert.equal(FILE_TABS.size, 3);
  assert.equal(fileScope("drive-firma-dosyalari"), "related");
  assert.equal(fileScope("drive-dosyalar"), "all");
  assert.match(fileViewTitle("drive-son-kullanilanlar"), /Son Açılan/);
  const page = read("./CommunicationHubPage.jsx");
  const files = read("./CommunicationFilesWorkspace.jsx");
  assert.match(page, /<CommunicationFilesWorkspace activeTab=/);
  assert.match(page, /tabKey: "depolama-mail"/);
  assert.doesNotMatch(page, /requestMailAccount/);
  assert.match(files, /listCommunicationFiles/);
  assert.doesNotMatch(files, /cloud\/authorize|\/file-hub\/bindings/);
});
test("File Hub source files retain their IDs and their types are recognized", () => {
  assert.equal(fileName({ file_name: "AKS.psd" }), "AKS.psd");
  assert.equal(filePreviewType({ file_name: "desen.pdf" }), "pdf");
  assert.equal(filePreviewType({ file_name: "görsel.jpg" }), "image");
  assert.equal(filePreviewType({ file_name: "model.psb" }), "download");
  assert.equal(fileSize(1024 * 1024), "1.0 MB");
});
test("recent files are per-context and do not duplicate records", () => {
  const map = new Map();
  const storage = { getItem: (key) => map.get(key), setItem: (key, value) => map.set(key, value) };
  const key = "test-tenant:user";
  assert.deepEqual(recordRecentFile(storage, key, "a"), ["a"]);
  assert.deepEqual(recordRecentFile(storage, key, "b"), ["b", "a"]);
  assert.deepEqual(recordRecentFile(storage, key, "a"), ["a", "b"]);
  assert.deepEqual(recentFileIds(storage, key), ["a", "b"]);
  assert.deepEqual(visibleCommunicationFiles([{id:"a"},{id:"b"},{id:"c"}], "drive-son-kullanilanlar", ["b","a"]), [{id:"b"},{id:"a"}]);
  assert.deepEqual(visibleCommunicationFiles([{id:"a"}], "drive-firma-dosyalari", []), [{id:"a"}]);
});
test("draft attachments are real File Hub refs and API enforces tenant/module permission", () => {
  const page = read("./CommunicationHubPage.jsx");
  const api = read("../../services/mailApi.js");
  assert.match(page, /attachmentRefs: draftFiles\.map/);
  assert.match(page, /current\.length >= 10/);
  assert.match(page, /25 \* 1024 \* 1024/);
  assert.match(api, /\/mail\/files\/\$\{encodeURIComponent\(assetId\)\}\/content/);
  const worker = read("../../../../../cloud/ky-erp-api/src/mail-communication-core.ts");
  assert.match(worker, /app\.get\("\/api\/mail\/files\/:id\/content"/);
  assert.match(worker, /fileEntityTypesForUser\(current\)/);
  assert.match(worker, /X-Content-Type-Options/);
  assert.match(worker, /scope"\)\)=== "RELATED"|scope"\)\)==="RELATED"/);
});
