/**
 * Repository aggregator (v2 - no changeItems or componentReferences).
 */
import type { AppDatabase } from "../types.js";
import { makeUserRepo } from "./userRepo.js";
import { makeProjectRepo } from "./projectRepo.js";
import { makeWebsiteRepo } from "./websiteRepo.js";
import { makeAssignmentRepo } from "./assignmentRepo.js";
import { makeChangeRequestRepo } from "./changeRequestRepo.js";
import { makeScreenshotRepo } from "./screenshotRepo.js";
import { makeAttachmentRepo } from "./attachmentRepo.js";
import { makeNoteRepo } from "./noteRepo.js";
import { makeActivityRepo } from "./activityRepo.js";

export function makeRepositories(db: AppDatabase) {
  return {
    transaction<T>(fn: () => T): T {
      db.exec("BEGIN");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // ignore rollback errors; surface the original error
        }
        throw err;
      }
    },
    users: makeUserRepo(db),
    projects: makeProjectRepo(db),
    websites: makeWebsiteRepo(db),
    assignments: makeAssignmentRepo(db),
    changeRequests: makeChangeRequestRepo(db),
    screenshots: makeScreenshotRepo(db),
    attachments: makeAttachmentRepo(db),
    notes: makeNoteRepo(db),
    activities: makeActivityRepo(db),
  };
}

export type Repositories = ReturnType<typeof makeRepositories>;

export * from "./userRepo.js";
export * from "./projectRepo.js";
export * from "./websiteRepo.js";
export * from "./assignmentRepo.js";
export * from "./changeRequestRepo.js";
export * from "./screenshotRepo.js";
export * from "./attachmentRepo.js";
export * from "./noteRepo.js";
export * from "./activityRepo.js";
