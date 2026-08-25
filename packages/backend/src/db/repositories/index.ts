/**
 * Repository aggregator. `makeRepositories(db)` builds every repository from a
 * single database handle so services receive one cohesive `Repositories` object.
 */
import type { AppDatabase } from "../types.js";
import { makeUserRepo } from "./userRepo.js";
import { makeProjectRepo } from "./projectRepo.js";
import { makeWebsiteRepo } from "./websiteRepo.js";
import { makeAssignmentRepo } from "./assignmentRepo.js";
import { makeChangeRequestRepo } from "./changeRequestRepo.js";
import {
  makeChangeItemRepo,
  makeComponentReferenceRepo,
  makeScreenshotRepo,
  makeAttachmentRepo,
} from "./changeItemRepo.js";

export function makeRepositories(db: AppDatabase) {
  return {
    /**
     * Run `fn` inside a single SQLite transaction. Commits on success; rolls
     * back and rethrows on any error so partial writes never survive
     * (Req 11.7 atomic submit).
     */
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
    changeItems: makeChangeItemRepo(db),
    componentReferences: makeComponentReferenceRepo(db),
    screenshots: makeScreenshotRepo(db),
    attachments: makeAttachmentRepo(db),
  };
}

export type Repositories = ReturnType<typeof makeRepositories>;

export * from "./userRepo.js";
export * from "./projectRepo.js";
export * from "./websiteRepo.js";
export * from "./assignmentRepo.js";
export * from "./changeRequestRepo.js";
export * from "./changeItemRepo.js";
