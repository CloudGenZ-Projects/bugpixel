/**
 * Authorization service: the role -> allowed-actions permission matrix, and
 * dashboard-view resolution.
 *
 * Each User holds exactly one role (Req 2.1). An action is permitted iff it is
 * in the allowed set for that role; admin-only actions (roster + assignment
 * management) are permitted iff the role is Admin (Req 2.3, 2.4). Dashboard view
 * corresponds exactly to the role (Req 2.2).
 *
 * Requirements: 2.2, 2.3, 2.4
 */
import { Role } from "@crp/shared";
import { ServiceError } from "./serviceError.js";

/** The set of actions the permission matrix governs. */
export enum Action {
  // Client actions
  ListOwnWebsites = "ListOwnWebsites",
  CreateChangeRequest = "CreateChangeRequest",
  AddChangeItem = "AddChangeItem",
  UploadScreenshot = "UploadScreenshot",
  UploadAttachment = "UploadAttachment",
  SubmitChangeRequest = "SubmitChangeRequest",
  MintInspectorToken = "MintInspectorToken",
  ListOwnChangeRequests = "ListOwnChangeRequests",

  // Developer actions
  ListAssignedChangeRequests = "ListAssignedChangeRequests",
  ViewAssignedChangeRequestDetail = "ViewAssignedChangeRequestDetail",

  // Admin actions
  ManageRoster = "ManageRoster",
  ManageAssignments = "ManageAssignments",
  ListAllChangeRequests = "ListAllChangeRequests",
}

/** The dashboard view identifier for each role. */
export type DashboardView = "client" | "developer" | "admin";

const CLIENT_ACTIONS: ReadonlySet<Action> = new Set([
  Action.ListOwnWebsites,
  Action.CreateChangeRequest,
  Action.AddChangeItem,
  Action.UploadScreenshot,
  Action.UploadAttachment,
  Action.SubmitChangeRequest,
  Action.MintInspectorToken,
  Action.ListOwnChangeRequests,
]);

const DEVELOPER_ACTIONS: ReadonlySet<Action> = new Set([
  Action.ListAssignedChangeRequests,
  Action.ViewAssignedChangeRequestDetail,
]);

const ADMIN_ACTIONS: ReadonlySet<Action> = new Set([
  Action.ManageRoster,
  Action.ManageAssignments,
  Action.ListAllChangeRequests,
]);

const ALLOWED: Record<Role, ReadonlySet<Action>> = {
  [Role.Client]: CLIENT_ACTIONS,
  [Role.Developer]: DEVELOPER_ACTIONS,
  [Role.Admin]: ADMIN_ACTIONS,
};

/** The admin-only actions, called out explicitly for Req 2.4. */
export const ADMIN_ONLY_ACTIONS: ReadonlySet<Action> = ADMIN_ACTIONS;

export interface AuthzService {
  can(role: Role, action: Action): boolean;
  /** Throw AUTHZ_FORBIDDEN (403) if the role may not perform the action. */
  assertCan(role: Role, action: Action): void;
  dashboardView(role: Role): DashboardView;
}

export function makeAuthzService(): AuthzService {
  return {
    can(role, action) {
      return ALLOWED[role].has(action);
    },

    assertCan(role, action) {
      if (!ALLOWED[role].has(action)) {
        throw new ServiceError(
          "AUTHZ_FORBIDDEN",
          403,
          "You are not permitted to perform this action."
        );
      }
    },

    dashboardView(role) {
      switch (role) {
        case Role.Client:
          return "client";
        case Role.Developer:
          return "developer";
        case Role.Admin:
          return "admin";
      }
    },
  };
}
