/**
 * Admin dashboard: overview of all requests + developer roster + assignments.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { ChangeRequest } from "@crp/shared";
import { endpoints, type SessionUser } from "../api/endpoints.js";

export function AdminDashboard() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [developers, setDevelopers] = useState<SessionUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([endpoints.listChangeRequests(), endpoints.listDevelopers()]).then(
      ([r, d]) => {
        setRequests(r.changeRequests);
        setDevelopers(d.developers);
        setLoading(false);
      }
    );
  }, []);

  if (loading) return <div className="text-gray-500 animate-pulse">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Requests list */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">All Requests ({requests.length})</h2>
            </div>
            {requests.length === 0 ? (
              <p className="p-6 text-gray-500 text-center">No requests yet.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {requests.slice(0, 20).map((cr) => (
                  <Link
                    key={cr.id}
                    to={`/requests/${cr.id}`}
                    className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition"
                  >
                    <div>
                      <span className="text-sm font-mono text-gray-700">#{cr.id.slice(0, 8)}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        {cr.submittedAt && new Date(cr.submittedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {cr.priority}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {cr.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Developers panel */}
        <div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Developers ({developers.length})</h2>
            <div className="space-y-2">
              {developers.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">{d.email}</span>
                </div>
              ))}
              {developers.length === 0 && (
                <p className="text-sm text-gray-400">No developers added yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
