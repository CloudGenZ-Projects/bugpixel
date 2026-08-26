/**
 * Express application factory. Wires routes, applies auth/role middleware, and
 * installs security headers + error handler.
 */
import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { v4 as uuid } from "uuid";

import { Role, ChangeRequestStatus, Priority, makeApiError } from "@crp/shared";
import type { Container } from "../container.js";
import { ServiceError } from "../services/serviceError.js";
import { makeRateLimiter } from "../services/rateLimiter.js";
import {
  SESSION_COOKIE,
  CSRF_COOKIE,
  asyncHandler,
  errorHandler,
  makeRequireRole,
  makeRequireSession,
  makeCsrf,
  makeValidateUpload,
  csrfTokenFor,
} from "./middleware.js";

export interface AppOptions {
  secureCookies?: boolean;
  enforceHttps?: boolean;
  spaDir?: string;
  inspectorDir?: string;
  allowedOrigins?: string[];
}

/** Escape HTML special characters to prevent XSS in rendered output. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeBase64Payload(input: unknown): Uint8Array {
  if (typeof input !== "string" || input.length === 0) {
    throw new ServiceError(
      "VALIDATION_UNSUPPORTED_TYPE",
      400,
      "A base64 file payload is required.",
      "attachment"
    );
  }
  const comma = input.indexOf(",");
  const base64 = input.startsWith("data:") && comma >= 0 ? input.slice(comma + 1) : input;
  return new Uint8Array(Buffer.from(base64, "base64"));
}

export function makeApp(container: Container, options: AppOptions = {}) {
  const app = express();
  app.set("trust proxy", true);

  // --- Rate limiters -------------------------------------------------------
  const loginLimiter = makeRateLimiter({ maxRequests: 5, windowMs: 60_000 });
  const apiLimiter = makeRateLimiter({ maxRequests: 100, windowMs: 60_000 });

  // --- Security headers + HTTPS enforcement --------------------------------
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (options.enforceHttps) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      const proto = req.headers["x-forwarded-proto"];
      const isHttps = req.secure || proto === "https";
      if (!isHttps) {
        return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
      }
    }
    next();
  });

  app.use(express.json({ limit: "15mb" }));
  app.use(cookieParser());

  // --- Global API rate limit -----------------------------------------------
  app.use("/api", (req, res, next) => {
    const key = req.ip ?? "unknown";
    if (!apiLimiter.allow(key)) {
      return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Try again shortly." } });
    }
    next();
  });

  // --- CORS: dynamic origin allowlist from registered websites -------------
  // Instead of a static env-var list, we check incoming Origin against the
  // website.url column in the DB. Cached for 60s so it's not a DB hit per request.
  let cachedOrigins: Set<string> | null = null;
  let cacheExpiry = 0;

  function getAllowedOrigins(): Set<string> {
    const now = Date.now();
    if (cachedOrigins && now < cacheExpiry) return cachedOrigins;
    // Build set of origins from all registered website URLs
    const websites = container.repos.websites.listAll();
    const origins = new Set<string>();
    // Also include any statically configured origins (fallback/override)
    for (const o of options.allowedOrigins ?? []) {
      if (o === "*") {
        // Wildcard: allow all origins dynamically
        cachedOrigins = new Set(["*"]);
        cacheExpiry = now + 60_000;
        return cachedOrigins;
      }
      origins.add(o);
    }
    for (const w of websites) {
      try {
        origins.add(new URL(w.url).origin);
      } catch {
        // skip malformed URLs
      }
    }
    cachedOrigins = origins;
    cacheExpiry = now + 60_000;
    return origins;
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next();
    const allowed = getAllowedOrigins();
    if (allowed.has("*") || allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
      if (req.method === "OPTIONS") return res.status(204).end();
    }
    next();
  });

  const requireSession = makeRequireSession(container);
  const requireAdmin = [requireSession, makeRequireRole(container, Role.Admin)];
  const requireClient = [requireSession, makeRequireRole(container, Role.Client)];
  const requireDeveloper = [requireSession, makeRequireRole(container, Role.Developer)];

  app.use(
    "/api",
    makeCsrf(container.csrfSecret, ["/api/auth/login", "/api/inspector/validate"])
  );

  function setSessionCookie(res: Response, sid: string) {
    res.cookie(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/",
    });
    res.cookie(CSRF_COOKIE, csrfTokenFor(sid, container.csrfSecret), {
      httpOnly: false,
      sameSite: "none",
      secure: true,
      path: "/",
    });
  }

  // === Auth + session ======================================================
  app.post(
    "/api/auth/login",
    asyncHandler((req: Request, res: Response) => {
      // Rate limit login attempts
      const key = req.ip ?? "unknown";
      if (!loginLimiter.allow(key)) {
        return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again in a minute." } });
      }
      const { identifier, password } = req.body ?? {};
      const { session, user } = container.auth.login(
        String(identifier),
        String(password)
      );
      setSessionCookie(res, session.id);
      res.json({
        user: { id: user.id, email: user.email, role: user.role },
        csrfToken: csrfTokenFor(session.id, container.csrfSecret),
      });
    })
  );

  app.post(
    "/api/auth/logout",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      container.auth.logout(req.session!.id);
      res.clearCookie(SESSION_COOKIE, { path: "/" });
      res.clearCookie(CSRF_COOKIE, { path: "/" });
      res.json({ ok: true });
    })
  );

  app.get(
    "/api/session",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const user = container.repos.users.getById(req.session!.userId)!;
      res.json({
        user: { id: user.id, email: user.email, role: user.role },
        view: container.authz.dashboardView(user.role),
        csrfToken: csrfTokenFor(req.session!.id, container.csrfSecret),
      });
    })
  );

  // === File serving (screenshots + attachments) ============================
  app.get(
    "/api/files/:key",
    requireSession,
    asyncHandler(async (req: Request, res: Response) => {
      const key = req.params.key;
      // Validate key is hex only to prevent path traversal
      if (!/^[0-9a-f]{64}$/.test(key)) {
        return res.status(400).json(makeApiError("AUTH_REQUIRED", "Invalid file key."));
      }

      // R2 async path
      if (container.r2Ops) {
        try {
          const { bytes, contentType } = await container.r2Ops.read(key);
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return res.send(Buffer.from(bytes));
        } catch {
          return res.status(404).json(makeApiError("AUTH_REQUIRED", "File not found."));
        }
      }

      // Local filesystem path
      if (!container.fileStore.exists(key)) {
        return res.status(404).json(makeApiError("AUTH_REQUIRED", "File not found."));
      }
      const bytes = container.fileStore.read(key);
      let contentType = "application/octet-stream";
      if (bytes[0] === 0x89 && bytes[1] === 0x50) contentType = "image/png";
      else if (bytes[0] === 0xFF && bytes[1] === 0xD8) contentType = "image/jpeg";
      else if (bytes[0] === 0x25 && bytes[1] === 0x50) contentType = "application/pdf";
      else if (bytes[0] === 0x47 && bytes[1] === 0x49) contentType = "image/gif";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.send(Buffer.from(bytes));
    })
  );

  // === Websites (client) ===================================================
  app.get(
    "/api/websites",
    requireClient,
    asyncHandler((req: Request, res: Response) => {
      res.json({ websites: container.websites.listOwned(req.session!.userId) });
    })
  );

  // === Inspector token =====================================================
  app.post(
    "/api/inspector/token",
    requireClient,
    asyncHandler((req: Request, res: Response) => {
      const { websiteId } = req.body ?? {};
      const result = container.inspectorTokens.mint(
        { sessionId: req.session!.id, userId: req.session!.userId },
        String(websiteId)
      );
      res.json(result);
    })
  );

  app.post(
    "/api/inspector/validate",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const { token, websiteId } = req.body ?? {};
      const result = container.inspectorTokens.validate(token, String(websiteId));
      res.json(result);
    })
  );

  // === Change requests (client compose + submit) ===========================
  app.post(
    "/api/change-requests",
    requireClient,
    asyncHandler((req: Request, res: Response) => {
      const { websiteId, priority } = req.body ?? {};
      const cr = container.changeRequests.createDraft(
        req.session!.userId,
        String(websiteId)
      );
      // Update priority if provided
      if (priority && Object.values(Priority).includes(priority)) {
        container.repos.changeRequests.updatePriority(cr.id, priority);
      }
      res.status(201).json({ changeRequest: container.repos.changeRequests.getById(cr.id) });
    })
  );

  app.post(
    "/api/change-requests/:id/items",
    requireClient,
    asyncHandler((req: Request, res: Response) => {
      const item = container.changeRequests.addItem(
        req.session!.userId,
        req.params.id,
        req.body
      );
      res.status(201).json({ item });
    })
  );

  app.post(
    "/api/change-requests/:id/screenshots",
    requireClient,
    asyncHandler((req: Request, res: Response) => {
      const { dataBase64, mime } = req.body ?? {};
      const bytes = decodeBase64Payload(dataBase64);
      const storageKey = container.changeRequests.storeScreenshot(
        req.session!.userId,
        req.params.id,
        bytes,
        String(mime ?? "image/png")
      );
      res.status(201).json({ storageKey });
    })
  );

  app.post(
    "/api/change-requests/:id/items/:itemId/attachments",
    requireClient,
    makeValidateUpload(),
    asyncHandler((req: Request, res: Response) => {
      const { dataBase64, mime, filename } = req.body ?? {};
      const bytes = decodeBase64Payload(dataBase64);
      const attachment = container.changeRequests.addAttachment(
        req.session!.userId,
        req.params.id,
        req.params.itemId,
        bytes,
        String(mime ?? "application/octet-stream"),
        String(filename ?? "attachment")
      );
      res.status(201).json({ attachment });
    })
  );

  app.post(
    "/api/change-requests/:id/submit",
    requireClient,
    asyncHandler((req: Request, res: Response) => {
      const cr = container.changeRequests.submit(req.session!.userId, req.params.id);
      res.json({ changeRequest: cr });
    })
  );

  // === Change request status transitions (developer/admin) =================
  app.patch(
    "/api/change-requests/:id/status",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const { status } = req.body ?? {};
      const s = req.session!;
      const cr = container.repos.changeRequests.getById(req.params.id);
      if (!cr) {
        return res.status(404).json(makeApiError("AUTH_REQUIRED", "Not found."));
      }

      // Validate the transition is allowed
      const validTransitions: Record<string, string[]> = {
        Submitted: ["InProgress", "Rejected"],
        AwaitingDeveloperAssignment: ["InProgress", "Rejected"],
        InProgress: ["Done", "Rejected"],
        Done: [], // terminal
        Rejected: ["InProgress"], // can reopen
      };

      const allowed = validTransitions[cr.status] ?? [];
      if (!allowed.includes(status)) {
        return res.status(400).json(makeApiError("AUTHZ_FORBIDDEN", `Cannot transition from ${cr.status} to ${status}.`));
      }

      // Only developers assigned to the project or admins can transition
      if (s.role === Role.Developer) {
        if (!container.ownership.canDeveloperView(s.userId, cr.id)) {
          return res.status(403).json(makeApiError("AUTHZ_FORBIDDEN", "Not assigned to this request."));
        }
      } else if (s.role !== Role.Admin) {
        return res.status(403).json(makeApiError("AUTHZ_FORBIDDEN", "Only developers or admins can update status."));
      }

      container.repos.changeRequests.updateStatus(cr.id, status as ChangeRequestStatus);
      // Log activity
      container.repos.activities.create({
        id: uuid(),
        changeRequestId: cr.id,
        actorId: s.userId,
        action: "status_change",
        detail: `${cr.status} → ${status}`,
        createdAt: new Date(container.clock.now()).toISOString(),
      });
      res.json({ changeRequest: container.repos.changeRequests.getById(cr.id) });
    })
  );

  // === Change request priority update ======================================
  app.patch(
    "/api/change-requests/:id/priority",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const { priority } = req.body ?? {};
      if (!Object.values(Priority).includes(priority)) {
        return res.status(400).json(makeApiError("AUTHZ_FORBIDDEN", "Invalid priority."));
      }
      const cr = container.repos.changeRequests.getById(req.params.id);
      if (!cr) return res.status(404).json(makeApiError("AUTH_REQUIRED", "Not found."));
      container.repos.changeRequests.updatePriority(cr.id, priority);
      res.json({ changeRequest: container.repos.changeRequests.getById(cr.id) });
    })
  );

  // === Notes (comments) on change requests =================================
  app.get(
    "/api/change-requests/:id/notes",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const notes = container.repos.notes.listByRequest(req.params.id);
      // Enrich with author email
      const enriched = notes.map((n) => {
        const author = container.repos.users.getById(n.authorId);
        return { ...n, authorEmail: author?.email ?? "unknown" };
      });
      res.json({ notes: enriched });
    })
  );

  app.post(
    "/api/change-requests/:id/notes",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const { content } = req.body ?? {};
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json(makeApiError("VALIDATION_DESCRIPTION_REQUIRED", "Note content is required."));
      }
      const note = container.repos.notes.create({
        id: uuid(),
        changeRequestId: req.params.id,
        authorId: req.session!.userId,
        content: content.trim(),
        createdAt: new Date(container.clock.now()).toISOString(),
      });
      const author = container.repos.users.getById(note.authorId);
      res.status(201).json({ note: { ...note, authorEmail: author?.email ?? "unknown" } });
    })
  );

  // === Activity feed ========================================================
  app.get(
    "/api/change-requests/:id/activity",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const activities = container.repos.activities.listByRequest(req.params.id);
      const enriched = activities.map((a) => {
        const actor = container.repos.users.getById(a.actorId);
        return { ...a, actorEmail: actor?.email ?? "unknown" };
      });
      res.json({ activities: enriched });
    })
  );

  // === Bulk status update ==================================================
  app.post(
    "/api/change-requests/bulk-status",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const { ids, status } = req.body ?? {};
      const s = req.session!;
      if (!Array.isArray(ids) || !status) {
        return res.status(400).json(makeApiError("AUTHZ_FORBIDDEN", "ids (array) and status are required."));
      }
      if (s.role !== Role.Admin && s.role !== Role.Developer) {
        return res.status(403).json(makeApiError("AUTHZ_FORBIDDEN", "Only developers or admins can bulk update."));
      }
      let updated = 0;
      for (const id of ids) {
        const cr = container.repos.changeRequests.getById(id);
        if (!cr) continue;
        container.repos.changeRequests.updateStatus(cr.id, status as ChangeRequestStatus);
        container.repos.activities.create({
          id: uuid(),
          changeRequestId: cr.id,
          actorId: s.userId,
          action: "status_change",
          detail: `${cr.status} → ${status} (bulk)`,
          createdAt: new Date(container.clock.now()).toISOString(),
        });
        updated++;
      }
      res.json({ updated });
    })
  );

  // === Password change (self-service) ======================================
  app.post(
    "/api/auth/change-password",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const { currentPassword, newPassword } = req.body ?? {};
      if (!currentPassword || !newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json(makeApiError("VALIDATION_DESCRIPTION_REQUIRED", "New password must be at least 8 characters."));
      }
      const user = container.repos.users.getById(req.session!.userId);
      if (!user) return res.status(401).json(makeApiError("AUTH_REQUIRED", "User not found."));

      // Verify current password using the auth service
      try {
        container.auth.login(user.email, String(currentPassword));
      } catch {
        return res.status(401).json(makeApiError("AUTH_INVALID_CREDENTIALS", "Current password is incorrect."));
      }

      const newHash = container.auth.hashPassword(String(newPassword));
      container.repos.users.updatePassword(user.id, newHash);
      res.json({ ok: true });
    })
  );

  // === Analytics / reporting ================================================
  app.get(
    "/api/analytics/monthly",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const months = Number(req.query.months) || 12;
      res.json({ stats: container.repos.changeRequests.getMonthlyStats(months) });
    })
  );

  app.get(
    "/api/analytics/summary",
    requireSession,
    asyncHandler((_req: Request, res: Response) => {
      const counts = container.repos.changeRequests.getStatusCounts();
      res.json({ counts });
    })
  );

  // === Export change request as printable HTML (PDF via browser print) ======
  app.get(
    "/api/change-requests/:id/export",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const s = req.session!;
      const cr = container.repos.changeRequests.getById(req.params.id);
      if (!cr) return res.status(404).json(makeApiError("AUTH_REQUIRED", "Not found."));

      const items = container.repos.changeItems.listByRequest(cr.id).map((item) => ({
        item,
        screenshot: container.repos.screenshots.getByItem(item.id),
        componentReference: container.repos.componentReferences.getByItem(item.id),
      }));
      const website = container.repos.websites.getById(cr.websiteId);

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Change Request #${cr.id.slice(0, 8)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #111; }
  h1 { font-size: 24px; border-bottom: 2px solid #6366f1; padding-bottom: 8px; }
  .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
  .item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge-add { background: #d1fae5; color: #065f46; }
  .badge-update { background: #dbeafe; color: #1e40af; }
  .badge-delete { background: #fee2e2; color: #991b1b; }
  .content-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin: 8px 0; font-size: 14px; }
  img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; }
  @media print { body { margin: 0; } .item { break-inside: avoid; } }
</style></head><body>
<h1>Change Request #${cr.id.slice(0, 8)}</h1>
<div class="meta">
  <p><strong>Website:</strong> ${website?.name ?? "Unknown"} (${website?.url ?? ""})</p>
  <p><strong>Status:</strong> ${cr.status} | <strong>Priority:</strong> ${cr.priority}</p>
  <p><strong>Submitted:</strong> ${cr.submittedAt ? new Date(cr.submittedAt).toLocaleString() : "Draft"}</p>
  ${cr.dueDate ? `<p><strong>Due:</strong> ${cr.dueDate}</p>` : ""}
</div>
<h2>${items.length} Change Item${items.length !== 1 ? "s" : ""}</h2>
${items.map(({ item, screenshot, componentReference }, i) => `
<div class="item">
  <p><strong>#${i + 1}</strong> <span class="badge badge-${item.changeType.toLowerCase()}">${item.changeType}</span>
    ${componentReference?.selector ? `<code>${escapeHtml(componentReference.selector)}</code>` : ""}</p>
  <p>${escapeHtml(item.description)}</p>
  ${item.contentAdd ? `<div class="content-box"><strong>Add:</strong> ${escapeHtml(item.contentAdd)}</div>` : ""}
  ${item.contentCurrent ? `<div class="content-box"><strong>Current:</strong> ${escapeHtml(item.contentCurrent)}</div>` : ""}
  ${item.contentUpdated ? `<div class="content-box"><strong>Updated:</strong> ${escapeHtml(item.contentUpdated)}</div>` : ""}
  ${item.contentDelete ? `<div class="content-box"><strong>Remove:</strong> ${escapeHtml(item.contentDelete)}</div>` : ""}
  ${screenshot ? `<img src="/api/files/${screenshot.storageKey}" alt="Screenshot" />` : ""}
</div>`).join("\n")}
<p style="color:#999;font-size:12px;margin-top:32px;">Generated by BugPixel on ${new Date().toISOString()}</p>
</body></html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    })
  );

  // === Role-scoped listing + detail ========================================
  app.get(
    "/api/change-requests",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const s = req.session!;
      let changeRequests;
      if (s.role === Role.Client)
        changeRequests = container.listing.listForClient(s.userId);
      else if (s.role === Role.Developer)
        changeRequests = container.listing.listForDeveloper(s.userId);
      else changeRequests = container.listing.listAllForAdmin();
      res.json({ changeRequests });
    })
  );

  app.get(
    "/api/change-requests/:id",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      const s = req.session!;
      if (s.role === Role.Client) {
        res.json(container.listing.clientDetail(s.userId, req.params.id));
      } else if (s.role === Role.Developer) {
        res.json(container.listing.developerDetail(s.userId, req.params.id));
      } else {
        res.json(container.listing.adminDetail(req.params.id));
      }
    })
  );

  // === Admin: roster =======================================================
  app.get(
    "/api/admin/developers",
    requireAdmin,
    asyncHandler((_req: Request, res: Response) => {
      const developers = container.roster
        .list()
        .map((u) => ({ id: u.id, email: u.email, role: u.role }));
      res.json({ developers });
    })
  );

  app.post(
    "/api/admin/developers",
    requireAdmin,
    asyncHandler((req: Request, res: Response) => {
      const { identifier, password } = req.body ?? {};
      const passwordHash = container.auth.hashPassword(String(password ?? ""));
      const dev = container.roster.add({ identifier: String(identifier), passwordHash });
      res.status(201).json({ developer: { id: dev.id, email: dev.email, role: dev.role } });
    })
  );

  app.delete(
    "/api/admin/developers/:id",
    requireAdmin,
    asyncHandler((req: Request, res: Response) => {
      container.roster.remove(req.params.id);
      res.json({ ok: true });
    })
  );

  // === Admin: assignments ==================================================
  app.get(
    "/api/admin/assignments",
    requireAdmin,
    asyncHandler((_req: Request, res: Response) => {
      res.json({ assignments: container.assignments.list() });
    })
  );

  app.put(
    "/api/admin/projects/:projectId/assignment",
    requireAdmin,
    asyncHandler((req: Request, res: Response) => {
      const { developerId } = req.body ?? {};
      const assignment = container.assignments.set(
        req.params.projectId,
        String(developerId)
      );
      res.json({ assignment });
    })
  );

  app.delete(
    "/api/admin/projects/:projectId/assignment",
    requireAdmin,
    asyncHandler((req: Request, res: Response) => {
      container.assignments.remove(req.params.projectId);
      res.json({ ok: true });
    })
  );

  // === Admin: projects + websites ==========================================
  app.get(
    "/api/admin/projects",
    requireAdmin,
    asyncHandler((_req: Request, res: Response) => {
      res.json({ projects: container.repos.projects.list() });
    })
  );

  app.post(
    "/api/admin/projects",
    requireAdmin,
    asyncHandler((req: Request, res: Response) => {
      const { name } = req.body ?? {};
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json(makeApiError("VALIDATION_DESCRIPTION_REQUIRED", "Project name is required."));
      }
      const project = container.repos.projects.create({ id: uuid(), name: name.trim() });
      res.status(201).json({ project });
    })
  );

  app.get(
    "/api/admin/websites",
    requireAdmin,
    asyncHandler((_req: Request, res: Response) => {
      const websites = container.repos.websites.listAll();
      const enriched = websites.map((w) => {
        const owner = container.repos.users.getById(w.ownerClientId);
        const project = container.repos.projects.getById(w.projectId);
        return { ...w, ownerEmail: owner?.email ?? "unknown", projectName: project?.name ?? "unknown" };
      });
      res.json({ websites: enriched });
    })
  );

  app.post(
    "/api/admin/websites",
    requireAdmin,
    asyncHandler((req: Request, res: Response) => {
      const { name, url, projectId, ownerClientId } = req.body ?? {};
      if (!name || !url || !projectId || !ownerClientId) {
        return res.status(400).json(makeApiError("VALIDATION_DESCRIPTION_REQUIRED", "name, url, projectId, and ownerClientId are required."));
      }
      const website = container.repos.websites.create({
        id: uuid(),
        projectId: String(projectId),
        ownerClientId: String(ownerClientId),
        name: String(name),
        url: String(url),
      });
      res.status(201).json({ website });
    })
  );

  // Get all clients (for website owner assignment)
  app.get(
    "/api/admin/clients",
    requireAdmin,
    asyncHandler((_req: Request, res: Response) => {
      const clients = container.repos.users.listByRole(Role.Client);
      res.json({ clients: clients.map((u) => ({ id: u.id, email: u.email })) });
    })
  );

  // Fallback 404 for unknown API routes.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json(makeApiError("AUTH_REQUIRED", "Not found."));
  });

  // Serve the injected inspector script from the portal origin.
  if (options.inspectorDir) {
    app.use("/inspector", express.static(options.inspectorDir));
  }

  // Serve the built SPA and support client-side routing.
  if (options.spaDir) {
    const spaDir = options.spaDir;
    app.use(express.static(spaDir));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile("index.html", { root: spaDir });
    });
  }

  app.use(errorHandler);
  return app;
}
