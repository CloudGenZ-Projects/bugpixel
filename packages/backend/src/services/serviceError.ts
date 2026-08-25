/**
 * A typed application error carrying a machine-readable `ErrorCode` and an
 * optional field name, plus the HTTP status the route layer should emit. This
 * lets services throw domain errors that middleware maps directly to the
 * `{ error: { code, message, field? } }` response shape.
 */
import type { ErrorCode } from "@crp/shared";

export class ServiceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
