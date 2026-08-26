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

  // --- CORS for cross-origin callers ---------------------------------------
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  if (allowedOrigins.size > 0) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
        if (req.method === "OPTIONS") return res.status(204).end();
      }
      next();
    });
  }

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
      sameSite: "strict",
      secure: options.secureCookies ?? false,
      path: "/",
    });
    res.cookie(CSRF_COOKIE, csrfTokenFor(sid, container.csrfSecret), {
      httpOnly: false,
      sameSite: "strict",
      secure: options.secureCookies ?? false,
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
