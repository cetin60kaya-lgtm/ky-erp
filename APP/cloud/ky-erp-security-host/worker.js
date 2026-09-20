export default {
  async fetch(request) {
    const incoming = new URL(request.url);
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
