import { probeIsnetPublicLogin } from "./isnet-portal-public-health.ts";

/** Hard-coded, public, no-credential egress diagnostics only.
 * No user-supplied hostname, redirect following, cookies, passwords or body.
 * Do not use as an e-invoice API login or SSRF-capable proxy.
 */
const TARGETS = Object.freeze({
  nettefatura: "https://nettefatura.isnet.net.tr/Account/Login",
  efatura: "https://efatura.isnet.net.tr/Account/Login",
  einvoiceapi: "https://einvoiceapi.isnet.net.tr/Help",
});
type Result = { reachable: boolean; status: string; httpStatus: number | null; durationMs: number };
async function loginProbe(fetcher: typeof fetch, url: string, timeoutMs: number): Promise<Result> {
  const start = Date.now();
  const result = await probeIsnetPublicLogin(fetcher, url, timeoutMs);
  return { ...result, durationMs: Date.now() - start };
}
async function apiProbe(fetcher: typeof fetch): Promise<Result> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(TARGETS.einvoiceapi, {
      method: "GET", redirect: "manual",
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 KY-ERP-IsNet-Cloud/4.0" },
      signal: controller.signal,
    });
    const status = response.status >= 300 && response.status < 400 ? "REDIRECT"
      : response.ok ? "READY" : "HTTP_ERROR";
    return { reachable: response.ok, status, httpStatus: response.status, durationMs: Date.now() - start };
  } catch(error: any) {
    const timeoutHit = controller.signal.aborted || ["AbortError","TimeoutError"].includes(String(error?.name));
    return { reachable: false, status: timeoutHit ? "TIMEOUT" : "NETWORK_ERROR", httpStatus: null, durationMs: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}
export async function measureIsnetWorkerEgress(fetcher: typeof fetch) {
  const [nettefatura, efatura, einvoiceapi] = await Promise.all([
    loginProbe(fetcher, TARGETS.nettefatura, 6500),
    loginProbe(fetcher, TARGETS.efatura, 5000),
    apiProbe(fetcher),
  ]);
  return { nettefatura, efatura, einvoiceapi };
}
