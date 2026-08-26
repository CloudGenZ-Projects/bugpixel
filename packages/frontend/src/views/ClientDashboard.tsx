/**
 * Client dashboard: shows change requests in a kanban-style board.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { ChangeRequest } from "@crp/shared";
import { endpoints } from "../api/endpoints.js";

const STATUS_COLUMNS = [
  { key: "Draft", label: "Drafts", color: "bg-gray-100 text-gray-600" },
  { key: "Submitted", label: "Submitted", color: "bg-blue-100 text-blue-800" },
  { key: "InProgress", label: "In Progress", color: "bg-yellow-100 text-yellow-800" },
  { key: "Done", label: "Done", color: "bg-green-100 text-green-800" },
  { key: "Rejected", label: "Rejected", color: "bg-red-100 text-red-800" },
];

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-500",
  High: "bg-orange-400",
  Medium: "bg-blue-400",
  Low: "bg-gray-300",
};

export function ClientDashboard() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    endpoints.listChangeRequests().then((r) => {
      setRequests(r.changeRequests);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="text-gray-500 animate-pulse">Loading requests...</div>;
  }

  const grouped = STATUS_COLUMNS.map((col) => ({
    ...col,
    items: requests.filter((r) => r.status === col.key),
  }));

  // Include AwaitingDeveloperAssignment in Submitted column
  grouped[1].items = [
    ...requests.filter((r) => r.status === "AwaitingDeveloperAssignment"),
    ...grouped[1].items,
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Change Requests</h1>
        <Link
          to="/new"
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm font-medium"
        >
          + New Request
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-gray-400 text-5xl mb-4">📋</div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">No requests yet</h3>
          <p className="text-gray-500 mb-4">Submit your first visual change request</p>
          <Link
            to="/new"
            className="inline-flex px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm"
          >
            Get started
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {grouped.map((col) => (
            <div key={col.key} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">{col.label}</h2>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {col.items.length}
                </span>
              </div>
              <div className="space-y-2">
                {col.items.map((cr) => (
                  <Link
                    key={cr.id}
                    to={`/requests/${cr.id}`}
                    className="block p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-primary/30 hover:bg-primary-light/30 transition group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[cr.priority] || "bg-gray-300"}`} />
                      <span className="text-xs text-gray-500 font-mono">
                        {cr.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 group-hover:text-primary">
                      {cr.submittedAt
                        ? new Date(cr.submittedAt).toLocaleDateString()
                        : "Draft"}
                    </div>
                    {cr.dueDate && (
                      <div className="text-xs text-gray-400 mt-1">
                        Due: {new Date(cr.dueDate).toLocaleDateString()}
                      </div>
                    )}
                  </Link>
                ))}
                {col.items.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No items</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
