/**
 * Public entry point for the backend package (library surface).
 */
export { SCHEMA_SQL, createDb } from "./db/index.js";
export type { AppDatabase } from "./db/index.js";
export { makeRepositories } from "./db/repositories/index.js";
export type { Repositories } from "./db/repositories/index.js";
export * from "./services/index.js";
export * from "./container.js";
export { makeApp } from "./http/app.js";
export type { AppOptions } from "./http/app.js";
export { SESSION_COOKIE } from "./http/middleware.js";
