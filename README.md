# BugPixel

A visual change request portal. Clients submit change requests against websites
with screenshots captured via an injected inspector. Developers and admins
manage requests on per-project kanban boards.

**v2 model:** 1 request = 1 change (flat schema, no child items).

## Stack

- **Frontend:** React + Vite + Tailwind CSS v4 + React Router
- **Backend:** Node.js 22 + Express (TypeScript)
- **Shared types:** `packages/shared`
- **Database:** SQLite via Node's built-in `node:sqlite` (`DatabaseSync`)
- **Blob storage:** Local filesystem (content-addressed SHA-256), optional Cloudflare R2
- **Auth:** HTTP-only session cookie + double-submit CSRF token; short-lived JWT for inspector handshake
- **CORS:** Dynamic allowlist from registered website URLs (60s cache)

## Prerequisites

- Node.js 22.5+ (for built-in `node:sqlite`)
- npm 10+

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Build all packages
npm run build

# 3. Seed the database with test data
CRP_DB_PATH=data/portal.db npm run seed --workspace packages/backend

# 4. Start backend (API on :3000)
CRP_DB_PATH=data/portal.db npm run start --workspace packages/backend

# 5. In another terminal - start frontend dev server (:5173, proxies to :3000)
npm run dev --workspace packages/frontend
```

Open http://localhost:5173 and log in.

### Default Test Accounts

| Role      | Email                   | Password           |
|-----------|-------------------------|---------------------|
| Admin     | admin@example.com       | admin-password      |
| Client    | client@example.com      | client-password     |
| Developer | developer@example.com   | developer-password  |

### Testing the Inspector

1. Log in as Client
2. Create a New Request - pick a website, fill the form
3. Click "📸 Capture Screenshot" to open the inspector popup
4. The popup loads the website with the inspector toolbar
5. Select an element → screenshot is captured → popup closes
6. Submit the request

For the inspector to work locally, include the inspector script on your test site:
```html
<script src="http://localhost:3000/inspector/inspector.js"
  data-portal-origin="http://localhost:5173"
  data-website-id="YOUR_WEBSITE_ID"></script>
```

## Build & Test

```bash
npm run build            # shared → backend → frontend
npm run test:backend     # 46 tests (vitest)
npm run build:frontend   # Vite production build
```

## Project Layout

```
packages/
  shared/     Enums, entity interfaces, error codes, constants
  backend/    DB (schema + repos), services, HTTP (routes + middleware), server, seed
  frontend/   API client, auth context, views (kanban, detail, compose, reports, admin)
```

### Key Views (Frontend)

| View | What |
|------|------|
| `ProjectBoard.tsx` | Per-project kanban (Submitted / InProgress / Done / Cancelled) |
| `NewChangeRequest.tsx` | Compose form with Capture Screenshot button |
| `ChangeRequestDetail.tsx` | Full detail: gallery, metadata, notes, activity |
| `ImageLightbox.tsx` | Full-screen image zoom |
| `ReportsView.tsx` | Per-project stats, resolution time, monthly trends |
| `AdminDashboard.tsx` | All projects + manage tab (users, websites, assignments) |

## API Routes (v2)

### Auth
- `POST /api/auth/login` - Login (returns session cookie + CSRF)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

### Change Requests
- `POST /api/change-requests` - Create (Submitted immediately, no drafts)
- `GET /api/change-requests` - List (role-scoped)
- `GET /api/change-requests/:id` - Detail (with screenshots, attachments, notes, activity)
- `PATCH /api/change-requests/:id/status` - Update status
- `PATCH /api/change-requests/:id/priority` - Update priority
- `POST /api/change-requests/:id/screenshots` - Upload screenshot (base64)
- `POST /api/change-requests/:id/attachments` - Upload attachment
- `POST /api/change-requests/:id/notes` - Add note (with optional image)
- `GET /api/change-requests/:id/activity` - Audit log

### Projects & Analytics
- `GET /api/projects` - List projects (role-scoped)
- `GET /api/projects/:id/change-requests` - Per-project requests (for kanban)
- `GET /api/analytics/stats` - Status counts, monthly trends, avg resolution

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user
- `POST /api/admin/projects` - Create project
- `POST /api/admin/websites` - Create website
- `POST /api/admin/assignments` - Assign developer to project

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | API listen port |
| `CRP_DB_PATH` | `data/portal.db` | SQLite file path |
| `CRP_STORAGE_ROOT` | `data/storage` | Blob storage directory |
| `CRP_INSPECTOR_SECRET` | dev fallback | JWT + CSRF secret (**required in production**) |
| `CRP_SPA_DIR` | (unset) | Built SPA directory to serve |
| `CRP_INSPECTOR_DIR` | (unset) | Inspector bundle directory |
| `NODE_ENV` | | `production` enables Secure cookies |

> **Note:** `CRP_ALLOWED_ORIGINS` is no longer needed - CORS is derived automatically
> from registered website URLs in the database (60s cache).

## Production Deployment

See [DEPLOY.md](./DEPLOY.md) for full VPS + Caddy + systemd + R2 setup guide.

Quick version:
```bash
npm run build
CRP_DB_PATH=/var/lib/crp/portal.db npm run seed --workspace packages/backend

NODE_ENV=production \
CRP_DB_PATH=/var/lib/crp/portal.db \
CRP_STORAGE_ROOT=/var/lib/crp/storage \
CRP_INSPECTOR_SECRET="$(openssl rand -hex 32)" \
CRP_SPA_DIR="$PWD/packages/frontend/dist" \
CRP_INSPECTOR_DIR="$PWD/packages/frontend/dist-inspector" \
node packages/backend/dist/server.js
```

## Design Decisions

- **1 request = 1 change:** No multi-item grouping. Each request is one thing to change.
- **No drafts:** Requests are Submitted immediately on creation.
- **Per-project kanban:** All roles see their projects as kanban boards with status columns.
- **Capture button (not auto-popup):** Inspector only opens when user clicks "📸 Capture Screenshot".
- **Multiple screenshots:** Up to 10 per request (different angles/states).
- **Statuses:** Submitted → InProgress → Done / Cancelled (client or dev/admin can cancel).
- **Dynamic CORS:** Website table IS the origin allowlist - no env var needed.
- **SameSite=None:** Cookies work cross-origin for inspector on client sites.
