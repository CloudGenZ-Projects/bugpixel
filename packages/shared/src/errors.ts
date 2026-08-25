/**
 * Shared error shape and error codes for the Change Request Portal.
 *
 * All API errors use the consistent JSON shape `{ error: { code, message, field? } }`
 * as described in the design's Error Handling section.
 */

/** The set of machine-readable error codes returned by the Portal API. */
export type ErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_REQUIRED"
  | "AUTHZ_FORBIDDEN"
  | "AUTHZ_NOT_OWNER"
  | "INSPECTOR_DENIED"
  | "VALIDATION_DESCRIPTION_REQUIRED"
  | "VALIDATION_CONTENT_REQUIRED"
  | "VALIDATION_UNSUPPORTED_TYPE"
  | "VALIDATION_FILE_TOO_LARGE"
  | "VALIDATION_NO_ITEMS"
  | "VALIDATION_TOO_MANY_ITEMS"
  | "SUBMISSION_FAILED"
  | "ROSTER_DUPLICATE"
  | "ASSIGNMENT_UNKNOWN_DEVELOPER";

/** The body of an error response. */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  /** Optional field name the error applies to (e.g. "description", "attachment"). */
  field?: string;
}

/** The full error response envelope returned by the API. */
export interface ApiError {
  error: ApiErrorBody;
}

/** Convenience helper to build a well-formed API error envelope. */
export function makeApiError(
  code: ErrorCode,
  message: string,
  field?: string
): ApiError {
  return { error: field ? { code, message, field } : { code, message } };
}
