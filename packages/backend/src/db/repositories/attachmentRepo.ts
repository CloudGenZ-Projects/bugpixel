/**
 * Attachment repository (v2 - references change_request directly).
 */
import type { Attachment } from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import { mapAttachment } from "../mappers.js";

export interface CreateAttachmentInput {
  id: string;
  changeRequestId: string;
  storageKey: string;
  filename: string;
  mime: string;
  sizeBytes: number;
}

export function makeAttachmentRepo(db: AppDatabase) {
  return {
    create(input: CreateAttachmentInput): Attachment {
      db.prepare(
        `INSERT INTO attachment (id, change_request_id, storage_key, filename, mime, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(input.id, input.changeRequestId, input.storageKey, input.filename, input.mime, input.sizeBytes);
      return mapAttachment(
        db.prepare(`SELECT * FROM attachment WHERE id = ?`).get(input.id) as Row
      );
    },

    listByRequest(changeRequestId: string): Attachment[] {
      const rows = db
        .prepare(`SELECT * FROM attachment WHERE change_request_id = ? ORDER BY id ASC`)
        .all(changeRequestId) as Row[];
      return rows.map(mapAttachment);
    },

    getById(id: string): Attachment | null {
      const r = db.prepare(`SELECT * FROM attachment WHERE id = ?`).get(id) as Row | undefined;
      return r ? mapAttachment(r) : null;
    },
  };
}

export type AttachmentRepo = ReturnType<typeof makeAttachmentRepo>;
