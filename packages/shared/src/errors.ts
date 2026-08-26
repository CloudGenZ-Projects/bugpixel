/**
 * Shared error shape and error codes for BugPixel (v2).
 */

/** The set of machine-readable error codes returned by the API. */
export type ErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_REQUIRED"
  | "AUTHZ_FORBIDDEN"
  | "AUTHZ_NOT_OWNER"
  | "INSPECTOR_DENIED"
  | "NOT_FOUND"
  | "LIMIT_EXCEEDED"
  | "VALIDATION_REQUIRED"
  | "VALIDATION_DESCRIPTION_REQUIRED"
  | "VALIDATION_DESCRIPTION_TOO_LONG"
  | "VALIDATION_CONTENT_REQUIRED"
  | "VALIDATION_CONTENT_TOO_LONG"
  | "VALIDATION_UNSUPPORTED_TYPE"
  | "VALIDATION_FILE_TOO_LARGE"
  | "VALIDATION_NO_ITEMS"
  | "VALIDATION_TOO_MANY_ITEMS"
  | "SUBMISSION_FAILED"
  | "ROSTER_DUPLICATE"
  | "ASSIGNMENT_UNKNOWN_DEVELOPER"
  | "RATE_LIMITED"
  | "FORBIDDEN";

/** The body of an error response. */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  field?: string;
}

/** The full error response envelope returned by the API. */
export interface ApiError {
  error: ApiErrorBody;
}

/** Convenience helper to build a well-formed API error envelope. */
export function makeApiError(code: ErrorCode, message: string, field?: string): ApiError {
  return { error: field ? { code, message, field } : { code, message } };
}
