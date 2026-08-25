/**
 * Developer roster management.
 *
 * The roster is the set of users with role Developer. `add` creates a Developer
 * record, rejecting a duplicate identifier (email) with ROSTER_DUPLICATE (Req
 * 13.4). `remove` deletes the developer; the schema's ON DELETE CASCADE removes
 * their assignments, and we also destroy any live sessions (Req 13.2). `list`
 * returns the current roster (Req 13.3).
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
import { v4 as uuid } from "uuid";

import { Role, type User } from "@crp/shared";
import type { UserRepo } from "../db/repositories/userRepo.js";
import type { AssignmentRepo } from "../db/repositories/assignmentRepo.js";
import type { SessionService } from "./sessionService.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { ServiceError } from "./serviceError.js";

export interface AddDeveloperInput {
  /** The unique identifier for the developer (email). */
  identifier: string;
  passwordHash: string;
}

export interface RosterService {
  add(input: AddDeveloperInput): User;
  remove(developerId: string): void;
  list(): User[];
}

export function makeRosterService(
  users: UserRepo,
  assignments: AssignmentRepo,
  sessions: SessionService,
  clock: Clock = systemClock
): RosterService {
  return {
    add(input) {
      // Reject a duplicate identifier (Req 13.4). The identifier is the email.
      if (users.getByEmail(input.identifier)) {
        throw new ServiceError(
          "ROSTER_DUPLICATE",
          409,
          "A developer with this identifier already exists.",
          "identifier"
        );
      }
      return users.create({
        id: uuid(),
        email: input.identifier,
        passwordHash: input.passwordHash,
        role: Role.Developer,
        createdAt: new Date(clock.now()).toISOString(),
      });
    },

    remove(developerId) {
      // Assignments cascade via the FK; explicitly clear sessions too so a
      // removed developer cannot continue acting (Req 13.2).
      sessions.destroyForUser(developerId);
      users.remove(developerId);
    },

    list() {
      return users.listByRole(Role.Developer);
    },
  };
}
