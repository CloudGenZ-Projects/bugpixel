/**
 * Screenshot repository (v2 - references change_request directly).
 */
import type { Screenshot } from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import { mapScreenshot } from "../mappers.js";

export interface CreateScreenshotInput {
  id: string;
  changeRequestId: string;
  storageKey: string;
  mime: string;
  width: number;
  height: number;
  createdAt: string;
}

export function makeScreenshotRepo(db: AppDatabase) {
  return {
    create(input: CreateScreenshotInput): Screenshot {
      db.prepare(
        `INSERT INTO screenshot (id, change_request_id, storage_key, mime, width, height, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(input.id, input.changeRequestId, input.storageKey, input.mime, input.width, input.height, input.createdAt);
      return mapScreenshot(
        db.prepare(`SELECT * FROM screenshot WHERE id = ?`).get(input.id) as Row
      );
    },

    listByRequest(changeRequestId: string): Screenshot[] {
      const rows = db
        .prepare(`SELECT * FROM screenshot WHERE change_request_id = ? ORDER BY created_at ASC`)
        .all(changeRequestId) as Row[];
      return rows.map(mapScreenshot);
    },

    getById(id: string): Screenshot | null {
      const r = db.prepare(`SELECT * FROM screenshot WHERE id = ?`).get(id) as Row | undefined;
      return r ? mapScreenshot(r) : null;
    },

    countByRequest(changeRequestId: string): number {
      const r = db
        .prepare(`SELECT COUNT(*) AS n FROM screenshot WHERE change_request_id = ?`)
        .get(changeRequestId) as Row;
      return r.n as number;
    },
  };
}

export type ScreenshotRepo = ReturnType<typeof makeScreenshotRepo>;
