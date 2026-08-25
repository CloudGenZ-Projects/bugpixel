/**
 * Shared entity interfaces for the Change Request Portal.
 *
 * These mirror the SQLite data model / ERD in the design document. All ids are
 * UUID strings and all timestamps are ISO-8601 text.
 */

import type { ChangeRequestStatus, ChangeType, Role } from "./enums.js";

/** Any authenticated actor of the Portal. Holds exactly one role. */
export interface User {
  id: string;
  email: string;
  /** Strong password hash (bcrypt/argon2). Never plaintext. */
  passwordHash: string;
  role: Role;
  createdAt: string;
}

/** The unit of work associated with a Website; Developers are assigned to it. */
export interface Project {
  id: string;
  name: string;
}

/** A site built and hosted by the portal owner, owned by a specific Client. */
export interface Website {
  id: string;
  projectId: string;
  ownerClientId: string;
  name: string;
  url: string;
}

/** An Admin-managed association between a Developer and a Project. */
export interface Assignment {
  id: string;
  projectId: string;
  developerId: string;
  createdAt: string;
}

/** A submitted report composed of one or more Change_Items against one Website. */
export interface ChangeRequest {
  id: string;
  websiteId: string;
  clientId: string;
  status: ChangeRequestStatus;
  createdAt: string;
  /** Set when the request is submitted; null/undefined while a Draft. */
  submittedAt?: string | null;
}

/**
 * A single requested change within a Change_Request. Only the content columns
 * relevant to `changeType` are populated.
 */
export interface ChangeItem {
  id: string;
  changeRequestId: string;
  changeType: ChangeType;
  description: string;
  /** Content to add (Add). */
  contentAdd?: string | null;
  /** Current value (Update). */
  contentCurrent?: string | null;
  /** Updated value (Update). */
  contentUpdated?: string | null;
  /** Content to remove (Delete). */
  contentDelete?: string | null;
  createdAt: string;
}

/**
 * The recorded identifier of the selected on-page component. A Screenshot is the
 * required capture; selector/HTML metadata are optional.
 */
export interface ComponentReference {
  id: string;
  changeItemId: string;
  selector?: string | null;
  htmlMeta?: string | null;
}

/** An image of the page captured at selection time, with a highlighted region. */
export interface Screenshot {
  id: string;
  changeItemId: string;
  storageKey: string;
  mime: string;
  width: number;
  height: number;
}

/** An optional PDF or image file added to an Add or Update Change_Item. */
export interface Attachment {
  id: string;
  changeItemId: string;
  storageKey: string;
  filename: string;
  /** Restricted to PDF or image types. */
  mime: string;
  sizeBytes: number;
}
