/**
 * User repository. Parameterized SQL only.
 * Requirements: 2.1
 */
import type { User } from "@crp/shared";
import type { AppDatabase, Row } from "../types.js";
import { mapUser } from "../mappers.js";

export interface CreateUserInput {
  id: string;
  email: string;
  passwordHash: string;
  role: User["role"];
  createdAt: string;
}

export function makeUserRepo(db: AppDatabase) {
  return {
    create(input: CreateUserInput): User {
      db.prepare(
        `INSERT INTO user (id, email, password_hash, role, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(input.id, input.email, input.passwordHash, input.role, input.createdAt);
      return this.getById(input.id)!;
    },

    getById(id: string): User | null {
      const r = db.prepare(`SELECT * FROM user WHERE id = ?`).get(id) as Row | undefined;
      return r ? mapUser(r) : null;
    },

    getByEmail(email: string): User | null {
      const r = db
        .prepare(`SELECT * FROM user WHERE email = ?`)
        .get(email) as Row | undefined;
      return r ? mapUser(r) : null;
    },

    /** List users of a given role (used by roster listing for Developers). */
    listByRole(role: User["role"]): User[] {
      const rows = db
        .prepare(`SELECT * FROM user WHERE role = ? ORDER BY created_at ASC, id ASC`)
        .all(role) as Row[];
      return rows.map(mapUser);
    },

    remove(id: string): void {
      db.prepare(`DELETE FROM user WHERE id = ?`).run(id);
    },
  };
}

export type UserRepo = ReturnType<typeof makeUserRepo>;
