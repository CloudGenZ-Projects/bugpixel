/**
 * Change request repository. Parameterized SQL only.
 *
 * Includes the role-scoped listing queries: by client (Req 3.1/3.2) and by
 * assigned developer via website -> project -> assignment join (Req 12.1/12.2).
 *
 * Requirements: 3.1, 3.2, 12.1, 12.2, 11.x (status/timestamp updates)
 */
import type { ChangeRequest, ChangeRequestStatus } from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import { mapChangeRequest } from "../mappers.js";

export interface CreateChangeRequestInput {
  id: string;
  websiteId: string;
  clientId: string;
  status: ChangeRequestStatus;
  createdAt: string;
  submittedAt?: string | null;
}

export function makeChangeRequestRepo(db: AppDatabase) {
  return {
    create(input: CreateChangeRequestInput): ChangeRequest {
      db.prepare(
        `INSERT INTO change_request (id, website_id, client_id, status, created_at, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.websiteId,
        input.clientId,
        input.status,
        input.createdAt,
        input.submittedAt ?? null
      );
      return this.getById(input.id)!;
    },

    getById(id: string): ChangeRequest | null {
      const r = db.prepare(`SELECT * FROM change_request WHERE id = ?`).get(id) as
        | Row
        | undefined;
      return r ? mapChangeRequest(r) : null;
    },

    /** Exactly the requests owned by the given client (Req 3.1, 3.2). */
    listByClient(clientId: string): ChangeRequest[] {
      const rows = db
        .prepare(
          `SELECT * FROM change_request WHERE client_id = ?
           ORDER BY created_at ASC, id ASC`
        )
        .all(clientId) as Row[];
      return rows.map(mapChangeRequest);
    },

    /**
     * Exactly the requests whose website's project has an active assignment to
     * the given developer (Req 12.1, 12.2). Draft requests are excluded — a
     * developer only sees submitted/routed requests.
     */
    listByAssignedDeveloper(developerId: string): ChangeRequest[] {
      const rows = db
        .prepare(
          `SELECT cr.* FROM change_request cr
             JOIN website w   ON w.id = cr.website_id
             JOIN assignment a ON a.project_id = w.project_id
           WHERE a.developer_id = ?
             AND cr.status != 'Draft'
           ORDER BY cr.created_at ASC, cr.id ASC`
        )
        .all(developerId) as Row[];
      return rows.map(mapChangeRequest);
    },

    /** All non-draft requests (Admin visibility, Req 11.4). */
    listAllSubmitted(): ChangeRequest[] {
      const rows = db
        .prepare(
          `SELECT * FROM change_request WHERE status != 'Draft'
           ORDER BY created_at ASC, id ASC`
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
  };
}

export type ChangeRequestRepo = ReturnType<typeof makeChangeRequestRepo>;
