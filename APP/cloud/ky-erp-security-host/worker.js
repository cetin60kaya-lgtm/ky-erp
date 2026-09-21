export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const documentPath = incoming.pathname === '/' || incoming.pathname === '/ky-guvenlik/' || incoming.pathname === '/ky-guvenlik/index.html';
    if (['GET','HEAD'].includes(request.method) && documentPath && incoming.searchParams.get('boot') !== '8') {
      incoming.pathname = '/ky-guvenlik/';
      incoming.searchParams.set('boot','8');
      return Response.redirect(incoming.toString(), 307);
    }
    const upstream = new URL(incoming.pathname + incoming.search, 'https://kyerp.net');
    if (incoming.pathname === '/') upstream.pathname = '/ky-guvenlik/';
    const headers = new Headers(request.headers);
    headers.delete('host');
    const init = { method: request.method, headers, redirect: 'manual' };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
    const response = await fetch(new Request(upstream, init));
    const outHeaders = new Headers(response.headers);
    outHeaders.set('Cache-Control', 'no-store, max-age=0');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outHeaders });
  },
};
