/**
 * Session service.
 *
 * Manages authenticated Owner_Sessions with a 30-minute idle timeout (Req 1.5).
 * A session is valid if and only if the idle duration since last activity is at
 * most IDLE_TIMEOUT_MS; touching a valid session renews `lastActiveAt`.
 *
 * Sessions are held in memory (single-process, single-user personal app per the
 * design). The store is keyed by an opaque session id set in an HTTP-only,
 * Secure, SameSite cookie by the route layer.
 *
 * Requirements: 1.1, 1.4, 1.5
 */
import { randomBytes } from "node:crypto";

import { IDLE_TIMEOUT_MS, type Role } from "@crp/shared";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";

export interface Session {
  id: string;
  userId: string;
  role: Role;
  createdAt: number;
  lastActiveAt: number;
}

export interface SessionService {
  create(userId: string, role: Role): Session;
  /**
   * Look up a session by id, enforcing the idle timeout. Returns the session
   * (with `lastActiveAt` renewed) if valid, or null if absent/expired. Expired
   * sessions are evicted.
   */
  get(sessionId: string): Session | null;
  /** True iff the session exists and is within the idle timeout. */
  isValid(sessionId: string): boolean;
  destroy(sessionId: string): void;
  /** Destroy every session for a user (e.g. on developer removal). */
  destroyForUser(userId: string): void;
}

export function makeSessionService(
  clock: Clock = systemClock,
  idleTimeoutMs: number = IDLE_TIMEOUT_MS
): SessionService {
  const sessions = new Map<string, Session>();

  function newId(): string {
    return randomBytes(32).toString("hex");
  }

  function isExpired(session: Session, at: number): boolean {
    return at - session.lastActiveAt > idleTimeoutMs;
  }

  return {
    create(userId, role) {
      const now = clock.now();
      const session: Session = {
        id: newId(),
        userId,
        role,
        createdAt: now,
        lastActiveAt: now,
      };
      sessions.set(session.id, session);
      return session;
    },

    get(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return null;
      const now = clock.now();
      if (isExpired(session, now)) {
        sessions.delete(sessionId);
        return null;
      }
      // Renew activity window on each successful access.
      session.lastActiveAt = now;
      return session;
    },

    isValid(sessionId) {
      return this.get(sessionId) !== null;
    },

    destroy(sessionId) {
      sessions.delete(sessionId);
    },

    destroyForUser(userId) {
      for (const [id, s] of sessions) {
        if (s.userId === userId) sessions.delete(id);
      }
    },
  };
}
