/**
 * API middleware + integration tests.
 *
 * Property 1: unauthenticated access to protected resources is denied (401).
 * Integration 11.6: login -> session cookie -> protected route, submit routing,
 * and admin-only gating against a running app with real SQLite.
 *
 * Requirements: 1.1, 1.3, 2.4, 2.5, 11.1, 15.3
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuid } from "uuid";

import { ChangeRequestStatus, ChangeType, Role } from "@crp/shared";
import { createDb } from "../src/db/createDb.js";
import { makeRepositories } from "../src/db/repositories/index.js";
import { makeContainer, type Container } from "../src/container.js";
import { makeApp } from "../src/http/app.js";

let dir: string;
let container: Container;
let app: ReturnType<typeof makeApp>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crp-api-"));
  const db = createDb(join(dir, "portal.db"));
  container = makeContainer({
    db,
    inspectorTokenSecret: "test-secret",
    storageRoot: join(dir, "storage"),
    bcryptRounds: 4,
  });
  app = makeApp(container, { secureCookies: false });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Seed a user with a known password via the container's repos + auth. */
function seedUser(email: string, password: string, role: Role): string {
  const id = uuid();
  container.repos.users.create({
    id,
    email,
    passwordHash: container.auth.hashPassword(password),
    role,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  return id;
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ identifier: email, password });
  expect(res.status).toBe(200);
  const cookie = res.headers["set-cookie"][0];
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Strict/i);
  return cookie;
}

const PROTECTED_ROUTES: Array<[string, string]> = [
  ["get", "/api/session"],
  ["get", "/api/websites"],
  ["post", "/api/inspector/token"],
  ["post", "/api/change-requests"],
  ["get", "/api/change-requests"],
  ["get", "/api/admin/developers"],
  ["get", "/api/admin/assignments"],
];

// Feature: change-request-portal, Property 1: For any protected resource or
// action, when the request carries no valid authenticated session, the Portal
// denies it and returns an authentication error (401 / redirect to login).
describe("Property 1: unauthenticated access to protected resources is denied", () => {
  it("returns 401 AUTH_REQUIRED for any protected route without a session", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...PROTECTED_ROUTES), async ([method, path]) => {
        const res = await (request(app) as any)[method](path).send({});
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("AUTH_REQUIRED");
      }),
      { numRuns: 100 }
    );
  });

  it("rejects a request bearing a bogus session cookie", async () => {
    const res = await request(app)
      .get("/api/session")
      .set("Cookie", "sid=not-a-real-session");
    expect(res.status).toBe(401);
  });
});

describe("Integration 11.6: login -> cookie -> protected, submit routing, admin gating", () => {
  it("logs in, sets a session cookie, and reaches a protected route", async () => {
    seedUser("client@example.com", "pw", Role.Client);
    const cookie = await login("client@example.com", "pw");

    const session = await request(app).get("/api/session").set("Cookie", cookie);
    expect(session.status).toBe(200);
    expect(session.body.user.role).toBe(Role.Client);
    expect(session.body.view).toBe("client");
  });

  it("rejects login with wrong credentials", async () => {
    seedUser("client@example.com", "pw", Role.Client);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "client@example.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("routes a submitted request to AwaitingDeveloperAssignment when unassigned", async () => {
    const clientId = seedUser("c@example.com", "pw", Role.Client);
    const projectId = uuid();
    container.repos.projects.create({ id: projectId, name: "p" });
    const websiteId = uuid();
    container.repos.websites.create({
      id: websiteId,
      projectId,
      ownerClientId: clientId,
      name: "site",
      url: "https://site.example.com",
    });
    const cookie = await login("c@example.com", "pw");

    const draftRes = await request(app)
      .post("/api/change-requests")
      .set("Cookie", cookie)
      .send({ websiteId });
    expect(draftRes.status).toBe(201);
    const crId = draftRes.body.changeRequest.id;

    const itemRes = await request(app)
      .post(`/api/change-requests/${crId}/items`)
      .set("Cookie", cookie)
      .send({
        changeType: ChangeType.Add,
        description: "please add a banner",
        contentAdd: "a banner",
        component: { selector: "#hero", htmlMeta: null },
        screenshot: { storageKey: "k1", mime: "image/png", width: 100, height: 100 },
      });
    expect(itemRes.status).toBe(201);

    const submitRes = await request(app)
      .post(`/api/change-requests/${crId}/submit`)
      .set("Cookie", cookie)
      .send({});
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.changeRequest.status).toBe(
      ChangeRequestStatus.AwaitingDeveloperAssignment
    );
  });

  it("routes to Submitted and is visible to the assigned developer", async () => {
    const clientId = seedUser("c2@example.com", "pw", Role.Client);
    const projectId = uuid();
    container.repos.projects.create({ id: projectId, name: "p2" });
    const websiteId = uuid();
    container.repos.websites.create({
      id: websiteId,
      projectId,
      ownerClientId: clientId,
      name: "site",
      url: "https://s2.example.com",
    });
    const devId = seedUser("dev@example.com", "pw", Role.Developer);
    container.repos.assignments.setForProject({
      id: uuid(),
      projectId,
      developerId: devId,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const clientCookie = await login("c2@example.com", "pw");
    const draft = await request(app)
      .post("/api/change-requests")
      .set("Cookie", clientCookie)
      .send({ websiteId });
    const crId = draft.body.changeRequest.id;
    await request(app)
      .post(`/api/change-requests/${crId}/items`)
      .set("Cookie", clientCookie)
      .send({
        changeType: ChangeType.Delete,
        description: "remove footer",
        contentDelete: "footer",
        component: { selector: null, htmlMeta: null },
        screenshot: { storageKey: "k2", mime: "image/png", width: 1, height: 1 },
      });
    const submit = await request(app)
      .post(`/api/change-requests/${crId}/submit`)
      .set("Cookie", clientCookie)
      .send({});
    expect(submit.body.changeRequest.status).toBe(ChangeRequestStatus.Submitted);

    // The assigned developer sees it in their list.
    const devCookie = await login("dev@example.com", "pw");
    const devList = await request(app).get("/api/change-requests").set("Cookie", devCookie);
    expect(devList.status).toBe(200);
    expect(devList.body.changeRequests.some((r: { id: string }) => r.id === crId)).toBe(true);
  });

  it("gates admin-only routes: non-admin gets 403, admin succeeds", async () => {
    seedUser("client@example.com", "pw", Role.Client);
    seedUser("admin@example.com", "pw", Role.Admin);

    const clientCookie = await login("client@example.com", "pw");
    const denied = await request(app)
      .get("/api/admin/developers")
      .set("Cookie", clientCookie);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("AUTHZ_FORBIDDEN");

    const adminCookie = await login("admin@example.com", "pw");
    const added = await request(app)
      .post("/api/admin/developers")
      .set("Cookie", adminCookie)
      .send({ identifier: "newdev@example.com", password: "pw" });
    expect(added.status).toBe(201);

    const list = await request(app).get("/api/admin/developers").set("Cookie", adminCookie);
    expect(list.body.developers.some((d: { email: string }) => d.email === "newdev@example.com")).toBe(
      true
    );

    // Duplicate roster identifier -> 409.
    const dup = await request(app)
      .post("/api/admin/developers")
      .set("Cookie", adminCookie)
      .send({ identifier: "newdev@example.com", password: "pw" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("ROSTER_DUPLICATE");
  });
});
