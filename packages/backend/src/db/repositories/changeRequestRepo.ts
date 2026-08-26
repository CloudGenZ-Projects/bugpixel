/**
 * Change request repository with analytics queries for reporting.
 */
import type { ChangeRequest, ChangeRequestStatus, Priority } from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import { mapChangeRequest } from "../mappers.js";

export interface CreateChangeRequestInput {
  id: string;
  websiteId: string;
  clientId: string;
  status: ChangeRequestStatus;
  priority: Priority;
  createdAt: string;
  submittedAt?: string | null;
  dueDate?: string | null;
}

export interface MonthlyStats {
  month: string; // YYYY-MM
  submitted: number;
  done: number;
  rejected: number;
  inProgress: number;
}

export function makeChangeRequestRepo(db: AppDatabase) {
  return {
    create(input: CreateChangeRequestInput): ChangeRequest {
      db.prepare(
        `INSERT INTO change_request (id, website_id, client_id, status, priority, created_at, submitted_at, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.websiteId,
        input.clientId,
        input.status,
        input.priority,
        input.createdAt,
        input.submittedAt ?? null,
        input.dueDate ?? null
      );
      return this.getById(input.id)!;
    },

    getById(id: string): ChangeRequest | null {
      const r = db.prepare(`SELECT * FROM change_request WHERE id = ?`).get(id) as
        | Row
        | undefined;
      return r ? mapChangeRequest(r) : null;
    },

    listByClient(clientId: string): ChangeRequest[] {
      const rows = db
        .prepare(
          `SELECT * FROM change_request WHERE client_id = ?
           ORDER BY created_at DESC, id ASC`
        )
        .all(clientId) as Row[];
      return rows.map(mapChangeRequest);
    },

    listByAssignedDeveloper(developerId: string): ChangeRequest[] {
      const rows = db
        .prepare(
          `SELECT cr.* FROM change_request cr
             JOIN website w   ON w.id = cr.website_id
             JOIN assignment a ON a.project_id = w.project_id
           WHERE a.developer_id = ?
             AND cr.status != 'Draft'
           ORDER BY cr.created_at DESC, cr.id ASC`
        )
        .all(developerId) as Row[];
      return rows.map(mapChangeRequest);
    },

    listAllSubmitted(): ChangeRequest[] {
      const rows = db
        .prepare(
          `SELECT * FROM change_request WHERE status != 'Draft'
           ORDER BY created_at DESC, id ASC`
        )
        .all() as Row[];
      return rows.map(mapChangeRequest);
    },

    updateStatusAndSubmittedAt(
      id: string,
      status: ChangeRequestStatus,
      submittedAt: string | null
    ): void {
      db.prepare(
        `UPDATE change_request SET status = ?, submitted_at = ? WHERE id = ?`
      ).run(status, submittedAt, id);
    },

    /** Update just the status (for developer workflow transitions). */
    updateStatus(id: string, status: ChangeRequestStatus): void {
      db.prepare(`UPDATE change_request SET status = ? WHERE id = ?`).run(status, id);
    },

    /** Update priority. */
    updatePriority(id: string, priority: Priority): void {
      db.prepare(`UPDATE change_request SET priority = ? WHERE id = ?`).run(priority, id);
    },

    /** Update due date. */
    updateDueDate(id: string, dueDate: string | null): void {
      db.prepare(`UPDATE change_request SET due_date = ? WHERE id = ?`).run(
        dueDate,
        id
      );
    },

    /** Monthly statistics for reporting dashboard. */
    getMonthlyStats(months: number = 12): MonthlyStats[] {
      const rows = db
        .prepare(
          `SELECT
             strftime('%Y-%m', submitted_at) AS month,
             COUNT(*) FILTER (WHERE status != 'Draft') AS submitted,
             COUNT(*) FILTER (WHERE status = 'Done') AS done,
             COUNT(*) FILTER (WHERE status = 'Rejected') AS rejected,
             COUNT(*) FILTER (WHERE status = 'InProgress') AS in_progress
           FROM change_request
           WHERE submitted_at IS NOT NULL
             AND submitted_at >= date('now', '-' || ? || ' months')
           GROUP BY month
           ORDER BY month DESC`
        )
        .all(months) as Row[];
      return rows.map((r) => ({
        month: r.month as string,
        submitted: (r.submitted as number) || 0,
        done: (r.done as number) || 0,
        rejected: (r.rejected as number) || 0,
        inProgress: (r.in_progress as number) || 0,
      }));
    },

    /** Summary counts for dashboard overview. */
    getStatusCounts(): Record<string, number> {
      const rows = db
        .prepare(
          `SELECT status, COUNT(*) AS count FROM change_request
           WHERE status != 'Draft'
           GROUP BY status`
        )
        .all() as Row[];
      const counts: Record<string, number> = {};
      for (const r of rows) {
        counts[r.status as string] = r.count as number;
      }
      return counts;
    },
  };
}

export type ChangeRequestRepo = ReturnType<typeof makeChangeRequestRepo>;
