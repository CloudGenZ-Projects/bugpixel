/**
 * Shared enums for the Change Request Portal.
 *
 * Kept as string-valued enums so the same values are used across the API
 * wire format and the SQLite text columns described in the design.
 */

/** The single role assigned to each User (Requirement 2.1). */
export enum Role {
  Client = "Client",
  Developer = "Developer",
  Admin = "Admin",
}

/** The category of a Change_Item (Requirement 8.1). */
export enum ChangeType {
  Add = "Add",
  Update = "Update",
  Delete = "Delete",
}

/** Lifecycle status of a Change_Request. */
export enum ChangeRequestStatus {
  Draft = "Draft",
  Submitted = "Submitted",
  AwaitingDeveloperAssignment = "AwaitingDeveloperAssignment",
  InProgress = "InProgress",
  Done = "Done",
  Rejected = "Rejected",
}

/** Priority level for a Change_Request. */
export enum Priority {
  Critical = "Critical",
  High = "High",
  Medium = "Medium",
  Low = "Low",
}
