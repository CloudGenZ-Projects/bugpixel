/**
 * Developer dashboard: kanban board with status transition controls.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { ChangeRequest } from "@crp/shared";
import { endpoints } from "../api/endpoints.js";

const STATUS_COLUMNS = [
  { key: "Submitted", label: "Submitted", color: "border-blue-300" },
  { key: "InProgress", label: "In Progress", color: "border-yellow-300" },
  { key: "Done", label: "Done", color: "border-green-300" },
];

const PRIORITY_BADGE: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-blue-100 text-blue-700",
  Low: "bg-gray-100 text-gray-600",
};

export function DeveloperDashboard() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    endpoints.listChangeRequests().then((r) => {
      setRequests(r.changeRequests);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, status: string) {
    await endpoints.updateStatus(id, status);
    load();
  }

  if (loading) return <div className="text-gray-500 animate-pulse">Loading...</div>;

  const grouped = STATUS_COLUMNS.map((col) => ({
    ...col,
    items: requests.filter((r) => r.status === col.key || (col.key === "Submitted" && r.status === "AwaitingDeveloperAssignment")),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Assigned Requests</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {grouped.map((col) => (
          <div key={col.key} className={`bg-white rounded-xl border-t-4 ${col.color} border border-gray-200 p-4`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">{col.label}</h2>
              <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {col.items.length}
              </span>
            </div>
            <div className="space-y-3">
              {col.items.map((cr) => (
                <div key={cr.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <Link to={`/requests/${cr.id}`} className="text-sm font-medium text-gray-800 hover:text-primary">
                    #{cr.id.slice(0, 8)}
                  </Link>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_BADGE[cr.priority] || ""}`}>
                      {cr.priority}
                    </span>
                    <span className="text-xs text-gray-400">
                      {cr.submittedAt && new Date(cr.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {/* Quick status actions */}
                  <div className="flex gap-1.5 mt-2">
                    {col.key === "Submitted" && (
                      <button
                        onClick={() => updateStatus(cr.id, "InProgress")}
                        className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-100"
                      >
                        Start
                      </button>
                    )}
                    {col.key === "InProgress" && (
                      <>
                        <button
                          onClick={() => updateStatus(cr.id, "Done")}
                          className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => updateStatus(cr.id, "Rejected")}
                          className="text-xs px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {col.items.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">No items</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
