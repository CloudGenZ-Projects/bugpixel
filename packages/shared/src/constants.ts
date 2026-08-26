/**
 * Shared constants for BugPixel.
 */

/** Max length of a description, in characters. */
export const MAX_DESCRIPTION_LENGTH = 5000;

/** Max length of a content field (Add/Delete/Update values). */
export const MAX_CONTENT_LENGTH = 5000;

/** Max size of a single attachment, in bytes: 10 MB. */
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** Max screenshots per request. */
export const MAX_SCREENSHOTS_PER_REQUEST = 10;

/** Idle session timeout, in milliseconds: 30 minutes. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Time-to-live of a minted inspector token, in seconds: 5 minutes. */
export const INSPECTOR_TOKEN_TTL_SECONDS = 5 * 60;
