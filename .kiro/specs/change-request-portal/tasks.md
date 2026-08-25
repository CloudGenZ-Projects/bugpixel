# Implementation Plan: Change Request Portal

## Overview

This plan implements the Change Request Portal as a React (Vite) + TypeScript SPA and a Node.js/Express + TypeScript API backed by SQLite (`better-sqlite3`), with screenshots and attachments stored on the local filesystem. Work builds from the bottom up: shared types and scaffolding first, then the SQLite schema and repositories, then services (auth/session, ownership, inspector tokens, change requests, roster, assignments), then the HTTP API and middleware, then the frontend composition/dashboard flows, then the injected inspector script, and finally security hardening and end-to-end wiring.

Testing uses property-based tests with `fast-check` + `vitest` (minimum 100 iterations per property, `numRuns: 100`), with exactly one property test per correctness property (Properties 1–27). Each property test is tagged with a comment of the form `// Feature: change-request-portal, Property {number}: {property_text}`. Acceptance criteria classified as EXAMPLE/SMOKE (1.1, 1.4, 2.1, 3.4, 3.5, 4.3, 5.1, 5.2, 5.3, 7.4, 15.5) are covered by unit/integration/smoke tests. Property tests use an in-memory SQLite instance and mocked filesystem/clock; integration tests exercise real SQLite file transactions and filesystem blob I/O.

## Tasks

- [x] 1. Scaffold monorepo, shared types, and tooling
  - [x] 1.1 Create workspace structure and shared TypeScript types
    - Create root `package.json` with npm workspaces for `packages/shared`, `packages/backend`, `packages/frontend`
    - In `packages/shared`, define shared TypeScript types/enums: `Role` ({Client, Developer, Admin}), `ChangeType` ({Add, Update, Delete}), `ChangeRequestStatus` ({Draft, Submitted, AwaitingDeveloperAssignment}), and interfaces for `User`, `Project`, `Website`, `Assignment`, `ChangeRequest`, `ChangeItem`, `ComponentReference`, `Screenshot`, `Attachment`
    - Define the shared error shape `{ error: { code, message, field? } }` and an `ErrorCode` union of the codes named in the design (e.g. `AUTH_INVALID_CREDENTIALS`, `AUTH_REQUIRED`, `AUTHZ_FORBIDDEN`, `AUTHZ_NOT_OWNER`, `INSPECTOR_DENIED`, `VALIDATION_DESCRIPTION_REQUIRED`, `VALIDATION_CONTENT_REQUIRED`, `VALIDATION_UNSUPPORTED_TYPE`, `VALIDATION_FILE_TOO_LARGE`, `VALIDATION_NO_ITEMS`, `VALIDATION_TOO_MANY_ITEMS`, `SUBMISSION_FAILED`, `ROSTER_DUPLICATE`, `ASSIGNMENT_UNKNOWN_DEVELOPER`)
    - Export constants: max description length (2000), max attachment size (10 MB), max items per request (500), idle timeout (30 min), inspector token TTL (~5 min)
    - _Requirements: 2.1, 8.1, 8.2, 8.3, 8.4, 9.4, 11.1, 1.5_

  - [x] 1.2 Configure backend and frontend build/test tooling
    - Add `packages/backend` with TypeScript, Express, `better-sqlite3`, and a `vitest` config; add `fast-check` as a dev dependency
    - Add `packages/frontend` with Vite + React + TypeScript + React Router and its own `vitest` config with `fast-check`
    - Add npm scripts to build shared → backend → frontend and to run tests with `--run` (single execution, not watch)
    - Create a shared `test/arbitraries.ts` module in the backend package exporting `fast-check` arbitraries for Users/roles, Websites (with owners), Projects, Assignments, Change_Requests, Change_Items per type, descriptions (whitespace-only and boundary lengths 0/1/2000/2001), files (varied MIME incl. unsupported, sizes straddling 10 MB), component selections (with/without selector metadata), inspector tokens (valid/expired/wrong-aud/no-session), and idle durations straddling 30 minutes
    - _Requirements: 2.1_

