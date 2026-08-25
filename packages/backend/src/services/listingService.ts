/**
 * Role-scoped listing and detail services, plus the owned-website picker.
 *
 * - Client list: exactly the requesting client's own change requests (Req 3.1,
 *   3.2); client detail: exactly that request's change items (Req 3.3).
 * - Developer list: exactly the change requests whose website's project has an
 *   active assignment to the developer (Req 12.1, 12.2); developer detail: all
 *   items with their component references, screenshots, and attachments
 *   (Req 12.3).
 * - Website picker: exactly the websites owned by the client (Req 4.1).
 *
 * Requirements: 3.1, 3.2, 3.3, 12.1, 12.2, 12.3, 4.1
 */
import type {
  Attachment,
  ChangeItem,
  ChangeRequest,
  ComponentReference,
  Screenshot,
  Website,
} from "@crp/shared";
import type { Repositories } from "../db/repositories/index.js";
import type { OwnershipService } from "./ownershipService.js";
import { ServiceError } from "./serviceError.js";

/** A fully-assembled change item with its linked payload (developer detail). */
export interface ChangeItemDetail {
  item: ChangeItem;
  componentReference: ComponentReference | null;
  screenshot: Screenshot | null;
  attachments: Attachment[];
}

export interface ChangeRequestDetail {
  request: ChangeRequest;
  items: ChangeItemDetail[];
}

export interface ListingService {
  listForClient(clientId: string): ChangeRequest[];
  clientDetail(clientId: string, requestId: string): ChangeRequestDetail;
  listForDeveloper(developerId: string): ChangeRequest[];
  developerDetail(developerId: string, requestId: string): ChangeRequestDetail;
  listAllForAdmin(): ChangeRequest[];
}

export interface WebsiteService {
  listOwned(clientId: string): Website[];
}

export function makeListingService(
  repos: Repositories,
  ownership: OwnershipService
): ListingService {
  /** Assemble the full per-item payload for a request. */
  function assembleDetail(request: ChangeRequest): ChangeRequestDetail {
    const items = repos.changeItems.listByRequest(request.id).map((item) => ({
      item,
      componentReference: repos.componentReferences.getByItem(item.id),
      screenshot: repos.screenshots.getByItem(item.id),
      attachments: repos.attachments.listByItem(item.id),
    }));
    return { request, items };
  }

  return {
    listForClient(clientId) {
      return repos.changeRequests.listByClient(clientId);
    },

    clientDetail(clientId, requestId) {
      const request = repos.changeRequests.getById(requestId);
      if (!request || request.clientId !== clientId) {
        throw new ServiceError(
          "AUTHZ_NOT_OWNER",
          403,
          "You do not own this change request."
        );
      }
      return assembleDetail(request);
    },

    listForDeveloper(developerId) {
      return repos.changeRequests.listByAssignedDeveloper(developerId);
    },

    developerDetail(developerId, requestId) {
      // The developer must hold an active assignment to the request's project.
      if (!ownership.canDeveloperView(developerId, requestId)) {
        throw new ServiceError(
          "AUTHZ_FORBIDDEN",
          403,
          "You are not assigned to this change request."
        );
      }
      const request = repos.changeRequests.getById(requestId)!;
      return assembleDetail(request);
    },

    listAllForAdmin() {
      return repos.changeRequests.listAllSubmitted();
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
