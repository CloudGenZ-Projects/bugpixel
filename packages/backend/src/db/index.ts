/**
 * Public entry point for the backend DB module.
 */
export { SCHEMA_SQL } from "./schema.js";
export { createDb } from "./createDb.js";
export type { AppDatabase } from "./createDb.js";
export { mapUser, mapProject, mapWebsite, mapAssignment, mapChangeRequest, mapScreenshot, mapAttachment, mapNote, mapActivity } from "./mappers.js";
export type { Row, Activity } from "./mappers.js";
export * from "./repositories/index.js";
