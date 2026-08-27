/**
 * CSRF protection tests (v2).
 */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { Role } from "@crp/shared";
import { createDb } from "../src/db/createDb.js";
import { makeContainer } from "../src/container.js";
import { makeApp } from "../src/http/app.js";

function createTestApp() {
  const db = createDb(":memory:");
  const c = makeContainer({ db, inspectorTokenSecret: "test-secret", storageRoot: "/tmp/bugpixel-csrf-test" });
  const now = new Date().toISOString();
  c.repos.users.create({ id: "u1", email: "c@test.com", passwordHash: c.auth.hashPassword("pw"), role: Role.Client, createdAt: now });
  c.repos.projects.create({ id: "p1", name: "P" });
  c.repos.websites.create({ id: "w1", projectId: "p1", ownerClientId: "u1", name: "S", url: "https://s.com" });
  return makeApp(c, { storageRoot: "/tmp/bugpixel-csrf-test" });
}

describe("CSRF protection", () => {
  let app: any;
  beforeAll(() => { app = createTestApp(); });

  it("login is exempt and returns a csrf cookie", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "c@test.com", password: "pw" });
    expect(res.status).toBe(200);
    const cookies = (res.headers["set-cookie"] as unknown as string[]).join("; ");
    expect(cookies).toContain("csrf=");
  });

  it("rejects state-changing request without CSRF header", async () => {
    const loginRes = await request(app).post("/api/auth/login").send({ email: "c@test.com", password: "pw" });
    const cookies = (loginRes.headers["set-cookie"] as unknown as string[]).map((c: string) => c.split(";")[0]).join("; ");

    const res = await request(app)
      .post("/api/change-requests")
      .set("Cookie", cookies)
      .send({ websiteId: "w1", changeType: "Add", description: "test" });
    expect(res.status).toBe(403);
  });

  it("accepts request with correct CSRF token", async () => {
    const loginRes = await request(app).post("/api/auth/login").send({ email: "c@test.com", password: "pw" });
    const cookies = (loginRes.headers["set-cookie"] as unknown as string[]).map((c: string) => c.split(";")[0]).join("; ");
    const csrfMatch = cookies.match(/csrf=([^;,]+)/);
    const csrf = csrfMatch?.[1] || "";

    const res = await request(app)
      .post("/api/change-requests")
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ websiteId: "w1", changeType: "Add", description: "test" });
    expect(res.status).toBe(201);
  });

  it("GET requests do not require CSRF", async () => {
    const loginRes = await request(app).post("/api/auth/login").send({ email: "c@test.com", password: "pw" });
    const cookies = (loginRes.headers["set-cookie"] as unknown as string[]).map((c: string) => c.split(";")[0]).join("; ");

    const res = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(res.status).toBe(200);
  });
});
