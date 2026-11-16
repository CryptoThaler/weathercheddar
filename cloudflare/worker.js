// Path alias: /weathercheddar/* -> original app at /weather-cheddar/* (Worker
// "weather-cheddar-path-proxy", reached through the LEGACY service binding).
// Responses are rewritten so every link, <base href>, fetch URL, JSON URL and redirect
// points at /weathercheddar, keeping visitors on the new address.
const NEW = '/weathercheddar';
const OLD = '/weather-cheddar';
// "/weather-cheddar" as a path segment only; never "/weather-cheddar-header.png" etc.
const PREFIX = /\/weather-cheddar(?=[/"'`?#\s)<>,;&]|$)/g;
const TEXTUAL = /^(text\/|application\/(json|javascript|x-javascript|ecmascript|ld\+json|manifest\+json|xml)|image\/svg\+xml)/i;

export const rewritePrefix = (s) => s.replace(PREFIX, NEW);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === NEW) return Response.redirect(`${url.origin}${NEW}/${url.search}`, 301);
    if (!url.pathname.startsWith(`${NEW}/`)) return new Response('Not found', { status: 404 });

    const upstream = new URL(request.url);
    upstream.pathname = OLD + url.pathname.slice(NEW.length);
    const res = await env.LEGACY.fetch(new Request(upstream, request));

    const headers = new Headers(res.headers);
    const loc = headers.get('location');
    if (loc) headers.set('location', rewritePrefix(loc));
    const cookies = headers.getSetCookie?.() || [];
    if (cookies.length) {
      headers.delete('set-cookie');
      for (const c of cookies) headers.append('set-cookie', c.replace(/;\s*path=\/weather-cheddar/i, `; Path=${NEW}`));
    }

    const type = headers.get('content-type') || '';
    if (request.method === 'HEAD' || !res.body || !TEXTUAL.test(type)) {
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    const body = rewritePrefix(await res.text());
    headers.delete('content-length');
    headers.delete('etag'); // body changed
    return new Response(body, { status: res.status, statusText: res.statusText, headers });
  },
};
