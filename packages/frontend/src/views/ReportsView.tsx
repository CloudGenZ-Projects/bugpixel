/**
 * Reports view: monthly stats, summary cards, and status breakdown.
 */
import { useEffect, useState } from "react";
import { endpoints } from "../api/endpoints.js";

interface MonthlyStats {
  month: string;
  submitted: number;
  done: number;
  rejected: number;
  inProgress: number;
}

export function ReportsView() {
  const [monthly, setMonthly] = useState<MonthlyStats[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([endpoints.monthlyStats(), endpoints.summaryStats()]).then(
      ([m, s]) => {
        setMonthly(m.stats);
        setSummary(s.counts);
        setLoading(false);
      }
    );
  }, []);

  if (loading) return <div className="text-gray-500 animate-pulse">Loading reports...</div>;

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  const done = summary["Done"] ?? 0;
  const closureRate = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reports & Analytics</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Total Requests" value={total} color="text-gray-900" />
        <SummaryCard label="In Progress" value={summary["InProgress"] ?? 0} color="text-yellow-600" />
        <SummaryCard label="Completed" value={done} color="text-green-600" />
        <SummaryCard label="Closure Rate" value={`${closureRate}%`} color="text-primary" />
      </div>

      {/* Status breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Status Breakdown</h2>
        <div className="space-y-3">
          {Object.entries(summary).map(([status, count]) => (
            <div key={status} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-48">{status}</span>
              <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: total > 0 ? `${(count / total) * 100}%` : "0%" }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700 w-12 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Monthly Activity</h2>
        </div>
        {monthly.length === 0 ? (
          <p className="p-6 text-gray-500 text-center">No data yet. Submit some requests!</p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Submitted</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">In Progress</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Done</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rejected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monthly.map((row) => (
                <tr key={row.month} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-800 font-medium">{row.month}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{row.submitted}</td>
                  <td className="px-6 py-3 text-sm text-right text-yellow-600">{row.inProgress}</td>
                  <td className="px-6 py-3 text-sm text-right text-green-600">{row.done}</td>
                  <td className="px-6 py-3 text-sm text-right text-red-600">{row.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
