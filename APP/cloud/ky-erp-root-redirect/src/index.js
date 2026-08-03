export default {
  async fetch(request) {
    const source = new URL(request.url);
    const target = new URL(`https://app.kyerp.net${source.pathname}${source.search}`);

    return Response.redirect(target.toString(), 308);
  },
};
