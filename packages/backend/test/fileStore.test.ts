/**
 * File store + attachment validation tests.
 *
 * Property 16: attachment file validation (pure logic).
 * Integration 7.3: filesystem blob write/read round-trip in a temp directory.
 *
 * Requirements: 7.3, 9.1, 9.2, 9.3, 9.4
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MAX_ATTACHMENT_SIZE_BYTES } from "@crp/shared";
import {
  makeFileStore,
  validateAttachment,
  isSupportedAttachmentMime,
  isWithinSizeLimit,
  ServiceError,
} from "../src/services/index.js";
import { anyFileArb } from "./arbitraries.js";

// Feature: change-request-portal, Property 16: For any candidate attachment file,
// it is accepted iff its type is PDF or an image type and its size is at most 10
// megabytes; unsupported types are rejected with a type-identifying error and
// oversized files with a size-limit error.
describe("Property 16: attachment file validation", () => {
  it("accepts iff supported MIME and size <= 10 MB, with correct error codes", () => {
    fc.assert(
      fc.property(anyFileArb, (file) => {
        const supported = isSupportedAttachmentMime(file.mime);
        const withinSize = isWithinSizeLimit(file.sizeBytes);
        const shouldAccept = supported && withinSize;

        if (shouldAccept) {
          expect(() => validateAttachment(file.mime, file.sizeBytes)).not.toThrow();
        } else {
          try {
            validateAttachment(file.mime, file.sizeBytes);
            throw new Error("expected rejection");
          } catch (e) {
            expect(e).toBeInstanceOf(ServiceError);
            const code = (e as ServiceError).code;
            // Type is checked first: unsupported type dominates the error.
            if (!supported) {
              expect(code).toBe("VALIDATION_UNSUPPORTED_TYPE");
            } else {
              expect(code).toBe("VALIDATION_FILE_TOO_LARGE");
            }
            expect((e as ServiceError).field).toBe("attachment");
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it("boundary: exactly 10 MB is accepted, 10 MB + 1 is rejected", () => {
    expect(() => validateAttachment("image/png", MAX_ATTACHMENT_SIZE_BYTES)).not.toThrow();
    expect(() =>
      validateAttachment("image/png", MAX_ATTACHMENT_SIZE_BYTES + 1)
    ).toThrowError(ServiceError);
  });
});

describe("Integration 7.3: filesystem blob write/read round-trip", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "crp-filestore-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a screenshot and an attachment and reads them back by key", () => {
    const store = makeFileStore(dir);

    const screenshotBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const screenshotKey = store.write(screenshotBytes, "image/png", "shot.png");
    expect(store.exists(screenshotKey)).toBe(true);
    expect(Array.from(store.read(screenshotKey))).toEqual(Array.from(screenshotBytes));

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 9, 8, 7]);
    const pdfKey = store.write(pdfBytes, "application/pdf", "doc.pdf", { validate: true });
    expect(Array.from(store.read(pdfKey))).toEqual(Array.from(pdfBytes));

    // Distinct content -> distinct keys.
    expect(screenshotKey).not.toBe(pdfKey);
  });

  it("rejects an invalid attachment before writing when validate=true", () => {
    const store = makeFileStore(dir);
    const bytes = new Uint8Array([1, 2, 3]);
    expect(() =>
      store.write(bytes, "application/zip", "bad.zip", { validate: true })
    ).toThrowError(ServiceError);
  });
});
