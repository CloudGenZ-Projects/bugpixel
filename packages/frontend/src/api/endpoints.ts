/**
 * BugPixel v2 API endpoints.
 */
import type { ChangeRequest, ChangeRequestStatus, Priority, Screenshot, Attachment, Note } from "@crp/shared";
import { api } from "./client.js";

export interface SessionResponse {
  user: { id: string; email: string; role: string };
  view: "client" | "developer" | "admin";
}

export interface CreateChangeRequestInput {
  websiteId: string;
  changeType: string;
  description: string;
  priority?: string;
  contentAdd?: string | null;
  contentCurrent?: string | null;
  contentUpdated?: string | null;
  contentDelete?: string | null;
  selector?: string | null;
  htmlMeta?: string | null;
  dueDate?: string | null;
}

export interface ChangeRequestDetailResponse {
  request: ChangeRequest;
  screenshots: Screenshot[];
  attachments: Attachment[];
  notes: Note[];
  activity: { id: string; actorId: string; action: string; detail: string | null; createdAt: string }[];
}

export const endpoints = {
  // Auth
  async login(email: string, password: string) {
    return api.post<{ user: { id: string; email: string; role: string }; csrfToken: string }>("/api/auth/login", { email, password });
  },
  async logout() {
    return api.post<{ ok: boolean }>("/api/auth/logout", {});
  },
  async session(): Promise<SessionResponse> {
    const res = await api.get<{ user: { id: string; email: string; role: string } }>("/api/auth/me");
    const role = res.user.role.toLowerCase() as "client" | "developer" | "admin";
    return { user: res.user, view: role };
  },

  // Change Requests
  async createChangeRequest(input: CreateChangeRequestInput) {
    return api.post<{ changeRequest: ChangeRequest }>("/api/change-requests", input);
  },
  async listChangeRequests() {
    return api.get<{ changeRequests: ChangeRequest[] }>("/api/change-requests");
  },
  async getChangeRequestDetail(id: string) {
    return api.get<ChangeRequestDetailResponse>(`/api/change-requests/${id}`);
  },
  async updateStatus(id: string, status: ChangeRequestStatus) {
    return api.patch<{ changeRequest: ChangeRequest }>(`/api/change-requests/${id}/status`, { status });
  },
  async updatePriority(id: string, priority: Priority) {
    return api.patch<{ ok: boolean }>(`/api/change-requests/${id}/priority`, { priority });
  },
  async uploadScreenshot(id: string, data: string, mime: string, width: number, height: number) {
    return api.post<{ screenshot: Screenshot }>(`/api/change-requests/${id}/screenshots`, { data, mime, width, height });
  },
  async uploadAttachment(id: string, data: string, mime: string, filename: string) {
    return api.post<{ attachment: Attachment }>(`/api/change-requests/${id}/attachments`, { data, mime, filename });
  },
  async addNote(id: string, content: string, imageData?: string, imageMime?: string) {
    return api.post<{ note: Note }>(`/api/change-requests/${id}/notes`, { content, imageData, imageMime });
  },
  async getActivity(id: string) {
    return api.get<{ activity: any[] }>(`/api/change-requests/${id}/activity`);
  },

  // Projects
  async listProjects() {
    return api.get<{ projects: { id: string; name: string }[] }>("/api/projects");
  },
  async listProjectChangeRequests(projectId: string) {
    return api.get<{ changeRequests: (ChangeRequest & { screenshots: Screenshot[] })[] }>(`/api/projects/${projectId}/change-requests`);
  },

  // Websites
  async listWebsites() {
    return api.get<{ websites: { id: string; projectId: string; ownerClientId: string; name: string; url: string }[] }>("/api/websites");
  },

  // Analytics
  async getAnalytics(projectId?: string) {
    return api.get<{ statusCounts: Record<string, number>; monthlyStats: any[]; avgResolutionHours: number | null }>(
      `/api/analytics/stats${projectId ? `?projectId=${projectId}` : ""}`
    );
  },

  // Inspector
  async mintInspectorToken(websiteId: string) {
    return api.post<{ token: string; expiresIn: number }>("/api/inspector/token", { websiteId });
  },

  // Admin
  async listUsers() {
    return api.get<{ users: { id: string; email: string; role: string; createdAt: string }[] }>("/api/admin/users");
  },
  async createUser(email: string, password: string, role: string) {
    return api.post<{ user: { id: string; email: string; role: string } }>("/api/admin/users", { email, password, role });
  },
  async updateUser(id: string, data: { email?: string; role?: string; password?: string }) {
    return api.patch<{ user: { id: string; email: string; role: string } }>(`/api/admin/users/${id}`, data);
  },
  async deleteUser(id: string) {
    return api.del<{ ok: boolean }>(`/api/admin/users/${id}`);
  },
  async createProject(name: string) {
    return api.post<{ project: { id: string; name: string } }>("/api/admin/projects", { name });
  },
  async updateProject(id: string, name: string) {
    return api.patch<{ project: { id: string; name: string } }>(`/api/admin/projects/${id}`, { name });
  },
  async deleteProject(id: string) {
    return api.del<{ ok: boolean }>(`/api/admin/projects/${id}`);
  },
  async createWebsite(projectId: string, ownerClientId: string, name: string, url: string) {
    return api.post<{ website: any }>("/api/admin/websites", { projectId, ownerClientId, name, url });
  },
  async updateWebsite(id: string, data: { name?: string; url?: string; projectId?: string; ownerClientId?: string }) {
    return api.patch<{ website: any }>(`/api/admin/websites/${id}`, data);
  },
  async deleteWebsite(id: string) {
    return api.del<{ ok: boolean }>(`/api/admin/websites/${id}`);
  },
  async listAssignments() {
    return api.get<{ assignments: { id: string; projectId: string; developerId: string; createdAt: string }[] }>("/api/admin/assignments");
  },
  async createAssignment(projectId: string, developerId: string) {
    return api.post<{ assignment: any }>("/api/admin/assignments", { projectId, developerId });
  },
  async deleteAssignment(projectId: string) {
    return api.del<{ ok: boolean }>(`/api/admin/assignments/${projectId}`);
  },
};
