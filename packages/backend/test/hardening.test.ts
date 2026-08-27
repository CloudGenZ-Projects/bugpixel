/**
 * Security hardening tests (v2).
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createDb } from "../src/db/createDb.js";
import { makeContainer } from "../src/container.js";
import { makeApp } from "../src/http/app.js";

function createTestApp(opts = {}) {
  const db = createDb(":memory:");
  const c = makeContainer({ db, inspectorTokenSecret: "test-secret", storageRoot: "/tmp/bugpixel-hard-test" });
  return makeApp(c, { storageRoot: "/tmp/bugpixel-hard-test", ...opts });
}

describe("Security headers", () => {
  it("sets X-Content-Type-Options: nosniff", async () => {
    const app = createTestApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY", async () => {
    const app = createTestApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});

describe("Rate limiting", () => {
  it("returns 429 after too many requests from same IP", async () => {
    const app = createTestApp();
    // Make 101 requests (limit is 100/min)
    for (let i = 0; i < 100; i++) {
      await request(app).get("/api/auth/me");
    }
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(429);
  });
});

describe("404 handling", () => {
  it("returns 404 for unknown API routes", async () => {
    const app = createTestApp();
    const res = await request(app).get("/api/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
