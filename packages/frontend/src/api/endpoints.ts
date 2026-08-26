/**
 * Typed endpoint wrappers over the API client, mirroring the backend routes.
 */
import type { ChangeRequest, ChangeItem, Role, Website, Assignment } from "@crp/shared";
import { api } from "./client.js";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

export interface SessionResponse {
  user: SessionUser;
  view: "client" | "developer" | "admin";
}

export interface ChangeItemDetail {
  item: ChangeItem;
  componentReference: {
    id: string;
    selector: string | null;
    htmlMeta: string | null;
  } | null;
  screenshot: {
    id: string;
    storageKey: string;
    mime: string;
    width: number;
    height: number;
  } | null;
  attachments: Array<{ id: string; filename: string; mime: string; sizeBytes: number }>;
}

export interface ChangeRequestDetail {
  request: ChangeRequest;
  items: ChangeItemDetail[];
}

export interface AddItemBody {
  changeType: string;
  description: string;
  contentAdd?: string | null;
  contentCurrent?: string | null;
  contentUpdated?: string | null;
  contentDelete?: string | null;
  component: { selector: string | null; htmlMeta: string | null };
  screenshot: { storageKey: string; mime: string; width: number; height: number };
}

export const endpoints = {
  login: (identifier: string, password: string) =>
    api.post<{ user: SessionUser }>("/api/auth/login", { identifier, password }),
  logout: () => api.post<{ ok: true }>("/api/auth/logout"),
  session: () => api.get<SessionResponse>("/api/session"),

  websites: () => api.get<{ websites: Website[] }>("/api/websites"),

  mintInspectorToken: (websiteId: string) =>
    api.post<{ token: string; expiresIn: number }>("/api/inspector/token", { websiteId }),

  createChangeRequest: (websiteId: string) =>
    api.post<{ changeRequest: ChangeRequest }>("/api/change-requests", { websiteId }),
  addItem: (requestId: string, body: AddItemBody) =>
    api.post<{ item: ChangeItem }>(`/api/change-requests/${requestId}/items`, body),
  uploadScreenshot: (requestId: string, dataBase64: string, mime: string) =>
    api.post<{ storageKey: string }>(`/api/change-requests/${requestId}/screenshots`, {
      dataBase64,
      mime,
    }),
  uploadAttachment: (
    requestId: string,
    itemId: string,
    dataBase64: string,
    mime: string,
    filename: string
  ) =>
    api.post<{
      attachment: { id: string; filename: string; mime: string; sizeBytes: number };
    }>(`/api/change-requests/${requestId}/items/${itemId}/attachments`, {
      dataBase64,
      mime,
      filename,
    }),
  submit: (requestId: string) =>
    api.post<{ changeRequest: ChangeRequest }>(
      `/api/change-requests/${requestId}/submit`
    ),

  listChangeRequests: () =>
    api.get<{ changeRequests: ChangeRequest[] }>("/api/change-requests"),
  changeRequestDetail: (id: string) =>
    api.get<ChangeRequestDetail>(`/api/change-requests/${id}`),

  listDevelopers: () => api.get<{ developers: SessionUser[] }>("/api/admin/developers"),
  addDeveloper: (identifier: string, password: string) =>
    api.post<{ developer: SessionUser }>("/api/admin/developers", {
      identifier,
      password,
    }),
  removeDeveloper: (id: string) => api.del<{ ok: true }>(`/api/admin/developers/${id}`),
  listAssignments: () => api.get<{ assignments: Assignment[] }>("/api/admin/assignments"),
  setAssignment: (projectId: string, developerId: string) =>
    api.put<{ assignment: Assignment }>(`/api/admin/projects/${projectId}/assignment`, {
      developerId,
    }),
  removeAssignment: (projectId: string) =>
    api.del<{ ok: true }>(`/api/admin/projects/${projectId}/assignment`),
};
