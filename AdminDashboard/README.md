# Dental OS — Site Dashboard

The platform console for site admins: tenants, branches, plans, billing,
analytics, admins, feature flags, quarantine, monitoring (health, performance,
audit/error logs), backups and settings. Built with React + Redux Toolkit +
Tailwind, deployed on Vercel.

The clinic operating app lives in `../Client`; the API in `../server`.

## Development

```bash
npm install
npm run dev        # http://localhost:5174
npm run lint       # oxlint
npm test           # vitest
npm run test:e2e   # Playwright
npm run build      # production build
```

The dev server proxies `/api` and `/socket.io` (websocket transport) to the
Express backend at `http://localhost:7000` — start the server first.

## Environment variables

### Vite (frontend, `VITE_` prefix)

| Variable | Default (dev) | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:7000/api/v1/site` | API base. In production it must be a **same-origin** path such as `/api/v1/site` (served by the edge middleware below) or an origin allowed in the server's `CLIENT_URL`. |
| `VITE_SOCKET_URL` | derived from the API base | Socket.IO origin. Through the Vercel edge only **long-polling** works (the edge proxies `fetch`, not the HTTP upgrade). Set this to the absolute backend origin (e.g. `https://api.example.com`) to get the websocket transport. |
| `VITE_CLINIC_URL` | — | Clinic app URL, opened by the impersonation flow (`Login as`). |

### Edge proxy (server, Vercel project env)

| Variable | Required | Notes |
|---|---|---|
| `BACKEND_API_URL` | yes | Absolute backend origin the edge middleware forwards `/api` and `/socket.io` to. |
| `BACKEND_TIMEOUT_MS` | no | Upstream timeout, default `25000`. |

`middleware.js` mirrors `Client/middleware.ts` feature for feature (hop-by-hop
header stripping, `Set-Cookie` re-appending, spoof-proof `x-forwarded-for`
rebuild, 504/502 distinction). If you change one, change the other.

## Production checklist

- `BACKEND_API_URL` is set on the Vercel project (without it every API call
  returns `502 Backend URL not configured`).
- The server's `CLIENT_URL` includes **this deployment's origin** — one comma
  list drives CORS, the CSRF allowed-origins check and socket origin
  validation for both frontends. A missing admin origin does not fail on
  boot; you get CORS/CSRF rejections at runtime instead.
- Deployed builds get a CSP via `vercel.json` `headers` (script/style
  `'unsafe-inline'` is required by the inline theme bootstrap; `unsafe-eval`
  is deliberately absent). The dev server does not apply these headers.
