/**
 * Change-request composition service.
 *
 * `createDraft` binds a new Draft change request to exactly one website the
 * client owns (Req 4.4, ownership per 15.4). `addItem` validates and appends a
 * Change_Item in order, persisting its required Component_Reference and
 * Screenshot and (optionally) the selector/HTML metadata; all items belong to
 * the request's single website (Req 5.4, 8.9, 10.1, 10.2, 10.3).
 *
 * Requirements: 4.4, 5.4, 8.9, 10.1, 10.2, 10.3
 */
import { v4 as uuid } from "uuid";

import {
  ChangeRequestStatus,
  MAX_ITEMS_PER_REQUEST,
  type Attachment,
  type ChangeItem,
  type ChangeRequest,
  type ChangeType,
} from "@crp/shared";
import type { Repositories } from "../db/repositories/index.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { ServiceError } from "./serviceError.js";
import type { ChangeItemValidator } from "./changeItemValidator.js";
import type { OwnershipService } from "./ownershipService.js";
import type { FileStore } from "./fileStore.js";
import { validateAttachment } from "./fileStore.js";

/** Component selection captured by the inspector for an item. */
export interface ComponentSelectionInput {
  selector?: string | null;
  htmlMeta?: string | null;
}

/** A captured screenshot for an item (bytes already written to the file store). */
export interface ScreenshotInput {
  storageKey: string;
  mime: string;
  width: number;
  height: number;
}

export interface AddItemInput {
  changeType: ChangeType;
  description: string;
  contentAdd?: string | null;
  contentCurrent?: string | null;
  contentUpdated?: string | null;
  contentDelete?: string | null;
  component: ComponentSelectionInput;
  screenshot: ScreenshotInput;
}

export interface ChangeRequestService {
  createDraft(clientId: string, websiteId: string): ChangeRequest;
  addItem(clientId: string, requestId: string, input: AddItemInput): ChangeItem;
  submit(clientId: string, requestId: string): ChangeRequest;
  /** Store screenshot bytes for a request and return the opaque storage key. */
  storeScreenshot(
    clientId: string,
    requestId: string,
    bytes: Uint8Array,
    mime: string
  ): string;
  /** Validate + store an attachment blob and link it to an item. */
  addAttachment(
    clientId: string,
    requestId: string,
    itemId: string,
    bytes: Uint8Array,
    mime: string,
    filename: string
  ): Attachment;
}

