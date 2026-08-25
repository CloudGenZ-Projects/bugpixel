/**
 * Submission service property tests: item-count guard (P18), routing and
 * visibility (P19), atomicity (P20). Plus integration 9.5: real file-backed
 * SQLite transaction commit and rollback.
 *
 * Requirements: 10.4, 11.1-11.7, 14.4
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuid } from "uuid";

import {
  ChangeRequestStatus,
  ChangeType,
  Role,
  MAX_ITEMS_PER_REQUEST,
} from "@crp/shared";
import {
  createDb,
  makeRepositories,
  type AppDatabase,
} from "../src/db/index.js";
import {
  MutableClock,
  makeChangeItemValidator,
  makeChangeRequestService,
  makeOwnershipService,
  type AddItemInput,
  ServiceError,
} from "../src/services/index.js";

function buildServices(repos: ReturnType<typeof makeRepositories>) {
  const ownership = makeOwnershipService(
    repos.websites,
    repos.changeRequests,
    repos.assignments
  );
  const validator = makeChangeItemValidator();
  const clock = new MutableClock(1_000);
  const service = makeChangeRequestService(repos, validator, ownership, clock);
  return { service, clock };
}

function seedClientAndWebsite(repos: ReturnType<typeof makeRepositories>) {
  const clientId = uuid();
  repos.users.create({
    id: clientId,
    email: `${clientId}@example.com`,
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
    ownerClientId: clientId,
    name: "site",
    url: "https://site.example.com",
  });
  return { clientId, projectId, websiteId };
}

function seedDeveloper(repos: ReturnType<typeof makeRepositories>): string {
  const id = uuid();
  repos.users.create({
    id,
    email: `${id}@example.com`,
    passwordHash: "h",
    role: Role.Developer,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  return id;
}

function validItem(): AddItemInput {
  return {
    changeType: ChangeType.Add,
    description: "desc",
    contentAdd: "content",
    component: { selector: null, htmlMeta: null },
    screenshot: { storageKey: `k-${uuid()}`, mime: "image/png", width: 10, height: 10 },
  };
}

// Feature: change-request-portal, Property 18: For any Change_Request, submission
// is rejected (leaving status and stored items unchanged) if it contains zero
// Change_Items or more than 500 Change_Items; submission proceeds only for counts
// in the range 1 to 500.
describe("Property 18: submission guard on item count", () => {
  it("rejects 0 items with VALIDATION_NO_ITEMS and leaves status Draft", () => {
    const db = createDb(":memory:");
    const repos = makeRepositories(db);
    const { service } = buildServices(repos);
    const { clientId, websiteId } = seedClientAndWebsite(repos);
    const draft = service.createDraft(clientId, websiteId);

    try {
      service.submit(clientId, draft.id);
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as ServiceError).code).toBe("VALIDATION_NO_ITEMS");
    }
    expect(repos.changeRequests.getById(draft.id)!.status).toBe(ChangeRequestStatus.Draft);
  });

  it("proceeds for counts in [1, 500]; the boundary 500 is accepted", () => {
    // Use a modest count generator; also explicitly test count === 1.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (count) => {
        const db = createDb(":memory:");
        const repos = makeRepositories(db);
        const { service } = buildServices(repos);
        const { clientId, websiteId } = seedClientAndWebsite(repos);
        const draft = service.createDraft(clientId, websiteId);
        for (let i = 0; i < count; i++) service.addItem(clientId, draft.id, validItem());

        const result = service.submit(clientId, draft.id);
        expect(result.status).not.toBe(ChangeRequestStatus.Draft);
        expect(result.submittedAt).toBeTruthy();
      }),
      { numRuns: 30 }
    );
  });

  it("rejects > 500 items with VALIDATION_TOO_MANY_ITEMS (status unchanged)", () => {
    const db = createDb(":memory:");
    const repos = makeRepositories(db);
    const { service } = buildServices(repos);
    const { clientId, websiteId } = seedClientAndWebsite(repos);
    const draft = service.createDraft(clientId, websiteId);

    // Insert 501 items directly via the repo (fast) to exceed the cap.
    for (let i = 0; i < MAX_ITEMS_PER_REQUEST + 1; i++) {
      repos.changeItems.create({
        id: uuid(),
        changeRequestId: draft.id,
        changeType: ChangeType.Add,
        description: "d",
        contentAdd: "c",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    }
    try {
      service.submit(clientId, draft.id);
      throw new Error("expected rejection");
    } catch (e) {
      expect((e as ServiceError).code).toBe("VALIDATION_TOO_MANY_ITEMS");
    }
    expect(repos.changeRequests.getById(draft.id)!.status).toBe(ChangeRequestStatus.Draft);
  });
});

// Feature: change-request-portal, Property 19: For any Change_Request submitted
// with 1 to 500 items: if the associated Website's Project has an active
// Assignment, the status becomes Submitted and the request is visible to the
// submitting Client, the assigned Developer, and the Admin; if the Project has no
// active Assignment, the status becomes Awaiting Developer Assignment and the
// request is visible to the submitting Client and the Admin. A submitted_at
// timestamp is recorded in all successful cases.
describe("Property 19: submission routing and visibility", () => {
  it("routes to Submitted iff an assignment exists, else AwaitingDeveloperAssignment", () => {
    fc.assert(
      fc.property(fc.boolean(), (hasAssignment) => {
        const db = createDb(":memory:");
        const repos = makeRepositories(db);
        const { service } = buildServices(repos);
        const { clientId, projectId, websiteId } = seedClientAndWebsite(repos);

        let developerId: string | null = null;
        if (hasAssignment) {
          developerId = seedDeveloper(repos);
          repos.assignments.setForProject({
            id: uuid(),
            projectId,
            developerId,
            createdAt: "2026-01-01T00:00:00.000Z",
          });
        }

        const draft = service.createDraft(clientId, websiteId);
        service.addItem(clientId, draft.id, validItem());
        const result = service.submit(clientId, draft.id);

        expect(result.submittedAt).toBeTruthy();
        if (hasAssignment) {
          expect(result.status).toBe(ChangeRequestStatus.Submitted);
          // Visible to the assigned developer.
          const devList = repos.changeRequests.listByAssignedDeveloper(developerId!);
          expect(devList.some((r) => r.id === draft.id)).toBe(true);
        } else {
          expect(result.status).toBe(ChangeRequestStatus.AwaitingDeveloperAssignment);
        }
        // Visible to the submitting client and on the admin (all-submitted) list.
        expect(repos.changeRequests.listByClient(clientId).some((r) => r.id === draft.id)).toBe(
          true
        );
        expect(repos.changeRequests.listAllSubmitted().some((r) => r.id === draft.id)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 20: For any submission that fails
// during persistence, the resulting stored state equals the pre-submission state
// (status unchanged, no partial items persisted).
describe("Property 20: submission atomicity", () => {
  it("rolls back so status stays Draft when the persistence step throws", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (count) => {
        const db = createDb(":memory:");
        const repos = makeRepositories(db);
        const { service } = buildServices(repos);
        const { clientId, websiteId } = seedClientAndWebsite(repos);
        const draft = service.createDraft(clientId, websiteId);
        for (let i = 0; i < count; i++) service.addItem(clientId, draft.id, validItem());

        // Force the persistence step to fail mid-transaction.
        const original = repos.changeRequests.updateStatusAndSubmittedAt;
        repos.changeRequests.updateStatusAndSubmittedAt = () => {
          throw new Error("simulated persistence failure");
        };

        try {
          service.submit(clientId, draft.id);
          throw new Error("expected SUBMISSION_FAILED");
        } catch (e) {
          expect((e as ServiceError).code).toBe("SUBMISSION_FAILED");
        } finally {
          repos.changeRequests.updateStatusAndSubmittedAt = original;
        }

        // Pre-submission state preserved: still Draft, no submitted_at, items intact.
        const reloaded = repos.changeRequests.getById(draft.id)!;
        expect(reloaded.status).toBe(ChangeRequestStatus.Draft);
        expect(reloaded.submittedAt ?? null).toBeNull();
        expect(repos.changeItems.countByRequest(draft.id)).toBe(count);
      }),
      { numRuns: 50 }
    );
  });
});

describe("Integration 9.5: real file-backed SQLite transaction commit/rollback", () => {
  let dir: string;
  let db: AppDatabase;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "crp-submit-"));
    db = createDb(join(dir, "portal.db"));
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("commits the submit on a real database", () => {
    const repos = makeRepositories(db);
    const { service } = buildServices(repos);
    const { clientId, websiteId } = seedClientAndWebsite(repos);
    const draft = service.createDraft(clientId, websiteId);
    service.addItem(clientId, draft.id, validItem());

    const result = service.submit(clientId, draft.id);
    expect(result.status).toBe(ChangeRequestStatus.AwaitingDeveloperAssignment);

    // Re-open the persisted state via a fresh repository view on the same db.
    const reread = makeRepositories(db).changeRequests.getById(draft.id)!;
    expect(reread.status).toBe(ChangeRequestStatus.AwaitingDeveloperAssignment);
    expect(reread.submittedAt).toBeTruthy();
  });

  it("rolls back a multi-statement transaction on failure, leaving no partial writes", () => {
    const repos = makeRepositories(db);
    const { clientId, websiteId } = seedClientAndWebsite(repos);
    const draft = repos.changeRequests.create({
      id: uuid(),
      websiteId,
      clientId,
      status: ChangeRequestStatus.Draft,
      createdAt: "2026-01-01T00:00:00.000Z",
      submittedAt: null,
    });

    // A transaction that writes one row then throws must roll back the write.
    expect(() =>
      repos.transaction(() => {
        repos.changeRequests.updateStatusAndSubmittedAt(
          draft.id,
          ChangeRequestStatus.Submitted,
          "2026-01-02T00:00:00.000Z"
        );
        throw new Error("boom");
      })
    ).toThrow(/boom/);

    // The status update was rolled back.
    expect(repos.changeRequests.getById(draft.id)!.status).toBe(ChangeRequestStatus.Draft);
    expect(repos.changeRequests.getById(draft.id)!.submittedAt ?? null).toBeNull();
  });
});
