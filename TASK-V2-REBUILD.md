# BugPixel v2 Rebuild - Task Spec

## Context

Project location: `/home/dhruvill/ChangeSubmit`
Stack: TypeScript monorepo (packages/shared, packages/backend, packages/frontend). Node 22, Express, SQLite (node:sqlite), React + Vite + Tailwind CSS v4.

The v2 schema and shared types are already committed (commit a2ef7fd). The backend is currently broken because repos/services/routes still reference the old multi-item model. This task completes the rebuild.

## Design Decisions (confirmed by user)

- **1 request = 1 change** (no change_items table, fields flattened onto change_request)
- **Multiple screenshots** per request (different angles/states)
- **Statuses:** Submitted, InProgress, Done, Cancelled (NO Draft)
- **Popup opens** only on explicit "📸 Capture" button click (not on website select)
- **Kanban:** per-project boards, columns = statuses, for ALL roles
- **Admin view:** per-project boards + one aggregated overview
- **Card titles:** use description text (truncated), not UUID
- **Status change:** available to ALL roles (client can Cancel)
- **Images:** clickable with lightbox/modal zoom everywhere
- **Notes:** support image attachments
- **Rejected/Cancelled:** visible as a kanban column
- **Reports:** per-project stats, trends, avg resolution time
- **Audit log:** activity feed visible in request detail
- **UI:** must look attractive (not just functional)
- **Inspector:** floating toolbar with Navigate/Select modes (already implemented)
- **Popup closes** after capture (already implemented)
- **Browser metadata:** captured (browser, OS, screen dims, URL) - display in detail page

## Steps

### Step 1: Backend - Mappers + Repos

File: `packages/backend/src/db/mappers.ts`
- Remove: mapChangeItem, mapComponentReference
- Update: mapChangeRequest to include changeType, description, content*, selector, htmlMeta, dueDate
- Update: mapScreenshot to include changeRequestId + createdAt
- Update: mapNote to include imageStorageKey

File: `packages/backend/src/db/repositories/`
- DELETE: changeItemRepo.ts (file removal)
- Rewrite: changeRequestRepo.ts - flat fields, create() takes full payload, add listByProject(), updateStatus(), getMonthlyStats(), getStatusCounts()
- Rewrite: screenshotRepo - references change_request_id, has listByRequest()
- Keep: userRepo, projectRepo, websiteRepo, assignmentRepo, noteRepo, activityRepo (minor type adjustments)
- Update: noteRepo - add imageStorageKey field
- Update: repositories/index.ts - remove changeItems, componentReferences, screenshots (old), add screenshots (new)

### Step 2: Backend - Services

- Remove: changeItemValidator.ts, changeRequestService.ts (old multi-step flow)
- Create new: changeRequestService.ts - single create() that takes full payload + submits immediately, no draft concept
- Update: listingService.ts - return screenshots[] and attachments[] per request, per-project listing
- Update: ownershipService.ts - remove item-level checks
- Keep: authService, sessionService, inspectorTokenService, fileStore, r2Store, rateLimiter, rosterService, assignmentService

### Step 3: Backend - Routes (app.ts)

Rewrite routes:
- `POST /api/change-requests` - takes full payload (websiteId, changeType, description, content*, priority, selector, htmlMeta, dueDate) and creates in Submitted status immediately
- `POST /api/change-requests/:id/screenshots` - upload screenshot to existing request
- `POST /api/change-requests/:id/attachments` - upload attachment
- `PATCH /api/change-requests/:id/status` - any role can transition (client: Cancel, dev/admin: InProgress/Done/Cancelled)
- `PATCH /api/change-requests/:id/priority` - update priority
- `GET /api/change-requests` - role-scoped list (per project grouping)
- `GET /api/change-requests/:id` - detail with screenshots[], attachments[], notes[], activity[]
- `GET /api/projects/:projectId/change-requests` - per-project listing for kanban
- `POST /api/change-requests/:id/notes` - add note (text + optional image)
- `GET /api/change-requests/:id/notes` - list notes
- `GET /api/change-requests/:id/activity` - audit log
- Keep: auth, session, inspector, admin, file serving, analytics routes

### Step 4: Backend - Container + Seed

- Update container.ts - remove old services, wire new ones
- Update seed.ts - create sample data with new schema

### Step 5: Frontend - New Compose Flow

File: `packages/frontend/src/views/NewChangeRequest.tsx`
- Pick website → show compose form (NOT popup)
- Form has: changeType, description, content fields, priority, due date, "📸 Capture Screenshot" button
- Capture button opens popup → capture → popup closes → thumbnail appears
- Can capture multiple screenshots (each adds a thumbnail)
- Submit button sends everything in one POST
- No draft, no multi-item, no "add another"

### Step 6: Frontend - Per-Project Kanban

File: `packages/frontend/src/views/ProjectBoard.tsx` (new)
- Columns: Submitted | InProgress | Done | Cancelled
- Cards show: description (truncated), priority badge, created date, screenshot thumbnail
- Cards are clickable → navigate to detail

File: `packages/frontend/src/views/ClientDashboard.tsx` (rewrite)
- Project selector/tabs at top
- Renders ProjectBoard for selected project
- "New Request" button

File: `packages/frontend/src/views/DeveloperDashboard.tsx` (rewrite)
- Shows boards for all assigned projects

File: `packages/frontend/src/views/AdminDashboard.tsx` (rewrite)
- All projects view + per-project boards
- Manage tab stays (projects, developers, websites, assignments)

### Step 7: Frontend - Detail Page

File: `packages/frontend/src/views/ChangeRequestDetail.tsx` (rewrite)
- Header: status badge + status change dropdown + priority badge
- Description + content fields (styled by type)
- Screenshots gallery (thumbnails, click to open lightbox)
- Browser metadata panel (OS, browser, viewport, URL)
- Attachments list
- Activity/audit log timeline
- Notes section with image support
- Export button

### Step 8: Frontend - Image Lightbox

File: `packages/frontend/src/views/ImageLightbox.tsx` (new)
- Modal overlay, shows image full-size
- Click outside or X to close
- Used everywhere images are shown

### Step 9: Frontend - Reports Page

Rewrite to show:
- Per-project stats (filter by project)
- Requests by status over time
- Average resolution time (Submitted → Done)
- Priority distribution

### Step 10: Frontend - UI Polish

- Attractive layout (not just functional)
- Consistent spacing, typography, colors
- Smooth transitions
- Loading states
- Empty states with helpful messaging
- Mobile responsive

### Step 11: Build + Test + Seed

- `npm run build` must pass clean
- `npm run test:backend` - update/rewrite tests for new model
- Delete old data/portal.db, re-seed with new schema
- Verify the full flow works end-to-end

## Verification

After each step, run `npm run build` to verify compilation. After Step 11, the full app should be testable at localhost:5173 with:
- Login as client → see per-project kanban → create request via capture button → submit → see it in Submitted column
- Login as developer → see assigned project board → move to InProgress → Done
- Login as admin → see all projects → manage everything

## Notes

- This is a personal project, NOT Amazon code. Do not use Amazon patterns (no Brazil, no Coral, no Apollo).
- Use Tailwind CSS v4 (already configured with @tailwindcss/vite plugin)
- Keep existing: rate limiting, R2 storage adapter, graceful shutdown, dynamic CORS, inspector toolbar
- Tests will need significant rewriting since the model changed fundamentally
- The inspector-entry.ts is already correct (toolbar, navigate/select, popup close, browser metadata capture)
