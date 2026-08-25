/**
 * Shared constants for the Change Request Portal.
 *
 * Units are made explicit in each name to avoid ambiguity.
 */

/** Max length of a Change_Item description, in characters (Req 8.1). */
export const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Max length of a type-specific content field, in characters
 * (Add/Delete content, Update current/updated values) (Req 8.2–8.4).
 */
export const MAX_CONTENT_LENGTH = 2000;

/** Max size of a single attachment, in bytes: 10 MB (Req 9.4). */
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** Max number of Change_Items allowed in a single Change_Request (Req 11.1). */
export const MAX_ITEMS_PER_REQUEST = 500;

/** Idle session timeout, in milliseconds: 30 minutes (Req 1.5). */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Time-to-live of a minted inspector token, in seconds: 5 minutes. */
export const INSPECTOR_TOKEN_TTL_SECONDS = 5 * 60;
