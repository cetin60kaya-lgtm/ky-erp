export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const legacySecurityPath = incoming.pathname === '/security' || incoming.pathname.startsWith('/security/');
    if (['GET', 'HEAD'].includes(request.method) && (incoming.pathname === '/' || legacySecurityPath)) {
      incoming.pathname = '/ky-guvenlik/';
      return Response.redirect(incoming.toString(), 308);
    }
    const upstream = new URL(incoming.pathname + incoming.search, 'https://kyerp.net');
    const headers = new Headers(request.headers);
    headers.delete('host');
    const init = { method: request.method, headers, redirect: 'manual' };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
    const response = await fetch(new Request(upstream, init), { cache: 'no-store' });
    const outHeaders = new Headers(response.headers);
    outHeaders.set('Cache-Control', 'no-store, max-age=0');
    outHeaders.set('CDN-Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outHeaders });
  },
};
