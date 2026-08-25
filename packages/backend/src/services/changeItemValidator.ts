/**
 * Change-item validation.
 *
 * Validates a proposed Change_Item:
 *   - description: required, non-empty after trimming, at most 2000 chars
 *     (Req 8.1, 8.5) -> VALIDATION_DESCRIPTION_REQUIRED
 *   - type-specific content, each 1..2000 chars, non-whitespace (Req 8.2-8.4, 8.6):
 *       Add    -> contentAdd
 *       Delete -> contentDelete
 *       Update -> contentCurrent AND contentUpdated
 *     -> VALIDATION_CONTENT_REQUIRED (with the offending field name)
 *   - attachment availability: attachments permitted iff Add or Update
 *     (Req 8.7, 8.8, 9.1, 9.5)
 *
 * Validators throw a ServiceError on failure; retention of entered values is the
 * caller's responsibility (the API echoes submitted values back to the client).
 *
 * Requirements: 8.1-8.8, 9.1, 9.5
 */
import { ChangeType, MAX_CONTENT_LENGTH, MAX_DESCRIPTION_LENGTH } from "@crp/shared";
import { ServiceError } from "./serviceError.js";

export interface ChangeItemInput {
  changeType: ChangeType;
  description: string;
  contentAdd?: string | null;
  contentCurrent?: string | null;
  contentUpdated?: string | null;
  contentDelete?: string | null;
}

/** True iff `value` is present, non-whitespace, and within [1, max] chars. */
function isValidBoundedText(value: string | null | undefined, max: number): boolean {
  if (value == null) return false;
  if (value.trim().length === 0) return false;
  return value.length <= max;
}

export interface ChangeItemValidator {
  validateDescription(description: string): void;
  validateContent(input: ChangeItemInput): void;
  /** Full validation (description + content). */
  validate(input: ChangeItemInput): void;
  /** True iff attachments are permitted for this change type. */
  attachmentsAllowed(changeType: ChangeType): boolean;
  /** Throw if an attachment is offered for a type that forbids them. */
  assertAttachmentAllowed(changeType: ChangeType): void;
}

export function makeChangeItemValidator(): ChangeItemValidator {
  return {
    validateDescription(description) {
      if (!isValidBoundedText(description, MAX_DESCRIPTION_LENGTH)) {
        throw new ServiceError(
          "VALIDATION_DESCRIPTION_REQUIRED",
          400,
          "A description of 1 to 2000 characters is required.",
          "description"
        );
      }
    },

    validateContent(input) {
      const requireField = (value: string | null | undefined, field: string) => {
        if (!isValidBoundedText(value, MAX_CONTENT_LENGTH)) {
          throw new ServiceError(
            "VALIDATION_CONTENT_REQUIRED",
            400,
            `The ${field} field of 1 to 2000 characters is required.`,
            field
          );
        }
      };

      switch (input.changeType) {
        case ChangeType.Add:
          requireField(input.contentAdd, "contentAdd");
          break;
        case ChangeType.Delete:
          requireField(input.contentDelete, "contentDelete");
          break;
        case ChangeType.Update:
          requireField(input.contentCurrent, "contentCurrent");
          requireField(input.contentUpdated, "contentUpdated");
          break;
      }
    },

    validate(input) {
      this.validateDescription(input.description);
      this.validateContent(input);
    },

    attachmentsAllowed(changeType) {
      return changeType === ChangeType.Add || changeType === ChangeType.Update;
    },

    assertAttachmentAllowed(changeType) {
      if (!this.attachmentsAllowed(changeType)) {
        throw new ServiceError(
          "VALIDATION_UNSUPPORTED_TYPE",
          400,
          "Attachments are not permitted for Delete change items.",
          "attachment"
        );
      }
    },
  };
}
