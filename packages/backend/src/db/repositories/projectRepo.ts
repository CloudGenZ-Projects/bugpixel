/**
 * Project repository. Parameterized SQL only.
 */
import type { Project } from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import { mapProject } from "../mappers.js";

export function makeProjectRepo(db: AppDatabase) {
  return {
    create(input: { id: string; name: string }): Project {
      db.prepare(`INSERT INTO project (id, name) VALUES (?, ?)`).run(
        input.id,
        input.name
      );
      return this.getById(input.id)!;
    },

    getById(id: string): Project | null {
      const r = db.prepare(`SELECT * FROM project WHERE id = ?`).get(id) as
        | Row
        | undefined;
      return r ? mapProject(r) : null;
    },

    list(): Project[] {
      const rows = db.prepare(`SELECT * FROM project ORDER BY name ASC`).all() as Row[];
      return rows.map(mapProject);
    },
  };
}

export type ProjectRepo = ReturnType<typeof makeProjectRepo>;
