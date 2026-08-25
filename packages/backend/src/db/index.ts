/**
 * Public entry point for the backend DB module: schema DDL, the createDb
 * bootstrap helper, the AppDatabase type, row mappers, and the repository layer.
 */
export { SCHEMA_SQL } from "./schema.js";
export { createDb } from "./createDb.js";
export type { AppDatabase } from "./createDb.js";
export * from "./mappers.js";
export * from "./repositories/index.js";
