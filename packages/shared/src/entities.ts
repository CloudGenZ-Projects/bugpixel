/**
 * Shared entity interfaces for BugPixel (v2 - flattened model).
 */

import type { ChangeRequestStatus, ChangeType, Priority, Role } from "./enums.js";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface Website {
  id: string;
  projectId: string;
  ownerClientId: string;
  name: string;
  url: string;
}

export interface Assignment {
  id: string;
  projectId: string;
  developerId: string;
  createdAt: string;
}

/** A single change request = one thing to change on one website. */
export interface ChangeRequest {
  id: string;
  websiteId: string;
  clientId: string;
  status: ChangeRequestStatus;
  priority: Priority;
  changeType: ChangeType;
  description: string;
  contentAdd?: string | null;
  contentCurrent?: string | null;
  contentUpdated?: string | null;
  contentDelete?: string | null;
  selector?: string | null;
  htmlMeta?: string | null;
  createdAt: string;
  dueDate?: string | null;
}

/** A screenshot attached to a change request. Multiple allowed. */
export interface Screenshot {
  id: string;
  changeRequestId: string;
  storageKey: string;
  mime: string;
  width: number;
  height: number;
  createdAt: string;
}

/** An optional file attachment on a request. */
export interface Attachment {
  id: string;
  changeRequestId: string;
  storageKey: string;
  filename: string;
  mime: string;
  sizeBytes: number;
}

/** A comment/note on a change request. Supports optional image. */
export interface Note {
  id: string;
  changeRequestId: string;
  authorId: string;
  content: string;
  imageStorageKey?: string | null;
  createdAt: string;
}
