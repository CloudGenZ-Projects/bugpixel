# Change Request Portal

A single-tenant web app that lets Clients submit visual change requests against
websites the portal owner builds and hosts. A Client logs in, opens one of their
websites in a popup, activates a gated inspector to pick an on-page component,
captures a highlighted screenshot, composes one or more change items (Add /
Update / Delete) with optional attachments, and submits a report that is routed
by role to the Client, the assigned Developer, and the Admin.

Built to the spec in `.kiro/specs/change-request-portal/` (requirements, design,
tasks). All 27 correctness properties are covered by property-based tests.

## Stack

- **Frontend:** React + Vite + React Router (TypeScript) — `packages/frontend`
- **Backend:** Node + Express (TypeScript) — `packages/backend`
- **Shared types:** `packages/shared`
- **Database:** SQLite via Node's built-in `node:sqlite` (`DatabaseSync`)
- **Blob storage:** local filesystem, content-addressed (sha256)
- **Auth:** HTTP-only `SameSite=Strict` session cookie + double-submit CSRF token;
  short-lived signed JWT for the inspector handshake
- **Screenshots:** client-side capture with `html2canvas`

> **Driver note:** the design specifies `better-sqlite3`, which has no Node 22
> prebuild and cannot compile from source in this environment (Python 3.7 <
> node-gyp's required 3.8). We use Node's built-in `node:sqlite` instead —
> same synchronous, embedded, file-based semantics — isolated behind
> `packages/backend/src/db/createDb.ts`.

## Prerequisites

- Node.js 22.5+ (for the built-in `node:sqlite` module)
- npm 10+

## Install

```bash
npm install
```

## Build

```bash
npm run build            # shared -> backend -> frontend
npm run build:inspector --workspace packages/frontend   # standalone inspector.js bundle
```

## Seed a working data set

Creates an Admin, Client, and Developer, one Project, one Website owned by the
Client, and an Assignment linking the Developer to that Project. Idempotent.

```bash
CRP_DB_PATH=data/portal.db npm run seed --workspace packages/backend
```

Default logins (override with `CRP_SEED_*` env vars):

| Role      | Email                     | Password             |
|-----------|---------------------------|----------------------|
| Admin     | `admin@example.com`       | `admin-password`     |
| Client    | `client@example.com`      | `client-password`    |
| Developer | `developer@example.com`   | `developer-password` |

## Run

### Development (two processes, with dev proxy)

```bash
# Terminal 1 - backend API on :3000
CRP_DB_PATH=data/portal.db npm run start --workspace packages/backend

# Terminal 2 - frontend dev server on :5173 (proxies /api and /inspector to :3000)
npm run dev --workspace packages/frontend
```

Open http://localhost:5173 and log in with a seeded account.

### Production (single process serving the SPA + API)

```bash
npm run build
npm run build:inspector --workspace packages/frontend

NODE_ENV=production \
CRP_DB_PATH=/var/lib/crp/portal.db \
CRP_STORAGE_ROOT=/var/lib/crp/storage \
CRP_INSPECTOR_SECRET="$(openssl rand -hex 32)" \
CRP_SPA_DIR="$PWD/packages/frontend/dist" \
CRP_INSPECTOR_DIR="$PWD/packages/frontend/dist-inspector" \
npm run start --workspace packages/backend
```

In production, run behind a TLS-terminating reverse proxy (Caddy/nginx) that
sets `X-Forwarded-Proto`. The server then emits HSTS and redirects plain HTTP to
HTTPS, and marks cookies `Secure`.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | API listen port |
| `CRP_DB_PATH` | `data/portal.db` | SQLite file (or `:memory:`) |
| `CRP_STORAGE_ROOT` | `data/storage` | blob storage root |
| `CRP_INSPECTOR_SECRET` | dev fallback | inspector JWT + CSRF secret (**required in prod**) |
| `CRP_SPA_DIR` | (unset) | built SPA dir to serve |
| `CRP_INSPECTOR_DIR` | (unset) | built inspector bundle dir to serve at `/inspector` |
| `CRP_ALLOWED_ORIGINS` | (unset) | comma-separated origins allowed to make credentialed cross-origin requests (e.g. a sample client site on another origin) |
| `NODE_ENV` | | `production` enables HTTPS/HSTS + Secure cookies |

## Deploying the portal to a VPS (with a real domain)

The portal is a single Node process. It needs a Node 22.5+ host and a
TLS-terminating reverse proxy (Caddy/nginx) in front. High-level steps:

1. **Install & build on the box:**
   ```bash
   git clone git@github.com:CloudGenZ-Projects/bugpixel.git
   cd bugpixel && npm install && npm run build
   npm run build:inspector --workspace packages/frontend
   ```
2. **Create data dirs & seed:**
   ```bash
   mkdir -p /var/lib/crp
   CRP_DB_PATH=/var/lib/crp/portal.db CRP_STORAGE_ROOT=/var/lib/crp/storage \
     node packages/backend/dist/seed.js
   ```
3. **Run under a process manager** (systemd / pm2) with production env:
   ```bash
   NODE_ENV=production \
   PORT=3000 \
   CRP_DB_PATH=/var/lib/crp/portal.db \
   CRP_STORAGE_ROOT=/var/lib/crp/storage \
   CRP_INSPECTOR_SECRET="$(openssl rand -hex 32)" \
   CRP_SPA_DIR="$PWD/packages/frontend/dist" \
   CRP_INSPECTOR_DIR="$PWD/packages/frontend/dist-inspector" \
   node packages/backend/dist/server.js
   ```
4. **Reverse proxy** (Caddy example) terminates TLS for `portal.yourdomain.com`
   and forwards to `127.0.0.1:3000`, setting `X-Forwarded-Proto: https`. The
   app then emits HSTS, redirects HTTP→HTTPS, and marks cookies `Secure`.

### Cross-origin sample site (Cloudflare Pages) — what's needed

If the sample client website lives on a **different origin** than the portal
(e.g. `bugpixel-client-test` on Cloudflare Pages, portal on your VPS), the
inspector makes credentialed cross-origin calls to the portal. For that to work:

- Set `CRP_ALLOWED_ORIGINS=https://your-client-site.pages.dev` (comma-separated
  for multiple) so the portal returns the required CORS headers with
  credentials.
- **Cross-site cookies:** browsers only send the session/CSRF cookies on
  cross-site requests when they are `SameSite=None; Secure`. The current cookies
  are `SameSite=Strict` (best for a same-origin SPA). For a true cross-origin
  inspector on a separate domain you would need to relax the cookie SameSite to
  `None` (and keep `Secure`) — a small change in `packages/backend/src/http/app.ts`
  `setSessionCookie`. This is intentionally left `Strict` by default; flip it
  only if you deploy the client site on a separate origin and understand the
  tradeoff. If you instead serve the sample site from the **same** domain as the
  portal (e.g. a path or subpath), no CORS/SameSite changes are needed.

## Repositories

- `bugpixel` — this whole project (portal: backend + frontend + specs)
- `bugpixel-client-test` — the standalone sample client website (`sample-site/`),
  for Cloudflare Pages. See `sample-site/README.md`.

## The injected inspector

Client websites include the inspector from the portal origin:

```html
<script
  src="https://portal.example.com/inspector/inspector.js"
  data-portal-origin="https://portal.example.com"
  data-website-id="THE_WEBSITE_ID"></script>
```

It stays inert for anonymous visitors and only activates after an
origin-verified `INSPECTOR_INIT` handshake carrying a valid, backend-validated
token tied to the owning Client's session.

## Test, lint, format

```bash
npm test                 # backend + frontend test suites
npm run lint             # ESLint (flat config)
npm run format           # Prettier write
npm run format:check     # Prettier check
```

## Project layout

```
packages/
  shared/     enums, entity interfaces, error shape, constants
  backend/    db (schema + repositories), services, http (middleware + routes), server, seed
  frontend/   api client, auth shell, dashboards, composer, inspector (controller + injected script)
.kiro/specs/change-request-portal/   requirements.md, design.md, tasks.md
```
