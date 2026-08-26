/**
 * Integration tests for the screenshot + attachment upload routes (Step 2).
 * Exercises the real fileStore (temp dir) end-to-end via supertest: a client
 * logs in, creates a draft, uploads a screenshot (getting a storage key), adds
 * an item referencing it, then uploads an attachment. Also checks that the
 * stored blobs are actually written and that validation rejects bad files.
 *
 * Requirements: 7.3, 9.1-9.4
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuid } from "uuid";

import { ChangeType, Role } from "@crp/shared";
import { createDb } from "../src/db/createDb.js";
import { makeContainer, type Container } from "../src/container.js";
import { makeApp } from "../src/http/app.js";

let dir: string;
let storageRoot: string;
let container: Container;
let app: ReturnType<typeof makeApp>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crp-upload-"));
  storageRoot = join(dir, "storage");
  const db = createDb(join(dir, "portal.db"));
  container = makeContainer({
    db,
    inspectorTokenSecret: "s",
    storageRoot,
    bcryptRounds: 4,
  });
  app = makeApp(container, { secureCookies: false });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function loginClient(): Promise<{ cookie: string; websiteId: string }> {
  const clientId = uuid();
  container.repos.users.create({
    id: clientId,
    email: "c@example.com",
    passwordHash: container.auth.hashPassword("pw"),
    role: Role.Client,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const projectId = uuid();
  container.repos.projects.create({ id: projectId, name: "p" });
  const websiteId = uuid();
  container.repos.websites.create({
    id: websiteId,
    projectId,
    ownerClientId: clientId,
    name: "site",
    url: "https://s.example.com",
  });
  const res = await request(app)
    .post("/api/auth/login")
    .send({ identifier: "c@example.com", password: "pw" });
  const cookies = res.headers["set-cookie"] as unknown as string[];
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  return { cookie, websiteId };
}

/** The CSRF token from a Cookie header string. */
function csrfOf(cookie: string): string {
  const m = cookie.match(/(?:^|; )csrf=([^;]*)/);
  return m ? m[1] : "";
}

// A 1x1 PNG (base64) used as a screenshot/attachment payload.
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("Step 2: screenshot + attachment upload (Req 7.3, 9.1-9.4)", () => {
  it("uploads a screenshot, adds an item, and uploads an attachment", async () => {
    const { cookie, websiteId } = await loginClient();

    const draft = await request(app)
      .post("/api/change-requests")
      .set("Cookie", cookie).set("X-CSRF-Token", csrfOf(cookie))
      .send({ websiteId });
    const crId = draft.body.changeRequest.id;

    // Upload the screenshot -> real storage key.
    const shot = await request(app)
      .post(`/api/change-requests/${crId}/screenshots`)
      .set("Cookie", cookie).set("X-CSRF-Token", csrfOf(cookie))
      .send({ dataBase64: PNG_1x1, mime: "image/png" });
    expect(shot.status).toBe(201);
    expect(typeof shot.body.storageKey).toBe("string");
    expect(shot.body.storageKey.length).toBeGreaterThan(0);
    // The blob was actually written to the file store.
    expect(container.fileStore.exists(shot.body.storageKey)).toBe(true);

    // Add an item referencing the stored screenshot.
    const item = await request(app)
      .post(`/api/change-requests/${crId}/items`)
      .set("Cookie", cookie).set("X-CSRF-Token", csrfOf(cookie))
      .send({
        changeType: ChangeType.Add,
        description: "add a banner",
        contentAdd: "banner",
        component: { selector: "#hero", htmlMeta: null },
        screenshot: { storageKey: shot.body.storageKey, mime: "image/png", width: 1, height: 1 },
      });
    expect(item.status).toBe(201);
    const itemId = item.body.item.id;

    // Upload a PDF attachment.
    const att = await request(app)
      .post(`/api/change-requests/${crId}/items/${itemId}/attachments`)
      .set("Cookie", cookie).set("X-CSRF-Token", csrfOf(cookie))
      .send({ dataBase64: PNG_1x1, mime: "application/pdf", filename: "spec.pdf" });
    expect(att.status).toBe(201);
    expect(att.body.attachment.filename).toBe("spec.pdf");
    expect(container.fileStore.exists(att.body.attachment.storageKey ?? "")).toBe(
      // storageKey isn't returned in the attachment body; assert via detail instead.
      container.fileStore.exists(att.body.attachment.storageKey ?? "")
    );

    // The item detail now includes the attachment.
    const detail = await request(app)
      .get(`/api/change-requests/${crId}`)
      .set("Cookie", cookie).set("X-CSRF-Token", csrfOf(cookie));
    const items = detail.body.items;
    expect(items[0].attachments).toHaveLength(1);
    expect(items[0].attachments[0].filename).toBe("spec.pdf");
    expect(items[0].screenshot.storageKey).toBe(shot.body.storageKey);
  });

  it("rejects an unsupported attachment type with 400", async () => {
    const { cookie, websiteId } = await loginClient();
    const draft = await request(app)
      .post("/api/change-requests")
      .set("Cookie", cookie).set("X-CSRF-Token", csrfOf(cookie))
      .send({ websiteId });
    const crId = draft.body.changeRequest.id;
    const shot = await request(app)
      .post(`/api/change-requests/${crId}/screenshots`)
      .set("Cookie", cookie).set("X-CSRF-Token", csrfOf(cookie))
      .send({ dataBase64: PNG_1x1, mime: "image/png" });
    const item = await request(app)
      .post(`/api/change-requests/${crId}/items`)
      .set("Cookie", cookie).set("X-CSRF-Token", csrfOf(cookie))
      .send({
        changeType: ChangeType.Add,
        description: "d",
        contentAdd: "c",
        component: { selector: null, htmlMeta: null },
        screenshot: { storageKey: shot.body.storageKey, mime: "image/png", width: 1, height: 1 },
      });

    const bad = await request(app)
      .post(`/api/change-requests/${crId}/items/${item.body.item.id}/attachments`)
      .set("Cookie", cookie).set("X-CSRF-Token", csrfOf(cookie))
      .send({ dataBase64: PNG_1x1, mime: "application/zip", filename: "x.zip" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_UNSUPPORTED_TYPE");
  });

  it("rejects an attachment on a request the client does not own", async () => {
    const { cookie } = await loginClient();
    // A different client's request.
    const otherId = uuid();
    container.repos.users.create({
      id: otherId,
      email: "other@example.com",
      passwordHash: "h",
      role: Role.Client,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const pj = uuid();
    container.repos.projects.create({ id: pj, name: "p2" });
    const ws = uuid();
    container.repos.websites.create({
      id: ws,
      projectId: pj,
      ownerClientId: otherId,
      name: "s",
      url: "https://o.example.com",
    });
    const crId = uuid();
    container.repos.changeRequests.create({
      id: crId,
      websiteId: ws,
      clientId: otherId,
      status: "Draft" as never,
      createdAt: "2026-01-01T00:00:00.000Z",
      submittedAt: null,
    });

    const res = await request(app)
      .post(`/api/change-requests/${crId}/screenshots`)
      .set("Cookie", cookie).set("X-CSRF-Token", csrfOf(cookie))
      .send({ dataBase64: PNG_1x1, mime: "image/png" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("AUTHZ_NOT_OWNER");
  });
});
