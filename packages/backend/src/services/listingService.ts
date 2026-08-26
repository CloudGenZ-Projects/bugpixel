/**
 * Listing service (v2 - flat model, screenshots/notes/activity on request).
 */
import type {
  Attachment,
  ChangeRequest,
  Note,
  Screenshot,
  Website,
} from "@crp/shared";
import type { Activity } from "../db/mappers.js";
import type { Repositories } from "../db/repositories/index.js";
import type { OwnershipService } from "./ownershipService.js";
import { ServiceError } from "./serviceError.js";

/** Full detail payload for a single change request. */
export interface ChangeRequestDetail {
  request: ChangeRequest;
  screenshots: Screenshot[];
  attachments: Attachment[];
  notes: Note[];
  activity: Activity[];
}

export interface ListingService {
  listForClient(clientId: string): ChangeRequest[];
  listForDeveloper(developerId: string): ChangeRequest[];
  listByProject(projectId: string): ChangeRequest[];
  listAll(): ChangeRequest[];
  getDetail(requestId: string): ChangeRequestDetail;
}

export interface WebsiteService {
  listOwned(clientId: string): Website[];
}

export function makeListingService(
  repos: Repositories,
  _ownership: OwnershipService
): ListingService {
  return {
    listForClient(clientId) {
      return repos.changeRequests.listByClient(clientId);
    },

    listForDeveloper(developerId) {
      return repos.changeRequests.listByAssignedDeveloper(developerId);
    },

    listByProject(projectId) {
      return repos.changeRequests.listByProject(projectId);
    },

    listAll() {
      return repos.changeRequests.listAll();
    },

    getDetail(requestId) {
      const request = repos.changeRequests.getById(requestId);
      if (!request) {
        throw new ServiceError("NOT_FOUND", 404, "Change request not found.");
      }
      return {
        request,
        screenshots: repos.screenshots.listByRequest(requestId),
        attachments: repos.attachments.listByRequest(requestId),
        notes: repos.notes.listByRequest(requestId),
        activity: repos.activities.listByRequest(requestId),
      };
    },
  };
}

export function makeWebsiteService(repos: Repositories): WebsiteService {
  return {
    listOwned(clientId) {
      return repos.websites.listByOwner(clientId);
    },
  };
}
