/**
 * Activity log repository for audit trail.
 */
import type { AppDatabase, Row } from "../types.js";

export interface Activity {
  id: string;
  changeRequestId: string;
  actorId: string;
  action: string;
  detail: string | null;
  createdAt: string;
}

export function makeActivityRepo(db: AppDatabase) {
  return {
    create(input: {
      id: string;
      changeRequestId: string;
      actorId: string;
      action: string;
      detail?: string | null;
      createdAt: string;
    }): Activity {
      db.prepare(
        `INSERT INTO activity (id, change_request_id, actor_id, action, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(input.id, input.changeRequestId, input.actorId, input.action, input.detail ?? null, input.createdAt);
      return this.getById(input.id)!;
    },

    getById(id: string): Activity | null {
      const r = db.prepare(`SELECT * FROM activity WHERE id = ?`).get(id) as Row | undefined;
      if (!r) return null;
      return {
        id: r.id as string,
        changeRequestId: r.change_request_id as string,
        actorId: r.actor_id as string,
        action: r.action as string,
        detail: r.detail as string | null,
        createdAt: r.created_at as string,
      };
    },

    listByRequest(changeRequestId: string): Activity[] {
      const rows = db
        .prepare(`SELECT * FROM activity WHERE change_request_id = ? ORDER BY created_at ASC`)
        .all(changeRequestId) as Row[];
      return rows.map((r) => ({
        id: r.id as string,
        changeRequestId: r.change_request_id as string,
        actorId: r.actor_id as string,
        action: r.action as string,
        detail: r.detail as string | null,
        createdAt: r.created_at as string,
      }));
    },
  };
}

export type ActivityRepo = ReturnType<typeof makeActivityRepo>;
