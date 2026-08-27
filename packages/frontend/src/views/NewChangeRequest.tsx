/**
 * New Change Request - compose form with Capture Screenshot button (v2).
 * No auto-popup. Client picks website, fills form, optionally captures screenshots, submits.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChangeType, Priority } from "@crp/shared";
import { endpoints } from "../api/endpoints.js";
import { WebsiteOpenController } from "../inspector/WebsiteOpenController.js";

interface ScreenshotPreview {
  data: string; // base64 data URL
  mime: string;
  width: number;
  height: number;
}

export function NewChangeRequest() {
  const navigate = useNavigate();
  const [websites, setWebsites] = useState<{ id: string; name: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [websiteId, setWebsiteId] = useState("");
  const [changeType, setChangeType] = useState<string>("Update");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("Medium");
  const [contentAdd, setContentAdd] = useState("");
  const [contentCurrent, setContentCurrent] = useState("");
  const [contentUpdated, setContentUpdated] = useState("");
  const [contentDelete, setContentDelete] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selector, setSelector] = useState<string | null>(null);
  const [htmlMeta, setHtmlMeta] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotPreview[]>([]);

  useEffect(() => {
    endpoints.listWebsites().then((res) => {
      setWebsites(res.websites);
      if (res.websites.length > 0) setWebsiteId(res.websites[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Capture screenshot via inspector popup
  async function captureScreenshot() {
    if (!websiteId) return;
    const website = websites.find((w) => w.id === websiteId);
    if (!website) return;

    try {
      const controller = new WebsiteOpenController({
        websiteId,
        websiteUrl: website.url,
        onCapture: (capture) => {
          setScreenshots((prev) => [
            ...prev,
            {
              data: capture.screenshot.dataUrl,
              mime: capture.screenshot.mime,
              width: capture.screenshot.width,
              height: capture.screenshot.height,
            },
          ]);
          if (capture.selector) setSelector(capture.selector);
          if (capture.browserInfo || capture.htmlMeta) {
            setHtmlMeta(
              JSON.stringify({
                ...capture.browserInfo,
                html: capture.htmlMeta,
              })
            );
          }
        },
      });
      await controller.open();
    } catch (e: any) {
      setError(e.message || "Failed to open inspector");
    }
  }

  function removeScreenshot(idx: number) {
    setScreenshots((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!websiteId || !description.trim()) {
      setError("Website and description are required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const { changeRequest } = await endpoints.createChangeRequest({
        websiteId,
        changeType,
        description: description.trim(),
        priority,
        contentAdd: changeType === "Add" ? contentAdd || null : null,
        contentCurrent: changeType === "Update" ? contentCurrent || null : null,
        contentUpdated: changeType === "Update" ? contentUpdated || null : null,
        contentDelete: changeType === "Delete" ? contentDelete || null : null,
        dueDate: dueDate || null,
        selector: selector || undefined,
        htmlMeta: htmlMeta || undefined,
      });

      // Upload screenshots
      for (const ss of screenshots) {
        await endpoints.uploadScreenshot(changeRequest.id, ss.data, ss.mime, ss.width, ss.height);
      }

      navigate(`/requests/${changeRequest.id}`);
    } catch (e: any) {
      setError(e.message || "Failed to create request");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  if (websites.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">🌐</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">No websites configured</h2>
        <p className="text-gray-500">Ask your admin to add a website to your project.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Change Request</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Website */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
          <select value={websiteId} onChange={(e) => setWebsiteId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {websites.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.url})</option>)}
          </select>
        </div>

        {/* Change Type + Priority row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Change Type</label>
            <select value={changeType} onChange={(e) => setChangeType(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {Object.values(ChangeType).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {Object.values(Priority).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs to change?"
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
            required
          />
        </div>

        {/* Content fields (conditional on type) */}
        {changeType === "Add" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content to Add</label>
            <textarea value={contentAdd} onChange={(e) => setContentAdd(e.target.value)} placeholder="Text/content to add..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y" />
          </div>
        )}
        {changeType === "Update" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Content</label>
              <textarea value={contentCurrent} onChange={(e) => setContentCurrent(e.target.value)} placeholder="What's there now..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Updated Content</label>
              <textarea value={contentUpdated} onChange={(e) => setContentUpdated(e.target.value)} placeholder="What it should say..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y" />
            </div>
          </>
        )}
        {changeType === "Delete" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content to Delete</label>
            <textarea value={contentDelete} onChange={(e) => setContentDelete(e.target.value)} placeholder="What to remove..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y" />
          </div>
        )}

        {/* Due Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (optional)</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        {/* Screenshots */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Screenshots</label>
          <div className="flex flex-wrap gap-3 mb-3">
            {screenshots.map((ss, i) => (
              <div key={i} className="relative group">
                <img src={ss.data} alt={`Screenshot ${i + 1}`} className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
                <button
                  type="button"
                  onClick={() => removeScreenshot(i)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={captureScreenshot}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            📸 Capture Screenshot
          </button>
          <p className="text-xs text-gray-400 mt-1">Opens the website for element selection. Up to 10 screenshots.</p>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-gray-100">
          <button
            type="submit"
            disabled={submitting || !description.trim()}
            className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
