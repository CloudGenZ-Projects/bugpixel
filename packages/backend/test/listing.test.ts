/**
 * Role-scoped listing/detail property tests: client list (P6), request detail
 * items (P7), website picker (P8), developer list (P21), developer detail
 * payload (P22).
 *
 * Requirements: 3.1, 3.2, 3.3, 4.1, 12.1, 12.2, 12.3
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { v4 as uuid } from "uuid";

import { ChangeRequestStatus, ChangeType, Role } from "@crp/shared";
import { createDb, makeRepositories } from "../src/db/index.js";
import {
  makeListingService,
  makeWebsiteService,
  makeOwnershipService,
} from "../src/services/index.js";

const NOW = "2026-01-01T00:00:00.000Z";

function setup() {
  const db = createDb(":memory:");
  const repos = makeRepositories(db);
  const ownership = makeOwnershipService(
    repos.websites,
    repos.changeRequests,
    repos.assignments
  );
  const listing = makeListingService(repos, ownership);
  const websiteSvc = makeWebsiteService(repos);
  return { repos, listing, websiteSvc };
}

function makeClient(repos: ReturnType<typeof makeRepositories>): string {
  const id = uuid();
  repos.users.create({
    id,
    email: `${id}@example.com`,
    passwordHash: "h",
    role: Role.Client,
    createdAt: NOW,
  });
  return id;
}

function makeWebsite(repos: ReturnType<typeof makeRepositories>, ownerId: string) {
  const projectId = uuid();
  repos.projects.create({ id: projectId, name: `p-${projectId}` });
  const websiteId = uuid();
  repos.websites.create({
    id: websiteId,
    projectId,
    ownerClientId: ownerId,
    name: "site",
    url: "https://site.example.com",
  });
  return { projectId, websiteId };
}

function makeSubmittedRequest(
  repos: ReturnType<typeof makeRepositories>,
  clientId: string,
  websiteId: string,
  status: ChangeRequestStatus = ChangeRequestStatus.Submitted
): string {
  const id = uuid();
  repos.changeRequests.create({
    id,
    websiteId,
    clientId,
    status,
    createdAt: NOW,
    submittedAt: NOW,
  });
  return id;
}

// Feature: change-request-portal, Property 6: For any collection of
// Change_Requests across clients, the list returned for client C equals exactly
// the set of Change_Requests whose client_id is C (no more, no fewer).
describe("Property 6: client change-request list is exactly the client's own", () => {
  it("returns exactly the requests owned by the client", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 6 }),
        (myCount, otherCount) => {
          const { repos, listing } = setup();
          const me = makeClient(repos);
          const other = makeClient(repos);
          const { websiteId: myWebsite } = makeWebsite(repos, me);
          const { websiteId: otherWebsite } = makeWebsite(repos, other);

          const mine = new Set<string>();
          for (let i = 0; i < myCount; i++)
            mine.add(makeSubmittedRequest(repos, me, myWebsite));
          for (let i = 0; i < otherCount; i++)
            makeSubmittedRequest(repos, other, otherWebsite);

          const listed = new Set(listing.listForClient(me).map((r) => r.id));
          expect(listed).toEqual(mine);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 7: For any Change_Request, its detail
// view returns exactly the Change_Items whose change_request_id is that
// Change_Request.
describe("Property 7: change-request detail contains exactly its own items", () => {
  it("returns exactly the items of the requested change request", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (mineCount, otherCount) => {
          const { repos, listing } = setup();
          const client = makeClient(repos);
          const { websiteId } = makeWebsite(repos, client);
          const target = makeSubmittedRequest(repos, client, websiteId);
          const other = makeSubmittedRequest(repos, client, websiteId);

          const expected = new Set<string>();
          for (let i = 0; i < mineCount; i++) {
            const id = uuid();
            repos.changeItems.create({
              id,
              changeRequestId: target,
              changeType: ChangeType.Add,
              description: "d",
              contentAdd: "c",
              createdAt: NOW,
            });
            expected.add(id);
          }
          for (let i = 0; i < otherCount; i++) {
            repos.changeItems.create({
              id: uuid(),
              changeRequestId: other,
              changeType: ChangeType.Add,
              description: "d",
              contentAdd: "c",
              createdAt: NOW,
            });
          }

          const detail = listing.clientDetail(client, target);
          const got = new Set(detail.items.map((d) => d.item.id));
          expect(got).toEqual(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 8: For any collection of Websites
// across owners, the picker list for client C equals exactly the set of Websites
// whose owner_client_id is C.
describe("Property 8: website picker lists exactly the client's owned websites", () => {
  it("returns exactly the websites owned by the client", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 6 }),
        (myCount, otherCount) => {
          const { repos, websiteSvc } = setup();
          const me = makeClient(repos);
          const other = makeClient(repos);

          const mine = new Set<string>();
          for (let i = 0; i < myCount; i++) mine.add(makeWebsite(repos, me).websiteId);
          for (let i = 0; i < otherCount; i++) makeWebsite(repos, other);

          const listed = new Set(websiteSvc.listOwned(me).map((w) => w.id));
          expect(listed).toEqual(mine);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 21: For any collection of
// Change_Requests and Assignments, the list returned for developer D equals
// exactly the set of Change_Requests whose Website's Project has an active
// Assignment to D.
describe("Property 21: developer change-request list is exactly assigned projects'", () => {
  it("returns exactly the requests on projects assigned to the developer", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 4 }), (assignedReqs, unassignedReqs) => {
        const { repos, listing } = setup();
        const client = makeClient(repos);

        // Developer with an assignment to project A.
        const dev = uuid();
        repos.users.create({
          id: dev,
          email: `${dev}@example.com`,
          passwordHash: "h",
          role: Role.Developer,
          createdAt: NOW,
        });
        const { projectId: assignedProject, websiteId: assignedWebsite } = makeWebsite(
          repos,
          client
        );
        repos.assignments.setForProject({
          id: uuid(),
          projectId: assignedProject,
          developerId: dev,
          createdAt: NOW,
        });
        // A different, unassigned project/website.
        const { websiteId: unassignedWebsite } = makeWebsite(repos, client);

        const expected = new Set<string>();
        for (let i = 0; i < assignedReqs; i++)
          expected.add(makeSubmittedRequest(repos, client, assignedWebsite));
        for (let i = 0; i < unassignedReqs; i++)
          makeSubmittedRequest(repos, client, unassignedWebsite);

        const listed = new Set(listing.listForDeveloper(dev).map((r) => r.id));
        expect(listed).toEqual(expected);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 22: For any Change_Request a developer
// is permitted to view, the detail includes all its Change_Items together with
// their Component_References, Screenshots, and Attachments.
describe("Property 22: developer detail contains full item payload", () => {
  it("assembles items with component references, screenshots, and attachments", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 0, max: 3 }), (numItems, numAttach) => {
        const { repos, listing } = setup();
        const client = makeClient(repos);
        const dev = uuid();
        repos.users.create({
          id: dev,
          email: `${dev}@example.com`,
          passwordHash: "h",
          role: Role.Developer,
          createdAt: NOW,
        });
        const { projectId, websiteId } = makeWebsite(repos, client);
        repos.assignments.setForProject({
          id: uuid(),
          projectId,
          developerId: dev,
          createdAt: NOW,
        });
        const reqId = makeSubmittedRequest(repos, client, websiteId);

        const itemIds: string[] = [];
        for (let i = 0; i < numItems; i++) {
          const itemId = uuid();
          repos.changeItems.create({
            id: itemId,
            changeRequestId: reqId,
            changeType: ChangeType.Add,
            description: "d",
            contentAdd: "c",
            createdAt: NOW,
          });
          repos.componentReferences.create({ id: uuid(), changeItemId: itemId, selector: "sel", htmlMeta: null });
          repos.screenshots.create({
            id: uuid(),
            changeItemId: itemId,
            storageKey: `k-${uuid()}`,
            mime: "image/png",
            width: 5,
            height: 5,
          });
          for (let a = 0; a < numAttach; a++) {
            repos.attachments.create({
              id: uuid(),
              changeItemId: itemId,
              storageKey: `att-${uuid()}`,
              filename: `f${a}.pdf`,
              mime: "application/pdf",
              sizeBytes: 100,
            });
          }
          itemIds.push(itemId);
        }

        const detail = listing.developerDetail(dev, reqId);
        expect(detail.items.map((d) => d.item.id)).toEqual(itemIds);
        for (const d of detail.items) {
          expect(d.componentReference).not.toBeNull();
          expect(d.screenshot).not.toBeNull();
          expect(d.attachments).toHaveLength(numAttach);
        }
      }),
      { numRuns: 100 }
    );
  });
});
