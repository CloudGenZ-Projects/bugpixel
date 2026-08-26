/**
 * Change Request Service (v2 - single create = immediate submit, no draft).
 */
import { v4 as uuid } from "uuid";
import {
  ChangeRequestStatus,
  MAX_CONTENT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_SCREENSHOTS_PER_REQUEST,
  type Attachment,
  type ChangeRequest,
  type ChangeType,
  type Note,
  type Priority,
  type Screenshot,
} from "@crp/shared";
import type { Repositories } from "../db/repositories/index.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { ServiceError } from "./serviceError.js";
import type { OwnershipService } from "./ownershipService.js";
import type { FileStore } from "./fileStore.js";

export interface CreateChangeRequestInput {
  websiteId: string;
  changeType: ChangeType;
  description: string;
  priority?: Priority;
  contentAdd?: string | null;
  contentCurrent?: string | null;
  contentUpdated?: string | null;
  contentDelete?: string | null;
  selector?: string | null;
  htmlMeta?: string | null;
  dueDate?: string | null;
}

export interface ChangeRequestService {
  create(clientId: string, input: CreateChangeRequestInput): ChangeRequest;
  updateStatus(
    actorId: string,
    requestId: string,
    newStatus: ChangeRequestStatus
  ): ChangeRequest;
  updatePriority(requestId: string, priority: Priority): void;
  addScreenshot(
    requestId: string,
    bytes: Uint8Array,
    mime: string,
    width: number,
    height: number
  ): Screenshot;
  addAttachment(
    requestId: string,
    bytes: Uint8Array,
    mime: string,
    filename: string
  ): Attachment;
  addNote(
    requestId: string,
    authorId: string,
    content: string,
    imageBytes?: Uint8Array | null,
    imageMime?: string | null
  ): Note;
}

export function makeChangeRequestService(
  repos: Repositories,
  ownership: OwnershipService,
  clock: Clock = systemClock,
  fileStore: FileStore
): ChangeRequestService {
  function assertRequestExists(id: string): ChangeRequest {
    const cr = repos.changeRequests.getById(id);
    if (!cr) throw new ServiceError("NOT_FOUND", 404, "Change request not found.");
    return cr;
  }

  function isoNow(): string {
    return new Date(clock.now()).toISOString();
  }

  function validateDescription(description: string): void {
    const trimmed = description.trim();
    if (!trimmed) {
      throw new ServiceError(
        "VALIDATION_DESCRIPTION_REQUIRED",
        400,
        "Description is required."
      );
    }
    if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
      throw new ServiceError(
        "VALIDATION_DESCRIPTION_TOO_LONG",
        400,
        `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`
      );
    }
  }

  function validateContent(value: string | null | undefined, fieldName: string): void {
    if (value && value.length > MAX_CONTENT_LENGTH) {
      throw new ServiceError(
        "VALIDATION_CONTENT_TOO_LONG",
        400,
        `${fieldName} must be at most ${MAX_CONTENT_LENGTH} characters.`
      );
    }
  }

  return {
    create(clientId, input) {
      ownership.assertOwns(clientId, input.websiteId);
      validateDescription(input.description);
      validateContent(input.contentAdd, "contentAdd");
      validateContent(input.contentCurrent, "contentCurrent");
      validateContent(input.contentUpdated, "contentUpdated");
      validateContent(input.contentDelete, "contentDelete");

      const id = uuid();
      const now = isoNow();

      const cr = repos.changeRequests.create({
        id,
        websiteId: input.websiteId,
        clientId,
        status: ChangeRequestStatus.Submitted,
        priority: input.priority,
        changeType: input.changeType,
        description: input.description.trim(),
        contentAdd: input.contentAdd ?? null,
        contentCurrent: input.contentCurrent ?? null,
        contentUpdated: input.contentUpdated ?? null,
        contentDelete: input.contentDelete ?? null,
        selector: input.selector ?? null,
        htmlMeta: input.htmlMeta ?? null,
        createdAt: now,
        dueDate: input.dueDate ?? null,
      });

      repos.activities.create({
        id: uuid(),
        changeRequestId: id,
        actorId: clientId,
        action: "created",
        detail: `Request created with status Submitted`,
        createdAt: now,
      });

      return cr;
    },

    updateStatus(actorId, requestId, newStatus) {
      const cr = assertRequestExists(requestId);
      const oldStatus = cr.status;
      if (oldStatus === newStatus) return cr;

      repos.changeRequests.updateStatus(requestId, newStatus);
      repos.activities.create({
        id: uuid(),
        changeRequestId: requestId,
        actorId,
        action: "status_changed",
        detail: `${oldStatus} -> ${newStatus}`,
        createdAt: isoNow(),
      });

      return repos.changeRequests.getById(requestId)!;
    },

    updatePriority(requestId, priority) {
      assertRequestExists(requestId);
      repos.changeRequests.updatePriority(requestId, priority);
    },

    addScreenshot(requestId, bytes, mime, width, height) {
      assertRequestExists(requestId);
      const count = repos.screenshots.countByRequest(requestId);
      if (count >= MAX_SCREENSHOTS_PER_REQUEST) {
        throw new ServiceError(
          "LIMIT_EXCEEDED",
          400,
          `Maximum ${MAX_SCREENSHOTS_PER_REQUEST} screenshots per request.`
        );
      }

      const storageKey = fileStore.write(bytes, mime, "screenshot");
      return repos.screenshots.create({
        id: uuid(),
        changeRequestId: requestId,
        storageKey,
        mime,
        width,
        height,
        createdAt: isoNow(),
      });
    },

    addAttachment(requestId, bytes, mime, filename) {
      assertRequestExists(requestId);
      const storageKey = fileStore.write(bytes, mime, filename);
      return repos.attachments.create({
        id: uuid(),
        changeRequestId: requestId,
        storageKey,
        filename,
        mime,
        sizeBytes: bytes.length,
      });
    },

    addNote(requestId, authorId, content, imageBytes, imageMime) {
      assertRequestExists(requestId);
      if (!content.trim()) {
        throw new ServiceError("VALIDATION_CONTENT_REQUIRED", 400, "Note content is required.");
      }

      let imageStorageKey: string | null = null;
      if (imageBytes && imageMime) {
        imageStorageKey = fileStore.write(imageBytes, imageMime, "note-image");
      }

      const note = repos.notes.create({
        id: uuid(),
        changeRequestId: requestId,
        authorId,
        content: content.trim(),
        imageStorageKey,
        createdAt: isoNow(),
      });

      repos.activities.create({
        id: uuid(),
        changeRequestId: requestId,
        actorId: authorId,
        action: "note_added",
        detail: null,
        createdAt: isoNow(),
      });

      return note;
    },
  };
}
