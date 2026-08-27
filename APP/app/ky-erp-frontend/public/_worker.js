const API_HOST = "api.kyerp.net";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const upstreamUrl = new URL(request.url);
      upstreamUrl.protocol = "https:";
      upstreamUrl.hostname = API_HOST;
      upstreamUrl.port = "";

      const upstreamRequest = new Request(upstreamUrl.toString(), request);
      const upstreamResponse = await fetch(upstreamRequest);

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: upstreamResponse.headers,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