- [x] 2. Implement SQLite schema and repository layer
  - [x] 2.1 Create schema, migrations, and DB bootstrap
    - Write SQL DDL for tables: `user`, `project`, `website`, `assignment`, `change_request`, `change_item`, `component_reference`, `screenshot`, `attachment` per the design ERD, using TEXT UUID PKs and ISO-8601 text timestamps
    - Enforce `PRAGMA foreign_keys = ON`; add a UNIQUE constraint on `assignment.project_id` (at most one active assignment per project) and on `user.email`; set `ON DELETE CASCADE` from `user` (developer) → `assignment`
    - Provide a `createDb(path | ':memory:')` helper that applies the schema, used by both runtime and tests
    - _Requirements: 2.1, 14.3, 13.2_

  - [x] 2.2 Implement repositories with parameterized queries
    - Implement `userRepo`, `websiteRepo`, `projectRepo`, `assignmentRepo`, `changeRequestRepo`, `changeItemRepo`, `componentReferenceRepo`, `screenshotRepo`, `attachmentRepo` using only parameterized SQL (no string interpolation)
    - Include queries needed downstream: websites by owner, change requests by client, change requests by assigned developer (join website→project→assignment), items by change request with joined component reference/screenshot/attachments, assignment by project, roster listing
    - _Requirements: 3.2, 4.1, 12.2, 13.3_

  - [x]* 2.3 Write unit tests for repository CRUD and cascade behavior
    - Test FK enforcement, unique assignment-per-project constraint, and developer-removal cascade using a real file-backed SQLite instance
    - _Requirements: 13.2, 14.3_

- [x] 3. Implement authentication, session, and authorization services
  - [x] 3.1 Implement credential verification and session service
    - Implement `authService.login(identifier, password)` verifying against stored strong password hashes (bcrypt/argon2), returning a session on exact match only and an auth error otherwise
    - Implement session creation/lookup/termination with `last_active_at` tracking and a 30-minute idle timeout; a session is valid iff idle duration ≤ 30 minutes and is renewed on activity
    - Inject a clock abstraction so idle timing is testable
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [x]* 3.2 Write property test for exact-credential authentication
    - **Property 2: Only exact credentials authenticate** — for any (identifier, password) not exactly matching a stored user, login is rejected; only the exact valid pair establishes a session
    - **Validates: Requirements 1.2**

  - [x]* 3.3 Write property test for idle-timeout session validity
    - **Property 3: Idle timeout invalidates sessions** — a session is valid iff idle duration since last activity is at most 30 minutes
    - **Validates: Requirements 1.5**

  - [x]* 3.4 Write unit tests for login success and logout flow
    - Cover successful login establishing a session and logout terminating it (EXAMPLE criteria)
    - _Requirements: 1.1, 1.4_

  - [x] 3.5 Implement role/permission model and ownership checks
    - Implement `authzService` with a role→allowed-actions permission matrix; admin-only actions (roster + assignment management) permitted iff role is Admin
    - Implement dashboard-view resolution returning the view for the user's role
    - Implement `ownershipService.assertOwns(clientId, websiteId)` comparing `website.owner_client_id`, and developer-detail access checked against an active Assignment
    - _Requirements: 2.2, 2.3, 2.4, 4.2, 12.2, 15.4_

  - [x]* 3.6 Write property test for role-appropriate dashboard view
    - **Property 4: Dashboard view matches role** — for any authenticated user with role R, the resolved dashboard/session view corresponds exactly to R
    - **Validates: Requirements 2.2**

  - [x]* 3.7 Write property test for role permission matrix enforcement
    - **Property 5: Role permission matrix is enforced** — an action is permitted iff it belongs to the allowed set for the user's role; admin-only actions permitted iff role is Admin, else an authorization error
    - **Validates: Requirements 2.3, 2.4**

  - [x]* 3.8 Write property test for ownership enforcement on open/create/submit
    - **Property 9: Ownership is enforced for open/create/submit** — for any client and any Website not owned by them, open/create/submit requests are denied with an authorization error
    - **Validates: Requirements 4.2, 15.4**

