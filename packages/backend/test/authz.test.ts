/**
 * Authorization + ownership tests: dashboard view matches role (Property 4),
 * permission matrix enforcement (Property 5), and ownership enforcement on
 * open/create/submit (Property 9).
 *
 * Requirements: 2.2, 2.3, 2.4, 4.2, 15.4
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { v4 as uuid } from "uuid";

import { Role } from "@crp/shared";
import { createDb, makeRepositories } from "../src/db/index.js";
import {
  Action,
  ADMIN_ONLY_ACTIONS,
  makeAuthzService,
  makeOwnershipService,
  ServiceError,
} from "../src/services/index.js";
import { roleArb } from "./arbitraries.js";

const authz = makeAuthzService();
const allActions = Object.values(Action);

const EXPECTED_VIEW: Record<Role, string> = {
  [Role.Client]: "client",
  [Role.Developer]: "developer",
  [Role.Admin]: "admin",
};

// Feature: change-request-portal, Property 4: For any authenticated user with
// role R in {Client, Developer, Admin}, the resolved dashboard/session view
// corresponds exactly to role R.
describe("Property 4: dashboard view matches role", () => {
  it("resolves the exact view for the role", () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        expect(authz.dashboardView(role)).toBe(EXPECTED_VIEW[role]);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 5: For any user and any action, the
// action is permitted iff it belongs to the allowed set for that user's role;
// admin-only actions are permitted iff the role is Admin. Otherwise the Portal
// returns an authorization error.
describe("Property 5: role permission matrix is enforced", () => {
  it("permits an action iff it is in the role's allowed set", () => {
    fc.assert(
      fc.property(roleArb, fc.constantFrom(...allActions), (role, action) => {
        const permitted = authz.can(role, action);

        // Admin-only actions permitted iff role is Admin.
        if (ADMIN_ONLY_ACTIONS.has(action)) {
          expect(permitted).toBe(role === Role.Admin);
        }

        // assertCan agrees with can, throwing an authorization error otherwise.
        if (permitted) {
          expect(() => authz.assertCan(role, action)).not.toThrow();
        } else {
          try {
            authz.assertCan(role, action);
            throw new Error("expected assertCan to throw");
          } catch (e) {
            expect(e).toBeInstanceOf(ServiceError);
            expect((e as ServiceError).code).toBe("AUTHZ_FORBIDDEN");
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("each role's allowed set is exactly the expected partition", () => {
    // Sanity: the three role action sets are disjoint and cover all actions.
    const admin = allActions.filter((a) => authz.can(Role.Admin, a));
    const dev = allActions.filter((a) => authz.can(Role.Developer, a));
    const client = allActions.filter((a) => authz.can(Role.Client, a));
    expect(new Set([...admin, ...dev, ...client]).size).toBe(allActions.length);
    // No overlap between roles.
    expect(admin.some((a) => dev.includes(a) || client.includes(a))).toBe(false);
    expect(dev.some((a) => client.includes(a))).toBe(false);
  });
});

// Feature: change-request-portal, Property 9: For any client and any Website
// whose owner_client_id is not that client, requests to open, create a
// Change_Request for, or submit a Change_Request against that Website are denied
// with an authorization error.
describe("Property 9: ownership is enforced for open/create/submit", () => {
  it("assertOwns throws iff the client does not own the website", () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (ownerId, otherId) => {
        fc.pre(ownerId !== otherId);

        const db = createDb(":memory:");
        const repos = makeRepositories(db);
        const ownership = makeOwnershipService(
          repos.websites,
          repos.changeRequests,
          repos.assignments
        );

        // Seed owner + a website they own.
        repos.users.create({
          id: ownerId,
          email: `${ownerId}@example.com`,
          passwordHash: "h",
          role: Role.Client,
          createdAt: "2026-01-01T00:00:00.000Z",
        });
        repos.users.create({
          id: otherId,
          email: `${otherId}@example.com`,
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

        // Owner is allowed; non-owner is denied with AUTHZ_NOT_OWNER.
        expect(ownership.isOwner(ownerId, websiteId)).toBe(true);
        expect(() => ownership.assertOwns(ownerId, websiteId)).not.toThrow();

        expect(ownership.isOwner(otherId, websiteId)).toBe(false);
        try {
          ownership.assertOwns(otherId, websiteId);
          throw new Error("expected assertOwns to throw");
        } catch (e) {
          expect(e).toBeInstanceOf(ServiceError);
          expect((e as ServiceError).code).toBe("AUTHZ_NOT_OWNER");
        }
      }),
      { numRuns: 100 }
    );
  });
});
