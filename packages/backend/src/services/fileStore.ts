/**
 * Filesystem blob store + attachment validation.
 *
 * `fileStore.write` validates the file (MIME + size) BEFORE writing any bytes,
 * then stores the blob under a content-addressed path (sha256 of bytes) below a
 * configured root, returning an opaque storage key. `read` returns the bytes for
 * a storage key.
 *
 * Attachment validation (Req 9.2-9.4):
 *   - accepted iff MIME is application/pdf or an image/* type, AND
 *   - size is at most MAX_ATTACHMENT_SIZE_BYTES (10 MB)
 *   - unsupported type -> VALIDATION_UNSUPPORTED_TYPE
 *   - oversized       -> VALIDATION_FILE_TOO_LARGE
 *
 * Requirements: 7.3, 9.2, 9.3, 9.4
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { MAX_ATTACHMENT_SIZE_BYTES } from "@crp/shared";
import { ServiceError } from "./serviceError.js";

/** True iff the MIME type is an accepted attachment type (PDF or image). */
export function isSupportedAttachmentMime(mime: string): boolean {
  const normalized = mime.trim().toLowerCase();
  return normalized === "application/pdf" || normalized.startsWith("image/");
}

/** True iff the size is within the 10 MB attachment limit. */
export function isWithinSizeLimit(sizeBytes: number): boolean {
  return sizeBytes >= 0 && sizeBytes <= MAX_ATTACHMENT_SIZE_BYTES;
}

/**
 * Validate an attachment candidate. Throws a ServiceError on failure; returns
 * void on success. Pure (no I/O) so it is also usable as a fast pre-check.
 */
export function validateAttachment(mime: string, sizeBytes: number): void {
  if (!isSupportedAttachmentMime(mime)) {
    throw new ServiceError(
      "VALIDATION_UNSUPPORTED_TYPE",
      400,
      "Attachments must be a PDF or an image.",
      "attachment"
    );
  }
  if (!isWithinSizeLimit(sizeBytes)) {
    throw new ServiceError(
      "VALIDATION_FILE_TOO_LARGE",
      400,
      "Attachments must be at most 10 MB.",
      "attachment"
    );
  }
}

export interface FileStore {
  /**
   * Validate and write bytes, returning an opaque storage key. When
   * `validate` is true (default for attachments) the MIME/size rules are
   * enforced before writing.
   */
  write(
    bytes: Uint8Array,
    mime: string,
    filename: string,
    opts?: { validate?: boolean }
  ): string;
  read(storageKey: string): Uint8Array;
  exists(storageKey: string): boolean;
}

/**
 * Create a file store rooted at `root`. Blobs are content-addressed:
 * `<root>/<aa>/<bb>/<sha256>` where aa/bb are the first bytes of the hash, so a
 * large number of files spread across subdirectories.
 */
export function makeFileStore(root: string): FileStore {
  function pathForKey(storageKey: string): string {
    return join(root, storageKey.slice(0, 2), storageKey.slice(2, 4), storageKey);
  }

  return {
    write(bytes, mime, _filename, opts) {
      if (opts?.validate) {
        validateAttachment(mime, bytes.byteLength);
      }
      const hash = createHash("sha256").update(bytes).digest("hex");
      const target = pathForKey(hash);
      mkdirSync(dirname(target), { recursive: true });
      // Content-addressed: identical bytes map to the same key; only write once.
      if (!existsSync(target)) {
        writeFileSync(target, bytes);
      }
      return hash;
    },

    read(storageKey) {
      return readFileSync(pathForKey(storageKey));
    },

    exists(storageKey) {
      return existsSync(pathForKey(storageKey));
    },
  };
}