- [x] 4. Implement inspector token service
  - [x] 4.1 Implement token minting and validation
    - Implement `inspectorTokenService.mint(sessionUser, websiteId)` producing a short-lived (~5 min) signed JWT with `aud = websiteId`, requiring a valid session and website ownership
    - Implement `inspectorTokenService.validate(token, session)` returning success iff the token is validly signed, unexpired, scoped to the opened website, and backed by an active Owner_Session of the owning client; all other cases (no token, expired, wrong aud, ended/absent session, anonymous) are denied
    - Keep the token secret server-side only
    - _Requirements: 5.1, 6.1, 6.2, 6.5, 6.6, 15.1, 15.2_

  - [x]* 4.2 Write property test for full inspector activation gating
    - **Property 11: Inspector activation is fully gated** — activation (and subsequent Component_Reference recording / Screenshot capture) succeeds iff the token is validly signed, unexpired, website-scoped, and backed by an active owner session; otherwise denied and the view is unchanged
    - **Validates: Requirements 6.1, 6.2, 6.5, 6.6, 15.1, 15.2**

- [x] 5. Implement change-item validation and composition service
  - [x] 5.1 Implement description and type-specific content validation
    - Implement `changeItemValidator` that trims and validates description (non-empty, ≤ 2000 chars) and required content fields by type: Add requires add-content; Delete requires delete-content; Update requires current-value and updated-value; each 1–2000 chars
    - On failure return the appropriate validation error (`VALIDATION_DESCRIPTION_REQUIRED` / `VALIDATION_CONTENT_REQUIRED`) identifying the missing field; retention of entered values is the caller's contract (values echoed back)
    - Implement attachment-availability rule: attachments permitted iff type is Add or Update; Delete accepts none
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 9.1, 9.5_

  - [x]* 5.2 Write property test for description validation
    - **Property 13: Description validation** — save accepted iff trimmed description is non-empty and ≤ 2000 chars; empty/whitespace rejected with a description-identifying error while values are retained
    - **Validates: Requirements 8.1, 8.5**

  - [x]* 5.3 Write property test for type-specific required content validation
    - **Property 14: Type-specific required content validation** — save accepted iff every required field for the type is non-whitespace and within 1–2000 chars; otherwise rejected identifying the missing field and retaining values
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.6**

  - [x]* 5.4 Write property test for attachment availability by change type
    - **Property 15: Attachment availability by change type** — attachments permitted iff type is Add or Update; for Delete no attachment is accepted
    - **Validates: Requirements 8.7, 8.8, 9.1, 9.5**

  - [x] 5.5 Implement change-request draft, item accumulation, and single-website binding
    - Implement `changeRequestService.createDraft(clientId, websiteId)` binding the draft to exactly one owned website
    - Implement `addItem` appending validated items in order, retaining the association with the recorded Component_Reference and Screenshot, and ensuring all items belong to the request's single website
    - _Requirements: 4.4, 5.4, 8.9, 10.1, 10.2, 10.3_

  - [x]* 5.6 Write property test for single website per change request
    - **Property 10: One website per change request** — all items are associated with the single Website recorded on the request; the request references exactly one Website
    - **Validates: Requirements 4.4, 5.4, 10.3**

  - [x]* 5.7 Write property test for ordered item accumulation
    - **Property 17: Item accumulation within a change request** — for any sequence of valid items added, the request contains exactly those items in order of addition
    - **Validates: Requirements 10.1, 10.2**

  - [x]* 5.8 Write property test for component/screenshot linkage
    - **Property 12: Component selection yields a linked reference and highlighted screenshot** — the resulting item retains an associated Component_Reference and a Screenshot with a highlighted region; optional selector/HTML metadata stored when present, reference still valid when absent
    - **Validates: Requirements 6.3, 6.4, 7.1, 7.2, 7.3, 8.9**

