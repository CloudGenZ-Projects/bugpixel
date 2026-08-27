/**
 * Admin dashboard - all project boards + management panel.
 */
import { useEffect, useState } from "react";
import { endpoints } from "../api/endpoints.js";
import { ProjectBoard } from "./ProjectBoard.js";

type Tab = "boards" | "manage";

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("boards");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Manage state
  const [users, setUsers] = useState<{ id: string; email: string; role: string }[]>([]);
  const [websites, setWebsites] = useState<{ id: string; name: string; url: string; projectId: string }[]>([]);
  const [newProject, setNewProject] = useState("");
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "Client" });
  const [newWebsite, setNewWebsite] = useState({ projectId: "", ownerClientId: "", name: "", url: "" });
  const [newAssign, setNewAssign] = useState({ projectId: "", developerId: "" });

  useEffect(() => {
    endpoints.listProjects().then((res) => {
      setProjects(res.projects);
      if (res.projects.length > 0) setSelected(res.projects[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function loadManage() {
    endpoints.listUsers().then((r) => setUsers(r.users));
    endpoints.listWebsites().then((r) => setWebsites(r.websites as any));
  }

  useEffect(() => { if (tab === "manage") loadManage(); }, [tab]);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const current = projects.find((p) => p.id === selected);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("boards")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "boards" ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Boards
          </button>
          <button
            onClick={() => setTab("manage")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "manage" ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            Manage
          </button>
        </div>
      </div>

      {tab === "boards" && (
        <div>
          {projects.length > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${selected === p.id ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {selected && current && <ProjectBoard projectId={selected} projectName={current.name} />}
          {projects.length === 0 && (
            <p className="text-center py-8 text-gray-500">No projects. Create one in the Manage tab.</p>
          )}
        </div>
      )}

      {tab === "manage" && (
        <div className="space-y-6">
          {/* Create Project */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Create Project</h3>
            <div className="flex gap-2">
              <input
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                placeholder="Project name"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={async () => {
                  if (!newProject.trim()) return;
                  const r = await endpoints.createProject(newProject.trim());
                  setProjects([...projects, r.project]);
                  setNewProject("");
                }}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover"
              >
                Create
              </button>
            </div>
          </section>

          {/* Create User */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Create User</h3>
            <div className="flex gap-2 flex-wrap">
              <input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="Email" className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[150px]" />
              <input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Password" type="password" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36" />
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option>Client</option><option>Developer</option><option>Admin</option>
              </select>
              <button onClick={async () => {
                await endpoints.createUser(newUser.email, newUser.password, newUser.role);
                setNewUser({ email: "", password: "", role: "Client" });
                loadManage();
              }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">Create</button>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Users: {users.map((u) => `${u.email} (${u.role})`).join(", ") || "none"}
            </div>
          </section>

          {/* Create Website */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Create Website</h3>
            <div className="flex gap-2 flex-wrap">
              <select value={newWebsite.projectId} onChange={(e) => setNewWebsite({ ...newWebsite, projectId: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Project...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={newWebsite.ownerClientId} onChange={(e) => setNewWebsite({ ...newWebsite, ownerClientId: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Owner...</option>
                {users.filter((u) => u.role === "Client").map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
              </select>
              <input value={newWebsite.name} onChange={(e) => setNewWebsite({ ...newWebsite, name: e.target.value })} placeholder="Site name" className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[120px]" />
              <input value={newWebsite.url} onChange={(e) => setNewWebsite({ ...newWebsite, url: e.target.value })} placeholder="https://..." className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[150px]" />
              <button onClick={async () => {
                await endpoints.createWebsite(newWebsite.projectId, newWebsite.ownerClientId, newWebsite.name, newWebsite.url);
                setNewWebsite({ projectId: "", ownerClientId: "", name: "", url: "" });
                loadManage();
              }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">Create</button>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Websites: {websites.map((w) => w.name).join(", ") || "none"}
            </div>
          </section>

          {/* Assign Developer */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Assign Developer</h3>
            <div className="flex gap-2">
              <select value={newAssign.projectId} onChange={(e) => setNewAssign({ ...newAssign, projectId: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Project...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={newAssign.developerId} onChange={(e) => setNewAssign({ ...newAssign, developerId: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Developer...</option>
                {users.filter((u) => u.role === "Developer").map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
              </select>
              <button onClick={async () => {
                await endpoints.createAssignment(newAssign.projectId, newAssign.developerId);
                setNewAssign({ projectId: "", developerId: "" });
              }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">Assign</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
