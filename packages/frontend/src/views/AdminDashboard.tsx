import { useEffect, useState } from "react";
import { endpoints } from "../api/endpoints.js";
import { ProjectBoard } from "./ProjectBoard.js";
import { ProjectSelector } from "./ProjectSelector.js";

type ViewMode = "grid" | "board" | "manage";

export function AdminDashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [websites, setWebsites] = useState<{ id: string; name: string; url: string; projectId: string; ownerClientId: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; role: string; createdAt?: string }[]>([]);
  const [assignments, setAssignments] = useState<{ id: string; projectId: string; developerId: string }[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Manage form & editing states
  const [manageSubTab, setManageSubTab] = useState<"projects" | "websites" | "users" | "assignments">("projects");
  const [newProject, setNewProject] = useState("");
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "Client" });
  const [newWebsite, setNewWebsite] = useState({ projectId: "", ownerClientId: "", name: "", url: "" });
  const [newAssign, setNewAssign] = useState({ projectId: "", developerId: "" });

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState("");

  const [editingWebsiteId, setEditingWebsiteId] = useState<string | null>(null);
  const [editWebsite, setEditWebsite] = useState({ name: "", url: "", projectId: "", ownerClientId: "" });

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<{ email: string; role: string }>({ email: "", role: "Client" });

  async function loadData() {
    try {
      const [projRes, webRes, userRes, reqRes, assignRes] = await Promise.all([
        endpoints.listProjects(),
        endpoints.listWebsites(),
        endpoints.listUsers(),
        endpoints.listChangeRequests(),
        endpoints.listAssignments().catch(() => ({ assignments: [] })),
      ]);
      setProjects(projRes.projects);
      setWebsites(webRes.websites as any);
      setUsers(userRes.users);
      setRequests((reqRes.changeRequests as any) || []);
      setAssignments(assignRes.assignments || []);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading dashboard...</div>;

  // Compute stats across all requests
  const totalRequests = requests.length;
  const totalSubmitted = requests.filter((r) => r.status === "Submitted").length;
  const totalInProgress = requests.filter((r) => r.status === "InProgress").length;
  const totalDone = requests.filter((r) => r.status === "Done").length;

  // Filter projects by search
  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const site = websites.find((w) => w.projectId === p.id);
    return (
      p.name.toLowerCase().includes(q) ||
      (site && (site.name.toLowerCase().includes(q) || site.url.toLowerCase().includes(q)))
    );
  });

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const currentTitle =
    selectedProjectId === "ALL"
      ? "All Projects (Combined)"
      : selectedProject?.name ?? "Project";

  return (
    <div className="space-y-6">
      {/* Top Header & View Mode Switcher */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage projects, websites, and review all client requests in one place
          </p>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center bg-gray-100 p-1 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === "grid"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <span>⊞</span> Projects Hub
          </button>
          <button
            type="button"
            onClick={() => setViewMode("board")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === "board"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <span>▥</span> Kanban Board
          </button>
          <button
            type="button"
            onClick={() => setViewMode("manage")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === "manage"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <span>⚙️</span> Manage
          </button>
        </div>
      </div>

      {/* ================= VIEW 1: PROJECTS GRID (BugHerd Hub) ================= */}
      {viewMode === "grid" && (
        <div className="space-y-6">
          {/* Top Summary Banner */}
          <div className="bg-gradient-to-r from-gray-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md flex flex-wrap items-center justify-between gap-6">
            <div>
              <span className="text-xs font-semibold tracking-wider uppercase text-indigo-300">
                Workspace Overview
              </span>
              <h2 className="text-xl font-bold mt-1">{projects.length} Active Projects</h2>
              <div className="flex items-center gap-4 mt-3 flex-wrap text-xs text-gray-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  {totalSubmitted} Submitted
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  {totalInProgress} In Progress
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  {totalDone} Done
                </span>
                <span className="text-gray-400">({totalRequests} total requests)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedProjectId("ALL");
                setViewMode("board");
              }}
              className="px-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <span>🌐</span> Open Combined Board →
            </button>
          </div>

          {/* Search & Action Bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${projects.length} projects by name or URL...`}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors shadow-sm"
              />
              <svg
                className="w-4 h-4 text-gray-400 absolute left-3 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <button
              type="button"
              onClick={() => setViewMode("manage")}
              className="px-3.5 py-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-semibold rounded-xl transition-all shadow-sm"
            >
              + Add New Project
            </button>
          </div>

          {/* Projects Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProjects.map((project) => {
              const projectWebsites = websites.filter((w) => w.projectId === project.id);
              const pWebsiteIds = new Set(projectWebsites.map((w) => w.id));
              const pRequests = requests.filter((r) => pWebsiteIds.has(r.websiteId));
              const pSubmitted = pRequests.filter((r) => r.status === "Submitted").length;
              const pInProgress = pRequests.filter((r) => r.status === "InProgress").length;
              const pDone = pRequests.filter((r) => r.status === "Done").length;
              const primarySite = projectWebsites[0];
              const clientOwner = users.find((u) => u.id === primarySite?.ownerClientId);

              return (
                <div
                  key={project.id}
                  className="bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all p-5 flex flex-col justify-between group"
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors line-clamp-1">
                          {project.name}
                        </h3>
                        {primarySite && (
                          <a
                            href={primarySite.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-gray-400 hover:text-primary transition-colors flex items-center gap-1 mt-0.5"
                          >
                            <span>🌐</span>
                            <span className="truncate max-w-[200px]">{primarySite.url}</span>
                          </a>
                        )}
                      </div>
                      <span className="text-[11px] px-2 py-0.5 bg-green-50 text-green-700 font-semibold rounded-full shrink-0">
                        Active
                      </span>
                    </div>

                    {/* Client & Metadata */}
                    {clientOwner && (
                      <p className="text-xs text-gray-500 mb-4 flex items-center gap-1.5 truncate">
                        <span className="text-gray-400">👤 Client:</span>
                        <span className="truncate font-medium text-gray-700">{clientOwner.email}</span>
                      </p>
                    )}

                    {/* Status Counters */}
                    <div className="grid grid-cols-3 gap-2 py-3 border-y border-gray-100 my-3 text-center">
                      <div className="bg-blue-50/60 rounded-lg p-2">
                        <span className="block text-xs font-bold text-blue-700">{pSubmitted}</span>
                        <span className="text-[10px] text-blue-600/80 font-medium">Submitted</span>
                      </div>
                      <div className="bg-amber-50/60 rounded-lg p-2">
                        <span className="block text-xs font-bold text-amber-700">{pInProgress}</span>
                        <span className="text-[10px] text-amber-600/80 font-medium">In Progress</span>
                      </div>
                      <div className="bg-green-50/60 rounded-lg p-2">
                        <span className="block text-xs font-bold text-green-700">{pDone}</span>
                        <span className="text-[10px] text-green-600/80 font-medium">Done</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setViewMode("board");
                    }}
                    className="w-full mt-3 py-2 bg-gray-50 hover:bg-primary hover:text-white text-gray-700 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    Open Kanban Board →
                  </button>
                </div>
              );
            })}

            {filteredProjects.length === 0 && (
              <div className="col-span-full py-16 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <p className="text-sm font-medium text-gray-600">No projects match "{searchQuery}"</p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-2 text-xs text-primary font-semibold hover:underline"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= VIEW 2: KANBAN BOARD ================= */}
      {viewMode === "board" && (
        <div className="space-y-4">
          {/* Breadcrumb & Project Selector Header */}
          <div className="flex items-center justify-between flex-wrap gap-3 bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className="text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
              >
                ← Back to Projects
              </button>
              <span className="text-gray-300">|</span>
              <ProjectSelector
                projects={projects}
                selectedId={selectedProjectId}
                onSelect={(id) => setSelectedProjectId(id)}
                showAllOption={true}
              />
            </div>
          </div>

          {projects.length > 0 ? (
            <ProjectBoard projectId={selectedProjectId} projectName={currentTitle} />
          ) : (
            <p className="text-center py-8 text-gray-500">No projects found. Create one in Manage.</p>
          )}
        </div>
      )}

      {/* ================= VIEW 3: MANAGE TAB (FULL CRUD) ================= */}
      {viewMode === "manage" && (
        <div className="space-y-6">
          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-gray-200 pb-3 flex-wrap">
            <button
              type="button"
              onClick={() => setManageSubTab("projects")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                manageSubTab === "projects"
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Projects ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setManageSubTab("websites")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                manageSubTab === "websites"
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Websites ({websites.length})
            </button>
            <button
              type="button"
              onClick={() => setManageSubTab("users")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                manageSubTab === "users"
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Users ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setManageSubTab("assignments")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                manageSubTab === "assignments"
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Assignments ({assignments.length})
            </button>
          </div>

          {/* --- SUBTAB 1: PROJECTS CRUD --- */}
          {manageSubTab === "projects" && (
            <div className="space-y-4">
              {/* Create Project Form */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Create New Project</h3>
                <div className="flex gap-2">
                  <input
                    value={newProject}
                    onChange={(e) => setNewProject(e.target.value)}
                    placeholder="Enter project name..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newProject.trim()) return;
                      await endpoints.createProject(newProject.trim());
                      setNewProject("");
                      loadData();
                    }}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors"
                  >
                    Create Project
                  </button>
                </div>
              </div>

              {/* Projects Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Project Name</th>
                      <th className="px-4 py-3">Linked Websites</th>
                      <th className="px-4 py-3">Assigned Developer</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {projects.map((p) => {
                      const pSites = websites.filter((w) => w.projectId === p.id);
                      const pAssign = assignments.find((a) => a.projectId === p.id);
                      const pDev = users.find((u) => u.id === pAssign?.developerId);
                      const isEditing = editingProjectId === p.id;

                      return (
                        <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {isEditing ? (
                              <input
                                value={editProjectName}
                                onChange={(e) => setEditProjectName(e.target.value)}
                                className="border border-primary rounded px-2 py-1 text-sm w-full max-w-xs focus:outline-none"
                              />
                            ) : (
                              p.name
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {pSites.map((s) => s.name).join(", ") || <span className="text-gray-400 italic">None</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {pDev ? pDev.email : <span className="text-gray-400 italic">Unassigned</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!editProjectName.trim()) return;
                                      await endpoints.updateProject(p.id, editProjectName.trim());
                                      setEditingProjectId(null);
                                      loadData();
                                    }}
                                    className="px-2.5 py-1 bg-primary text-white text-xs font-semibold rounded hover:bg-primary-hover"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingProjectId(null)}
                                    className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded hover:bg-gray-200"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingProjectId(p.id);
                                      setEditProjectName(p.name);
                                    }}
                                    className="text-xs text-gray-600 hover:text-primary font-medium px-2 py-1 rounded hover:bg-gray-100"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!confirm(`Are you sure you want to delete project "${p.name}"?`)) return;
                                      await endpoints.deleteProject(p.id);
                                      loadData();
                                    }}
                                    className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {projects.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-gray-400">
                          No projects created yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- SUBTAB 2: WEBSITES CRUD --- */}
          {manageSubTab === "websites" && (
            <div className="space-y-4">
              {/* Create Website Form */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Add Website to Project</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                  <select
                    value={newWebsite.projectId}
                    onChange={(e) => setNewWebsite({ ...newWebsite, projectId: e.target.value })}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                  >
                    <option value="">Select Project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={newWebsite.ownerClientId}
                    onChange={(e) => setNewWebsite({ ...newWebsite, ownerClientId: e.target.value })}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                  >
                    <option value="">Select Client Owner...</option>
                    {users.filter((u) => u.role === "Client").map((u) => (
                      <option key={u.id} value={u.id}>{u.email}</option>
                    ))}
                  </select>
                  <input
                    value={newWebsite.name}
                    onChange={(e) => setNewWebsite({ ...newWebsite, name: e.target.value })}
                    placeholder="Site Name (e.g. Acme)"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <input
                    value={newWebsite.url}
                    onChange={(e) => setNewWebsite({ ...newWebsite, url: e.target.value })}
                    placeholder="https://... or http://localhost:8080"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newWebsite.projectId || !newWebsite.ownerClientId || !newWebsite.name || !newWebsite.url) {
                        alert("Please fill in all website fields");
                        return;
                      }
                      await endpoints.createWebsite(newWebsite.projectId, newWebsite.ownerClientId, newWebsite.name, newWebsite.url);
                      setNewWebsite({ projectId: "", ownerClientId: "", name: "", url: "" });
                      loadData();
                    }}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors"
                  >
                    Add Website
                  </button>
                </div>
              </div>

              {/* Websites Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Website Name</th>
                      <th className="px-4 py-3">Target URL</th>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Client Owner</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {websites.map((w) => {
                      const proj = projects.find((p) => p.id === w.projectId);
                      const owner = users.find((u) => u.id === w.ownerClientId);
                      const isEditing = editingWebsiteId === w.id;

                      return (
                        <tr key={w.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {isEditing ? (
                              <input
                                value={editWebsite.name}
                                onChange={(e) => setEditWebsite({ ...editWebsite, name: e.target.value })}
                                className="border border-primary rounded px-2 py-1 text-xs w-full focus:outline-none"
                              />
                            ) : (
                              w.name
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {isEditing ? (
                              <input
                                value={editWebsite.url}
                                onChange={(e) => setEditWebsite({ ...editWebsite, url: e.target.value })}
                                className="border border-primary rounded px-2 py-1 text-xs w-full focus:outline-none"
                              />
                            ) : (
                              <a href={w.url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate max-w-[200px] block">
                                {w.url}
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {isEditing ? (
                              <select
                                value={editWebsite.projectId}
                                onChange={(e) => setEditWebsite({ ...editWebsite, projectId: e.target.value })}
                                className="border border-primary rounded px-2 py-1 text-xs focus:outline-none bg-white"
                              >
                                {projects.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            ) : (
                              proj?.name || "Unassigned"
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {isEditing ? (
                              <select
                                value={editWebsite.ownerClientId}
                                onChange={(e) => setEditWebsite({ ...editWebsite, ownerClientId: e.target.value })}
                                className="border border-primary rounded px-2 py-1 text-xs focus:outline-none bg-white"
                              >
                                {users.filter((u) => u.role === "Client").map((u) => (
                                  <option key={u.id} value={u.id}>{u.email}</option>
                                ))}
                              </select>
                            ) : (
                              owner?.email || "None"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await endpoints.updateWebsite(w.id, editWebsite);
                                      setEditingWebsiteId(null);
                                      loadData();
                                    }}
                                    className="px-2.5 py-1 bg-primary text-white text-xs font-semibold rounded hover:bg-primary-hover"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingWebsiteId(null)}
                                    className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded hover:bg-gray-200"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingWebsiteId(w.id);
                                      setEditWebsite({
                                        name: w.name,
                                        url: w.url,
                                        projectId: w.projectId,
                                        ownerClientId: w.ownerClientId,
                                      });
                                    }}
                                    className="text-xs text-gray-600 hover:text-primary font-medium px-2 py-1 rounded hover:bg-gray-100"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!confirm(`Are you sure you want to delete website "${w.name}"?`)) return;
                                      await endpoints.deleteWebsite(w.id);
                                      loadData();
                                    }}
                                    className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {websites.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400">
                          No websites registered yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- SUBTAB 3: USERS CRUD --- */}
          {manageSubTab === "users" && (
            <div className="space-y-4">
              {/* Create User Form */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Invite / Create User</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="User email"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <input
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Temporary password"
                    type="password"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
                  >
                    <option>Client</option>
                    <option>Developer</option>
                    <option>Admin</option>
                  </select>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newUser.email || !newUser.password) {
                        alert("Email and password required");
                        return;
                      }
                      await endpoints.createUser(newUser.email, newUser.password, newUser.role);
                      setNewUser({ email: "", password: "", role: "Client" });
                      loadData();
                    }}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors"
                  >
                    Create User
                  </button>
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((u) => {
                      const isEditing = editingUserId === u.id;
                      return (
                        <tr key={u.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {isEditing ? (
                              <input
                                value={editUser.email}
                                onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                                className="border border-primary rounded px-2 py-1 text-xs w-full max-w-xs focus:outline-none"
                              />
                            ) : (
                              u.email
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {isEditing ? (
                              <select
                                value={editUser.role}
                                onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                                className="border border-primary rounded px-2 py-1 text-xs bg-white focus:outline-none"
                              >
                                <option>Client</option>
                                <option>Developer</option>
                                <option>Admin</option>
                              </select>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded-full font-semibold ${
                                  u.role === "Admin"
                                    ? "bg-purple-100 text-purple-800"
                                    : u.role === "Developer"
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-green-100 text-green-800"
                                }`}
                              >
                                {u.role}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await endpoints.updateUser(u.id, editUser);
                                      setEditingUserId(null);
                                      loadData();
                                    }}
                                    className="px-2.5 py-1 bg-primary text-white text-xs font-semibold rounded hover:bg-primary-hover"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingUserId(null)}
                                    className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded hover:bg-gray-200"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingUserId(u.id);
                                      setEditUser({ email: u.email, role: u.role });
                                    }}
                                    className="text-xs text-gray-600 hover:text-primary font-medium px-2 py-1 rounded hover:bg-gray-100"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!confirm(`Are you sure you want to delete user "${u.email}"?`)) return;
                                      await endpoints.deleteUser(u.id);
                                      loadData();
                                    }}
                                    className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- SUBTAB 4: DEVELOPER ASSIGNMENTS --- */}
          {manageSubTab === "assignments" && (
            <div className="space-y-4">
              {/* Assign Form */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Assign Developer to Project</h3>
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={newAssign.projectId}
                    onChange={(e) => setNewAssign({ ...newAssign, projectId: e.target.value })}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary flex-1 min-w-[150px]"
                  >
                    <option value="">Select Project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={newAssign.developerId}
                    onChange={(e) => setNewAssign({ ...newAssign, developerId: e.target.value })}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary flex-1 min-w-[150px]"
                  >
                    <option value="">Select Developer...</option>
                    {users.filter((u) => u.role === "Developer").map((u) => (
                      <option key={u.id} value={u.id}>{u.email}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newAssign.projectId || !newAssign.developerId) {
                        alert("Select both project and developer");
                        return;
                      }
                      await endpoints.createAssignment(newAssign.projectId, newAssign.developerId);
                      setNewAssign({ projectId: "", developerId: "" });
                      loadData();
                    }}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors"
                  >
                    Assign Developer
                  </button>
                </div>
              </div>

              {/* Assignments Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Assigned Developer</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {assignments.map((a) => {
                      const proj = projects.find((p) => p.id === a.projectId);
                      const dev = users.find((u) => u.id === a.developerId);

                      return (
                        <tr key={a.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {proj?.name || a.projectId}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700">
                            {dev?.email || a.developerId}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm(`Remove assignment for project "${proj?.name || a.projectId}"?`)) return;
                                await endpoints.deleteAssignment(a.projectId);
                                loadData();
                              }}
                              className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                            >
                              Remove Assignment
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {assignments.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-xs text-gray-400">
                          No developer assignments yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
