/**
 * Change request detail: shows items with screenshots, notes section, and
 * status controls.
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import { endpoints, type ChangeRequestDetail as Detail, type EnrichedNote } from "../api/endpoints.js";
import { useSession } from "../auth/SessionContext.js";

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Submitted: "bg-blue-100 text-blue-700",
  AwaitingDeveloperAssignment: "bg-purple-100 text-purple-700",
  InProgress: "bg-yellow-100 text-yellow-700",
  Done: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

export function ChangeRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notes, setNotes] = useState<EnrichedNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    endpoints
      .changeRequestDetail(id)
      .then(setDetail)
      .catch(() => setError("Unable to load this change request."));
    endpoints.listNotes(id).then((r) => setNotes(r.notes));
  }, [id]);

  async function postNote() {
    if (!id || !noteText.trim()) return;
    const { note } = await endpoints.addNote(id, noteText);
    setNotes((prev) => [...prev, note]);
    setNoteText("");
  }

  if (error) return <div className="text-center py-8"><p className="text-red-600">{error}</p></div>;
  if (!detail) return <div className="text-gray-500 animate-pulse py-8">Loading...</div>;

  const { request, items } = detail;

  return (
    <div className="max-w-4xl">
      <Link to="/" className="text-sm text-primary hover:text-primary-hover mb-4 inline-block">
        ← Back to dashboard
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-gray-900">
            Request #{request.id.slice(0, 8)}
          </h1>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_STYLES[request.status] ?? ""}`}>
            {request.status}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>Priority: <strong className="text-gray-700">{request.priority}</strong></span>
          <span>Submitted: {request.submittedAt ? new Date(request.submittedAt).toLocaleString() : "—"}</span>
          {request.dueDate && <span>Due: {new Date(request.dueDate).toLocaleDateString()}</span>}
          <span>Items: <strong>{items.length}</strong></span>
        </div>
      </div>

      {/* Change items */}
      <div className="space-y-4 mb-8">
        {items.map(({ item, componentReference, screenshot, attachments }, idx) => (
          <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                #{idx + 1}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                item.changeType === "Add" ? "bg-green-100 text-green-700" :
                item.changeType === "Delete" ? "bg-red-100 text-red-700" :
                "bg-blue-100 text-blue-700"
              }`}>
                {item.changeType}
              </span>
              {componentReference?.selector && (
                <code className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded">
                  {componentReference.selector}
                </code>
              )}
            </div>

            <p className="text-gray-800 mb-3">{item.description}</p>

            {/* Type-specific content */}
            {item.contentAdd && (
              <div className="bg-green-50 border border-green-100 rounded-lg p-3 mb-3">
                <span className="text-xs text-green-600 font-medium">Content to add:</span>
                <p className="text-sm text-green-800 mt-1">{item.contentAdd}</p>
              </div>
            )}
            {item.contentCurrent && (
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-3">
                <span className="text-xs text-gray-500 font-medium">Current:</span>
                <p className="text-sm text-gray-700 mt-1">{item.contentCurrent}</p>
              </div>
            )}
            {item.contentUpdated && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
                <span className="text-xs text-blue-600 font-medium">Updated:</span>
                <p className="text-sm text-blue-800 mt-1">{item.contentUpdated}</p>
              </div>
            )}
            {item.contentDelete && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-3">
                <span className="text-xs text-red-600 font-medium">To remove:</span>
                <p className="text-sm text-red-800 mt-1">{item.contentDelete}</p>
              </div>
            )}

            {/* Screenshot */}
            {screenshot && (
              <div className="mt-3">
                <img
                  src={endpoints.fileUrl(screenshot.storageKey)}
                  alt="Screenshot"
                  className="rounded-lg border border-gray-200 max-h-64 object-contain"
                />
              </div>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={endpoints.fileUrl(a.storageKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100"
                  >
                    📎 {a.filename} ({(a.sizeBytes / 1024).toFixed(0)} KB)
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Notes / Comments */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Notes & Discussion</h2>

        {notes.length === 0 && (
          <p className="text-sm text-gray-400 mb-4">No notes yet. Start the conversation.</p>
        )}

        <div className="space-y-3 mb-4">
          {notes.map((note) => (
            <div key={note.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {note.authorEmail[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{note.authorEmail}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(note.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{note.content}</p>
              </div>
            </div>
          ))}
        </div>

        {session && (
          <div className="flex gap-2">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && postNote()}
              placeholder="Add a note..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
            <button
              onClick={postNote}
              disabled={!noteText.trim()}
              className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-hover disabled:opacity-50"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
