/**
 * Change-item validation property tests: description (Property 13), type-specific
 * content (Property 14), and attachment availability by type (Property 15).
 *
 * Requirements: 8.1-8.8, 9.1, 9.5
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { ChangeType, MAX_CONTENT_LENGTH, MAX_DESCRIPTION_LENGTH } from "@crp/shared";
import { makeChangeItemValidator, ServiceError } from "../src/services/index.js";
import {
  validDescriptionArb,
  invalidDescriptionArb,
  anyDescriptionArb,
  validContentArb,
  invalidContentArb,
  changeTypeArb,
} from "./arbitraries.js";

const validator = makeChangeItemValidator();

function descriptionAccepted(d: string): boolean {
  return d.trim().length > 0 && d.length <= MAX_DESCRIPTION_LENGTH;
}
function contentAccepted(c: string): boolean {
  return c.trim().length > 0 && c.length <= MAX_CONTENT_LENGTH;
}

// Feature: change-request-portal, Property 13: For any description string, saving
// a Change_Item is accepted iff the description, after trimming, is non-empty and
// at most 2000 characters; empty or whitespace-only descriptions are rejected with
// a description-identifying validation error while entered values are retained.
describe("Property 13: description validation", () => {
  it("accepts iff trimmed non-empty and <= 2000 chars", () => {
    fc.assert(
      fc.property(anyDescriptionArb, (description) => {
        const accepted = descriptionAccepted(description);
        if (accepted) {
          expect(() => validator.validateDescription(description)).not.toThrow();
        } else {
          try {
            validator.validateDescription(description);
            throw new Error("expected rejection");
          } catch (e) {
            expect(e).toBeInstanceOf(ServiceError);
            expect((e as ServiceError).code).toBe("VALIDATION_DESCRIPTION_REQUIRED");
            expect((e as ServiceError).field).toBe("description");
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("valid descriptions always pass and invalid always fail", () => {
    fc.assert(
      fc.property(validDescriptionArb, (d) => {
        expect(() => validator.validateDescription(d)).not.toThrow();
      }),
      { numRuns: 50 }
    );
    fc.assert(
      fc.property(invalidDescriptionArb, (d) => {
        expect(() => validator.validateDescription(d)).toThrowError(ServiceError);
      }),
      { numRuns: 50 }
    );
  });
});

// Feature: change-request-portal, Property 14: For any Change_Type and its
// required content field(s) - Add requires add-content; Delete requires
// delete-content; Update requires both current-value and updated-value, each 1
// to 2000 characters - saving is accepted iff every required field for that type
// is non-empty (non-whitespace) and within bounds; otherwise the save is rejected
// identifying the missing field and retaining entered values.
describe("Property 14: type-specific required content validation", () => {
  it("accepts iff every required field for the type is valid", () => {
    fc.assert(
      fc.property(
        changeTypeArb,
        fc.oneof(validContentArb, invalidContentArb),
        fc.oneof(validContentArb, invalidContentArb),
        fc.oneof(validContentArb, invalidContentArb),
        (changeType, c1, c2, c3) => {
          const input = {
            changeType,
            description: "valid description",
            contentAdd: changeType === ChangeType.Add ? c1 : null,
            contentDelete: changeType === ChangeType.Delete ? c1 : null,
            contentCurrent: changeType === ChangeType.Update ? c2 : null,
            contentUpdated: changeType === ChangeType.Update ? c3 : null,
          };

          let expectAccepted: boolean;
          switch (changeType) {
            case ChangeType.Add:
              expectAccepted = contentAccepted(c1);
              break;
            case ChangeType.Delete:
              expectAccepted = contentAccepted(c1);
              break;
            case ChangeType.Update:
              expectAccepted = contentAccepted(c2) && contentAccepted(c3);
              break;
          }

          if (expectAccepted) {
            expect(() => validator.validateContent(input)).not.toThrow();
          } else {
            try {
              validator.validateContent(input);
              throw new Error("expected rejection");
            } catch (e) {
              expect(e).toBeInstanceOf(ServiceError);
              expect((e as ServiceError).code).toBe("VALIDATION_CONTENT_REQUIRED");
              expect((e as ServiceError).field).toBeTruthy();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: change-request-portal, Property 15: For any Change_Type, the attachment
// control is available (attachments permitted) iff the type is Add or Update; for
// Delete no attachment is accepted.
describe("Property 15: attachment availability by change type", () => {
  it("permits attachments iff Add or Update", () => {
    fc.assert(
      fc.property(changeTypeArb, (changeType) => {
        const allowed = validator.attachmentsAllowed(changeType);
        expect(allowed).toBe(
          changeType === ChangeType.Add || changeType === ChangeType.Update
        );
        if (allowed) {
          expect(() => validator.assertAttachmentAllowed(changeType)).not.toThrow();
        } else {
          expect(() => validator.assertAttachmentAllowed(changeType)).toThrowError(
            ServiceError
          );
        }
      }),
      { numRuns: 100 }
    );
  });
});
