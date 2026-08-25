/**
 * Auth + session service tests: exact-credential authentication (Property 2),
 * idle-timeout session validity (Property 3), and login/logout example flow.
 *
 * Requirements: 1.1, 1.2, 1.4, 1.5
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { v4 as uuid } from "uuid";

import { Role, IDLE_TIMEOUT_MS } from "@crp/shared";
import { createDb, makeRepositories } from "../src/db/index.js";
import {
  MutableClock,
  makeSessionService,
  makeAuthService,
  ServiceError,
} from "../src/services/index.js";
import { emailArb, passwordArb, idleDurationMsArb } from "./arbitraries.js";

function setup(clock = new MutableClock(0)) {
  const db = createDb(":memory:");
  const repos = makeRepositories(db);
  const sessions = makeSessionService(clock);
  // Low bcrypt cost keeps property tests (100+ iterations) fast while still
  // exercising real bcrypt hashing/comparison.
  const auth = makeAuthService(repos.users, sessions, 4);
  return { db, repos, sessions, auth, clock };
}

function seedUser(
  auth: ReturnType<typeof makeAuthService>,
  repos: ReturnType<typeof makeRepositories>,
  email: string,
  password: string,
  role: Role = Role.Client
): void {
  repos.users.create({
    id: uuid(),
    email,
    passwordHash: auth.hashPassword(password),
    role,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

// Feature: change-request-portal, Property 2: For any pair (identifier, password)
// that does not exactly match a stored user's credentials, login is rejected
// with an authentication error; only the exact valid pair establishes a session.
describe("Property 2: only exact credentials authenticate", () => {
  it("accepts only the exact (identifier, password) pair", () => {
    fc.assert(
      fc.property(
        emailArb,
        passwordArb,
        emailArb,
        passwordArb,
        (email, password, otherEmail, otherPassword) => {
          const { auth, repos } = setup();
          seedUser(auth, repos, email, password);

          // Exact match establishes a session.
          const ok = auth.login(email, password);
          expect(ok.session.userId).toBeDefined();
          expect(ok.user.email).toBe(email);

          // Wrong password for a known identifier is rejected.
          if (otherPassword !== password) {
            expect(() => auth.login(email, otherPassword)).toThrowError(ServiceError);
          }
          // Unknown identifier is rejected (unless the generated other email
          // happens to equal the seeded one).
          if (otherEmail !== email) {
            expect(() => auth.login(otherEmail, password)).toThrowError(ServiceError);
          }
          // Both wrong is rejected.
          if (otherEmail !== email || otherPassword !== password) {
            expect(() => auth.login(otherEmail, otherPassword)).toThrowError(
              ServiceError
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 3: For any session and any idle
// duration since last activity, the session is valid if and only if that idle
// duration is at most 30 minutes.
describe("Property 3: idle timeout invalidates sessions", () => {
  it("session is valid iff idle duration <= 30 minutes", () => {
    fc.assert(
      fc.property(idleDurationMsArb, (idleMs) => {
        const clock = new MutableClock(1_000_000);
        const { auth, repos, sessions } = setup(clock);
        seedUser(auth, repos, "a@example.com", "pw");
        const { session } = auth.login("a@example.com", "pw");

        // Advance the clock by the idle duration with no activity.
        clock.advance(idleMs);

        const valid = sessions.isValid(session.id);
        expect(valid).toBe(idleMs <= IDLE_TIMEOUT_MS);
      }),
      { numRuns: 100 }
    );
  });

  it("activity within the window renews the session (does not expire)", () => {
    const clock = new MutableClock(0);
    const { auth, repos, sessions } = setup(clock);
    seedUser(auth, repos, "a@example.com", "pw");
    const { session } = auth.login("a@example.com", "pw");

    // Touch every 29 minutes for a long time; should never expire.
    for (let i = 0; i < 10; i++) {
      clock.advance(IDLE_TIMEOUT_MS - 60_000);
      expect(sessions.isValid(session.id)).toBe(true);
    }
  });
});

describe("login success and logout flow (Req 1.1, 1.4)", () => {
  it("establishes a session on login and terminates it on logout", () => {
    const { auth, repos, sessions } = setup();
    seedUser(auth, repos, "user@example.com", "secret", Role.Admin);

    const { session, user } = auth.login("user@example.com", "secret");
    expect(user.role).toBe(Role.Admin);
    expect(sessions.isValid(session.id)).toBe(true);

    auth.logout(session.id);
    expect(sessions.isValid(session.id)).toBe(false);
  });
});
