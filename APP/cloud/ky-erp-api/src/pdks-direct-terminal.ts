// @ts-nocheck
import { connect } from "cloudflare:sockets";
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function packet(command: number, param32 = 0, param16 = 0, machine = 1) {
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  out[0] = 0x55; out[1] = 0xaa;
  view.setUint16(2, machine, true);
  view.setUint16(4, 0x1979, true);
  view.setUint16(6, command, true);
  view.setUint32(8, param32 >>> 0, true);
  view.setUint16(12, param16, true);
  let checksum = 0;
  for (let i = 0; i < 14; i += 1) checksum = (checksum + out[i]) & 0xffff;
  view.setUint16(14, checksum, true);
  return out;
}

function shortValues(bytes: Uint8Array) {
  const values: number[] = [];
  for (let i = 0; i + 13 < bytes.length; i += 1) {
    if (bytes[i] !== 0xaa || bytes[i + 1] !== 0x55) continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset + i, 14);
    values.push(view.getUint32(8, true));
    i += 13;
  }
  return values;
}

function ascii(bytes: Uint8Array) {
  let out = "";
  for (const value of bytes) out += value >= 32 && value <= 126 ? String.fromCharCode(value) : " ";
  return out;
}

function maskedHost(host: string) {
  const parts = host.split(".");
  if (parts.length === 4) return parts.map((part, index) => index < 2 ? part : "x").join(".");
  return host ? "configured" : "";
}

async function directSnapshot(env: any) {
  const host = text(env.PDKS_TERMINAL_HOST);
  const port = Number(env.PDKS_TERMINAL_PORT || 0);
  const machine = Number(env.PDKS_TERMINAL_MACHINE || 1);
  if (!host || !port) return { configured: false, reachable: false, source: "DIRECT_ETHERNET" };

  const started = Date.now();
  const socket = connect({ hostname: host, port });
  const timeout = sleep(2200).then(() => { throw new Error("PDKS_DIRECT_TIMEOUT"); });
  await Promise.race([socket.opened, timeout]);

  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let stop = false;
  const readTask = (async () => {
    try {
      while (!stop && total < 8192) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value?.length) {
          const copy = new Uint8Array(value);
          chunks.push(copy);
          total += copy.length;
        }
      }
    } catch {}
  })();

  const commands = [
    packet(0x0052, 0, 0, machine),
    packet(0x010b, 0, 0, machine),
    packet(0x0108, 0, 2, machine),
    packet(0x0108, 0, 6, machine),
    packet(0x0108, 0, 7, machine),
    packet(0x0113, 0, 0, machine),
    packet(0x0116, 0, 0, machine),
  ];

  for (const command of commands) {
    await writer.write(command);
    await sleep(110);
  }
  await sleep(380);
  stop = true;
  try { socket.close(); } catch {}
  await Promise.race([readTask, sleep(250)]);
  try { writer.releaseLock(); } catch {}
  try { reader.releaseLock(); } catch {}

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const values = shortValues(bytes);
  const rawText = ascii(bytes);
  const serial = rawText.match(/SN:[0-9A-Z_-]+/i)?.[0] || "";
  const model = rawText.match(/(?:^|\s)(A3)(?:\s|$)/i)?.[1]?.toUpperCase() || "";

  // Sıra: enable, init, users, new logs, cards, serial, product.
  // Kısa cevaplar protokolde sabit 14 bayttır; kimlik cevapları ayrıca veri paketi taşır.
  const users = Number(values[2] ?? 0);
  const pendingLogs = Number(values[3] ?? 0);
  const cards = Number(values[4] ?? 0);

  return {
    configured: true,
    reachable: true,
    source: "DIRECT_ETHERNET",
    pcIndependent: true,
    host: maskedHost(host),
    port,
    machine,
    model,
    serial,
    users,
    cards,
    pendingLogs,
    latencyMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
  };
}

export function registerPdksDirectTerminalRoutes(app: Hono<AppEnv>) {
  app.get("/api/ik/personnel-control/direct-terminal/status", async (c: Context<AppEnv>) => {
    const user = await getAuthenticatedUser(c) as Row | null;
    if (!user) return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Oturum doğrulanamadı." } }, 401);
    try {
      const data = await directSnapshot(c.env);
      return c.json({ ok: true, data }, 200);
    } catch (cause) {
      return c.json({
        ok: true,
        data: {
          configured: true,
          reachable: false,
          source: "DIRECT_ETHERNET",
          pcIndependent: true,
          error: cause instanceof Error ? cause.message : String(cause),
          checkedAt: new Date().toISOString(),
        },
      }, 200);
    }
  });
}
