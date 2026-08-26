/**
 * Express application (v2 - flat change requests, per-project kanban API).
 */
import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { v4 as uuid } from "uuid";

import { Role, ChangeRequestStatus, Priority, ChangeType } from "@crp/shared";
import type { Container } from "../container.js";
import { ServiceError } from "../services/serviceError.js";
import { makeRateLimiter } from "../services/rateLimiter.js";
import {
  SESSION_COOKIE,
  CSRF_COOKIE,
  asyncHandler,
  errorHandler,
  makeRequireSession,
  makeRequireRole,
  makeCsrf,
  csrfTokenFor,
} from "./middleware.js";

export interface AppOptions {
  secureCookies?: boolean;
  enforceHttps?: boolean;
  spaDir?: string;
  inspectorDir?: string;
  allowedOrigins?: string[];
  storageRoot?: string;
}

function decodeBase64Payload(input: unknown): Uint8Array {
  if (typeof input !== "string" || input.length === 0) {
    throw new ServiceError("VALIDATION_UNSUPPORTED_TYPE", 400, "A base64 file payload is required.");
  }
  const comma = input.indexOf(",");
  const base64 = input.startsWith("data:") && comma >= 0 ? input.slice(comma + 1) : input;
  return new Uint8Array(Buffer.from(base64, "base64"));
}

