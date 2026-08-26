/**
 * Authentication service.
 *
 * `login` verifies a (identifier, password) pair against the stored strong
 * password hash (bcrypt) and establishes a session on an EXACT match only;
 * any mismatch (unknown identifier or wrong password) yields a generic
 * authentication error with no user enumeration (Req 1.2). `logout` terminates
 * the session (Req 1.4).
 *
 * Requirements: 1.1, 1.2, 1.4
 */
import bcrypt from "bcryptjs";

import type { User } from "@crp/shared";
import type { UserRepo } from "../db/repositories/userRepo.js";
import type { Session, SessionService } from "./sessionService.js";
import { ServiceError } from "./serviceError.js";

export interface AuthService {
  login(identifier: string, password: string): { session: Session; user: User };
  logout(sessionId: string): void;
  /** Hash a plaintext password for user creation/seeding. */
  hashPassword(plaintext: string): string;
}

export function makeAuthService(
  users: UserRepo,
  sessions: SessionService,
  bcryptRounds = 10
): AuthService {
  function authError(): never {
    // Generic message; do not reveal whether the identifier exists (Req 1.2).
    throw new ServiceError("AUTH_INVALID_CREDENTIALS", 401, "Invalid credentials.");
  }

  return {
    hashPassword(plaintext) {
      return bcrypt.hashSync(plaintext, bcryptRounds);
    },

    login(identifier, password) {
      const user = users.getByEmail(identifier);
      if (!user) {
        // Perform a dummy compare to reduce timing side-channels, then fail.
        bcrypt.compareSync(
          password,
          "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv"
        );
        authError();
      }
      const ok = bcrypt.compareSync(password, user.passwordHash);
      if (!ok) authError();
      const session = sessions.create(user.id, user.role);
      return { session, user };
    },

    logout(sessionId) {
      sessions.destroy(sessionId);
    },
  };
}
