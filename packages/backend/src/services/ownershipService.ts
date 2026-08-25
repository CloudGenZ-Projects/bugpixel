/**
 * Ownership service.
 *
 * `assertOwns` verifies a website's `ownerClientId` equals the acting client for
 * any open/create/submit action (Req 4.2, 15.4). `canDeveloperView` checks a
 * developer's access to a change request against an active Assignment on the
 * request's website's project (Req 12.2).
 *
 * Requirements: 4.2, 12.2, 15.4
 */
import type { AssignmentRepo } from "../db/repositories/assignmentRepo.js";
import type { ChangeRequestRepo } from "../db/repositories/changeRequestRepo.js";
import type { WebsiteRepo } from "../db/repositories/websiteRepo.js";
import { ServiceError } from "./serviceError.js";

export interface OwnershipService {
  isOwner(clientId: string, websiteId: string): boolean;
  /** Throw AUTHZ_NOT_OWNER (403) if the client does not own the website. */
  assertOwns(clientId: string, websiteId: string): void;
  /** True iff the developer has an active assignment to the request's project. */
  canDeveloperView(developerId: string, changeRequestId: string): boolean;
}

export function makeOwnershipService(
  websites: WebsiteRepo,
  changeRequests: ChangeRequestRepo,
  assignments: AssignmentRepo
): OwnershipService {
  return {
    isOwner(clientId, websiteId) {
      const website = websites.getById(websiteId);
      return website != null && website.ownerClientId === clientId;
    },

    assertOwns(clientId, websiteId) {
      if (!this.isOwner(clientId, websiteId)) {
        throw new ServiceError(
          "AUTHZ_NOT_OWNER",
          403,
          "You do not own this website."
        );
      }
    },

    canDeveloperView(developerId, changeRequestId) {
      const cr = changeRequests.getById(changeRequestId);
      if (!cr) return false;
      const website = websites.getById(cr.websiteId);
      if (!website) return false;
      const assignment = assignments.getByProject(website.projectId);
      return assignment != null && assignment.developerId === developerId;
    },
  };
}
