import { useEffect, useState } from "react";
import { endpoints } from "../api/endpoints.js";
import { ProjectBoard } from "./ProjectBoard.js";
import { ProjectSelector } from "./ProjectSelector.js";

export function DeveloperDashboard() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string | "ALL">("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    endpoints.listProjects().then((res) => {
      setProjects(res.projects);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  if (projects.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">🔧</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">No assignments yet</h2>
        <p className="text-gray-500">Your admin will assign you to a project.</p>
      </div>
    );
  }

  const current = projects.find((p) => p.id === selected);
  const currentTitle =
    selected === "ALL"
      ? "All Assigned Projects (Combined)"
      : current?.name ?? "Project";

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Assigned Work</h1>
        {projects.length > 0 && (
          <ProjectSelector
            projects={projects}
            selectedId={selected}
            onSelect={(id) => setSelected(id)}
            showAllOption={true}
          />
        )}
      </div>

      <ProjectBoard projectId={selected} projectName={currentTitle} />
    </div>
  );
}
