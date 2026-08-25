import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { validDescriptionArb, validFileArb, idleDurationMsArb } from "./arbitraries.js";
import { MAX_DESCRIPTION_LENGTH, MAX_ATTACHMENT_SIZE_BYTES } from "@crp/shared";

// Sanity check that the arbitraries module and fast-check wiring work.
describe("arbitraries smoke", () => {
  it("valid descriptions are within bounds and non-blank", () => {
    fc.assert(
      fc.property(validDescriptionArb, (d) => {
        expect(d.trim().length).toBeGreaterThan(0);
        expect(d.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
      }),
      { numRuns: 100 }
    );
  });

  it("valid files are supported MIME and within size", () => {
    fc.assert(
      fc.property(validFileArb, (f) => {
        expect(f.sizeBytes).toBeLessThanOrEqual(MAX_ATTACHMENT_SIZE_BYTES);
        expect(f.mime === "application/pdf" || f.mime.startsWith("image/")).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("idle durations generate values around the boundary", () => {
    fc.assert(
      fc.property(idleDurationMsArb, (ms) => {
        expect(ms).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });
});
