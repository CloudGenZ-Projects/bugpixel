/**
 * Security hardening smoke test (task 17.2): with HTTPS enforcement enabled the
 * HSTS header is present on HTTPS responses and plain HTTP is redirected
 * (Req 15.5).
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
  dir = mkdtempSync(join(tmpdir(), "crp-hsts-"));
  const db = createDb(join(dir, "portal.db"));
  container = makeContainer({
    db,
    inspectorTokenSecret: "s",
    storageRoot: join(dir, "storage"),
    bcryptRounds: 4,
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("HTTPS/HSTS enforcement (Req 15.5)", () => {
  it("sets the HSTS header on HTTPS-forwarded requests", async () => {
    const app = makeApp(container, { enforceHttps: true, secureCookies: true });
    const res = await request(app)
      .get("/api/session")
      .set("X-Forwarded-Proto", "https");
    // Header present regardless of auth outcome.
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=31536000/);
    expect(res.headers["strict-transport-security"]).toMatch(/includeSubDomains/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("redirects plain HTTP to HTTPS with 308", async () => {
    const app = makeApp(container, { enforceHttps: true });
    const res = await request(app)
      .get("/api/session")
      .set("X-Forwarded-Proto", "http")
      .redirects(0);
    expect(res.status).toBe(308);
    expect(res.headers["location"]).toMatch(/^https:\/\//);
  });

  it("does not enforce HTTPS when the option is off (dev)", async () => {
    const app = makeApp(container, { enforceHttps: false });
    const res = await request(app)
      .get("/api/session")
      .set("X-Forwarded-Proto", "http");
    // No redirect; request is handled (401 since unauthenticated).
    expect(res.status).toBe(401);
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });
});
