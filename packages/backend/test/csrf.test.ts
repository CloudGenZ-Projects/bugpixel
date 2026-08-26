/**
 * CSRF protection tests (Step 4). State-changing API requests require a valid
 * X-CSRF-Token matching the double-submit csrf cookie; safe methods and login
 * are exempt.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuid } from "uuid";

import { Role } from "@crp/shared";
import { createDb } from "../src/db/createDb.js";
import { makeContainer, type Container } from "../src/container.js";
import { makeApp } from "../src/http/app.js";

let dir: string;
let container: Container;
let app: ReturnType<typeof makeApp>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crp-csrf-"));
  const db = createDb(join(dir, "portal.db"));
  container = makeContainer({
    db,
    inspectorTokenSecret: "s",
    storageRoot: join(dir, "storage"),
    bcryptRounds: 4,
  });
  app = makeApp(container, { secureCookies: false });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function loginAdmin(): Promise<{ cookie: string; csrf: string }> {
  container.repos.users.create({
    id: uuid(),
    email: "a@example.com",
    passwordHash: container.auth.hashPassword("pw"),
    role: Role.Admin,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const res = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "a@example.com", password: "pw" });
  const cookies = res.headers["set-cookie"] as unknown as string[];
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  return { cookie, csrf: res.body.csrfToken as string };
}

describe("CSRF protection (Step 4)", () => {
  it("login is exempt and returns a csrf token + cookie", async () => {
    const { cookie, csrf } = await loginAdmin();
    expect(csrf).toBeTruthy();
    expect(cookie).toMatch(/csrf=/);
  });

  it("rejects a state-changing request with no CSRF header (403)", async () => {
    const { cookie } = await loginAdmin();
    const res = await request(app)
      .post("/api/admin/developers")
      .set("Cookie", cookie)
      .send({ identifier: "d@example.com", password: "pw" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("rejects a wrong CSRF token (403)", async () => {
    const { cookie } = await loginAdmin();
    const res = await request(app)
      .post("/api/admin/developers")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", "wrong-token")
      .send({ identifier: "d@example.com", password: "pw" });
    expect(res.status).toBe(403);
  });

  it("accepts a state-changing request with the matching CSRF token", async () => {
    const { cookie, csrf } = await loginAdmin();
    const res = await request(app)
      .post("/api/admin/developers")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .send({ identifier: "d@example.com", password: "pw" });
    expect(res.status).toBe(201);
  });

  it("does not require CSRF on safe GET requests", async () => {
    const { cookie } = await loginAdmin();
    const res = await request(app).get("/api/session").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});