- [x] 6. Checkpoint - core services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement file storage service and attachment validation
  - [x] 7.1 Implement filesystem blob store with MIME/size validation
    - Implement `fileStore.write(bytes, mime, filename)` and `fileStore.read(storageKey)` under a configured content-addressed root, returning opaque storage keys
    - Implement attachment validation: accept iff MIME is PDF or an image type and size ≤ 10 MB; reject unsupported types with `VALIDATION_UNSUPPORTED_TYPE` and oversized files with `VALIDATION_FILE_TOO_LARGE`; validate before any write
    - _Requirements: 7.3, 9.2, 9.3, 9.4_

  - [x]* 7.2 Write property test for attachment file validation
    - **Property 16: Attachment file validation** — accepted iff type is PDF/image and size ≤ 10 MB; unsupported types → type error, oversized → size-limit error
    - **Validates: Requirements 9.2, 9.3, 9.4**

  - [x]* 7.3 Write integration test for filesystem blob write/read round-trip
    - Write a screenshot and an attachment to a temp directory and read them back, verifying storage-key referencing (I/O boundary)
    - _Requirements: 7.3, 9.1_

- [x] 8. Implement roster and assignment services
  - [x] 8.1 Implement developer roster management
    - Implement `rosterService.add` (reject duplicate identifier with `ROSTER_DUPLICATE`), `remove` (cascade active assignments), and `list`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 8.2 Implement assignment management
    - Implement `assignmentService.set(projectId, developerId)` creating/replacing the single active assignment per project, `remove(projectId)`, and `list`; reject assigning a developer not in the roster with `ASSIGNMENT_UNKNOWN_DEVELOPER`
    - _Requirements: 14.1, 14.2, 14.3, 14.5_

  - [x]* 8.3 Write property test for roster add-then-list round-trip
    - **Property 23: Roster add then list round-trip** — after adding a developer with a unique identifier, the roster listing contains exactly that developer among its members
    - **Validates: Requirements 13.1, 13.3**

  - [x]* 8.4 Write property test for developer-removal cascade
    - **Property 24: Developer removal cascades assignments** — after removal the roster excludes the developer and no Assignment references them
    - **Validates: Requirements 13.2**

  - [x]* 8.5 Write property test for duplicate roster identifier rejection
    - **Property 25: Duplicate roster identifier is rejected** — adding a developer with an existing identifier is rejected with a duplicate error and the roster is unchanged
    - **Validates: Requirements 13.4**

  - [x]* 8.6 Write property test for assignment semantics
    - **Property 26: Assignment semantics (at most one active per project)** — for any sequence of set/remove operations, at most one assignment is active per project, naming the developer from the most recent successful set (or none if last was a removal)
    - **Validates: Requirements 14.1, 14.2, 14.3**

  - [x]* 8.7 Write property test for non-roster developer assignment rejection
    - **Property 27: Non-roster developer cannot be assigned** — assigning an identifier not in the roster is rejected with a validation error and no Assignment is created
    - **Validates: Requirements 14.5**

- [x] 9. Implement submission service with transactional routing
  - [x] 9.1 Implement submit with item-count guard, routing, and atomicity
    - Implement `changeRequestService.submit(clientId, requestId)` inside a single `better-sqlite3` transaction: validate item count (reject 0 with `VALIDATION_NO_ITEMS`, reject > 500 with `VALIDATION_TOO_MANY_ITEMS`), set status, and record `submitted_at`
    - Determine routing: if the website's Project has an active Assignment → status `Submitted` (visible to Client, assigned Developer, Admin); else → `AwaitingDeveloperAssignment` (visible to Client and Admin)
    - On any persistence failure, roll back so stored state equals the pre-submission state (`SUBMISSION_FAILED`, status unchanged, no partial rows)
    - _Requirements: 10.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 14.4_

  - [x]* 9.2 Write property test for submission item-count guard
    - **Property 18: Submission guard on item count** — submission rejected (status/items unchanged) for 0 or > 500 items; proceeds only for 1–500
    - **Validates: Requirements 10.4, 11.1, 11.5**

  - [x]* 9.3 Write property test for submission routing and visibility
    - **Property 19: Submission routing and visibility** — with 1–500 items: assignment present → `Submitted`, visible to Client/assigned Developer/Admin; no assignment → `AwaitingDeveloperAssignment`, visible to Client/Admin; `submitted_at` recorded in all successful cases
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.6, 14.4**

  - [x]* 9.4 Write property test for submission atomicity
    - **Property 20: Submission atomicity** — for any submission that fails during persistence, stored state equals the pre-submission state (status unchanged, no partial items)
    - **Validates: Requirements 11.7**

  - [x]* 9.5 Write integration test for end-to-end submit on real SQLite
    - Exercise the full submit path against a real file-backed SQLite database, verifying transaction commit and rollback behavior (I/O boundary)
    - _Requirements: 11.1, 11.7_