export function makeApp(container: Container, options: AppOptions = {}) {
  const app = express();
  app.set("trust proxy", true);

  const loginLimiter = makeRateLimiter({ maxRequests: 5, windowMs: 60_000 });
  const apiLimiter = makeRateLimiter({ maxRequests: 100, windowMs: 60_000 });

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.use(express.json({ limit: "15mb" }));
  app.use(cookieParser());

  // Rate limit
  app.use("/api", (req, res, next) => {
    if (!apiLimiter.allow(req.ip ?? "unknown")) {
      return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests." } });
    }
    next();
  });

  // Dynamic CORS
  let cachedOrigins: Set<string> | null = null;
  let cacheExpiry = 0;
  function getAllowedOrigins(): Set<string> {
    const now = Date.now();
    if (cachedOrigins && now < cacheExpiry) return cachedOrigins;
    const rows = container.repos.websites.listAll();
    const origins = new Set<string>();
    for (const w of rows) {
      try { origins.add(new URL(w.url).origin); } catch {}
    }
    if (options.allowedOrigins) {
      for (const o of options.allowedOrigins) origins.add(o);
    }
    cachedOrigins = origins;
    cacheExpiry = now + 60_000;
    return origins;
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && getAllowedOrigins().has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Static file serving for uploaded blobs
  const storageRoot = options.storageRoot ?? "data/storage";
  app.use("/files", express.static(storageRoot, { maxAge: "1y", immutable: true }));

  // Middleware
  const requireSession = makeRequireSession(container);
  const csrf = makeCsrf(container.csrfSecret);

  /** Convenience: require session + specific role. */
  function requireRole(role: Role) {
    return [requireSession, makeRequireRole(container, role)];
  }

  // ========================== AUTH ==========================

  app.post("/api/auth/login", asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: "VALIDATION_REQUIRED", message: "Email and password required." } });
    }
    if (!loginLimiter.allow(req.ip ?? "unknown")) {
      return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many login attempts." } });
    }
    const { session, user } = container.auth.login(email, password);
    const csrfToken = csrfTokenFor(session.id, container.csrfSecret);
    res.cookie(SESSION_COOKIE, session.id, { httpOnly: true, sameSite: "none", secure: true, maxAge: 30 * 60 * 1000 });
    res.cookie(CSRF_COOKIE, csrfToken, { httpOnly: false, sameSite: "none", secure: true, maxAge: 30 * 60 * 1000 });
    res.json({ user: { id: user.id, email: user.email, role: user.role }, csrfToken });
  }));

  app.post("/api/auth/logout", requireSession, asyncHandler(async (req: Request, res: Response) => {
    container.auth.logout(req.session!.id);
    res.clearCookie(SESSION_COOKIE);
    res.clearCookie(CSRF_COOKIE);
    res.json({ ok: true });
  }));

  app.get("/api/auth/me", requireSession, asyncHandler(async (req: Request, res: Response) => {
    const user = container.repos.users.getById(req.session!.userId)!;
    res.json({ user: { id: user.id, email: user.email, role: user.role } });
  }));

  // ========================== CHANGE REQUESTS ==========================

  app.post("/api/change-requests", requireSession, csrf, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session!.userId;
    const role = req.session!.role;
    if (role !== Role.Client && role !== Role.Admin) {
      return res.status(403).json({ error: { code: "AUTHZ_FORBIDDEN", message: "Only clients can create requests." } });
    }
    const { websiteId, changeType, description, priority, contentAdd, contentCurrent, contentUpdated, contentDelete, selector, htmlMeta, dueDate } = req.body;
    if (!websiteId || !changeType || !description) {
      return res.status(400).json({ error: { code: "VALIDATION_REQUIRED", message: "websiteId, changeType, and description are required." } });
    }
    const cr = container.changeRequests.create(userId, {
      websiteId, changeType, description, priority, contentAdd, contentCurrent, contentUpdated, contentDelete, selector, htmlMeta, dueDate,
    });
    res.status(201).json({ changeRequest: cr });
  }));

  app.get("/api/change-requests", requireSession, asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = req.session!;
    let requests;
    if (role === Role.Admin) requests = container.listing.listAll();
    else if (role === Role.Developer) requests = container.listing.listForDeveloper(userId);
    else requests = container.listing.listForClient(userId);
    res.json({ changeRequests: requests });
  }));

  app.get("/api/change-requests/:id", requireSession, asyncHandler(async (req: Request, res: Response) => {
    const detail = container.listing.getDetail(req.params.id);
    res.json(detail);
  }));

  app.patch("/api/change-requests/:id/status", requireSession, csrf, asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = req.session!;
    const { status } = req.body;
    if (!status || !Object.values(ChangeRequestStatus).includes(status)) {
      return res.status(400).json({ error: { code: "VALIDATION_REQUIRED", message: "Valid status required." } });
    }
    if (role === Role.Client && status !== ChangeRequestStatus.Cancelled) {
      return res.status(403).json({ error: { code: "AUTHZ_FORBIDDEN", message: "Clients can only cancel requests." } });
    }
    const cr = container.changeRequests.updateStatus(userId, req.params.id, status);
    res.json({ changeRequest: cr });
  }));

  app.patch("/api/change-requests/:id/priority", requireSession, csrf, asyncHandler(async (req: Request, res: Response) => {
    const { priority } = req.body;
    if (!priority || !Object.values(Priority).includes(priority)) {
      return res.status(400).json({ error: { code: "VALIDATION_REQUIRED", message: "Valid priority required." } });
    }
    container.changeRequests.updatePriority(req.params.id, priority);
    res.json({ ok: true });
  }));

  app.post("/api/change-requests/:id/screenshots", requireSession, csrf, asyncHandler(async (req: Request, res: Response) => {
    const { data, mime, width, height } = req.body;
    const bytes = decodeBase64Payload(data);
    const screenshot = container.changeRequests.addScreenshot(
      req.params.id, bytes, mime || "image/png", width || 0, height || 0
    );
    res.status(201).json({ screenshot });
  }));

  app.post("/api/change-requests/:id/attachments", requireSession, csrf, asyncHandler(async (req: Request, res: Response) => {
    const { data, mime, filename } = req.body;
    const bytes = decodeBase64Payload(data);
    const attachment = container.changeRequests.addAttachment(
      req.params.id, bytes, mime || "application/octet-stream", filename || "file"
    );
    res.status(201).json({ attachment });
  }));

  app.post("/api/change-requests/:id/notes", requireSession, csrf, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session!.userId;
    const { content, imageData, imageMime } = req.body;
    const imageBytes = imageData ? decodeBase64Payload(imageData) : null;
    const note = container.changeRequests.addNote(req.params.id, userId, content, imageBytes, imageMime);
    res.status(201).json({ note });
  }));

  app.get("/api/change-requests/:id/notes", requireSession, asyncHandler(async (req: Request, res: Response) => {
    const notes = container.repos.notes.listByRequest(req.params.id);
    res.json({ notes });
  }));

  app.get("/api/change-requests/:id/activity", requireSession, asyncHandler(async (req: Request, res: Response) => {
    const activity = container.repos.activities.listByRequest(req.params.id);
    res.json({ activity });
  }));

  // ========================== PROJECTS ==========================

  app.get("/api/projects/:projectId/change-requests", requireSession, asyncHandler(async (req: Request, res: Response) => {
    const requests = container.listing.listByProject(req.params.projectId);
    const enriched = requests.map((cr) => ({
      ...cr,
      screenshots: container.repos.screenshots.listByRequest(cr.id),
    }));
    res.json({ changeRequests: enriched });
  }));

  app.get("/api/projects", requireSession, asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = req.session!;
    let projects;
    if (role === Role.Admin) {
      projects = container.repos.projects.listAll();
    } else if (role === Role.Developer) {
      const assignments = container.repos.assignments.listByDeveloper(userId);
      projects = assignments.map((a) => container.repos.projects.getById(a.projectId)).filter(Boolean);
    } else {
      const websites = container.repos.websites.listByOwner(userId);
      const projectIds = [...new Set(websites.map((w) => w.projectId))];
      projects = projectIds.map((id) => container.repos.projects.getById(id)).filter(Boolean);
    }
    res.json({ projects });
  }));

  // ========================== WEBSITES ==========================

  app.get("/api/websites", requireSession, asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = req.session!;
    const websites = role === Role.Admin
      ? container.repos.websites.listAll()
      : container.repos.websites.listByOwner(userId);
    res.json({ websites });
  }));

  // ========================== ANALYTICS ==========================

  app.get("/api/analytics/stats", requireSession, asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.query.projectId as string | undefined;
    const statusCounts = container.repos.changeRequests.getStatusCounts(projectId);
    const monthlyStats = container.repos.changeRequests.getMonthlyStats(12);
    const avgResolution = container.repos.changeRequests.getAvgResolutionHours(projectId);
    res.json({ statusCounts, monthlyStats, avgResolutionHours: avgResolution });
  }));

  // ========================== INSPECTOR ==========================

  app.post("/api/inspector/token", requireSession, csrf, asyncHandler(async (req: Request, res: Response) => {
    const { websiteId } = req.body;
    if (!websiteId) {
      return res.status(400).json({ error: { code: "VALIDATION_REQUIRED", message: "websiteId required." } });
    }
    const result = container.inspectorTokens.mint(
      { sessionId: req.session!.id, userId: req.session!.userId },
      String(websiteId)
    );
    res.json(result);
  }));

  app.post("/api/inspector/validate", asyncHandler(async (req: Request, res: Response) => {
    const { token, websiteId } = req.body;
    if (!token || !websiteId) return res.status(400).json({ valid: false });
    try {
      const payload = container.inspectorTokens.validate(token, websiteId);
      res.json({ valid: true, payload });
    } catch {
      res.json({ valid: false });
    }
  }));

  // ========================== ADMIN ==========================

  app.get("/api/admin/users", ...requireRole(Role.Admin), asyncHandler(async (_req: Request, res: Response) => {
    const clients = container.repos.users.listByRole(Role.Client);
    const devs = container.repos.users.listByRole(Role.Developer);
    const admins = container.repos.users.listByRole(Role.Admin);
    const users = [...clients, ...devs, ...admins];
    res.json({ users: users.map((u) => ({ id: u.id, email: u.email, role: u.role, createdAt: u.createdAt })) });
  }));

  app.post("/api/admin/users", ...requireRole(Role.Admin), csrf, asyncHandler(async (req: Request, res: Response) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({ error: { code: "VALIDATION_REQUIRED", message: "email, password, role required." } });
    }
    const passwordHash = container.auth.hashPassword(password);
    const user = container.repos.users.create({ id: uuid(), email, passwordHash, role, createdAt: new Date().toISOString() });
    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role } });
  }));

  app.post("/api/admin/projects", ...requireRole(Role.Admin), csrf, asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: { code: "VALIDATION_REQUIRED", message: "name required." } });
    const project = container.repos.projects.create({ id: uuid(), name });
    res.status(201).json({ project });
  }));

  app.post("/api/admin/websites", ...requireRole(Role.Admin), csrf, asyncHandler(async (req: Request, res: Response) => {
    const { projectId, ownerClientId, name, url } = req.body;
    if (!projectId || !ownerClientId || !name || !url) {
      return res.status(400).json({ error: { code: "VALIDATION_REQUIRED", message: "All fields required." } });
    }
    const website = container.repos.websites.create({ id: uuid(), projectId, ownerClientId, name, url });
    cachedOrigins = null;
    res.status(201).json({ website });
  }));

  app.post("/api/admin/assignments", ...requireRole(Role.Admin), csrf, asyncHandler(async (req: Request, res: Response) => {
    const { projectId, developerId } = req.body;
    if (!projectId || !developerId) {
      return res.status(400).json({ error: { code: "VALIDATION_REQUIRED", message: "projectId and developerId required." } });
    }
    const assignment = container.assignments.set(projectId, developerId);
    res.status(201).json({ assignment });
  }));

  app.delete("/api/admin/websites/:id", ...requireRole(Role.Admin), csrf, asyncHandler(async (req: Request, res: Response) => {
    container.repos.websites.remove(req.params.id);
    cachedOrigins = null;
    res.json({ ok: true });
  }));

  // ========================== CATCH-ALL ==========================

  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } });
  });

  if (options.inspectorDir) {
    app.use("/inspector", express.static(options.inspectorDir));
  }

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
