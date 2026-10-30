# Dental OS — Cross-Project Review (server · Client · AdminDashboard)

Scope: integration, security, performance, UI/UX. All findings are grounded in the current code.
Overall verdict: this is an unusually mature codebase (RBAC, tenant isolation, CSRF, audit chain,
magic-byte upload validation, rate-limit hardening, lazy routes, RTL+dark theming). The gaps below
are the ones that actually matter, ordered by priority.

---

## P0 — Security

### 1. No `Cache-Control` headers anywhere in the server (PHI risk)

`Cache-Control|no-store` matches **zero** files under `server/`. Every authenticated response —
patients, EMR, invoices, wallet balances, `/auth/me` — leaves the API with no cache policy:

- Browsers may store PHI in the back/forward cache; after logout, the back button can still show
  the last patient record.
- Any shared/edge cache in front behaves by default (`GET` is cacheable by heuristics only if
  validators exist — but there is no reason to leave this to chance).
- The Vercel edge middlewares forward response headers verbatim, so nothing compensates upstream.

**Fix:** in `error.js`/middleware chain (before routers), set for all `/api` responses:
`Cache-Control: no-store` — or `private, no-store` when authenticated and add
`Cache-Control: no-store` explicitly on login/refresh/`/auth/me` responses. PHI GET routes
(patients, EMR attachments, billing) should never be `public`. Also consider `Clear-Site-Data: "cache"` on logout.

### 2. Admin edge middleware is behind the Client one (port the improvements)

`AdminDashboard/middleware.js` lacks everything `Client/middleware.ts` already solved:

- **`Set-Cookie` folding** — `new Headers(response.headers)` can merge repeated `Set-Cookie`
  headers into one comma-joined value in some runtimes, silently dropping the second session
  cookie (`site_access`/`site_refresh`, or `_csrf` on first login). Intermittent random 401s.
  Fix: `responseHeaders.delete('set-cookie')` + re-append via `response.headers.getSetCookie()`.
- No `x-forwarded-host`/`x-forwarded-proto` passthrough → the server's CSRF `selfOrigin`
  check (`req.protocol + '://' + req.get('host')`) computes from the *backend's* Host, and
  any hostPolicy logic sees the wrong host.
- Timeout is indistinguishable from unreachable (both plain 502). Port Client's 504/502 split.

### 3. Content-Security-Policy

- `Client/index.html` has a meta CSP but it's weak: `script-src 'self' 'unsafe-inline' 'unsafe-eval'`.
  The `'unsafe-eval'` allowance defeats most of the protection.
- `AdminDashboard/index.html` has **no CSP at all** — the platform console with tenant
  credentials, impersonation tokens and backup codes has the weakest XSS posture of the two apps.

**Fix:** add long-lived static (`hash`-based) CSP via `vercel.json` `headers` for both apps
(React apps don't need `'unsafe-inline'` for scripts once inline bootstrap snippets are hashed
or moved to external files), and remove `'unsafe-eval'`.

### 4. `securityAudit` logging is noisy and expensive (`server/middleware/security.js`)

It monkey-patches `res.end` and, **for every 4xx/5xx**, constructs a real `Error` (captures stack)
and logs at *error* level. Routine 401s, 404s and rate-limit 429s become "security events" with
full stacks — log noise (real incidents get buried), CPU cost on hot paths, and URL/IP spam into
the error logs that the admin dashboard then surfaces.

**Fix:** drop the `Error`-object construction; log structured fields only; log 4xx at `warn`;
sample or restrict 4xx classes to `401/403/429`.

### 5. Impersonation handoff token in the URL query

The dashboard opens `/login?impersonation=<token>` — the token lands in browser history,
referrer headers and proxy logs. TTL is 60 s and single-use (good), but prefer a URL **fragment**
(`#impersonation=`) or a one-intermediate step, and ensure the app does `history.replaceState`
to purge it from the address bar after reading it.

### 6. Small cleanups

- `X-XSS-Protection` and `Expect-CT` are dead headers (retired by browsers) — remove; use
  `Strict-Transport-Security` to real values if not set at the proxy.
- The global `requestSizeLimiter("55mb")` applies the 55 MB allowance to **every** route
  (uploads included). Apply the large limit only to multipart upload endpoints; the global
  body cap would then be the JSON/urlencoded 1 MB limit. (Cosmetic today — parsers still cap at 1 MB —
  but it is the wrong blast radius if a future parser relaxes.)

---

## P1 — Server performance

1. **No response compression.** `compression` is not in package.json and nothing in the chain
   gzips. Behind nginx/Vercel cancelling it may be handled — but the Vercel edge middleware
   forwards raw bytes and does not compress. If the API is ever reached directly (mobile clients,
   health checks, staging), every JSON payload travels uncompressed. Add `compression`
   (or `express@5` + proxy-level config) — one dependency, big win on list endpoints.
2. **Double/threefold per-request limiter work**: `generalLimiter` + `userRateLimit` + `abuseMonitor`
   + `perfMiddleware` all track each request. That is by design, but the `securityAudit`
   res.end wrap (fix above) removes the most expensive piece. Optionally make `perfMiddleware`
   sampling-based under load.
3. **`upgradeRateLimitStore()` failure is silent-once**: if Redis drops later, limiters fall back
   to per-process memory with no re-upgrade attempt or alert. Emit `emitToAdmins` on the transition.

