/**
 * Per-project Kanban board with status columns.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChangeRequest, Screenshot } from "@crp/shared";
import { endpoints } from "../api/endpoints.js";
import { ImageLightbox } from "./ImageLightbox.js";

const STATUS_COLUMNS = ["Submitted", "InProgress", "Done", "Cancelled"] as const;
const STATUS_COLORS: Record<string, string> = {
  Submitted: "bg-blue-50 border-blue-200",
  InProgress: "bg-amber-50 border-amber-200",
  Done: "bg-green-50 border-green-200",
  Cancelled: "bg-gray-50 border-gray-200",
};
const STATUS_LABELS: Record<string, string> = {
  Submitted: "📥 Submitted",
  InProgress: "🔄 In Progress",
  Done: "✅ Done",
  Cancelled: "🚫 Cancelled",
};
const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-blue-100 text-blue-800",
  Low: "bg-gray-100 text-gray-600",
};

interface EnrichedRequest extends ChangeRequest {
  screenshots: Screenshot[];
}

interface Props {
  projectId: string;
  projectName: string;
}

export function ProjectBoard({ projectId, projectName }: Props) {
  const [requests, setRequests] = useState<EnrichedRequest[]>([]);
  const [websites, setWebsites] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Load website names for tags
    endpoints.listWebsites().then((res) => {
      const map: Record<string, string> = {};
      for (const w of res.websites) {
        map[w.id] = w.name;
      }
      setWebsites(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const fetcher =
      projectId === "ALL"
        ? endpoints.listChangeRequests()
        : endpoints.listProjectChangeRequests(projectId);

    fetcher
      .then((res) => {
        const raw = (res.changeRequests as any) || [];
        const normalized: EnrichedRequest[] = raw.map((r: any) => ({
          ...r,
          screenshots: Array.isArray(r.screenshots) ? r.screenshots : [],
        }));
        setRequests(normalized);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading board...</div>;
  }

  const columns = STATUS_COLUMNS.map((status) => ({
    status,
    items: requests.filter((r) => r.status === status),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{projectName}</h2>
        <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
          {requests.length} total {requests.length === 1 ? "request" : "requests"}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map(({ status, items }) => (
          <div key={status} className={`rounded-xl border p-3 min-h-[200px] ${STATUS_COLORS[status]}`}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center justify-between">
              {STATUS_LABELS[status]}
              <span className="text-xs font-normal text-gray-500 bg-white px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            </h3>
            <div className="space-y-2">
              {items.length === 0 && (
                <p className="text-xs text-gray-400 italic text-center py-4">No requests</p>
              )}
              {items.map((cr) => {
                const ssList = Array.isArray(cr.screenshots) ? cr.screenshots : [];
                return (
                  <div
                    key={cr.id}
                    onClick={() => navigate(`/requests/${cr.id}`)}
                    className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-gray-200 transition-all"
                  >
                    <p className="text-sm text-gray-900 font-medium line-clamp-2 mb-2">
                      {cr.description}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {websites[cr.websiteId] && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                          {websites[cr.websiteId]}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[cr.priority]}`}>
                        {cr.priority}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(cr.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {ssList.length > 0 && (
                      <div className="mt-2 flex gap-1">
                        {ssList.slice(0, 2).map((s) => (
                          <img
                            key={s.id}
                            src={`/files/${s.storageKey.slice(0, 2)}/${s.storageKey.slice(2, 4)}/${s.storageKey}`}
                            alt="Screenshot"
                            className="w-12 h-12 rounded object-cover border border-gray-200 cursor-zoom-in"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightbox(`/files/${s.storageKey.slice(0, 2)}/${s.storageKey.slice(2, 4)}/${s.storageKey}`);
                            }}
                          />
                        ))}
                        {ssList.length > 2 && (
                          <span className="text-xs text-gray-400 self-center">+{ssList.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
