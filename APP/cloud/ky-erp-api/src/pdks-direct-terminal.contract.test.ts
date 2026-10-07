import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const api = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontendRoot = resolve(here, "../../../app/ky-erp-frontend/src");
const frontend = (name: string) => readFileSync(resolve(frontendRoot, name), "utf8");

test("PDKS direct terminal is read-only and PC-independent", () => {
  const source = api("pdks-direct-terminal.ts");
  assert.match(source, /cloudflare:sockets/);
  assert.match(source, /DIRECT_ETHERNET/);
  assert.match(source, /pcIndependent: true/);
  assert.match(source, /direct-terminal\/status/);
  assert.doesNotMatch(source, /EmptyGeneralLogData|DeleteEnrollData|SetDeviceTime|clearlogs|deleteuser/i);
});

test("PDKS web and mobile expose direct terminal state", () => {
  const service = frontend("services/pdksApi.js");
  const desktop = frontend("pages/pdks/PdksLiveHome.jsx");
  const mobile = frontend("mobile/MobilePDKS.jsx");
  const router = frontend("mobile/MobileApp.jsx");
  assert.match(service, /getPdksDirectTerminalStatus/);
  assert.match(desktop, /PC bağımsız Ethernet bağlantısı/);
  assert.match(mobile, /Kart cihazı doğrudan bağlı/);
  assert.match(router, /MobilePDKS/);
  assert.match(router, /\/mobile\/pdks/);
});
