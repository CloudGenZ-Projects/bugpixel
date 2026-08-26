/**
 * Database seeding / bootstrap script.
 *
 * Populates the database with a minimal working data set so the portal is
 * usable immediately: an Admin, a Client, and a Developer; one Project; one
 * Website owned by the Client; and an Assignment linking the Developer to that
 * Project (so a submitted request routes to the Developer).
 *
 * Idempotent: if a user with a given email already exists it is left untouched,
 * so re-running is safe.
 *
 * Usage:
 *   CRP_DB_PATH=data/portal.db npm run seed --workspace packages/backend
 *
 * Credentials (overridable via env):
 *   CRP_SEED_ADMIN_EMAIL     / CRP_SEED_ADMIN_PASSWORD
 *   CRP_SEED_CLIENT_EMAIL    / CRP_SEED_CLIENT_PASSWORD
 *   CRP_SEED_DEVELOPER_EMAIL / CRP_SEED_DEVELOPER_PASSWORD
 *   CRP_SEED_WEBSITE_URL     - the URL of the seeded website
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { v4 as uuid } from "uuid";

import { Role } from "@crp/shared";
import { createDb } from "./db/createDb.js";
import { makeContainer } from "./container.js";

interface SeedUserSpec {
  email: string;
  password: string;
  role: Role;
}

function main() {
  const dbPath = process.env.CRP_DB_PATH ?? "data/portal.db";
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

  const db = createDb(dbPath);
  const c = makeContainer({
    db,
    inspectorTokenSecret: process.env.CRP_INSPECTOR_SECRET ?? "dev-inspector-secret",
    storageRoot: process.env.CRP_STORAGE_ROOT ?? "data/storage",
  });

  const admin: SeedUserSpec = {
    email: process.env.CRP_SEED_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.CRP_SEED_ADMIN_PASSWORD ?? "admin-password",
    role: Role.Admin,
  };
  const client: SeedUserSpec = {
    email: process.env.CRP_SEED_CLIENT_EMAIL ?? "client@example.com",
    password: process.env.CRP_SEED_CLIENT_PASSWORD ?? "client-password",
    role: Role.Client,
  };
  const developer: SeedUserSpec = {
    email: process.env.CRP_SEED_DEVELOPER_EMAIL ?? "developer@example.com",
    password: process.env.CRP_SEED_DEVELOPER_PASSWORD ?? "developer-password",
    role: Role.Developer,
  };
  const websiteUrl = process.env.CRP_SEED_WEBSITE_URL ?? "https://example.com";

  const now = new Date().toISOString();

  /** Create a user if the email is not already present; return its id. */
  function ensureUser(spec: SeedUserSpec): { id: string; created: boolean } {
    const existing = c.repos.users.getByEmail(spec.email);
    if (existing) return { id: existing.id, created: false };
    const id = uuid();
    c.repos.users.create({
      id,
      email: spec.email,
      passwordHash: c.auth.hashPassword(spec.password),
      role: spec.role,
      createdAt: now,
    });
    return { id, created: true };
  }

  const adminRes = ensureUser(admin);
  const clientRes = ensureUser(client);
  const developerRes = ensureUser(developer);

  // Create a project + website owned by the client, if the client owns none yet.
  const ownedWebsites = c.repos.websites.listByOwner(clientRes.id);
  let websiteId: string;
  let projectId: string;
  if (ownedWebsites.length === 0) {
    projectId = uuid();
    c.repos.projects.create({ id: projectId, name: "Example Project" });
    websiteId = uuid();
    c.repos.websites.create({
      id: websiteId,
      projectId,
      ownerClientId: clientRes.id,
      name: "Example Website",
      url: websiteUrl,
    });
  } else {
    websiteId = ownedWebsites[0].id;
    projectId = ownedWebsites[0].projectId;
  }

  // Assign the developer to the project (replaces any existing assignment).
  c.assignments.set(projectId, developerRes.id);

  db.close();

  console.log(
    [
      "Seed complete.",
      `  DB: ${dbPath}`,
      `  Admin:     ${admin.email} / ${admin.password} ${adminRes.created ? "(created)" : "(existing)"}`,
      `  Client:    ${client.email} / ${client.password} ${clientRes.created ? "(created)" : "(existing)"}`,
      `  Developer: ${developer.email} / ${developer.password} ${developerRes.created ? "(created)" : "(existing)"}`,
      `  Project:   ${projectId} (Example Project)`,
      `  Website:   ${websiteId} (${websiteUrl}) owned by client, developer assigned`,
    ].join("\n")
  );
}

main();
