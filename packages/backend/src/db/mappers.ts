/**
 * Row-mapping helpers between snake_case SQLite columns and the camelCase
 * `@crp/shared` entity interfaces.
 *
 * v2 - flattened model (no change_items, no component_references).
 */
import type {
  Assignment,
  Attachment,
  ChangeRequest,
  Note,
  Project,
  Screenshot,
  User,
  Website,
} from "@crp/shared";
import { ChangeRequestStatus, ChangeType, Priority, Role } from "@crp/shared";

/** A generic SQLite row: column name -> primitive value. */
export type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v as string;
}
function strOrNull(v: unknown): string | null {
  return v == null ? null : (v as string);
}
function num(v: unknown): number {
  return v as number;
}

export function mapUser(r: Row): User {
  return {
    id: str(r.id),
    email: str(r.email),
    passwordHash: str(r.password_hash),
    role: str(r.role) as Role,
    createdAt: str(r.created_at),
  };
}

export function mapProject(r: Row): Project {
  return { id: str(r.id), name: str(r.name) };
}

export function mapWebsite(r: Row): Website {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    ownerClientId: str(r.owner_client_id),
    name: str(r.name),
    url: str(r.url),
  };
}

export function mapAssignment(r: Row): Assignment {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    developerId: str(r.developer_id),
    createdAt: str(r.created_at),
  };
}

export function mapChangeRequest(r: Row): ChangeRequest {
  return {
    id: str(r.id),
    websiteId: str(r.website_id),
    clientId: str(r.client_id),
    status: str(r.status) as ChangeRequestStatus,
    priority: (str(r.priority) || "Medium") as Priority,
    changeType: str(r.change_type) as ChangeType,
    description: str(r.description),
    contentAdd: strOrNull(r.content_add),
    contentCurrent: strOrNull(r.content_current),
    contentUpdated: strOrNull(r.content_updated),
    contentDelete: strOrNull(r.content_delete),
    selector: strOrNull(r.selector),
    htmlMeta: strOrNull(r.html_meta),
    createdAt: str(r.created_at),
    dueDate: strOrNull(r.due_date),
  };
}

export function mapScreenshot(r: Row): Screenshot {
  return {
    id: str(r.id),
    changeRequestId: str(r.change_request_id),
    storageKey: str(r.storage_key),
    mime: str(r.mime),
    width: num(r.width),
    height: num(r.height),
    createdAt: str(r.created_at),
  };
}

export function mapAttachment(r: Row): Attachment {
  return {
    id: str(r.id),
    changeRequestId: str(r.change_request_id),
    storageKey: str(r.storage_key),
    filename: str(r.filename),
    mime: str(r.mime),
    sizeBytes: num(r.size_bytes),
  };
}

export function mapNote(r: Row): Note {
  return {
    id: str(r.id),
    changeRequestId: str(r.change_request_id),
    authorId: str(r.author_id),
    content: str(r.content),
    imageStorageKey: strOrNull(r.image_storage_key),
    createdAt: str(r.created_at),
  };
}

/** Activity log row (no shared type - backend-only). */
export interface Activity {
  id: string;
  changeRequestId: string;
  actorId: string;
  action: string;
  detail: string | null;
  createdAt: string;
}

export function mapActivity(r: Row): Activity {
  return {
    id: str(r.id),
    changeRequestId: str(r.change_request_id),
    actorId: str(r.actor_id),
    action: str(r.action),
    detail: strOrNull(r.detail),
    createdAt: str(r.created_at),
  };
}
