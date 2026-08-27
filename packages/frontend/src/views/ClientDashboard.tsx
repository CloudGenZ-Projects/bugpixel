/**
 * Client dashboard - per-project kanban boards.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { endpoints } from "../api/endpoints.js";
import { ProjectBoard } from "./ProjectBoard.js";

export function ClientDashboard() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    endpoints.listProjects().then((res) => {
      setProjects(res.projects);
      if (res.projects.length > 0) setSelected(res.projects[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  if (projects.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">📋</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">No projects yet</h2>
        <p className="text-gray-500">Your admin will set up a project and website for you.</p>
      </div>
    );
  }

  const current = projects.find((p) => p.id === selected);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">My Requests</h1>
          {projects.length > 1 && (
            <select
              value={selected || ""}
              onChange={(e) => setSelected(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <Link
          to="/new"
          className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors"
        >
          + New Request
        </Link>
      </div>

      {selected && current && (
        <ProjectBoard projectId={selected} projectName={current.name} />
      )}
    </div>
  );
}
