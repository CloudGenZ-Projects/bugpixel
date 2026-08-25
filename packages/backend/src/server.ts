/**
 * Server entry point. Reads configuration from the environment, opens the
 * database, wires the container, and starts the HTTP server.
 *
 * Environment:
 *   PORT                     - listen port (default 3000)
 *   CRP_DB_PATH              - SQLite file path (default data/portal.db)
 *   CRP_STORAGE_ROOT         - blob storage root (default data/storage)
 *   CRP_INSPECTOR_SECRET     - inspector token signing secret (required in prod)
 *   NODE_ENV                 - "production" marks cookies Secure
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createDb } from "./db/createDb.js";
import { makeContainer } from "./container.js";
import { makeApp } from "./http/app.js";

function main() {
  const port = Number(process.env.PORT ?? 3000);
  const dbPath = process.env.CRP_DB_PATH ?? "data/portal.db";
  const storageRoot = process.env.CRP_STORAGE_ROOT ?? "data/storage";
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.CRP_INSPECTOR_SECRET ?? (isProd ? "" : "dev-inspector-secret");

  if (isProd && !secret) {
    throw new Error("CRP_INSPECTOR_SECRET must be set in production.");
  }

  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  mkdirSync(storageRoot, { recursive: true });

  const db = createDb(dbPath);
  const container = makeContainer({
    db,
    inspectorTokenSecret: secret,
    storageRoot,
  });
  const app = makeApp(container, {
    secureCookies: isProd,
    enforceHttps: isProd,
    spaDir: process.env.CRP_SPA_DIR,
    inspectorDir: process.env.CRP_INSPECTOR_DIR,
  });

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Change Request Portal API listening on :${port}`);
  });
}

main();
