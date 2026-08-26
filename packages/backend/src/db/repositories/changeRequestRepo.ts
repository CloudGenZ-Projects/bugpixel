/**
 * Change Request repository (v2 - flat model, no child items).
 */
import type { ChangeRequest, ChangeRequestStatus, ChangeType, Priority } from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import { mapChangeRequest } from "../mappers.js";

export interface CreateChangeRequestInput {
  id: string;
  websiteId: string;
  clientId: string;
  status: ChangeRequestStatus;
  priority?: Priority;
  changeType: ChangeType;
  description: string;
  contentAdd?: string | null;
  contentCurrent?: string | null;
  contentUpdated?: string | null;
  contentDelete?: string | null;
  selector?: string | null;
  htmlMeta?: string | null;
  createdAt: string;
  dueDate?: string | null;
}

export interface MonthlyStats {
  month: string;
  submitted: number;
  done: number;
  cancelled: number;
  inProgress: number;
}

export function makeChangeRequestRepo(db: AppDatabase) {
  return {
    create(input: CreateChangeRequestInput): ChangeRequest {
      db.prepare(
        `INSERT INTO change_request
           (id, website_id, client_id, status, priority, change_type, description,
            content_add, content_current, content_updated, content_delete,
            selector, html_meta, created_at, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.websiteId,
        input.clientId,
        input.status,
        input.priority ?? "Medium",
        input.changeType,
        input.description,
        input.contentAdd ?? null,
        input.contentCurrent ?? null,
        input.contentUpdated ?? null,
        input.contentDelete ?? null,
        input.selector ?? null,
        input.htmlMeta ?? null,
        input.createdAt,
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
           ORDER BY created_at DESC`
        )
        .all(clientId) as Row[];
      return rows.map(mapChangeRequest);
    },

    listByProject(projectId: string): ChangeRequest[] {
      const rows = db
        .prepare(
          `SELECT cr.* FROM change_request cr
             JOIN website w ON w.id = cr.website_id
           WHERE w.project_id = ?
           ORDER BY cr.created_at DESC`
        )
        .all(projectId) as Row[];
      return rows.map(mapChangeRequest);
    },

    listByAssignedDeveloper(developerId: string): ChangeRequest[] {
      const rows = db
        .prepare(
          `SELECT cr.* FROM change_request cr
             JOIN website w ON w.id = cr.website_id
             JOIN assignment a ON a.project_id = w.project_id
           WHERE a.developer_id = ?
           ORDER BY cr.created_at DESC`
        )
        .all(developerId) as Row[];
      return rows.map(mapChangeRequest);
    },

    listAll(): ChangeRequest[] {
      const rows = db
        .prepare(`SELECT * FROM change_request ORDER BY created_at DESC`)
        .all() as Row[];
      return rows.map(mapChangeRequest);
    },

    updateStatus(id: string, status: ChangeRequestStatus): void {
      db.prepare(`UPDATE change_request SET status = ? WHERE id = ?`).run(status, id);
    },

    updatePriority(id: string, priority: Priority): void {
      db.prepare(`UPDATE change_request SET priority = ? WHERE id = ?`).run(priority, id);
    },

    updateDueDate(id: string, dueDate: string | null): void {
      db.prepare(`UPDATE change_request SET due_date = ? WHERE id = ?`).run(dueDate, id);
    },

    /** Monthly statistics for reporting. */
    getMonthlyStats(months: number = 12): MonthlyStats[] {
      const rows = db
        .prepare(
          `SELECT
             strftime('%Y-%m', created_at) AS month,
             COUNT(*) AS submitted,
             COUNT(*) FILTER (WHERE status = 'Done') AS done,
             COUNT(*) FILTER (WHERE status = 'Cancelled') AS cancelled,
             COUNT(*) FILTER (WHERE status = 'InProgress') AS in_progress
           FROM change_request
           WHERE created_at >= date('now', '-' || ? || ' months')
           GROUP BY month
           ORDER BY month DESC`
        )
        .all(months) as Row[];
      return rows.map((r) => ({
        month: r.month as string,
        submitted: (r.submitted as number) || 0,
        done: (r.done as number) || 0,
        cancelled: (r.cancelled as number) || 0,
        inProgress: (r.in_progress as number) || 0,
      }));
    },

    /** Summary counts for dashboard overview. */
    getStatusCounts(projectId?: string): Record<string, number> {
      const sql = projectId
        ? `SELECT cr.status, COUNT(*) AS count FROM change_request cr
             JOIN website w ON w.id = cr.website_id
           WHERE w.project_id = ?
           GROUP BY cr.status`
        : `SELECT status, COUNT(*) AS count FROM change_request GROUP BY status`;
      const rows = (projectId ? db.prepare(sql).all(projectId) : db.prepare(sql).all()) as Row[];
      const counts: Record<string, number> = {};
      for (const r of rows) {
        counts[r.status as string] = r.count as number;
      }
      return counts;
    },

    /** Average resolution time in hours (Submitted -> Done). */
    getAvgResolutionHours(projectId?: string): number | null {
      const sql = projectId
        ? `SELECT AVG(
             (julianday(
               (SELECT a.created_at FROM activity a
                WHERE a.change_request_id = cr.id AND a.action = 'status_changed' AND a.detail LIKE '%Done%'
                ORDER BY a.created_at DESC LIMIT 1)
             ) - julianday(cr.created_at)) * 24
           ) AS avg_hours
           FROM change_request cr
             JOIN website w ON w.id = cr.website_id
           WHERE w.project_id = ? AND cr.status = 'Done'`
        : `SELECT AVG(
             (julianday(
               (SELECT a.created_at FROM activity a
                WHERE a.change_request_id = cr.id AND a.action = 'status_changed' AND a.detail LIKE '%Done%'
                ORDER BY a.created_at DESC LIMIT 1)
             ) - julianday(cr.created_at)) * 24
           ) AS avg_hours
           FROM change_request cr WHERE cr.status = 'Done'`;
      const r = (projectId ? db.prepare(sql).get(projectId) : db.prepare(sql).get()) as Row | undefined;
      if (!r || r.avg_hours == null) return null;
      return Math.round(r.avg_hours as number);
    },
  };
}

export type ChangeRequestRepo = ReturnType<typeof makeChangeRequestRepo>;
