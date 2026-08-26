/**
 * Admin dashboard: requests overview + manage developers, projects, websites, assignments.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { ChangeRequest, Project, Website, Assignment } from "@crp/shared";
import { endpoints, type SessionUser } from "../api/endpoints.js";
import { api } from "../api/client.js";

export function AdminDashboard() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [developers, setDevelopers] = useState<SessionUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [websites, setWebsites] = useState<Array<Website & { ownerEmail?: string; projectName?: string }>>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"requests" | "manage">("requests");

  // Form state
  const [newProjectName, setNewProjectName] = useState("");
  const [newDevEmail, setNewDevEmail] = useState("");
  const [newDevPassword, setNewDevPassword] = useState("");
  // Website form
  const [newWebName, setNewWebName] = useState("");
  const [newWebUrl, setNewWebUrl] = useState("");
  const [newWebProject, setNewWebProject] = useState("");
  const [newWebOwner, setNewWebOwner] = useState("");
  const [clients, setClients] = useState<Array<{ id: string; email: string }>>([]);
  const [editingWebsite, setEditingWebsite] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");

  function load() {
    Promise.all([
      endpoints.listChangeRequests(),
      endpoints.listDevelopers(),
      api.get<{ projects: Project[] }>("/api/admin/projects"),
      api.get<{ websites: Array<Website & { ownerEmail: string; projectName: string }> }>("/api/admin/websites"),
      endpoints.listAssignments(),
      api.get<{ clients: Array<{ id: string; email: string }> }>("/api/admin/clients"),
    ]).then(([r, d, p, w, a, c]) => {
      setRequests(r.changeRequests);
      setDevelopers(d.developers);
      setProjects(p.projects);
      setWebsites(w.websites);
      setAssignments(a.assignments);
      setClients(c.clients);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  async function createProject() {
    if (!newProjectName.trim()) return;
    await api.post("/api/admin/projects", { name: newProjectName.trim() });
    setNewProjectName("");
    load();
  }

  async function addDeveloper() {
    if (!newDevEmail.trim() || !newDevPassword) return;
    await endpoints.addDeveloper(newDevEmail.trim(), newDevPassword);
    setNewDevEmail("");
    setNewDevPassword("");
    load();
  }

  if (loading) return <div className="text-gray-500 animate-pulse">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setTab("requests")}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === "requests" ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-500"}`}
          >
            Requests
          </button>
          <button
            onClick={() => setTab("manage")}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === "manage" ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-500"}`}
          >
            Manage
          </button>
        </div>
      </div>

      {tab === "requests" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">All Requests ({requests.length})</h2>
          </div>
          {requests.length === 0 ? (
            <p className="p-8 text-gray-500 text-center">No requests submitted yet.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {requests.map((cr) => (
                <Link key={cr.id} to={`/requests/${cr.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-gray-700">#{cr.id.slice(0, 8)}</span>
                    <span className="text-xs text-gray-400">{cr.submittedAt && new Date(cr.submittedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      cr.priority === "Critical" ? "bg-red-100 text-red-700" :
                      cr.priority === "High" ? "bg-orange-100 text-orange-700" :
                      cr.priority === "Medium" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>{cr.priority}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{cr.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "manage" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Projects ({projects.length})</h3>
            <div className="space-y-2 mb-4">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">{p.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{p.id.slice(0, 8)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="New project name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                onKeyDown={(e) => e.key === "Enter" && createProject()}
              />
              <button onClick={createProject} className="px-3 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-hover">
                Add
              </button>
            </div>
          </div>

          {/* Developers */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Developers ({developers.length})</h3>
            <div className="space-y-2 mb-4">
              {developers.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">{d.email}</span>
                  <button
                    onClick={async () => { await endpoints.removeDeveloper(d.id); load(); }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <input
                value={newDevEmail}
                onChange={(e) => setNewDevEmail(e.target.value)}
                placeholder="developer@email.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newDevPassword}
                  onChange={(e) => setNewDevPassword(e.target.value)}
                  placeholder="Password"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <button onClick={addDeveloper} className="px-3 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-hover">
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Websites */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
            <h3 className="font-semibold text-gray-800 mb-4">Websites ({websites.length})</h3>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-gray-500 font-medium">Name</th>
                    <th className="text-left py-2 text-gray-500 font-medium">URL</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Project</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Owner</th>
                    <th className="text-right py-2 text-gray-500 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {websites.map((w) => (
                    <tr key={w.id}>
                      {editingWebsite === w.id ? (
                        <>
                          <td className="py-2"><input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                          <td className="py-2"><input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                          <td className="py-2 text-gray-600">{w.projectName}</td>
                          <td className="py-2 text-gray-600">{w.ownerEmail}</td>
                          <td className="py-2 text-right">
                            <button onClick={async () => { await api.patch(`/api/admin/websites/${w.id}`, { name: editName, url: editUrl }); setEditingWebsite(null); load(); }} className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded mr-1">Save</button>
                            <button onClick={() => setEditingWebsite(null)} className="text-xs px-2 py-1 text-gray-500">Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 text-gray-700">{w.name}</td>
                          <td className="py-2 text-gray-400 truncate max-w-48">{w.url}</td>
                          <td className="py-2 text-gray-600">{w.projectName}</td>
                          <td className="py-2 text-gray-600">{w.ownerEmail}</td>
                          <td className="py-2 text-right">
                            <button onClick={() => { setEditingWebsite(w.id); setEditName(w.name); setEditUrl(w.url); }} className="text-xs px-2 py-1 text-blue-600 hover:text-blue-800 mr-1">Edit</button>
                            <button onClick={async () => { if (confirm(`Delete ${w.name}?`)) { await api.del(`/api/admin/websites/${w.id}`); load(); } }} className="text-xs px-2 py-1 text-red-500 hover:text-red-700">Delete</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Add website form */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-500 mb-2 font-medium">Add Website</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input value={newWebName} onChange={(e) => setNewWebName(e.target.value)} placeholder="Website name" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <input value={newWebUrl} onChange={(e) => setNewWebUrl(e.target.value)} placeholder="https://client-site.com" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select value={newWebProject} onChange={(e) => setNewWebProject(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">Select project...</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={newWebOwner} onChange={(e) => setNewWebOwner(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">Select client owner...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.email}</option>)}
                </select>
                <button
                  onClick={async () => {
                    if (!newWebName || !newWebUrl || !newWebProject || !newWebOwner) return;
                    await api.post("/api/admin/websites", { name: newWebName, url: newWebUrl, projectId: newWebProject, ownerClientId: newWebOwner });
                    setNewWebName(""); setNewWebUrl(""); setNewWebProject(""); setNewWebOwner("");
                    load();
                  }}
                  className="px-3 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-hover"
                >
                  Add Website
                </button>
              </div>
            </div>
          </div>

          {/* Assignments */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
            <h3 className="font-semibold text-gray-800 mb-4">Assignments</h3>
            <p className="text-sm text-gray-500 mb-3">Assign developers to projects. Each project can have one developer.</p>
            <div className="space-y-2">
              {projects.map((p) => {
                const a = assignments.find((x) => x.projectId === p.id);
                const dev = a ? developers.find((d) => d.id === a.developerId) : null;
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={dev?.id ?? ""}
                        onChange={async (e) => {
                          if (e.target.value) {
                            await endpoints.setAssignment(p.id, e.target.value);
                          } else {
                            await endpoints.removeAssignment(p.id);
                          }
                          load();
                        }}
                        className="text-sm px-2 py-1 border border-gray-300 rounded-lg"
                      >
                        <option value="">Unassigned</option>
                        {developers.map((d) => (
                          <option key={d.id} value={d.id}>{d.email}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
