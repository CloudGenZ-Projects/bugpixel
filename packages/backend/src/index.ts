/**
 * Public entry point for the backend package (library surface).
 */
export * from "./db/index.js";
export * from "./services/index.js";
export * from "./container.js";
export { makeApp } from "./http/app.js";
export type { AppOptions } from "./http/app.js";
export { SESSION_COOKIE } from "./http/middleware.js";
