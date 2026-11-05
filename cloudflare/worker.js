// Runs only for requests on this Worker's route that don't match a static asset.
// - /weathercheddar            -> /weathercheddar/   (canonical trailing slash)
// - anything else              -> asset lookup / 404
// /weather-cheddar/* is intentionally NOT handled here: it is served by the separate
// "weather-cheddar-path-proxy" Worker (the original app).
const BASE = '/weathercheddar';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === BASE) return Response.redirect(`${url.origin}${BASE}/${url.search}`, 301);
    if (p.startsWith(`${BASE}/`)) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  },
};
