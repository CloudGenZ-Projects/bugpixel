/**
 * Website repository. Parameterized SQL only.
 * Requirements: 4.1 (websites by owner), 15.4 (ownership lookups)
 */
import type { Website } from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import { mapWebsite } from "../mappers.js";

export interface CreateWebsiteInput {
  id: string;
  projectId: string;
  ownerClientId: string;
  name: string;
  url: string;
}

export function makeWebsiteRepo(db: AppDatabase) {
  return {
    create(input: CreateWebsiteInput): Website {
      db.prepare(
        `INSERT INTO website (id, project_id, owner_client_id, name, url)
         VALUES (?, ?, ?, ?, ?)`
      ).run(input.id, input.projectId, input.ownerClientId, input.name, input.url);
      return this.getById(input.id)!;
    },

    getById(id: string): Website | null {
      const r = db.prepare(`SELECT * FROM website WHERE id = ?`).get(id) as
        | Row
        | undefined;
      return r ? mapWebsite(r) : null;
    },

    /** Exactly the websites owned by the given client (Req 4.1). */
    listByOwner(ownerClientId: string): Website[] {
      const rows = db
        .prepare(
          `SELECT * FROM website WHERE owner_client_id = ? ORDER BY name ASC, id ASC`
        )
        .all(ownerClientId) as Row[];
      return rows.map(mapWebsite);
    },

    /** All websites (admin view). */
    listAll(): Website[] {
      const rows = db.prepare(`SELECT * FROM website ORDER BY name ASC`).all() as Row[];
      return rows.map(mapWebsite);
    },

    update(id: string, fields: { name?: string; url?: string }): void {
      if (fields.name) db.prepare(`UPDATE website SET name = ? WHERE id = ?`).run(fields.name, id);
      if (fields.url) db.prepare(`UPDATE website SET url = ? WHERE id = ?`).run(fields.url, id);
    },

    remove(id: string): void {
      db.prepare(`DELETE FROM website WHERE id = ?`).run(id);
    },
  };
}

export type WebsiteRepo = ReturnType<typeof makeWebsiteRepo>;
