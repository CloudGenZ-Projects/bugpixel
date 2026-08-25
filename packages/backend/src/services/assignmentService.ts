/**
 * Assignment management.
 *
 * `set` creates or replaces the single active assignment for a project (Req
 * 14.1, 14.3), rejecting a developer not in the roster with
 * ASSIGNMENT_UNKNOWN_DEVELOPER (Req 14.5). `remove` clears a project's
 * assignment (Req 14.2). `list` returns all assignments.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.5
 */
import { v4 as uuid } from "uuid";

import { Role, type Assignment } from "@crp/shared";
import type { UserRepo } from "../db/repositories/userRepo.js";
import type { AssignmentRepo } from "../db/repositories/assignmentRepo.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { ServiceError } from "./serviceError.js";

export interface AssignmentService {
  set(projectId: string, developerId: string): Assignment;
  remove(projectId: string): void;
  list(): Assignment[];
  getByProject(projectId: string): Assignment | null;
}

export function makeAssignmentService(
  users: UserRepo,
  assignments: AssignmentRepo,
  clock: Clock = systemClock
): AssignmentService {
  return {
    set(projectId, developerId) {
      // The developer must be in the roster (a user with role Developer).
      const dev = users.getById(developerId);
      if (!dev || dev.role !== Role.Developer) {
        throw new ServiceError(
          "ASSIGNMENT_UNKNOWN_DEVELOPER",
          400,
          "The developer is not in the roster."
        );
      }
      return assignments.setForProject({
        id: uuid(),
        projectId,
        developerId,
        createdAt: new Date(clock.now()).toISOString(),
      });
    },

    remove(projectId) {
      assignments.removeForProject(projectId);
    },

    list() {
      return assignments.list();
    },

    getByProject(projectId) {
      return assignments.getByProject(projectId);
    },
  };
}
