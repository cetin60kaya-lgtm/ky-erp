import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (url) => readFileSync(new URL(url, import.meta.url), "utf8");

test("Muhasebe tedarikçi ekranı ikinci belge yükleme yolu açmaz; canonical e-Belge havuzuna yönlendirir", () => {
  const workspace = read("./SupplierDocumentsWorkspace.jsx");
  const page = read("../MuhasebePage.jsx");
  const api = read("../../../services/eBelgeApi.js");
  assert.doesNotMatch(workspace, /uploadEBelge/);
  assert.doesNotMatch(workspace, /\/muhasebe\/belge-havuzu/);
  assert.match(workspace, /openModule\?\.\("e-belge", \{ tabKey: "belge-havuzu" \}\)/);
  assert.match(workspace, /getEBelgePool/);
  assert.match(page, /SupplierDocumentsWorkspace[\s\S]*openModule=\{openModule\}/);
  assert.match(api, /pdfjs-dist\/build\/pdf\.mjs/);
  assert.match(api, /\/e-belge\/upload/);
});