- [x] 10. Implement role-scoped listing and detail services
  - [x] 10.1 Implement client and developer list/detail scoping
    - Implement client list returning exactly the requesting client's own Change_Requests, and detail returning exactly that request's Change_Items
    - Implement developer list returning exactly Change_Requests whose Website's Project has an active Assignment to the developer, and developer detail returning all items with Component_References, Screenshots, and Attachments
    - _Requirements: 3.1, 3.2, 3.3, 12.1, 12.2, 12.3_

  - [x]* 10.2 Write property test for client-owned list scoping
    - **Property 6: Client change-request list is exactly the client's own** — the list for client C equals exactly the set of requests whose client_id is C
    - **Validates: Requirements 3.1, 3.2**

  - [x]* 10.3 Write property test for change-request detail item scoping
    - **Property 7: Change-request detail contains exactly its own items** — detail returns exactly the items whose change_request_id is that request
    - **Validates: Requirements 3.3**

  - [x]* 10.4 Write property test for developer list scoping
    - **Property 21: Developer change-request list is exactly assigned projects'** — the list for developer D equals exactly requests whose Website's Project has an active Assignment to D
    - **Validates: Requirements 12.1, 12.2**

  - [x]* 10.5 Write property test for developer detail payload completeness
    - **Property 22: Developer detail contains full item payload** — for any request a developer may view, detail includes all items with their Component_References, Screenshots, and Attachments
    - **Validates: Requirements 12.3**

  - [x] 10.6 Implement owned-website picker listing
    - Implement `websiteService.listOwned(clientId)` returning exactly the websites whose `owner_client_id` is the client
    - _Requirements: 4.1_

  - [x]* 10.7 Write property test for website picker listing
    - **Property 8: Website picker lists exactly the client's owned websites** — the picker list for client C equals exactly the websites whose owner_client_id is C
    - **Validates: Requirements 4.1**

- [x] 11. Implement Express middleware and wire the API surface
  - [x] 11.1 Implement middleware stack
    - Implement `requireSession` (401 `AUTH_REQUIRED` when absent/expired), `requireRole(role)` (403 `AUTHZ_FORBIDDEN`), `requireWebsiteOwnership` (403 `AUTHZ_NOT_OWNER`), `validateUpload` (MIME + size), and `csrf`
    - Wire consistent error responses `{ error: { code, message, field? } }` with appropriate HTTP status codes
    - _Requirements: 1.3, 2.3, 2.4, 2.5, 4.2, 9.2, 9.3, 9.4, 15.3, 15.4_

  - [x]* 11.2 Write property test for unauthenticated protected-resource denial
    - **Property 1: Unauthenticated access to protected resources is denied** — any protected resource/action without a valid session is denied with an authentication error (401 / redirect)
    - **Validates: Requirements 1.3, 2.5, 15.3**

  - [x] 11.3 Wire auth, session, website, and inspector routes
    - Implement `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/session`, `GET /api/websites`, `POST /api/inspector/token`, `POST /api/inspector/validate` delegating to services; set HTTP-only, Secure, SameSite=Strict session cookie on login
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.2, 2.5, 4.1, 5.1, 6.1, 6.2, 15.1, 15.2_

  - [x] 11.4 Wire change-request, item, screenshot, and attachment routes
    - Implement `POST /api/change-requests`, `POST /api/change-requests/:id/items`, `POST /api/change-requests/:id/screenshots`, `POST /api/change-requests/:id/items/:itemId/attachments`, `POST /api/change-requests/:id/submit`, `GET /api/change-requests`, `GET /api/change-requests/:id` with ownership/assignment checks
    - _Requirements: 3.1, 3.2, 3.3, 4.2, 7.3, 8.9, 9.1, 10.1, 10.2, 10.3, 11.1, 11.5, 12.1, 12.2, 12.3, 15.4_

  - [x] 11.5 Wire admin roster and assignment routes
    - Implement `GET/POST /api/admin/developers`, `DELETE /api/admin/developers/:id`, `GET /api/admin/assignments`, `PUT/DELETE /api/admin/projects/:projectId/assignment`, all behind `requireRole(Admin)`
    - _Requirements: 2.4, 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3, 14.5_

  - [x]* 11.6 Write integration tests for representative API routes
    - Exercise login→session cookie→protected route, submit routing, and admin-only gating against a running app instance with real SQLite (I/O boundary)
    - _Requirements: 1.1, 2.4, 11.1_

