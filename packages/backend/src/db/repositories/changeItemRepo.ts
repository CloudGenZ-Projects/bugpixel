/**
 * Change item repository plus the child repos (component reference, screenshot,
 * attachment). Parameterized SQL only.
 *
 * `listByRequest` returns items in insertion order (Req 10.1/10.2 ordering,
 * Property 17). Child accessors let the detail assembler attach the full
 * payload (Req 12.3, Property 22).
 *
 * Requirements: 3.3, 10.1, 10.2, 12.3, 6.3, 6.4, 7.3, 9.1
 */
import type {
  ChangeItem,
  ChangeType,
  ComponentReference,
  Screenshot,
  Attachment,
} from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import {
  mapAttachment,
  mapChangeItem,
  mapComponentReference,
  mapScreenshot,
} from "../mappers.js";

export interface CreateChangeItemInput {
  id: string;
  changeRequestId: string;
  changeType: ChangeType;
  description: string;
  contentAdd?: string | null;
  contentCurrent?: string | null;
  contentUpdated?: string | null;
  contentDelete?: string | null;
  createdAt: string;
}

export function makeChangeItemRepo(db: AppDatabase) {
  return {
    create(input: CreateChangeItemInput): ChangeItem {
      db.prepare(
        `INSERT INTO change_item
           (id, change_request_id, change_type, description,
            content_add, content_current, content_updated, content_delete, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.changeRequestId,
        input.changeType,
        input.description,
        input.contentAdd ?? null,
        input.contentCurrent ?? null,
        input.contentUpdated ?? null,
        input.contentDelete ?? null,
        input.createdAt
      );
      return this.getById(input.id)!;
    },

    getById(id: string): ChangeItem | null {
      const r = db.prepare(`SELECT * FROM change_item WHERE id = ?`).get(id) as
        | Row
        | undefined;
      return r ? mapChangeItem(r) : null;
    },

    /** Items of a request, in insertion order (created_at, then id tiebreak). */
    listByRequest(changeRequestId: string): ChangeItem[] {
      const rows = db
        .prepare(
          `SELECT * FROM change_item WHERE change_request_id = ?
           ORDER BY created_at ASC, id ASC`
        )
        .all(changeRequestId) as Row[];
      return rows.map(mapChangeItem);
    },

    countByRequest(changeRequestId: string): number {
      const r = db
        .prepare(`SELECT COUNT(*) AS n FROM change_item WHERE change_request_id = ?`)
        .get(changeRequestId) as Row;
      return r.n as number;
    },
  };
}

export function makeComponentReferenceRepo(db: AppDatabase) {
  return {
    create(input: {
      id: string;
      changeItemId: string;
      selector?: string | null;
      htmlMeta?: string | null;
    }): ComponentReference {
      db.prepare(
        `INSERT INTO component_reference (id, change_item_id, selector, html_meta)
         VALUES (?, ?, ?, ?)`
      ).run(input.id, input.changeItemId, input.selector ?? null, input.htmlMeta ?? null);
      return this.getByItem(input.changeItemId)!;
    },

    getByItem(changeItemId: string): ComponentReference | null {
      const r = db
        .prepare(`SELECT * FROM component_reference WHERE change_item_id = ?`)
        .get(changeItemId) as Row | undefined;
      return r ? mapComponentReference(r) : null;
    },
  };
}

export function makeScreenshotRepo(db: AppDatabase) {
  return {
    create(input: {
      id: string;
      changeItemId: string;
      storageKey: string;
      mime: string;
      width: number;
      height: number;
    }): Screenshot {
      db.prepare(
        `INSERT INTO screenshot (id, change_item_id, storage_key, mime, width, height)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.changeItemId,
        input.storageKey,
        input.mime,
        input.width,
        input.height
      );
      return this.getByItem(input.changeItemId)!;
    },

    getByItem(changeItemId: string): Screenshot | null {
      const r = db
        .prepare(`SELECT * FROM screenshot WHERE change_item_id = ?`)
        .get(changeItemId) as Row | undefined;
      return r ? mapScreenshot(r) : null;
    },
  };
}

export function makeAttachmentRepo(db: AppDatabase) {
  return {
    create(input: {
      id: string;
      changeItemId: string;
      storageKey: string;
      filename: string;
      mime: string;
      sizeBytes: number;
    }): Attachment {
      db.prepare(
        `INSERT INTO attachment
           (id, change_item_id, storage_key, filename, mime, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        input.id,
        input.changeItemId,
        input.storageKey,
        input.filename,
        input.mime,
        input.sizeBytes
      );
      return mapAttachment(
        db.prepare(`SELECT * FROM attachment WHERE id = ?`).get(input.id) as Row
      );
    },

    listByItem(changeItemId: string): Attachment[] {
      const rows = db
        .prepare(
          `SELECT * FROM attachment WHERE change_item_id = ? ORDER BY id ASC`
        )
        .all(changeItemId) as Row[];
      return rows.map(mapAttachment);
    },
  };
}

export type ChangeItemRepo = ReturnType<typeof makeChangeItemRepo>;
export type ComponentReferenceRepo = ReturnType<typeof makeComponentReferenceRepo>;
export type ScreenshotRepo = ReturnType<typeof makeScreenshotRepo>;
export type AttachmentRepo = ReturnType<typeof makeAttachmentRepo>;
