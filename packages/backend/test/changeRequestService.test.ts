/**
 * Change-request composition property tests: one website per request
 * (Property 10), component/screenshot linkage (Property 12), and ordered item
 * accumulation (Property 17).
 *
 * Requirements: 4.4, 5.4, 6.3, 6.4, 7.1-7.3, 8.9, 10.1, 10.2, 10.3
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { v4 as uuid } from "uuid";

import { ChangeType, Role } from "@crp/shared";
import { createDb, makeRepositories } from "../src/db/index.js";
import {
  MutableClock,
  makeChangeItemValidator,
  makeChangeRequestService,
  makeOwnershipService,
  type AddItemInput,
} from "../src/services/index.js";
import { changeTypeArb, componentSelectionArb, validContentArb } from "./arbitraries.js";

function setup() {
  const db = createDb(":memory:");
  const repos = makeRepositories(db);
  const ownership = makeOwnershipService(
    repos.websites,
    repos.changeRequests,
    repos.assignments
  );
  const validator = makeChangeItemValidator();
  const clock = new MutableClock(0);
  const service = makeChangeRequestService(repos, validator, ownership, clock);
  return { repos, ownership, validator, service, clock };
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

function makeValidItemInput(
  changeType: ChangeType,
  content: string,
  component: { selector: string | null; htmlMeta: string | null }
): AddItemInput {
  return {
    changeType,
    description: "a valid description",
    contentAdd: changeType === ChangeType.Add ? content : null,
    contentDelete: changeType === ChangeType.Delete ? content : null,
    contentCurrent: changeType === ChangeType.Update ? content : null,
    contentUpdated: changeType === ChangeType.Update ? content : null,
    component,
    screenshot: {
      storageKey: `key-${uuid()}`,
      mime: "image/png",
      width: 800,
      height: 600,
    },
  };
}

// Feature: change-request-portal, Property 10: For any Change_Request and any set
// of Change_Items added to it, all items are associated with the single Website
// recorded on the Change_Request; the Change_Request references exactly one Website.
describe("Property 10: one website per change request", () => {
  it("all items belong to the request bound to a single website", () => {
    fc.assert(
      fc.property(fc.array(changeTypeArb, { minLength: 1, maxLength: 6 }), (types) => {
        const { repos, service } = setup();
        const { ownerId, websiteId } = seedOwnerAndWebsite(repos);
        const draft = service.createDraft(ownerId, websiteId);
        expect(draft.websiteId).toBe(websiteId);

        for (const t of types) {
          service.addItem(ownerId, draft.id, makeValidItemInput(t, "content", {
            selector: null,
            htmlMeta: null,
          }));
        }

        // The request still references exactly the one website.
        const reloaded = repos.changeRequests.getById(draft.id)!;
        expect(reloaded.websiteId).toBe(websiteId);
        // Every item belongs to this request (single-website binding is via the
        // request, which references exactly one website).
        const items = repos.changeItems.listByRequest(draft.id);
        expect(items).toHaveLength(types.length);
        expect(items.every((i) => i.changeRequestId === draft.id)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 12: For any component selection during
// composition, the resulting Change_Item retains an associated Component_Reference
// and a Screenshot that includes a highlighted region for the selected component;
// when selector/HTML metadata is available it is stored as optional data on the
// Component_Reference, and when absent the reference is still valid.
describe("Property 12: component selection yields linked reference and screenshot", () => {
  it("links a component reference and screenshot; optional metadata preserved", () => {
    fc.assert(
      fc.property(
        changeTypeArb,
        validContentArb,
        componentSelectionArb,
        (changeType, content, component) => {
          const { repos, service } = setup();
          const { ownerId, websiteId } = seedOwnerAndWebsite(repos);
          const draft = service.createDraft(ownerId, websiteId);

          const item = service.addItem(
            ownerId,
            draft.id,
            makeValidItemInput(changeType, content, component)
          );

          const ref = repos.componentReferences.getByItem(item.id);
          const shot = repos.screenshots.getByItem(item.id);

          // A component reference and a screenshot are always linked.
          expect(ref).not.toBeNull();
          expect(shot).not.toBeNull();
          expect(ref!.changeItemId).toBe(item.id);
          expect(shot!.changeItemId).toBe(item.id);

          // Optional metadata stored when present, null when absent.
          expect(ref!.selector).toBe(component.selector);
          expect(ref!.htmlMeta).toBe(component.htmlMeta);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 17: For any sequence of valid
// Change_Items added to a draft Change_Request, the Change_Request contains
// exactly those items, in order of addition.
describe("Property 17: item accumulation within a change request", () => {
  it("contains exactly the added items in addition order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(changeTypeArb, validContentArb), {
          minLength: 1,
          maxLength: 8,
        }),
        (specs) => {
          const { repos, service, clock } = setup();
          const { ownerId, websiteId } = seedOwnerAndWebsite(repos);
          const draft = service.createDraft(ownerId, websiteId);

          const addedIds: string[] = [];
          for (const [changeType, content] of specs) {
            // Advance the clock so timestamps differ, but ordering must hold
            // regardless (rowid-based).
            clock.advance(1);
            const item = service.addItem(
              ownerId,
              draft.id,
              makeValidItemInput(changeType, content, { selector: null, htmlMeta: null })
            );
            addedIds.push(item.id);
          }

          const listedIds = repos.changeItems.listByRequest(draft.id).map((i) => i.id);
          expect(listedIds).toEqual(addedIds);
        }
      ),
      { numRuns: 100 }
    );
  });
});
