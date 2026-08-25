/**
 * Assignment repository. Parameterized SQL only.
 *
 * At most one active Assignment exists per project, enforced by the UNIQUE
 * constraint on `assignment.project_id`. `setForProject` replaces any prior
 * assignment (Req 14.3). Deleting a developer cascades to their assignments via
 * the schema's ON DELETE CASCADE (Req 13.2).
 *
 * Requirements: 14.1, 14.2, 14.3, 12.2, 13.2
 */
import type { Assignment } from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import { mapAssignment } from "../mappers.js";

export interface SetAssignmentInput {
  id: string;
  projectId: string;
  developerId: string;
  createdAt: string;
}

export function makeAssignmentRepo(db: AppDatabase) {
  return {
    /** Create or replace the single assignment for a project (Req 14.1, 14.3). */
    setForProject(input: SetAssignmentInput): Assignment {
      // Remove any existing assignment for this project, then insert the new one.
      db.prepare(`DELETE FROM assignment WHERE project_id = ?`).run(input.projectId);
      db.prepare(
        `INSERT INTO assignment (id, project_id, developer_id, created_at)
         VALUES (?, ?, ?, ?)`
      ).run(input.id, input.projectId, input.developerId, input.createdAt);
      return this.getByProject(input.projectId)!;
    },

    getByProject(projectId: string): Assignment | null {
      const r = db
        .prepare(`SELECT * FROM assignment WHERE project_id = ?`)
        .get(projectId) as Row | undefined;
      return r ? mapAssignment(r) : null;
    },

    removeForProject(projectId: string): void {
      db.prepare(`DELETE FROM assignment WHERE project_id = ?`).run(projectId);
    },

    listByDeveloper(developerId: string): Assignment[] {
      const rows = db
        .prepare(`SELECT * FROM assignment WHERE developer_id = ?`)
        .all(developerId) as Row[];
      return rows.map(mapAssignment);
    },

    list(): Assignment[] {
      const rows = db
        .prepare(`SELECT * FROM assignment ORDER BY created_at ASC, id ASC`)
        .all() as Row[];
      return rows.map(mapAssignment);
    },
  };
}

export type AssignmentRepo = ReturnType<typeof makeAssignmentRepo>;
