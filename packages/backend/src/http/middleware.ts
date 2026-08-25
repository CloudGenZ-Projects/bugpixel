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

import { makeApiError, type Role } from "@crp/shared";
import type { Container } from "../container.js";
import { ServiceError } from "../services/serviceError.js";
import type { Session } from "../services/sessionService.js";

/** The session cookie name. */
export const SESSION_COOKIE = "sid";

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
    if (!req.session || !websiteId || !container.ownership.isOwner(req.session.userId, websiteId)) {
      return res
        .status(403)
        .json(makeApiError("AUTHZ_NOT_OWNER", "You do not own this website."));
    }
    next();
  };
}

/** Central error handler mapping ServiceError -> consistent JSON. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof ServiceError) {
    return res
      .status(err.status)
      .json(makeApiError(err.code, err.message, err.field));
  }
  // Body-parser / express errors carry a numeric status (e.g. malformed JSON).
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return res
      .status(status)
      .json({ error: { code: "AUTH_REQUIRED", message: "Bad request." } });
  }
  // Unknown error: do not leak internals.
  // eslint-disable-next-line no-console
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
