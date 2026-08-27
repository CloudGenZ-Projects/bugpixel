/**
 * Reports page - per-project stats, status distribution, avg resolution time.
 */
import { useEffect, useState } from "react";
import { endpoints } from "../api/endpoints.js";

export function ReportsView() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [stats, setStats] = useState<{
    statusCounts: Record<string, number>;
    monthlyStats: { month: string; submitted: number; done: number; cancelled: number; inProgress: number }[];
    avgResolutionHours: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    endpoints.listProjects().then((r) => {
      setProjects(r.projects);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    endpoints.getAnalytics(selectedProject || undefined).then((r) => setStats(r));
  }, [selectedProject]);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const total = stats ? Object.values(stats.statusCounts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
        >
          <option value="">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {!stats ? (
        <p className="text-center py-8 text-gray-500">Loading stats...</p>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total" value={total} color="bg-gray-900" />
            <StatCard label="Submitted" value={stats.statusCounts.Submitted || 0} color="bg-blue-600" />
            <StatCard label="In Progress" value={stats.statusCounts.InProgress || 0} color="bg-amber-500" />
            <StatCard label="Done" value={stats.statusCounts.Done || 0} color="bg-green-600" />
          </div>

          {/* Resolution time */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Average Resolution Time</h3>
            <p className="text-3xl font-bold text-gray-900">
              {stats.avgResolutionHours != null ? `${stats.avgResolutionHours}h` : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-1">From Submitted to Done</p>
          </div>

          {/* Monthly trend */}
          {stats.monthlyStats.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Activity</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-4">Month</th>
                      <th className="py-2 pr-4">Submitted</th>
                      <th className="py-2 pr-4">Done</th>
                      <th className="py-2 pr-4">In Progress</th>
                      <th className="py-2">Cancelled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.monthlyStats.map((m) => (
                      <tr key={m.month} className="border-b border-gray-50">
                        <td className="py-2 pr-4 font-medium text-gray-900">{m.month}</td>
                        <td className="py-2 pr-4 text-blue-600">{m.submitted}</td>
                        <td className="py-2 pr-4 text-green-600">{m.done}</td>
                        <td className="py-2 pr-4 text-amber-600">{m.inProgress}</td>
                        <td className="py-2 text-gray-500">{m.cancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Status distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Status Distribution</h3>
            {total > 0 ? (
              <div className="flex h-4 rounded-full overflow-hidden">
                {(stats.statusCounts.Submitted || 0) > 0 && <div className="bg-blue-500" style={{ width: `${((stats.statusCounts.Submitted || 0) / total) * 100}%` }} />}
                {(stats.statusCounts.InProgress || 0) > 0 && <div className="bg-amber-500" style={{ width: `${((stats.statusCounts.InProgress || 0) / total) * 100}%` }} />}
                {(stats.statusCounts.Done || 0) > 0 && <div className="bg-green-500" style={{ width: `${((stats.statusCounts.Done || 0) / total) * 100}%` }} />}
                {(stats.statusCounts.Cancelled || 0) > 0 && <div className="bg-gray-400" style={{ width: `${((stats.statusCounts.Cancelled || 0) / total) * 100}%` }} />}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No data</p>
            )}
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Submitted</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />In Progress</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Done</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" />Cancelled</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <div className={`h-1 w-8 rounded-full mt-2 ${color}`} />
    </div>
  );
}
