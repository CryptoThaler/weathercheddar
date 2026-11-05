// Runs only for requests that don't match a static asset under /weathercheddar/.
// - /weathercheddar           -> /weathercheddar/   (canonical trailing slash)
// - /weather-cheddar[/...]    -> /weathercheddar/   (legacy URL of the original dashboard)
// - anything else on the route -> asset lookup / 404
const BASE = '/weathercheddar';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === BASE || p === '/weather-cheddar' || p.startsWith('/weather-cheddar/')) {
      return Response.redirect(`${url.origin}${BASE}/${url.search}`, 301);
    }
    if (p.startsWith(`${BASE}/`)) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  },
};
