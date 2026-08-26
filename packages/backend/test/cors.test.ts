/**
 * CORS tests: with allowedOrigins configured, listed origins get credentialed
 * CORS headers and preflight succeeds; unlisted origins get no CORS headers.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDb } from "../src/db/createDb.js";
import { makeContainer, type Container } from "../src/container.js";
import { makeApp } from "../src/http/app.js";

let dir: string;
let container: Container;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crp-cors-"));
  const db = createDb(join(dir, "portal.db"));
  container = makeContainer({
    db,
    inspectorTokenSecret: "s",
    storageRoot: join(dir, "storage"),
    bcryptRounds: 4,
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ALLOWED = "https://client.pages.dev";

describe("CORS for credentialed cross-origin callers", () => {
  it("reflects an allowed origin with credentials", async () => {
    const app = makeApp(container, { allowedOrigins: [ALLOWED] });
    const res = await request(app)
      .post("/api/inspector/validate")
      .set("Origin", ALLOWED)
      .send({ token: "x", websiteId: "w" });
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("answers preflight OPTIONS for an allowed origin with 204", async () => {
    const app = makeApp(container, { allowedOrigins: [ALLOWED] });
    const res = await request(app)
      .options("/api/inspector/validate")
      .set("Origin", ALLOWED);
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-headers"]).toMatch(/X-CSRF-Token/i);
  });

  it("does not add CORS headers for an unlisted origin", async () => {
    const app = makeApp(container, { allowedOrigins: [ALLOWED] });
    const res = await request(app)
      .post("/api/inspector/validate")
      .set("Origin", "https://evil.example.com")
      .send({ token: "x", websiteId: "w" });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("adds no CORS headers when none configured (same-origin default)", async () => {
    const app = makeApp(container, {});
    const res = await request(app)
      .post("/api/inspector/validate")
      .set("Origin", ALLOWED)
      .send({ token: "x", websiteId: "w" });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
