/**
 * Vercel Edge Middleware - proxies the API and Socket.IO to the Express server.
 *
 * Why this exists: the browser calls the same-origin `/api/v1/*`
 * (`VITE_API_URL=/api/v1`), which Vite satisfies in dev via `server.proxy`.
 * On Vercel there is no dev server, so without this file every API call fell
 * through to the SPA rewrite and came back as `index.html` with a 200 - a
 * silent HTML parse error instead of a useful status code. `vercel.json` now
 * also excludes `/api/` and `/socket.io/` from the SPA catch-all so that
 * failure mode cannot come back.
 *
 * Requires `BACKEND_API_URL` (e.g. `https://api.example.com`) in the Vercel
 * project environment.
 *
 * Note on WebSockets: the edge runtime proxies `fetch`, not the HTTP upgrade,
 * so Socket.IO completes over its HTTP long-polling transport here. Set
 * `VITE_SOCKET_URL` to the absolute backend origin to get the websocket
 * transport as well.
 */

export const config = {
  matcher: ['/api/:path*', '/socket.io/:path*'],
};

// Connection-scoped headers that describe the *client* hop, not the request we
// are forwarding. Forwarding them confuses the upstream server.
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

const TIMEOUT_MS = 25000;

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
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));

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
    // cookie after the first. Re-append them individually.
    responseHeaders.delete('set-cookie');
    const setCookies =
      typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const cookie of setCookies) responseHeaders.append('set-cookie', cookie);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { success: false, message: 'Backend unreachable' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
