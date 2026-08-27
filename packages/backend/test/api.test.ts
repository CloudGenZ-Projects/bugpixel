/**
 * API integration tests (v2).
 */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { Role, ChangeRequestStatus } from "@crp/shared";
import { createDb } from "../src/db/createDb.js";
import { makeContainer } from "../src/container.js";
import { makeApp } from "../src/http/app.js";

function createTestApp() {
  const db = createDb(":memory:");
  const c = makeContainer({ db, inspectorTokenSecret: "test-secret", storageRoot: "/tmp/bugpixel-test" });

  // Seed users
  const now = new Date().toISOString();
  c.repos.users.create({ id: "u-admin", email: "admin@test.com", passwordHash: c.auth.hashPassword("pw"), role: Role.Admin, createdAt: now });
  c.repos.users.create({ id: "u-client", email: "client@test.com", passwordHash: c.auth.hashPassword("pw"), role: Role.Client, createdAt: now });
  c.repos.users.create({ id: "u-dev", email: "dev@test.com", passwordHash: c.auth.hashPassword("pw"), role: Role.Developer, createdAt: now });

  // Project + website + assignment
  c.repos.projects.create({ id: "proj-1", name: "Test Project" });
  c.repos.websites.create({ id: "web-1", projectId: "proj-1", ownerClientId: "u-client", name: "Test Site", url: "https://test.example.com" });
  c.assignments.set("proj-1", "u-dev");

  return makeApp(c, { storageRoot: "/tmp/bugpixel-test" });
}

async function login(app: any, email: string): Promise<{ cookie: string; csrf: string }> {
  const res = await request(app).post("/api/auth/login").send({ email, password: "pw" });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
  const raw = res.headers["set-cookie"];
  const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookie = cookies.map((c: string) => c.split(";")[0]).join("; ");
  const csrfMatch = cookie.match(/csrf=([^;,\s]+)/);
  return { cookie, csrf: csrfMatch?.[1] || "" };
}

describe("Authentication", () => {
  let app: any;
  beforeAll(() => { app = createTestApp(); });

  it("returns 401 for unauthenticated requests", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("rejects bogus session cookie", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", "sid=bogus");
    expect(res.status).toBe(401);
  });

  it("login succeeds and returns user + session cookie", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "client@test.com", password: "pw" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("Client");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("login fails with wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "client@test.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me returns user after login", async () => {
    const { cookie } = await login(app, "client@test.com");
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("client@test.com");
  });
});

describe("Change Requests (v2)", () => {
  let app: any;
  beforeAll(() => { app = createTestApp(); });

  it("client can create a change request (Submitted immediately)", async () => {
    const { cookie, csrf } = await login(app, "client@test.com");
    const res = await request(app)
      .post("/api/change-requests")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .send({ websiteId: "web-1", changeType: "Update", description: "Fix the header", priority: "High" });
    expect(res.status).toBe(201);
    expect(res.body.changeRequest.status).toBe("Submitted");
    expect(res.body.changeRequest.description).toBe("Fix the header");
  });

  it("developer sees assigned requests", async () => {
    const { cookie: clientCookie, csrf: clientCsrf } = await login(app, "client@test.com");
    // Create a request first
    await request(app).post("/api/change-requests").set("Cookie", clientCookie).set("X-CSRF-Token", clientCsrf)
      .send({ websiteId: "web-1", changeType: "Add", description: "Add footer" });

    const { cookie: devCookie } = await login(app, "dev@test.com");
    const res = await request(app).get("/api/change-requests").set("Cookie", devCookie);
    expect(res.status).toBe(200);
    expect(res.body.changeRequests.length).toBeGreaterThan(0);
  });

  it("status can be changed", async () => {
    const { cookie: clientCookie, csrf: clientCsrf } = await login(app, "client@test.com");
    const cr = await request(app).post("/api/change-requests").set("Cookie", clientCookie).set("X-CSRF-Token", clientCsrf)
      .send({ websiteId: "web-1", changeType: "Delete", description: "Remove banner" });

    const { cookie: devCookie, csrf: devCsrf } = await login(app, "dev@test.com");
    const res = await request(app)
      .patch(`/api/change-requests/${cr.body.changeRequest.id}/status`)
      .set("Cookie", devCookie)
      .set("X-CSRF-Token", devCsrf)
      .send({ status: "InProgress" });
    expect(res.status).toBe(200);
    expect(res.body.changeRequest.status).toBe("InProgress");
  });
});

describe("Admin routes", () => {
  let app: any;
  beforeAll(() => { app = createTestApp(); });

  it("non-admin gets 403 on admin routes", async () => {
    const { cookie } = await login(app, "client@test.com");
    const res = await request(app).get("/api/admin/users").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("admin can list users", async () => {
    const { cookie } = await login(app, "admin@test.com");
    const res = await request(app).get("/api/admin/users").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBe(3);
  });

  it("admin can view all projects", async () => {
    const { cookie } = await login(app, "admin@test.com");
    const res = await request(app).get("/api/projects").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.projects.length).toBe(1);
  });
});