## P2 — Integration (the three projects as one system)

1. **Single `CLIENT_URL` list must include all three deployments.** CORS, socket.io origin,
   CSP-ish hostname policy and CSRF allowed-origins all derive from `CLIENT_URL` (comma list).
   The Admin console origin **and** any custom tenant domain must be there or the dashboard gets
   silent CORS/CSRF failures. Make this explicit in the deploy checklist — e.g. a startup warn
   in prod when the running dashboard's URL can't be derived, and document it in
   `server/.env.example` (currently the example lists only the two dev client origins).
2. **Admin has no README** (`admin/README.md` doesn't exist, Client has one). Document:
   `VITE_API_BASE_URL`, `VITE_SOCKET_URL` (websocket transport is only available with the absolute
   backend origin — through the edge it degrades to long-polling), `BACKEND_API_URL`.
3. **Recharts version skew**: Client at `3.9`, Admin at `2.15`. Different APIs/behaviors; unify
   on one major so fixes/patterns (and possible future shared crate) align.
4. **Websocket path on Vercel is polling-only for both apps.** This is documented for Client;
   repeat for Admin: set `VITE_SOCKET_URL` to the backend origin in production so dashboard
   alerts arrive as websockets, not polling loops on the edge function.

## P3 — Frontend performance (measured)

Admin (`npm run build`) current state:

```
assets/axios-CX_KNnNk.js     105.52 kB │ gzip:  32.68 kB
assets/index-CPA83dJW.js     352.65 kB │ gzip: 108.91 kB   <-- single main chunk, no vendor split
assets/BarChart-W4IgrK78.js  381.24 kB │ gzip: 100.60 kB
```

`index` (353 kB raw / 109 kB gzip) contains React + Redux + router *and* app code in one chunk —
the exact issue the Client already fixed in `Client/vite.config.js` `manualChunks` (vendor /
recharts / dnd split with a documented rationale). Port that config to the Admin Vite config.
Also verify `BarChart` (381 kB) isn't pulled by the initial routes — if Dashboard/Analytics use
it, consider lazy-charts behind `React.lazy` on first paint.

## P4 — UI/UX

1. **Type-to-confirm for destructive platform actions** — the design spec itself flags this in
   §5.2 ("currently confirm modal — recommended hardening: type-to-confirm") for tenant delete /
   archive; do it also for Admin delete, Plan delete and restore-quarantine.
2. **Settings page: surfacing hidden fields** — Settings.md notes the slice stores
   `allowedDomains`/`maxTenants` but the UI doesn't render them ("not yet edited" pattern).
   Site-admin IP allowlist (`ALLOWED_SITE_IPS` mergeable via PlatformSetting) is likewise
   invisible — an operator can't see or rotate a security control from the console.
3. **SEO/meta for the public pricing page** — Client root (`/pricing`) is the public marketing
   surface but `index.html` has no `<meta name="description">`, no OG/Twitter tags and a static
   `<title>`; document.title is never changed per route. Add per-route titles + description for
   the two public pages (Pricing, Login), or prerender Pricing.
4. **Admin FOUC boot script lacks try/catch** — `Client/index.html` wraps its localStorage reads
   in `try{}catch{}`; Admin's doesn't, so a Chromium with storage blocked kills the script block
   (theme/lang flash). Two-line fix, match Client.
5. `/socket.io` in Client dev-proxy already has `ws: true`; Admin's Vite dev proxy config lacks a
   `socket.io` proxy entry entirely (it relies on `VITE_SOCKET_URL` or the apiBase origin) —
   harmless but inconsistent for new dev.
6. Roadmap-al improvements already spec'd in `design/SaaS-Platform-UI-UX-Spec.md` §7 — worth
   costing: tenant cockpit, per-route audit filters, backup restore UI.

---

## What's already excellent (don't re-litigate)

- **Server hardening**: token-family secrets, impersonation key separation, consent/audit chain
  keys required in prod, per-account (email-keyed) brute-force limiter on both versioned and
  unversioned paths, unsanitizers removed deliberately, tenant/PHI stripping per-socket,
  orphan-cap per IP, expired-trial socket teardown.
- **Uploads**: declared-type + magic-byte double validation, per-tenant encrypted storage,
  storage quotas counted before write (`attachment.routes.js`).
- **Client**: refresh-queue with correct transient-failure semantics (`shouldEndSession`),
  socket listener replay across rebuild, socket connection-state banner, plan-gate 403
  re-fetch, cookie-drop-safe edge proxy, FOUC-safe theme/language boot.
- **Admin**: session-teardown-in-flight guard, `RequireAccess` (hidden, not disabled),
  command palette, a full designer-grade UI/UX spec already checked in `design/`.
- **Tooling**: lint clean on all three projects, vitest suites + Playwright e2e, and a
  CI-grade `npm run verify` on the server.

## Suggested order of execution

1. Cache-Control no-store on all API responses (small, highest risk reduction).
2. Port Client edge middleware to Admin (mends intermittent auth breakage).
3. securityAudit noise/cost fix + CSP for both apps.
4. Admin Vite vendor chunking + README + integration env doc updates.
5. UX: type-to-confirm, Settings page gaps, per-route meta titles.

---

*Modeling note: this review is static analysis + one Admin build run; no test suites were
re-run. The P0 items can be verified in ~1h with a staging deploy and DevTools network check.*
