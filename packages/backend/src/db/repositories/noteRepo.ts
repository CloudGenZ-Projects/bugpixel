/**
 * Notes (comments) repository for change request conversations.
 * v2 - supports optional image attachment per note.
 */
import type { Note } from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import { mapNote } from "../mappers.js";

export function makeNoteRepo(db: AppDatabase) {
  return {
    create(input: {
      id: string;
      changeRequestId: string;
      authorId: string;
      content: string;
      imageStorageKey?: string | null;
      createdAt: string;
    }): Note {
      db.prepare(
        `INSERT INTO note (id, change_request_id, author_id, content, image_storage_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.changeRequestId,
        input.authorId,
        input.content,
        input.imageStorageKey ?? null,
        input.createdAt
      );
      return mapNote(
        db.prepare(`SELECT * FROM note WHERE id = ?`).get(input.id) as Row
      );
    },

    listByRequest(changeRequestId: string): Note[] {
      const rows = db
        .prepare(
          `SELECT * FROM note WHERE change_request_id = ? ORDER BY created_at ASC`
        )
        .all(changeRequestId) as Row[];
      return rows.map(mapNote);
    },
  };
}

export type NoteRepo = ReturnType<typeof makeNoteRepo>;
