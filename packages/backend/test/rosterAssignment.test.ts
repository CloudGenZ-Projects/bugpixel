/**
 * Roster + assignment property tests: roster add/list round-trip (P23),
 * developer-removal cascade (P24), duplicate identifier rejection (P25),
 * assignment semantics (P26), non-roster assignment rejection (P27).
 *
 * Requirements: 13.1-13.4, 14.1-14.3, 14.5
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { v4 as uuid } from "uuid";

import { Role } from "@crp/shared";
import { createDb, makeRepositories } from "../src/db/index.js";
import {
  MutableClock,
  makeSessionService,
  makeRosterService,
  makeAssignmentService,
  ServiceError,
} from "../src/services/index.js";

function setup() {
  const db = createDb(":memory:");
  const repos = makeRepositories(db);
  const clock = new MutableClock(0);
  const sessions = makeSessionService(clock);
  const roster = makeRosterService(repos.users, repos.assignments, sessions, clock);
  const assignmentSvc = makeAssignmentService(repos.users, repos.assignments, clock);
  return { repos, sessions, roster, assignmentSvc, clock };
}

function seedProject(repos: ReturnType<typeof makeRepositories>): string {
  const id = uuid();
  repos.projects.create({ id, name: `p-${id}` });
  return id;
}

// Feature: change-request-portal, Property 23: For any new developer with a
// unique identifier, after adding to the roster the roster listing contains
// exactly that developer among its members.
describe("Property 23: roster add then list round-trip", () => {
  it("adds a developer and lists them exactly once", () => {
    fc.assert(
      fc.property(fc.uuid(), (n) => {
        const { roster } = setup();
        const identifier = `dev-${n}@example.com`;
        const created = roster.add({ identifier, passwordHash: "h" });

        const listed = roster.list();
        const matching = listed.filter((u) => u.id === created.id);
        expect(matching).toHaveLength(1);
        expect(matching[0].email).toBe(identifier);
        expect(matching[0].role).toBe(Role.Developer);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 24: For any developer holding any set
// of assignments, after removal the roster excludes that developer and no
// Assignment references them.
describe("Property 24: developer removal cascades assignments", () => {
  it("removes the developer and all their assignments", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (numProjects) => {
        const { repos, roster, assignmentSvc } = setup();
        const dev = roster.add({ identifier: `d-${uuid()}@example.com`, passwordHash: "h" });

        for (let i = 0; i < numProjects; i++) {
          const projectId = seedProject(repos);
          assignmentSvc.set(projectId, dev.id);
        }
        expect(repos.assignments.listByDeveloper(dev.id)).toHaveLength(numProjects);

        roster.remove(dev.id);

        expect(roster.list().some((u) => u.id === dev.id)).toBe(false);
        expect(repos.assignments.listByDeveloper(dev.id)).toHaveLength(0);
        expect(repos.assignments.list().some((a) => a.developerId === dev.id)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 25: For any identifier already present
// in the roster, adding a developer with that identifier is rejected with a
// duplicate-identifying error and the roster is unchanged.
describe("Property 25: duplicate roster identifier is rejected", () => {
  it("rejects a duplicate identifier and leaves the roster unchanged", () => {
    fc.assert(
      fc.property(fc.uuid(), (n) => {
        const { roster } = setup();
        const identifier = `dup-${n}@example.com`;
        roster.add({ identifier, passwordHash: "h" });
        const before = roster.list().length;

        try {
          roster.add({ identifier, passwordHash: "h2" });
          throw new Error("expected duplicate rejection");
        } catch (e) {
          expect(e).toBeInstanceOf(ServiceError);
          expect((e as ServiceError).code).toBe("ROSTER_DUPLICATE");
          expect((e as ServiceError).field).toBe("identifier");
        }
        expect(roster.list()).toHaveLength(before);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 26: For any Project and any sequence of
// set/remove assignment operations, at most one Assignment is active for that
// Project, and it names the developer from the most recent successful set (or none
// if the last operation was a removal).
describe("Property 26: assignment semantics (at most one active per project)", () => {
  it("tracks at most one active assignment reflecting the last successful set", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.constant("remove"), fc.constant("set")), {
          minLength: 1,
          maxLength: 12,
        }),
        (ops) => {
          const { repos, roster, assignmentSvc } = setup();
          const projectId = seedProject(repos);
          // A small pool of roster developers to assign among.
          const devs = [0, 1, 2].map(
            (i) => roster.add({ identifier: `d${i}-${uuid()}@example.com`, passwordHash: "h" }).id
          );

          let expectedDeveloper: string | null = null;
          let devPicker = 0;
          for (const op of ops) {
            if (op === "set") {
              const dev = devs[devPicker % devs.length];
              devPicker++;
              assignmentSvc.set(projectId, dev);
              expectedDeveloper = dev;
            } else {
              assignmentSvc.remove(projectId);
              expectedDeveloper = null;
            }
            // Invariant after every op: at most one assignment for the project.
            const all = repos.assignments.list().filter((a) => a.projectId === projectId);
            expect(all.length).toBeLessThanOrEqual(1);
          }

          const active = assignmentSvc.getByProject(projectId);
          expect(active?.developerId ?? null).toBe(expectedDeveloper);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 27: For any developer identifier not
// present in the roster, creating an Assignment with that identifier is rejected
// with a validation error and no Assignment is created.
describe("Property 27: non-roster developer cannot be assigned", () => {
  it("rejects assigning an unknown developer and creates no assignment", () => {
    fc.assert(
      fc.property(fc.uuid(), (unknownDevId) => {
        const { repos, assignmentSvc } = setup();
        const projectId = seedProject(repos);

        try {
          assignmentSvc.set(projectId, unknownDevId);
          throw new Error("expected rejection");
        } catch (e) {
          expect(e).toBeInstanceOf(ServiceError);
          expect((e as ServiceError).code).toBe("ASSIGNMENT_UNKNOWN_DEVELOPER");
        }
        expect(assignmentSvc.getByProject(projectId)).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it("rejects assigning a non-Developer user (e.g. a Client)", () => {
    const { repos, assignmentSvc } = setup();
    const projectId = seedProject(repos);
    const clientId = uuid();
    repos.users.create({
      id: clientId,
      email: `${clientId}@example.com`,
      passwordHash: "h",
      role: Role.Client,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(() => assignmentSvc.set(projectId, clientId)).toThrowError(ServiceError);
  });
});
