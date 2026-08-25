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
import {
  SESSION_COOKIE,
  asyncHandler,
  errorHandler,
  makeRequireRole,
  makeRequireSession,
} from "./middleware.js";

export interface AppOptions {
  /** When true, the session cookie is marked Secure (production/HTTPS). */
  secureCookies?: boolean;
}

export function makeApp(container: Container, options: AppOptions = {}) {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use(cookieParser());

  const requireSession = makeRequireSession(container);
  const requireAdmin = [requireSession, makeRequireRole(container, Role.Admin)];
  const requireClient = [requireSession, makeRequireRole(container, Role.Client)];
  const requireDeveloper = [requireSession, makeRequireRole(container, Role.Developer)];

  function setSessionCookie(res: Response, sid: string) {
    res.cookie(SESSION_COOKIE, sid, {
      httpOnly: true,
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
      const { session, user } = container.auth.login(String(identifier), String(password));
      setSessionCookie(res, session.id);
      res.json({ user: { id: user.id, email: user.email, role: user.role } });
    })
  );

  app.post(
    "/api/auth/logout",
    requireSession,
    asyncHandler((req: Request, res: Response) => {
      container.auth.logout(req.session!.id);
      res.clearCookie(SESSION_COOKIE, { path: "/" });
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
      const cr = container.changeRequests.createDraft(req.session!.userId, String(websiteId));
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
      if (s.role === Role.Client) changeRequests = container.listing.listForClient(s.userId);
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
      const assignment = container.assignments.set(req.params.projectId, String(developerId));
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

  app.use(errorHandler);
  return app;
}
