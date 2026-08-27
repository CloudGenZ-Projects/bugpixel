/**
 * Change Request Detail page (v2) - status controls, gallery, metadata, activity, notes.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChangeRequestStatus, Priority } from "@crp/shared";
import type { ChangeRequest, Screenshot, Attachment, Note } from "@crp/shared";
import { endpoints, type ChangeRequestDetailResponse } from "../api/endpoints.js";
import { useSession } from "../auth/SessionContext.js";
import { ImageLightbox } from "./ImageLightbox.js";

const STATUS_BADGE: Record<string, string> = {
  Submitted: "bg-blue-100 text-blue-800",
  InProgress: "bg-amber-100 text-amber-800",
  Done: "bg-green-100 text-green-800",
  Cancelled: "bg-gray-100 text-gray-600",
};

export function ChangeRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ChangeRequestDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSending, setNoteSending] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    const d = await endpoints.getChangeRequestDetail(id);
    setDetail(d);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  if (loading || !detail) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const { request: cr, screenshots, attachments, notes, activity } = detail;
  const role = session?.user.role;

  function fileUrl(key: string) {
    return `/files/${key.slice(0, 2)}/${key.slice(2, 4)}/${key}`;
  }

  async function changeStatus(newStatus: ChangeRequestStatus) {
    await endpoints.updateStatus(cr.id, newStatus);
    load();
  }

  async function sendNote() {
    if (!noteText.trim()) return;
    setNoteSending(true);
    await endpoints.addNote(cr.id, noteText.trim());
    setNoteText("");
    setNoteSending(false);
    load();
  }

  // Parse htmlMeta
  let meta: Record<string, string> = {};
  if (cr.htmlMeta) {
    try { meta = JSON.parse(cr.htmlMeta); } catch {}
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700 mb-2">← Back</button>
          <h1 className="text-xl font-bold text-gray-900 line-clamp-2">{cr.description}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${STATUS_BADGE[cr.status]}`}>
              {cr.status}
            </span>
            <span className="text-sm text-gray-500">{cr.changeType}</span>
            <span className="text-sm text-gray-500">{cr.priority}</span>
            <span className="text-sm text-gray-400">{new Date(cr.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Status actions */}
        <div className="flex gap-2">
          {cr.status === "Submitted" && (role === "Developer" || role === "Admin") && (
            <button onClick={() => changeStatus(ChangeRequestStatus.InProgress)} className="px-3 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600">Start</button>
          )}
          {cr.status === "InProgress" && (role === "Developer" || role === "Admin") && (
            <button onClick={() => changeStatus(ChangeRequestStatus.Done)} className="px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600">Done</button>
          )}
          {cr.status !== "Cancelled" && cr.status !== "Done" && (
            <button onClick={() => changeStatus(ChangeRequestStatus.Cancelled)} className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300">Cancel</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Content fields */}
          {(cr.contentAdd || cr.contentCurrent || cr.contentUpdated || cr.contentDelete) && (
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Content Details</h3>
              {cr.contentAdd && <div className="mb-2"><span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">Add</span><p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{cr.contentAdd}</p></div>}
              {cr.contentCurrent && <div className="mb-2"><span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded">Current</span><p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{cr.contentCurrent}</p></div>}
              {cr.contentUpdated && <div className="mb-2"><span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">Updated</span><p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{cr.contentUpdated}</p></div>}
              {cr.contentDelete && <div className="mb-2"><span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded">Delete</span><p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{cr.contentDelete}</p></div>}
            </section>
          )}

          {/* Screenshots gallery */}
          {screenshots.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Screenshots ({screenshots.length})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {screenshots.map((s) => (
                  <img
                    key={s.id}
                    src={fileUrl(s.storageKey)}
                    alt="Screenshot"
                    className="rounded-lg border border-gray-200 cursor-zoom-in hover:shadow-md transition-shadow object-cover aspect-video"
                    onClick={() => setLightbox(fileUrl(s.storageKey))}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Notes */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Notes ({notes.length})</h3>
            {notes.length === 0 && <p className="text-sm text-gray-400 italic">No notes yet.</p>}
            <div className="space-y-3 mb-4">
              {notes.map((n) => (
                <div key={n.id} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-800">{n.content}</p>
                  {n.imageStorageKey && (
                    <img src={fileUrl(n.imageStorageKey)} alt="Note image" className="mt-2 max-w-[200px] rounded cursor-zoom-in" onClick={() => setLightbox(fileUrl(n.imageStorageKey!))} />
                  )}
                  <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendNote(); } }}
              />
              <button onClick={sendNote} disabled={noteSending || !noteText.trim()} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">Send</button>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Metadata panel */}
          {Object.keys(meta).length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Browser Info</h3>
              <dl className="space-y-2 text-xs">
                {meta.browser && <div><dt className="text-gray-500">Browser</dt><dd className="text-gray-900">{meta.browser}</dd></div>}
                {meta.os && <div><dt className="text-gray-500">OS</dt><dd className="text-gray-900">{meta.os}</dd></div>}
                {meta.viewport && <div><dt className="text-gray-500">Viewport</dt><dd className="text-gray-900">{meta.viewport}</dd></div>}
                {meta.screen && <div><dt className="text-gray-500">Screen</dt><dd className="text-gray-900">{meta.screen}</dd></div>}
                {meta.url && <div><dt className="text-gray-500">URL</dt><dd className="text-gray-900 break-all">{meta.url}</dd></div>}
                {meta.devicePixelRatio && <div><dt className="text-gray-500">DPR</dt><dd className="text-gray-900">{meta.devicePixelRatio}</dd></div>}
              </dl>
            </section>
          )}

          {/* Selector */}
          {cr.selector && (
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Element Selector</h3>
              <code className="text-xs bg-gray-100 p-2 rounded block break-all">{cr.selector}</code>
            </section>
          )}

          {/* Activity timeline */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Activity</h3>
            {activity.length === 0 && <p className="text-sm text-gray-400 italic">No activity.</p>}
            <div className="space-y-3">
              {activity.map((a) => (
                <div key={a.id} className="flex gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                  <div>
                    <span className="font-medium text-gray-700">{a.action}</span>
                    {a.detail && <span className="text-gray-500 ml-1">{a.detail}</span>}
                    <p className="text-gray-400">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Due date */}
          {cr.dueDate && (
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Due Date</h3>
              <p className="text-sm text-gray-900">{new Date(cr.dueDate).toLocaleDateString()}</p>
            </section>
          )}
        </div>
      </div>

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