- [x] 12. Checkpoint - backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement frontend auth shell and dashboards
  - [x] 13.1 Implement router guard and login view
    - Implement `AuthGate`/router guard reading `/api/session` and redirecting unauthenticated users to `/login`; implement `LoginView` posting credentials and showing auth errors
    - _Requirements: 1.1, 1.2, 1.3, 2.5_

  - [x] 13.2 Implement role-based dashboard router and dashboards
    - Implement `DashboardRouter` rendering `ClientDashboard`, `DeveloperDashboard`, or `AdminDashboard` by role; `ClientDashboard` lists the client's requests with status, empty-state, and New control; `DeveloperDashboard` lists assigned requests; `AdminDashboard` shows all requests plus roster/assignment management; `ChangeRequestDetail` shows items, component references, screenshots, attachments
    - _Requirements: 2.2, 3.1, 3.3, 3.4, 3.5, 12.1, 12.3, 13.3, 14.1_

  - [x]* 13.3 Write unit tests for empty-state and New-control flow
    - Cover the empty-state dashboard and the New control prompting website selection (EXAMPLE criteria)
    - _Requirements: 3.4, 3.5_

- [x] 14. Implement frontend website picker and popup controller
  - [x] 14.1 Implement website picker
    - Implement `WebsitePicker` listing only owned websites (from `GET /api/websites`); selecting one starts composition and allows exactly one website per Change_Request
    - _Requirements: 4.1, 4.4_

  - [x] 14.2 Implement popup controller with inspector token handshake
    - Implement `WebsiteOpenController` that mints an inspector token, opens the site via `window.open(url, name, resizable features)`, retains the handle, polls `popup.closed`, performs the origin-checked `postMessage` handshake (`INSPECTOR_INIT`), binds composition to the website id, and posts `INSPECTOR_DISABLE` on logout/idle-expiry
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.6, 10.3_

  - [x]* 14.3 Write smoke tests for popup open features and navigation
    - Assert `window.open` is called with resizable features and that in-site navigation is allowed (SMOKE criteria)
    - _Requirements: 5.2, 5.3_

- [x] 15. Implement frontend change composer and attachment input
  - [x] 15.1 Implement Change_Type-driven item form and composer
    - Implement `ChangeComposer` managing the in-progress request; per-item form driven by Change_Type (Add → single content field; Delete → single content field, no attachments; Update → current + updated fields); validate description and required fields, retaining entered values on error; add items on Done; Continue to add another item; disable Submit while zero items
    - Wire to `POST /api/change-requests`, `.../items`, `.../screenshots`, `.../submit`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 8.9, 10.1, 10.2, 10.4, 11.1_

  - [x] 15.2 Implement attachment input with client-side pre-check
    - Implement `AttachmentInput` shown only for Add/Update with client-side PDF/image type and ≤ 10 MB pre-check; hidden for Delete; upload via `.../attachments`
    - _Requirements: 8.7, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]* 15.3 Write unit tests for composer validation and Submit-disabled state
    - Cover validation-error value retention and Submit disabled at zero items
    - _Requirements: 8.5, 8.6, 10.4_

