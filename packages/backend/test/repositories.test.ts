/**
 * Repository CRUD + constraint tests.
 *
 * These exercise a REAL file-backed SQLite database (not :memory:) per task 2.3,
 * covering foreign-key enforcement, the unique assignment-per-project
 * constraint, and developer-removal cascade behavior.
 *
 * Requirements: 13.2, 14.3
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuid } from "uuid";

import { Role, ChangeRequestStatus, ChangeType } from "@crp/shared";
import { createDb, makeRepositories, type AppDatabase } from "../src/db/index.js";

const NOW = "2026-01-01T00:00:00.000Z";

let dir: string;
let dbPath: string;
let db: AppDatabase;
let repos: ReturnType<typeof makeRepositories>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crp-repo-"));
  dbPath = join(dir, "portal.db");
  db = createDb(dbPath);
  repos = makeRepositories(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function seedClient(): string {
  const id = uuid();
  repos.users.create({
    id,
    email: `${id}@example.com`,
    passwordHash: "hash",
    role: Role.Client,
    createdAt: NOW,
  });
  return id;
}

function seedDeveloper(): string {
  const id = uuid();
  repos.users.create({
    id,
    email: `${id}@example.com`,
    passwordHash: "hash",
    role: Role.Developer,
    createdAt: NOW,
  });
  return id;
}

function seedProject(): string {
  const id = uuid();
  repos.projects.create({ id, name: `proj-${id}` });
  return id;
}

describe("repository CRUD round-trips", () => {
  it("creates and reads back a user, website, request, and item", () => {
    const clientId = seedClient();
    const projectId = seedProject();
    const websiteId = uuid();
    repos.websites.create({
      id: websiteId,
      projectId,
      ownerClientId: clientId,
      name: "Site",
      url: "https://site.example.com",
    });

    expect(repos.websites.listByOwner(clientId).map((w) => w.id)).toEqual([websiteId]);

    const crId = uuid();
    repos.changeRequests.create({
      id: crId,
      websiteId,
      clientId,
      status: ChangeRequestStatus.Draft,
      createdAt: NOW,
    });
    const itemId = uuid();
    repos.changeItems.create({
      id: itemId,
      changeRequestId: crId,
      changeType: ChangeType.Add,
      description: "desc",
      contentAdd: "content",
      createdAt: NOW,
    });

    expect(repos.changeItems.listByRequest(crId).map((i) => i.id)).toEqual([itemId]);
    expect(repos.changeItems.countByRequest(crId)).toBe(1);
  });
});

describe("foreign-key enforcement", () => {
  it("rejects a website referencing a non-existent project/owner", () => {
    expect(() =>
      repos.websites.create({
        id: uuid(),
        projectId: "missing-project",
        ownerClientId: "missing-owner",
        name: "X",
        url: "https://x.example.com",
      })
    ).toThrow(/FOREIGN KEY/i);
  });

  it("rejects a change_item referencing a non-existent request", () => {
    expect(() =>
      repos.changeItems.create({
        id: uuid(),
        changeRequestId: "missing-request",
        changeType: ChangeType.Delete,
        description: "d",
        contentDelete: "c",
        createdAt: NOW,
      })
    ).toThrow(/FOREIGN KEY/i);
  });
});

describe("unique assignment-per-project (Req 14.3)", () => {
  it("keeps at most one assignment per project and replaces on set", () => {
    const projectId = seedProject();
    const dev1 = seedDeveloper();
    const dev2 = seedDeveloper();

    repos.assignments.setForProject({
      id: uuid(),
      projectId,
      developerId: dev1,
      createdAt: NOW,
    });
    expect(repos.assignments.getByProject(projectId)?.developerId).toBe(dev1);

    // Replacing must not violate the UNIQUE(project_id) constraint.
    repos.assignments.setForProject({
      id: uuid(),
      projectId,
      developerId: dev2,
      createdAt: NOW,
    });
    expect(repos.assignments.getByProject(projectId)?.developerId).toBe(dev2);
    expect(repos.assignments.list()).toHaveLength(1);
  });
});

describe("developer-removal cascade (Req 13.2)", () => {
  it("removes the developer's assignments when the developer is deleted", () => {
    const projectA = seedProject();
    const projectB = seedProject();
    const dev = seedDeveloper();

    repos.assignments.setForProject({
      id: uuid(),
      projectId: projectA,
      developerId: dev,
      createdAt: NOW,
    });
    repos.assignments.setForProject({
      id: uuid(),
      projectId: projectB,
      developerId: dev,
      createdAt: NOW,
    });
    expect(repos.assignments.listByDeveloper(dev)).toHaveLength(2);

    repos.users.remove(dev);

    expect(repos.users.getById(dev)).toBeNull();
    expect(repos.assignments.listByDeveloper(dev)).toHaveLength(0);
    expect(repos.assignments.list()).toHaveLength(0);
  });
});
