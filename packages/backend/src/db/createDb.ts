/**
 * Database bootstrap helper.
 *
 * `createDb` opens a SQLite connection (file-backed or in-memory), enables
 * foreign-key enforcement, and applies the schema DDL. It is the single entry
 * point used by both the runtime app and the test suite so schema drift between
 * them is impossible.
 *
 * Driver note:
 *   The design specifies `better-sqlite3`. That package has no prebuilt binary
 *   for Node 22 and must compile from source via node-gyp, which fails in this
 *   environment (only Python 3.7 is available; node-gyp's bundled gyp requires
 *   Python >= 3.8). We therefore use Node's built-in `node:sqlite` `DatabaseSync`
 *   driver instead. It provides the same synchronous, embedded, file-based
 *   SQLite semantics (including transactions for the atomic submit required by
 *   Req 11.1/11.7), so the architecture and requirements are unchanged. The
 *   driver choice is fully isolated behind this module and the `AppDatabase`
 *   type; repositories never import the driver directly.
 *
 * Usage:
 *   const db = createDb('data/portal.db'); // file-backed (runtime)
 *   const db = createDb(':memory:');       // ephemeral (tests)
 *
 * Requirements: 2.1, 14.3, 13.2
 */
import { createRequire } from "node:module";

import { SCHEMA_SQL } from "./schema.js";

// `node:sqlite` is loaded via a runtime require rather than a static ESM import.
// Vitest (see vitest-dev/vitest#10630) mishandles `node:`-only builtins in its
// externalization list and tries to transform `node:sqlite`, which fails. A
// runtime require bypasses Vite's static resolver while behaving identically at
// runtime under Node's native loader.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

/**
 * The application database handle. Aliased so the concrete driver stays an
 * implementation detail of this module.
 */
export type AppDatabase = import("node:sqlite").DatabaseSync;

/**
 * Open a SQLite database, enable foreign keys, and apply the portal schema.
 *
 * @param path A filesystem path for a persistent database, or `':memory:'` for
 *   an ephemeral in-memory database. Defaults to `':memory:'`.
 * @returns The initialized database connection.
 */
export function createDb(path: string = ":memory:"): AppDatabase {
  const db = new DatabaseSync(path);

  // Enforce foreign keys for every connection (off by default in SQLite).
  db.exec("PRAGMA foreign_keys = ON");
  // WAL improves concurrency/durability for the file-backed runtime case and is
  // harmless for in-memory databases.
  db.exec("PRAGMA journal_mode = WAL");

  // Apply the full schema. All statements are idempotent (IF NOT EXISTS).
  db.exec(SCHEMA_SQL);

  return db;
}
