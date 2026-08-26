/**
 * Express application factory. Wires every route from the design's API surface
 * to the service container, applies auth/role/ownership middleware, and installs
 * the consistent JSON error handler.
 *
 * Session cookie is HTTP-only, SameSite=Strict, and Secure in production.
 *
 * Requirements: 1.1-1.4, 2.2-2.5, 3.1-3.3, 4.1, 4.2, 5.1, 6.1, 6.2, 7.3, 8.9,
 * 9.1, 10.x, 11.x, 12.x, 13.x, 14.x, 15.1-15.4
 */
import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";

import { Role, makeApiError } from "@crp/shared";
import type { Container } from "../container.js";
import { ServiceError } from "../services/serviceError.js";
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
  /** When true, the session cookie is marked Secure (production/HTTPS). */
  secureCookies?: boolean;
  /**
   * When true, enforce HTTPS: send HSTS on every response and redirect plain
   * HTTP requests to https (Req 15.5). Enable in production behind a
   * TLS-terminating proxy that sets X-Forwarded-Proto.
   */
  enforceHttps?: boolean;
  /** Absolute path to the built SPA to serve (optional). */
  spaDir?: string;
  /** Absolute path to the built inspector script directory (optional). */
  inspectorDir?: string;
  /**
   * Origins allowed to make credentialed cross-origin requests (e.g. a sample
   * client website hosted on a different origin using the inspector). Each
   * listed origin is reflected in Access-Control-Allow-Origin with credentials
   * enabled. Same-origin requests never need this.
   */
  allowedOrigins?: string[];
}

/**
 * Decode a base64 or data-URL image/file payload into raw bytes. Accepts either
 * a bare base64 string or a `data:<mime>;base64,<data>` data URL.
 */
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

  // --- Security headers + HTTPS enforcement (Req 15.5) ---------------------
  app.use((req, res, next) => {
    // Baseline security headers (align with Golden Path HTTP security headers
    // guidance: HSTS, X-Content-Type-Options, X-Frame-Options).
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (options.enforceHttps) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      const proto = req.headers["x-forwarded-proto"];
      const isHttps = req.secure || proto === "https";
      if (!isHttps) {
        // Redirect plain HTTP to HTTPS.
        return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
      }
    }
    next();
  });

  app.use(express.json({ limit: "15mb" }));
  app.use(cookieParser());

  // --- CORS for credentialed cross-origin callers (e.g. the inspector on a
  // client website hosted on a different origin). Only listed origins are
  // allowed, and only with credentials so cookies/CSRF flow correctly.
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  if (allowedOrigins.size > 0) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
        if (req.method === "OPTIONS") {
          return res.status(204).end();
        }
      }
      next();
    });
  }

  const requireSession = makeRequireSession(container);
  const requireAdmin = [requireSession, makeRequireRole(container, Role.Admin)];
  const requireClient = [requireSession, makeRequireRole(container, Role.Client)];

  // CSRF protection on state-changing API requests. Login (no session yet) and
  // the cross-origin inspector validate endpoint (token-gated) are exempt.
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
    // Companion CSRF cookie: readable by JS (double-submit), same-site.
    res.cookie(CSRF_COOKIE, csrfTokenFor(sid, container.csrfSecret), {
      httpOnly: false,
      sameSite: "strict",
      secure: options.secureCookies ?? false,
      path: "/",
    });
  }

  // --- Auth + session ------------------------------------------------------
  app.post(
    "/api/auth/login",
    asyncHandler((req: Request, res: Response) => {
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

  // --- Websites (client) ---------------------------------------------------
  app.get(
    "/api/websites",
    requireClient,
    asyncHandler((req: Request, res: Response) => {
      res.json({ websites: container.websites.listOwned(req.session!.userId) });
    })
  );

  // --- Inspector token -----------------------------------------------------
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

  // --- Change requests (client compose + submit) ---------------------------
  app.post(
    "/api/change-requests",
    requireClient,
    asyncHandler((req: Request, res: Response) => {
      const { websiteId } = req.body ?? {};
      const cr = container.changeRequests.createDraft(
        req.session!.userId,
        String(websiteId)
      );
      res.status(201).json({ changeRequest: cr });
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

  // Upload a captured screenshot blob; returns the opaque storage key the
  // client then includes in the addItem body (Req 7.3).
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

  // Upload an attachment for an item (Add/Update only); validated + persisted
  // (Req 9.1-9.4).
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

  // Role-scoped list + detail. The list is dispatched by role; detail is
  // dispatched by role with ownership/assignment checks in the service.
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
        // Admin can view any request's full payload.
        res.json(container.listing.adminDetail(req.params.id));
      }
    })
  );

  // --- Admin: roster -------------------------------------------------------
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
      res
        .status(201)
        .json({ developer: { id: dev.id, email: dev.email, role: dev.role } });
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

  // --- Admin: assignments --------------------------------------------------
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

  // Serve the injected inspector script from the portal origin (Req 17.1) so
  // client websites can include <script src="https://portal/inspector/...">.
  if (options.inspectorDir) {
    app.use("/inspector", express.static(options.inspectorDir));
  }

  // Serve the built SPA and support client-side routing (deep links).
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
