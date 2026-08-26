/**
 * Express middleware and the error handler.
 *
 * - requireSession: 401 AUTH_REQUIRED when the session cookie is absent/expired.
 * - requireRole(role): 403 AUTHZ_FORBIDDEN when the session role does not match.
 * - requireWebsiteOwnership(param): 403 AUTHZ_NOT_OWNER when the client does not
 *   own the referenced website.
 * - errorHandler: maps ServiceError (and unknown errors) to the consistent
 *   `{ error: { code, message, field? } }` shape with the right status.
 *
 * Requirements: 1.3, 2.3, 2.4, 2.5, 4.2, 15.3, 15.4
 */
import type { NextFunction, Request, Response } from "express";
import { createHmac } from "node:crypto";

import { makeApiError, MAX_ATTACHMENT_SIZE_BYTES, type Role } from "@crp/shared";
import type { Container } from "../container.js";
import { ServiceError } from "../services/serviceError.js";
import type { Session } from "../services/sessionService.js";

/** The session cookie name. */
export const SESSION_COOKIE = "sid";
/** The CSRF token cookie name (readable by JS; double-submit pattern). */
export const CSRF_COOKIE = "csrf";
/** Header the SPA echoes the CSRF token back in. */
export const CSRF_HEADER = "x-csrf-token";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

export function makeRequireSession(container: Container) {
  return function requireSession(req: Request, res: Response, next: NextFunction) {
    const sid = req.cookies?.[SESSION_COOKIE];
    const session = sid ? container.sessions.get(sid) : null;
    if (!session) {
      return res
        .status(401)
        .json(makeApiError("AUTH_REQUIRED", "Authentication is required."));
    }
    req.session = session;
    next();
  };
}

/**
 * Derive a stable CSRF token for a session id via HMAC, so no extra storage is
 * needed and the value can't be forged without the server secret.
 */
export function csrfTokenFor(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("hex");
}

/**
 * CSRF protection (double-submit + HMAC). For state-changing API requests
 * (POST/PUT/DELETE) the `X-CSRF-Token` header must equal the token derived from
 * the session. Safe methods (GET/HEAD) pass through, as does login (no session
 * yet) and the cross-origin inspector validate endpoint (token-gated already).
 */
export function makeCsrf(secret: string, exemptPaths: string[] = []) {
  const safe = new Set(["GET", "HEAD", "OPTIONS"]);
  return function csrf(req: Request, res: Response, next: NextFunction) {
    if (safe.has(req.method)) return next();
    if (exemptPaths.includes(req.path)) return next();
    const sid = req.cookies?.[SESSION_COOKIE];
    // No session yet (e.g. login) -> nothing to protect; let auth handle it.
    if (!sid) return next();
    const expected = csrfTokenFor(sid, secret);
    const provided = req.get(CSRF_HEADER);
    if (!provided || provided !== expected) {
      return res
        .status(403)
        .json(makeApiError("AUTHZ_FORBIDDEN", "Invalid or missing CSRF token."));
    }
    next();
  };
}

export function makeRequireRole(_container: Container, role: Role) {
  return function requireRole(req: Request, res: Response, next: NextFunction) {
    if (!req.session || req.session.role !== role) {
      return res
        .status(403)
        .json(
          makeApiError("AUTHZ_FORBIDDEN", "You are not permitted to perform this action.")
        );
    }
    next();
  };
}

/**
 * Ensure the session client owns the website identified by `req[source]`
 * (params/body). Must run after requireSession.
 */
export function makeRequireWebsiteOwnership(
  container: Container,
  getWebsiteId: (req: Request) => string | undefined
) {
  return function requireWebsiteOwnership(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const websiteId = getWebsiteId(req);
    if (
      !req.session ||
      !websiteId ||
      !container.ownership.isOwner(req.session.userId, websiteId)
    ) {
      return res
        .status(403)
        .json(makeApiError("AUTHZ_NOT_OWNER", "You do not own this website."));
    }
    next();
  };
}

/**
 * Upload validation middleware (design "validateUpload"). Validates the decoded
 * size and MIME of a base64 upload body BEFORE the route handler runs, so an
 * oversized or unsupported upload is rejected at the middleware layer (Req
 * 9.2-9.4). The service repeats the check as defense in depth.
 */
export function makeValidateUpload() {
  return function validateUpload(req: Request, res: Response, next: NextFunction) {
    const body = (req.body ?? {}) as { dataBase64?: unknown; mime?: unknown };
    if (typeof body.dataBase64 !== "string" || body.dataBase64.length === 0) {
      return res
        .status(400)
        .json(
          makeApiError(
            "VALIDATION_UNSUPPORTED_TYPE",
            "A file payload is required.",
            "attachment"
          )
        );
    }
    const mime = typeof body.mime === "string" ? body.mime : "";
    if (!(mime === "application/pdf" || mime.startsWith("image/"))) {
      return res
        .status(400)
        .json(
          makeApiError(
            "VALIDATION_UNSUPPORTED_TYPE",
            "Attachments must be a PDF or an image.",
            "attachment"
          )
        );
    }
    const comma = body.dataBase64.indexOf(",");
    const base64 =
      body.dataBase64.startsWith("data:") && comma >= 0
        ? body.dataBase64.slice(comma + 1)
        : body.dataBase64;
    const sizeBytes = Buffer.byteLength(base64, "base64");
    if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      return res
        .status(400)
        .json(
          makeApiError(
            "VALIDATION_FILE_TOO_LARGE",
            "Attachments must be at most 10 MB.",
            "attachment"
          )
        );
    }
    next();
  };
}

/** Central error handler mapping ServiceError -> consistent JSON. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ServiceError) {
    return res.status(err.status).json(makeApiError(err.code, err.message, err.field));
  }
  // Body-parser / express errors carry a numeric status (e.g. malformed JSON).
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return res
      .status(status)
      .json({ error: { code: "AUTH_REQUIRED", message: "Bad request." } });
  }
  // Unknown error: do not leak internals.
  console.error("Unhandled error:", err);
  return res.status(500).json({
    error: { code: "SUBMISSION_FAILED", message: "Internal server error." },
  });
}

/** Wrap an async handler so thrown errors reach the error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown
) {
  return function (req: Request, res: Response, next: NextFunction) {
    try {
      const result = fn(req, res, next);
      if (result instanceof Promise) result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}
