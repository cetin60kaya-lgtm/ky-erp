const RELEASE = "2026-08-03T08:09:00+03:00";

export default {
  async fetch(request) {
    const source = new URL(request.url);
    const target = new URL(`https://app.kyerp.net${source.pathname}${source.search}`);

    return new Response(null, {
      status: 308,
      headers: {
        Location: target.toString(),
        "Cache-Control": "no-store",
        "X-KYERP-Redirect-Release": RELEASE,
      },
    });
  },
};