export function makeChangeRequestService(
  repos: Repositories,
  validator: ChangeItemValidator,
  ownership: OwnershipService,
  clock: Clock = systemClock,
  fileStore?: FileStore
): ChangeRequestService {
  function nowIso(): string {
    return new Date(clock.now()).toISOString();
  }

  function requireFileStore(): FileStore {
    if (!fileStore) {
      throw new ServiceError("SUBMISSION_FAILED", 500, "File storage is not configured.");
    }
    return fileStore;
  }

  /** Load a draft owned by the client, or throw. */
  function loadOwnedDraft(clientId: string, requestId: string): ChangeRequest {
    const cr = repos.changeRequests.getById(requestId);
    if (!cr || cr.clientId !== clientId) {
      throw new ServiceError(
        "AUTHZ_NOT_OWNER",
        403,
        "You do not own this change request."
      );
    }
    return cr;
  }

  return {
    createDraft(clientId, websiteId) {
      // The client must own the target website (Req 4.2, 15.4).
      ownership.assertOwns(clientId, websiteId);
      return repos.changeRequests.create({
        id: uuid(),
        websiteId,
        clientId,
        status: ChangeRequestStatus.Draft,
        createdAt: nowIso(),
        submittedAt: null,
      });
    },

    addItem(clientId, requestId, input) {
      const cr = loadOwnedDraft(clientId, requestId);

      // Validate description + type-specific content (Req 8.1-8.6).
      validator.validate(input);

      // Persist the item, then its required component reference + screenshot so
      // the item retains those associations (Req 8.9, Property 12). Content
      // columns irrelevant to the type are left null.
      const itemId = uuid();
      const item = repos.changeItems.create({
        id: itemId,
        changeRequestId: cr.id,
        changeType: input.changeType,
        description: input.description,
        contentAdd: input.contentAdd ?? null,
        contentCurrent: input.contentCurrent ?? null,
        contentUpdated: input.contentUpdated ?? null,
        contentDelete: input.contentDelete ?? null,
        createdAt: nowIso(),
      });

      repos.componentReferences.create({
        id: uuid(),
        changeItemId: itemId,
        selector: input.component.selector ?? null,
        htmlMeta: input.component.htmlMeta ?? null,
      });

      repos.screenshots.create({
        id: uuid(),
        changeItemId: itemId,
        storageKey: input.screenshot.storageKey,
        mime: input.screenshot.mime,
        width: input.screenshot.width,
        height: input.screenshot.height,
      });

      return item;
    },

    submit(clientId, requestId) {
      const cr = loadOwnedDraft(clientId, requestId);

      // Item-count guard (Req 10.4, 11.1, 11.5). Checked before the transaction
      // so the stored state is trivially unchanged on rejection.
      const itemCount = repos.changeItems.countByRequest(cr.id);
      if (itemCount === 0) {
        throw new ServiceError(
          "VALIDATION_NO_ITEMS",
          400,
          "A change request must contain at least one change item."
        );
      }
      if (itemCount > MAX_ITEMS_PER_REQUEST) {
        throw new ServiceError(
          "VALIDATION_TOO_MANY_ITEMS",
          400,
          `A change request may contain at most ${MAX_ITEMS_PER_REQUEST} change items.`
        );
      }

      // Determine routing: an active assignment on the website's project routes
      // the request to Submitted; otherwise AwaitingDeveloperAssignment
      // (Req 11.2-11.4, 11.6, 14.4).
      const website = repos.websites.getById(cr.websiteId);
      if (!website) {
        throw new ServiceError(
          "SUBMISSION_FAILED",
          500,
          "The change request could not be submitted."
        );
      }
      const assignment = repos.assignments.getByProject(website.projectId);
      const status = assignment
        ? ChangeRequestStatus.Submitted
        : ChangeRequestStatus.AwaitingDeveloperAssignment;
      const submittedAt = nowIso();

      // Persist status + timestamp atomically. Any failure rolls back leaving
      // the stored state exactly as before (Req 11.7, Property 20).
      try {
        repos.transaction(() => {
          repos.changeRequests.updateStatusAndSubmittedAt(cr.id, status, submittedAt);
        });
      } catch {
        throw new ServiceError(
          "SUBMISSION_FAILED",
          500,
          "The change request could not be submitted."
        );
      }

      return repos.changeRequests.getById(cr.id)!;
    },

    storeScreenshot(clientId, requestId, bytes, mime) {
      loadOwnedDraft(clientId, requestId);
      const store = requireFileStore();
      // Screenshots are images; validate as an attachment (PDF/image + size).
      return store.write(bytes, mime, "screenshot.png", { validate: true });
    },

    addAttachment(clientId, requestId, itemId, bytes, mime, filename) {
      loadOwnedDraft(clientId, requestId);

      // The item must belong to this request.
      const item = repos.changeItems.getById(itemId);
      if (!item || item.changeRequestId !== requestId) {
        throw new ServiceError(
          "AUTHZ_NOT_OWNER",
          403,
          "This item does not belong to the change request."
        );
      }

      // Attachments are only permitted for Add/Update items (Req 8.8, 9.5).
      validator.assertAttachmentAllowed(item.changeType);

      // Validate MIME + size, then persist the blob and link it.
      validateAttachment(mime, bytes.byteLength);
      const store = requireFileStore();
      const storageKey = store.write(bytes, mime, filename, { validate: true });

      return repos.attachments.create({
        id: uuid(),
        changeItemId: itemId,
        storageKey,
        filename,
        mime,
        sizeBytes: bytes.byteLength,
      });
    },
  };
}
