/** A no-credential, read-only reachability probe for one known İşNet login form.
 * Never return HTML, anti-forgery values, Set-Cookie, Authorization or user data.
 * READY means public form reached from this Worker; it is NOT an authenticated session.
 */
export type IsnetPortalHealth = {
  reachable: boolean;
  status: "READY" | "HTTP_ERROR" | "REDIRECT" | "FORM_MISSING" | "TIMEOUT" | "NETWORK_ERROR";
  httpStatus: number | null;
};
export async function probeIsnetPublicLogin(
  fetcher: typeof fetch,
  loginUrl: string,
  timeoutMs = 6500,
): Promise<IsnetPortalHealth> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(loginUrl, {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 KY-ERP-IsNet-Cloud/4.0" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      return { reachable: false, status: "REDIRECT", httpStatus: response.status };
    }
    if (!response.ok) return { reachable: false, status: "HTTP_ERROR", httpStatus: response.status };
    const html = await response.text();
    const input = html.match(/<input\b[^>]*\bname\s*=\s*["']__RequestVerificationToken["'][^>]*>/i)?.[0] ||
      html.match(/<input\b[^>]*\bvalue\s*=\s*["'][^"']+["'][^>]*\bname\s*=\s*["']__RequestVerificationToken["'][^>]*>/i)?.[0] || "";
    const form = /<form\b/i.test(html) && /\bname\s*=\s*["'](?:VknTckn|TCKN|UserName)["']/i.test(html);
    const hasValue = /\bvalue\s*=\s*["'][^"']+["']/i.test(input);
    return { reachable: form && hasValue, status: form && hasValue ? "READY" : "FORM_MISSING", httpStatus: response.status };
  } catch (error: any) {
    const timedOut = controller.signal.aborted || ["AbortError","TimeoutError"].includes(String(error?.name));
    return { reachable: false, status: timedOut ? "TIMEOUT" : "NETWORK_ERROR", httpStatus: null };
  } finally {
    clearTimeout(timeout);
  }
}
