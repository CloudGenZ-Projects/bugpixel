/**
 * Shared enums for BugPixel.
 */

export enum Role {
  Client = "Client",
  Developer = "Developer",
  Admin = "Admin",
}

export enum ChangeType {
  Add = "Add",
  Update = "Update",
  Delete = "Delete",
}

/** Lifecycle status of a Change_Request. */
export enum ChangeRequestStatus {
  Submitted = "Submitted",
  InProgress = "InProgress",
  Done = "Done",
  Cancelled = "Cancelled",
}

export enum Priority {
  Critical = "Critical",
  High = "High",
  Medium = "Medium",
  Low = "Low",
}
