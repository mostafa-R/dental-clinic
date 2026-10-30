/**
 * Vercel Edge Middleware - proxies the API and Socket.IO to the Express server.
 *
 * Why this exists: the browser calls the same-origin `/api/site/*` path from
 * the dashboard, which Vite satisfies in dev via `server.proxy`. On Vercel
 * there is no dev server, so without this file every API call fell through to
 * the SPA rewrite and came back as `index.html` with a 200 - a silent HTML
 * parse error instead of a useful status code. `vercel.json` also excludes
 * `/api/` and `/socket.io/` from the SPA catch-all so that failure mode
 * cannot come back.
 *
 * Requires `BACKEND_API_URL` (e.g. `https://api.example.com`) in the Vercel
 * project environment. Optional: `BACKEND_TIMEOUT_MS` (default 25000).
 *
 * Note on WebSockets: the edge runtime proxies `fetch`, not the HTTP upgrade,
 * so Socket.IO completes over its HTTP long-polling transport here. Set
 * `VITE_SOCKET_URL` to the absolute backend origin to get the websocket
 * transport as well. `src/lib/realtime.js` falls back to the apiBase origin,
 * so through the edge everything degrades to polling rather than failing.
 *
 * This file mirrors Client/middleware.ts feature for feature - the two edges
 * proxy the same backend, so they must stay in sync. Anything fixed here
 * should be fixed there too (and vice versa).
 */

export const config = {
  matcher: ['/api/:path*', '/socket.io/:path*'],
};

// Connection-scoped headers that describe the *client* hop, not the request
// we are forwarding. Forwarding them confuses the upstream server.
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
];

// Our own ceiling, not the platform's. Vercel kills an Edge Function that
// outlives the plan's duration limit regardless of what this is set to, so
// keep it comfortably below that - a timeout this low is far better than a
// hard platform kill, which surfaces as an opaque 500 with no body.
const TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS) || 25000;

export default async function middleware(request) {
  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) {
    return Response.json(
      { success: false, message: 'Backend URL not configured (set BACKEND_API_URL)' },
      { status: 502 },
    );
  }

  const url = new URL(request.url);
  const upstream = new URL(url.pathname + url.search, backendUrl);

  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  headers.set('host', upstream.host);
  // The backend's CSRF `selfOrigin` check (req.protocol + '://' +
  // req.get('host')) must see the ORIGINAL Host the browser used, not the
  // backend's own. Without these headers the origin comparison silently
  // depends on the deployment shape.
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));

  // Do NOT pass the browser's own `x-forwarded-for` through. It is a plain
  // request header, so any client can set it to anything, and once the
  // backend trusts one proxy hop it reads that value as `req.ip` — which is
  // what the rate limiters and the site-admin IP allowlist key on. Rebuild
  // the chain from the edge's own authoritative header instead:
  // `x-vercel-forwarded-for` is set by Vercel and cannot be spoofed by the
  // client (the platform overwrites it before we see it).
  headers.delete('x-forwarded-for');
  const clientIp =
    request.headers.get('x-vercel-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
      signal: controller.signal,
    });

    const responseHeaders = new Headers(response.headers);
    for (const name of ['x-powered-by', 'content-encoding', 'content-length', 'transfer-encoding']) {
      responseHeaders.delete(name);
    }

    // `new Headers(response.headers)` folds repeated Set-Cookie into one
    // comma-joined value in some runtimes, which silently drops every session
    // cookie after the first (site_access + site_refresh on login, `_csrf` on
    // first visit) and shows up later as intermittent random 401s. Re-append
    // them individually.
    responseHeaders.delete('set-cookie');
    const setCookies =
      typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const cookie of setCookies) responseHeaders.append('set-cookie', cookie);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // A timeout and a refused connection both land here, and they mean very
    // different things: one is a slow backend or too low a
    // `BACKEND_TIMEOUT_MS`, the other is a wrong `BACKEND_API_URL` or a
    // backend that is down. They used to collapse into one opaque "Backend
    // unreachable", which made a misconfigured environment indistinguishable
    // from an outage.
    const timedOut = controller.signal.aborted;
    return Response.json(
      {
        success: false,
        message: timedOut
          ? `Backend timed out after ${TIMEOUT_MS}ms`
          : 'Backend unreachable',
        ...(timedOut ? {} : { detail: error instanceof Error ? error.message : String(error) }),
      },
      // 504 says "the upstream was too slow" and 502 says "the upstream was
      // unreachable" - the distinction monitoring and any retry policy need.
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