- [x] 16. Implement injected inspector script
  - [x] 16.1 Implement bootstrap, token validation, and component picker
    - Implement the injected `inspector.js`: stays inert until an origin-verified `INSPECTOR_INIT` message from `window.opener` carries the token; calls `POST /api/inspector/validate` and enables UI only on success; deactivates when validate fails or `INSPECTOR_DISABLE` is received; hover-highlights DOM elements and click-selects, computing optional selector/HTML metadata
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 15.1, 15.2_

  - [x] 16.2 Implement client-side capturer and uploader
    - On selection, record the bounding box, draw a highlight overlay, rasterize the page (including overlay) to a PNG blob in parallel with recording the Component_Reference; hand the blob to the opener which uploads to `.../screenshots` and attaches it to the current item; on capture failure surface a retryable error and keep the selection active
    - _Requirements: 6.3, 7.1, 7.2, 7.3, 7.4_

  - [x]* 16.3 Write unit test for capture-failure retry
    - Cover the capture-failure path surfacing a retryable error while retaining the selection (EXAMPLE criterion)
    - _Requirements: 7.4_

- [x] 17. Implement security hardening and final wiring
  - [x] 17.1 Enforce HTTPS/HSTS and finalize secure cookie/transport config
    - Configure the server (or reverse-proxy assumptions) to require HTTPS and set HSTS; ensure session cookie is HTTP-only, Secure, SameSite=Strict; ensure the inspector token secret is server-side only and credentials are never logged
    - Wire the SPA build to be served by the Express app and confirm the inspector script is served from the portal origin
    - _Requirements: 15.5, 1.1, 15.2_

  - [x]* 17.2 Write smoke test for HTTPS/HSTS enforcement
    - Assert HTTP is redirected/refused and the HSTS header is present (SMOKE criterion)
    - _Requirements: 15.5_

- [x] 18. Final checkpoint - ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements (granular sub-requirements) for traceability, and each property test task references its design property number and text.
- All 27 correctness properties are covered by exactly one property test each (Properties 1–27), tagged with `// Feature: change-request-portal, Property {number}: {property_text}` and run at a minimum of 100 iterations (`numRuns: 100`).
- EXAMPLE/SMOKE-classified criteria (1.1, 1.4, 2.1, 3.4, 3.5, 4.3, 5.1, 5.2, 5.3, 7.4, 15.5) are covered by unit/integration/smoke tests.
- Property tests use in-memory SQLite plus mocked filesystem/clock; integration tests use real SQLite file transactions and filesystem blob I/O.
- Checkpoints (tasks 6, 12, 18) ensure incremental validation as layers build up.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "4.1", "5.1", "7.1"] },
    { "id": 3, "tasks": ["2.3", "3.1", "3.5", "4.2", "5.2", "5.3", "5.4", "7.2", "7.3", "8.1", "8.2"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.6", "3.7", "3.8", "5.5", "8.3", "8.4", "8.5", "8.6", "8.7", "9.1", "10.1", "10.6"] },
    { "id": 5, "tasks": ["5.6", "5.7", "5.8", "9.2", "9.3", "9.4", "9.5", "10.2", "10.3", "10.4", "10.5", "10.7"] },
    { "id": 6, "tasks": ["11.1"] },
    { "id": 7, "tasks": ["11.3", "11.4", "11.5"] },
    { "id": 8, "tasks": ["11.2", "11.6", "13.1", "16.1"] },
    { "id": 9, "tasks": ["13.2", "14.1", "14.2", "16.2", "17.1"] },
    { "id": 10, "tasks": ["13.3", "14.3", "15.1", "15.2", "16.3", "17.2"] },
    { "id": 11, "tasks": ["15.3"] }
  ]
}
```
