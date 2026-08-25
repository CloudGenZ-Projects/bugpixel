/**
 * Client dashboard: lists the client's change requests with status; shows an
 * empty-state with a New control when there are none (Req 3.1, 3.4, 3.5). The
 * New control routes to website selection.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { ChangeRequest } from "@crp/shared";
import { endpoints } from "../api/endpoints.js";

export function ClientDashboard() {
  const [requests, setRequests] = useState<ChangeRequest[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void endpoints.listChangeRequests().then((r) => setRequests(r.changeRequests));
  }, []);

  if (requests === null) return <div>Loading…</div>;

  return (
    <section aria-label="client dashboard">
      <header>
        <h2>My Change Requests</h2>
        <button type="button" onClick={() => navigate("/new")}>
          New Change Request
        </button>
      </header>

      {requests.length === 0 ? (
        <div role="status">
          <p>You have not submitted any change requests yet.</p>
          <button type="button" onClick={() => navigate("/new")}>
            Create your first change request
          </button>
        </div>
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
