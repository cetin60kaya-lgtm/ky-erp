const API_HOST = "api.kyerp.net";

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const upstreamUrl = new URL(request.url);
      upstreamUrl.protocol = "https:";
      upstreamUrl.hostname = API_HOST;
      upstreamUrl.port = "";

      try {
        const upstreamRequest = new Request(upstreamUrl.toString(), request);
        const upstreamResponse = await fetch(upstreamRequest);

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
