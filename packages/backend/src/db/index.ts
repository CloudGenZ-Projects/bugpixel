/**
 * Public entry point for the backend DB module: schema DDL and the createDb
 * bootstrap helper.
 */
export { SCHEMA_SQL } from "./schema.js";
export { createDb } from "./createDb.js";
export type { AppDatabase } from "./createDb.js";
