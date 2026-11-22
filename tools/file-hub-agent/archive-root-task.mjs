import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Executed only by a Windows scheduled task: interactive current user,
// least privilege, no automatic trigger. All IPC stays in that user's
// LocalAppData directory and is deleted by the desktop after completion.
// Neither this runner nor archive-root-probe may create cloud folders.
const base = path.join(process.env.LOCALAPPDATA || "", "KY ERP", "Desktop", "ArchiveProbe");
const requestFile = path.join(base, "request.json");
const responseFile = path.join(base, "response.json");
const pendingFile = path.join(base, "response.pending");

function publish(payload) {
  fs.mkdirSync(base, { recursive: true });
  fs.rmSync(pendingFile, { force: true });
  fs.writeFileSync(pendingFile, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
  fs.rmSync(responseFile, { force: true });
  fs.renameSync(pendingFile, responseFile);
}

let id = null;
try {
  if (!process.env.LOCALAPPDATA) throw new Error("Windows kullanıcı profili yok.");
  if (fs.statSync(requestFile).size > 131072) throw new Error("İstek çok büyük.");
  const envelope = JSON.parse(fs.readFileSync(requestFile, "utf8"));
  id = envelope?.id;
  if (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id))
    throw new Error("Geçersiz istek kimliği.");
  const req = envelope.request;
  if (req?.action !== "discover" && req?.action !== "inspect")
    throw new Error("Yalnız salt-okunur keşif ve inceleme desteklenir.");
  const result = spawnSync(process.execPath,
    [path.join(path.dirname(process.argv[1]), "archive-root-probe.mjs")],
    { input: Buffer.from(JSON.stringify(req), "utf8"), encoding: "utf8",
      windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  if (!result.stdout) throw new Error("Klasör doğrulama yanıtı boş.");
  const response = JSON.parse(result.stdout);
  publish({ id, payload: response, exitCode: result.status });
} catch (error) {
  if (id) publish({ id, error: String(error?.message || error).slice(0, 350) });
  process.exitCode = 1;
}
