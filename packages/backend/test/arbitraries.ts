/**
 * Shared `fast-check` arbitraries for property-based tests.
 *
 * These generators produce the domain values referenced across the 27
 * correctness properties: Users/roles, Websites (with owners), Projects,
 * Assignments, Change_Requests, Change_Items per type, descriptions (including
 * whitespace-only and boundary lengths 0/1/2000/2001), files (varied MIME incl.
 * unsupported, sizes straddling 10 MB), component selections (with/without
 * selector metadata), inspector token states (valid/expired/wrong-aud/no-session),
 * and idle durations straddling 30 minutes.
 *
 * Requirements: 2.1 (plus indirectly every property test that imports these)
 */
import fc from "fast-check";

import {
  ChangeType,
  Role,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_CONTENT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  IDLE_TIMEOUT_MS,
} from "@crp/shared";

/** A UUID-like string id. */
export const idArb: fc.Arbitrary<string> = fc.uuid();

/** Any of the three roles. */
export const roleArb: fc.Arbitrary<Role> = fc.constantFrom(
  Role.Client,
  Role.Developer,
  Role.Admin
);

/** Any change type. */
export const changeTypeArb: fc.Arbitrary<ChangeType> = fc.constantFrom(
  ChangeType.Add,
  ChangeType.Update,
  ChangeType.Delete
);

/** An email-like identifier. */
export const emailArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 12 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
    fc.constantFrom("example.com", "test.org", "portal.dev")
  )
  .map(([local, domain]) => `${local}@${domain}`);

/** A plaintext password. */
export const passwordArb: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 32,
});

// ---------------------------------------------------------------------------
// Descriptions and content fields (boundary-aware)
// ---------------------------------------------------------------------------

/** Whitespace-only strings (spaces, tabs, newlines). */
export const whitespaceOnlyArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 0, maxLength: 8 })
  .map((chars) => chars.join(""));

/** Non-whitespace visible content of a bounded length. */
function nonBlankOfLength(len: number): string {
  return "x".repeat(len);
}

/**
 * A valid description: non-empty after trimming and within
 * [1, MAX_DESCRIPTION_LENGTH] characters (boundaries 1 and 2000 included).
 */
export const validDescriptionArb: fc.Arbitrary<string> = fc
  .oneof(
    fc.constant(1),
    fc.constant(MAX_DESCRIPTION_LENGTH),
    fc.integer({ min: 1, max: MAX_DESCRIPTION_LENGTH })
  )
  .map((len) => nonBlankOfLength(len));

/**
 * An invalid description: empty, whitespace-only, or over the max length
 * (2001 included as a boundary).
 */
export const invalidDescriptionArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  whitespaceOnlyArb,
  fc.constant(nonBlankOfLength(MAX_DESCRIPTION_LENGTH + 1)),
  fc
    .integer({ min: MAX_DESCRIPTION_LENGTH + 1, max: MAX_DESCRIPTION_LENGTH + 50 })
    .map((len) => nonBlankOfLength(len))
);

/** An arbitrary description that may be valid or invalid (for full-range tests). */
export const anyDescriptionArb: fc.Arbitrary<string> = fc.oneof(
  validDescriptionArb,
  invalidDescriptionArb
);

/** A valid type-specific content field value (1..MAX_CONTENT_LENGTH, non-blank). */
export const validContentArb: fc.Arbitrary<string> = fc
  .oneof(
    fc.constant(1),
    fc.constant(MAX_CONTENT_LENGTH),
    fc.integer({ min: 1, max: MAX_CONTENT_LENGTH })
  )
  .map((len) => nonBlankOfLength(len));

/** An invalid content field value (empty, whitespace, or too long). */
export const invalidContentArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  whitespaceOnlyArb,
  fc.constant(nonBlankOfLength(MAX_CONTENT_LENGTH + 1))
);

// ---------------------------------------------------------------------------
// Files / attachments (MIME + size straddling 10 MB)
// ---------------------------------------------------------------------------

export interface FileCandidate {
  filename: string;
  mime: string;
  sizeBytes: number;
}

/** MIME types that are accepted (PDF or any image/*). */
export const supportedMimeArb: fc.Arbitrary<string> = fc.constantFrom(
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml"
);

/** MIME types that must be rejected. */
export const unsupportedMimeArb: fc.Arbitrary<string> = fc.constantFrom(
  "text/plain",
  "application/json",
  "application/zip",
  "application/octet-stream",
  "video/mp4",
  "audio/mpeg",
  "text/html"
);

