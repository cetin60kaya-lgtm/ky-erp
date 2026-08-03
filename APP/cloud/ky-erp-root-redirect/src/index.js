const RELEASE = "2026-08-03T07:16:00+03:00";

export default {
  async fetch(request) {
    const source = new URL(request.url);
    const target = new URL(`https://app.kyerp.net${source.pathname}${source.search}`);
    const response = Response.redirect(target.toString(), 308);
    response.headers.set("X-KYERP-Redirect-Release", RELEASE);
    return response;
  },
};
