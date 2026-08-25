/**
 * Developer dashboard: lists change requests for projects assigned to the
 * developer (Req 12.1). Selecting one opens the full detail view.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { ChangeRequest } from "@crp/shared";
import { endpoints } from "../api/endpoints.js";

export function DeveloperDashboard() {
  const [requests, setRequests] = useState<ChangeRequest[] | null>(null);

  useEffect(() => {
    void endpoints.listChangeRequests().then((r) => setRequests(r.changeRequests));
  }, []);

  if (requests === null) return <div>Loading…</div>;

  return (
    <section aria-label="developer dashboard">
      <h2>Assigned Change Requests</h2>
      {requests.length === 0 ? (
        <p role="status">No change requests are assigned to you yet.</p>
      ) : (
        <ul>
          {requests.map((r) => (
            <li key={r.id}>
              <Link to={`/requests/${r.id}`}>{r.id}</Link>
              <span data-testid="status"> — {r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