/** Size at or below the 10 MB limit (boundary MAX included). */
export const validSizeArb: fc.Arbitrary<number> = fc.oneof(
  fc.constant(0),
  fc.constant(1),
  fc.constant(MAX_ATTACHMENT_SIZE_BYTES),
  fc.integer({ min: 0, max: MAX_ATTACHMENT_SIZE_BYTES })
);

/** Size strictly above the 10 MB limit (boundary MAX+1 included). */
export const oversizeArb: fc.Arbitrary<number> = fc.oneof(
  fc.constant(MAX_ATTACHMENT_SIZE_BYTES + 1),
  fc.integer({
    min: MAX_ATTACHMENT_SIZE_BYTES + 1,
    max: MAX_ATTACHMENT_SIZE_BYTES * 3,
  })
);

/** A file candidate that should be accepted (supported MIME, valid size). */
export const validFileArb: fc.Arbitrary<FileCandidate> = fc.record({
  filename: fc.string({ minLength: 1, maxLength: 40 }),
  mime: supportedMimeArb,
  sizeBytes: validSizeArb,
});

/** A file candidate that should be rejected (bad MIME and/or oversized). */
export const invalidFileArb: fc.Arbitrary<FileCandidate> = fc.oneof(
  // Unsupported type, any size.
  fc.record({
    filename: fc.string({ minLength: 1, maxLength: 40 }),
    mime: unsupportedMimeArb,
    sizeBytes: fc.integer({ min: 0, max: MAX_ATTACHMENT_SIZE_BYTES }),
  }),
  // Supported type but oversized.
  fc.record({
    filename: fc.string({ minLength: 1, maxLength: 40 }),
    mime: supportedMimeArb,
    sizeBytes: oversizeArb,
  })
);

/** Any file candidate (valid or invalid). */
export const anyFileArb: fc.Arbitrary<FileCandidate> = fc.oneof(
  validFileArb,
  invalidFileArb
);

// ---------------------------------------------------------------------------
// Component selection (optional selector / html metadata)
// ---------------------------------------------------------------------------

export interface ComponentSelection {
  selector: string | null;
  htmlMeta: string | null;
}

/** A component selection that may or may not carry optional metadata. */
export const componentSelectionArb: fc.Arbitrary<ComponentSelection> = fc.record({
  selector: fc.option(fc.string({ minLength: 1, maxLength: 60 }), { nil: null }),
  htmlMeta: fc.option(fc.string({ minLength: 1, maxLength: 120 }), { nil: null }),
});

// ---------------------------------------------------------------------------
// Users / websites / projects / assignments
// ---------------------------------------------------------------------------

export interface UserSeed {
  id: string;
  email: string;
  password: string;
  role: Role;
}

export const userSeedArb: fc.Arbitrary<UserSeed> = fc.record({
  id: idArb,
  email: emailArb,
  password: passwordArb,
  role: roleArb,
});

export interface WebsiteSeed {
  id: string;
  projectId: string;
  ownerClientId: string;
  name: string;
  url: string;
}

export const websiteSeedArb: fc.Arbitrary<WebsiteSeed> = fc.record({
  id: idArb,
  projectId: idArb,
  ownerClientId: idArb,
  name: fc.string({ minLength: 1, maxLength: 40 }),
  url: fc.webUrl(),
});

// ---------------------------------------------------------------------------
// Inspector token states
// ---------------------------------------------------------------------------

export type TokenState =
  | "valid"
  | "expired"
  | "wrong-aud"
  | "bad-signature"
  | "no-session"
  | "absent";

export const tokenStateArb: fc.Arbitrary<TokenState> = fc.constantFrom(
  "valid",
  "expired",
  "wrong-aud",
  "bad-signature",
  "no-session",
  "absent"
);

// ---------------------------------------------------------------------------
// Idle durations straddling the 30-minute timeout
// ---------------------------------------------------------------------------

/** Idle durations (ms) at, below, and above the 30-minute timeout boundary. */
export const idleDurationMsArb: fc.Arbitrary<number> = fc.oneof(
  fc.constant(0),
  fc.constant(IDLE_TIMEOUT_MS - 1),
  fc.constant(IDLE_TIMEOUT_MS),
  fc.constant(IDLE_TIMEOUT_MS + 1),
  fc.integer({ min: 0, max: IDLE_TIMEOUT_MS * 2 })
);
