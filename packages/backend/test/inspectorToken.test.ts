/**
 * Inspector token gating tests (Property 11): activation succeeds iff the token
 * is validly signed, unexpired, website-scoped, and backed by an active owner
 * session; every other case is denied.
 *
 * Requirements: 6.1, 6.2, 6.5, 6.6, 15.1, 15.2
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";

import { Role, INSPECTOR_TOKEN_TTL_SECONDS } from "@crp/shared";
import { createDb, makeRepositories } from "../src/db/index.js";
import {
  MutableClock,
  makeSessionService,
  makeOwnershipService,
  makeInspectorTokenService,
  ServiceError,
} from "../src/services/index.js";
import { tokenStateArb, type TokenState } from "./arbitraries.js";

const SECRET = "test-secret-server-side-only";
const OTHER_SECRET = "different-secret";

function setup(clock: MutableClock) {
  const db = createDb(":memory:");
  const repos = makeRepositories(db);
  const sessions = makeSessionService(clock);
  const ownership = makeOwnershipService(
    repos.websites,
    repos.changeRequests,
    repos.assignments
  );
  const tokens = makeInspectorTokenService(SECRET, sessions, ownership, clock);
  return { repos, sessions, ownership, tokens };
}

function seedOwnerAndWebsite(repos: ReturnType<typeof makeRepositories>) {
  const ownerId = uuid();
  repos.users.create({
    id: ownerId,
    email: `${ownerId}@example.com`,
    passwordHash: "h",
    role: Role.Client,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const projectId = uuid();
  repos.projects.create({ id: projectId, name: "p" });
  const websiteId = uuid();
  repos.websites.create({
    id: websiteId,
    projectId,
    ownerClientId: ownerId,
    name: "site",
    url: "https://site.example.com",
  });
  return { ownerId, websiteId };
}

// Feature: change-request-portal, Property 11: For any inspector activation
// attempt, activation (and any subsequent recording of a Component_Reference or
// Screenshot capture) succeeds if and only if the presented token is validly
// signed, unexpired, scoped to the opened Website, and backed by an active
// Owner_Session of the client who owns that Website; in all other cases activation
// is denied and the Website_Open_View is left unchanged.
describe("Property 11: inspector activation is fully gated", () => {
  it("validates iff signed+unexpired+correct-aud+active-owner-session", () => {
    fc.assert(
      fc.property(tokenStateArb, (state: TokenState) => {
        const clock = new MutableClock(1_000_000_000);
        const { repos, sessions, tokens } = setup(clock);
        const { ownerId, websiteId } = seedOwnerAndWebsite(repos);
        const session = sessions.create(ownerId, Role.Client);

        // Build a token according to the state under test.
        let token: string | undefined;
        let expectOk = false;

        switch (state) {
          case "valid": {
            token = tokens.mint({ sessionId: session.id, userId: ownerId }, websiteId).token;
            expectOk = true;
            break;
          }
          case "expired": {
            token = tokens.mint({ sessionId: session.id, userId: ownerId }, websiteId).token;
            // Advance past TTL so the token is expired at validation time.
            clock.advance((INSPECTOR_TOKEN_TTL_SECONDS + 1) * 1000);
            expectOk = false;
            break;
          }
          case "wrong-aud": {
            // Mint for a different website (same owner) than the one opened, so
            // mint succeeds but the aud will not match at validation time.
            const otherProjectId = uuid();
            repos.projects.create({ id: otherProjectId, name: "p2" });
            const otherWebsiteId = uuid();
            repos.websites.create({
              id: otherWebsiteId,
              projectId: otherProjectId,
              ownerClientId: ownerId,
              name: "site2",
              url: "https://site2.example.com",
            });
            token = tokens.mint(
              { sessionId: session.id, userId: ownerId },
              otherWebsiteId
            ).token;
            expectOk = false;
            break;
          }
          case "bad-signature": {
            const nowSec = Math.floor(clock.now() / 1000);
            token = jwt.sign(
              { sub: ownerId, sid: session.id, aud: websiteId, iat: nowSec, exp: nowSec + 300 },
              OTHER_SECRET,
              { algorithm: "HS256" }
            );
            expectOk = false;
            break;
          }
          case "no-session": {
            token = tokens.mint({ sessionId: session.id, userId: ownerId }, websiteId).token;
            // Owner session ends before validation (Req 6.6).
            sessions.destroy(session.id);
            expectOk = false;
            break;
          }
          case "absent": {
            token = undefined;
            expectOk = false;
            break;
          }
        }

        if (expectOk) {
          const result = tokens.validate(token, websiteId);
          expect(result.ok).toBe(true);
          expect(result.websiteId).toBe(websiteId);
          expect(result.userId).toBe(ownerId);
        } else {
          try {
            tokens.validate(token, websiteId);
            throw new Error(`expected denial for state=${state}`);
          } catch (e) {
            expect(e).toBeInstanceOf(ServiceError);
            expect((e as ServiceError).code).toBe("INSPECTOR_DENIED");
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("mint requires ownership of the target website", () => {
    const clock = new MutableClock(0);
    const { repos, sessions, tokens } = setup(clock);
    const { websiteId } = seedOwnerAndWebsite(repos);

    // A different client (non-owner) with a valid session cannot mint.
    const strangerId = uuid();
    repos.users.create({
      id: strangerId,
      email: `${strangerId}@example.com`,
      passwordHash: "h",
      role: Role.Client,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const strangerSession = sessions.create(strangerId, Role.Client);

    expect(() =>
      tokens.mint({ sessionId: strangerSession.id, userId: strangerId }, websiteId)
    ).toThrowError(ServiceError);
  });
});
