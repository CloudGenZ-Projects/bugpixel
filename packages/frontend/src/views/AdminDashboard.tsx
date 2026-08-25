/**
 * Admin dashboard: developer roster management, assignment management, and the
 * list of all submitted change requests (Req 13, 14, 11.4).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { Assignment, ChangeRequest } from "@crp/shared";
import { ApiClientError } from "../api/client.js";
import { endpoints, type SessionUser } from "../api/endpoints.js";

export function AdminDashboard() {
  const [developers, setDevelopers] = useState<SessionUser[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [newDev, setNewDev] = useState("");
  const [newPw, setNewPw] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [d, a, r] = await Promise.all([
      endpoints.listDevelopers(),
      endpoints.listAssignments(),
      endpoints.listChangeRequests(),
    ]);
    setDevelopers(d.developers);
    setAssignments(a.assignments);
    setRequests(r.changeRequests);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function addDeveloper() {
    setError(null);
    try {
      await endpoints.addDeveloper(newDev, newPw);
      setNewDev("");
      setNewPw("");
      await reload();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to add developer.");
    }
  }

  async function removeDeveloper(id: string) {
    await endpoints.removeDeveloper(id);
    await reload();
  }

  return (
    <section aria-label="admin dashboard">
      <h2>Admin</h2>

      <section aria-label="roster">
        <h3>Developer Roster</h3>
        <ul>
          {developers.map((d) => (
            <li key={d.id}>
              {d.email}
              <button type="button" onClick={() => removeDeveloper(d.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div>
          <input
            placeholder="developer@example.com"
            value={newDev}
            onChange={(e) => setNewDev(e.target.value)}
          />
          <input
            type="password"
            placeholder="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <button type="button" onClick={addDeveloper}>
            Add developer
          </button>
          {error && (
            <p role="alert" style={{ color: "crimson" }}>
              {error}
            </p>
          )}
        </div>
      </section>

      <section aria-label="assignments">
        <h3>Assignments</h3>
        <ul>
          {assignments.map((a) => (
            <li key={a.id}>
              project {a.projectId} → developer {a.developerId}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="all requests">
        <h3>All Change Requests</h3>
        <ul>
          {requests.map((r) => (
            <li key={r.id}>
              <Link to={`/requests/${r.id}`}>{r.id}</Link> — {r.status}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
