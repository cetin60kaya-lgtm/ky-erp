const API_HOST = "api.kyerp.net";
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

function jsonResponse(status, code, message) {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message } }),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

function mayRetry(request, url) {
  const method = String(request.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  return method === "POST" && url.pathname === "/api/auth/v2/login";
}

async function proxyFetch(request, upstreamUrl) {
  const upstreamRequest = new Request(upstreamUrl.toString(), request);
  const retryRequest = upstreamRequest.clone();
  let response = await fetch(upstreamRequest);

  if (mayRetry(request, upstreamUrl) && TRANSIENT_STATUSES.has(response.status)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    response = await fetch(retryRequest);
  }

  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const upstreamUrl = new URL(request.url);
      upstreamUrl.protocol = "https:";
      upstreamUrl.hostname = API_HOST;
      upstreamUrl.port = "";

      try {
        const upstreamResponse = await proxyFetch(request, upstreamUrl);
        const headers = new Headers(upstreamResponse.headers);
        headers.set("Cache-Control", "no-store");

        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
          headers,
        });
      } catch (error) {
        console.error("KY ERP API proxy error", error);
        return jsonResponse(
          502,
          "API_PROXY_ERROR",
          "KY ERP API bağlantısı geçici olarak kurulamadı.",
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};
