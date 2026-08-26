/**
 * ChangeComposer: compose change items with priority, proper button UX, and styling.
 */
import { useState } from "react";

import {
  ChangeType,
  Priority,
  MAX_CONTENT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  type ChangeRequest,
  type Website,
} from "@crp/shared";
import { ApiClientError } from "../api/client.js";
import { endpoints, type AddItemBody } from "../api/endpoints.js";
import { AttachmentInput } from "./AttachmentInput.js";
import type { CapturedSelection } from "../inspector/WebsiteOpenController.js";

export interface ChangeComposerProps {
  website: Website;
  draft: ChangeRequest;
  latestCapture: CapturedSelection | null;
  onConsumedCapture: () => void;
  onDone: () => void;
}

interface FieldErrors {
  description?: string;
  contentAdd?: string;
  contentDelete?: string;
  contentCurrent?: string;
  contentUpdated?: string;
  form?: string;
}

function nonBlankWithin(value: string, max: number): boolean {
  return value.trim().length > 0 && value.length <= max;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

export function ChangeComposer({
  website,
  draft,
  latestCapture,
  onConsumedCapture,
  onDone,
}: ChangeComposerProps) {
  const [changeType, setChangeType] = useState<ChangeType>(ChangeType.Add);
  const [priority, setPriority] = useState<Priority>(Priority.Medium);
  const [description, setDescription] = useState("");
  const [contentAdd, setContentAdd] = useState("");
  const [contentDelete, setContentDelete] = useState("");
  const [contentCurrent, setContentCurrent] = useState("");
  const [contentUpdated, setContentUpdated] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [itemCount, setItemCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  function resetForm() {
    setDescription("");
    setContentAdd("");
    setContentDelete("");
    setContentCurrent("");
    setContentUpdated("");
    setErrors({});
  }

  function validate(): FieldErrors | null {
    const e: FieldErrors = {};
    if (!nonBlankWithin(description, MAX_DESCRIPTION_LENGTH)) {
      e.description = "A description of 1 to 2000 characters is required.";
    }
    if (changeType === ChangeType.Add && !nonBlankWithin(contentAdd, MAX_CONTENT_LENGTH)) {
      e.contentAdd = "Content to add is required.";
    }
    if (changeType === ChangeType.Delete && !nonBlankWithin(contentDelete, MAX_CONTENT_LENGTH)) {
      e.contentDelete = "Content to remove is required.";
    }
    if (changeType === ChangeType.Update) {
      if (!nonBlankWithin(contentCurrent, MAX_CONTENT_LENGTH)) e.contentCurrent = "Current value is required.";
      if (!nonBlankWithin(contentUpdated, MAX_CONTENT_LENGTH)) e.contentUpdated = "Updated value is required.";
    }
    return Object.keys(e).length > 0 ? e : null;
  }

  async function addItem() {
    const invalid = validate();
    if (invalid) { setErrors(invalid); return; }
    if (!latestCapture) {
      setErrors({ form: "Select a component with the inspector before adding an item." });
      return;
    }

    setBusy(true);
    try {
      const { storageKey } = await endpoints.uploadScreenshot(
        draft.id, latestCapture.screenshot.dataUrl, latestCapture.screenshot.mime
      );

      const body: AddItemBody = {
        changeType,
        description,
        contentAdd: changeType === ChangeType.Add ? contentAdd : null,
        contentDelete: changeType === ChangeType.Delete ? contentDelete : null,
        contentCurrent: changeType === ChangeType.Update ? contentCurrent : null,
        contentUpdated: changeType === ChangeType.Update ? contentUpdated : null,
        component: { selector: latestCapture.selector, htmlMeta: latestCapture.htmlMeta },
        screenshot: { storageKey, mime: latestCapture.screenshot.mime, width: latestCapture.screenshot.width, height: latestCapture.screenshot.height },
      };
      const { item } = await endpoints.addItem(draft.id, body);

      for (const file of pendingFiles) {
        const b64 = await fileToBase64(file);
        await endpoints.uploadAttachment(draft.id, item.id, b64, file.type, file.name);
      }

      setItemCount((n) => n + 1);
      setPendingFiles([]);
      onConsumedCapture();
      resetForm();
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Could not add the change item.";
      setErrors((prev) => ({ ...prev, form: message }));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    // Update priority before submitting
    if (priority !== Priority.Medium) {
      await endpoints.updatePriority(draft.id, priority);
    }
    setBusy(true);
    try {
      await endpoints.submit(draft.id);
      onDone();
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Could not submit the request.";
      setErrors((prev) => ({ ...prev, form: message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Change Request</h1>
          <p className="text-sm text-gray-500 mt-1">
            {website.name} — <span className="text-gray-400">{website.url}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {itemCount} item{itemCount !== 1 ? "s" : ""} added
          </span>
          <button
            type="button"
            disabled={busy || itemCount === 0}
            onClick={() => void onSubmit()}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
          >
            Submit Request
          </button>
        </div>
      </div>

      {/* Capture status */}
      {latestCapture ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-3">
          <span className="text-green-600 text-lg">✓</span>
          <div className="flex-1">
            <span className="text-sm text-green-800 font-medium">Component selected</span>
            {latestCapture.selector && (
              <code className="ml-2 text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                {latestCapture.selector}
              </code>
            )}
          </div>
          <img
            src={latestCapture.screenshot.dataUrl}
            alt="Captured"
            className="w-16 h-12 object-cover rounded border border-green-200"
          />
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <span className="text-sm text-amber-800">
            👆 Click a component in the popup window to capture it, then fill in the form below.
          </span>
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {errors.form && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {errors.form}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Change Type</label>
            <select
              value={changeType}
              onChange={(e) => setChangeType(e.target.value as ChangeType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="Add">Add (new content)</option>
              <option value="Update">Update (modify existing)</option>
              <option value="Delete">Delete (remove content)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="Critical">🔴 Critical</option>
              <option value="High">🟠 High</option>
              <option value="Medium">🔵 Medium</option>
              <option value="Low">⚪ Low</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-gray-400 font-normal">(what should change?)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y"
            placeholder="Describe what you want changed..."
          />
          {errors.description && <p className="text-sm text-red-600 mt-1">{errors.description}</p>}
        </div>

        {changeType === ChangeType.Add && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Content to add</label>
            <textarea
              value={contentAdd}
              onChange={(e) => setContentAdd(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y"
              placeholder="The new content that should appear..."
            />
            {errors.contentAdd && <p className="text-sm text-red-600 mt-1">{errors.contentAdd}</p>}
          </div>
        )}

        {changeType === ChangeType.Delete && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Content to remove</label>
            <textarea
              value={contentDelete}
              onChange={(e) => setContentDelete(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y"
              placeholder="The content that should be removed..."
            />
            {errors.contentDelete && <p className="text-sm text-red-600 mt-1">{errors.contentDelete}</p>}
          </div>
        )}

        {changeType === ChangeType.Update && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current value</label>
              <textarea
                value={contentCurrent}
                onChange={(e) => setContentCurrent(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y"
                placeholder="What it currently says..."
              />
              {errors.contentCurrent && <p className="text-sm text-red-600 mt-1">{errors.contentCurrent}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Updated value</label>
              <textarea
                value={contentUpdated}
                onChange={(e) => setContentUpdated(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y"
                placeholder="What it should say instead..."
              />
              {errors.contentUpdated && <p className="text-sm text-red-600 mt-1">{errors.contentUpdated}</p>}
            </div>
          </div>
        )}

        <AttachmentInput changeType={changeType} onFilesAccepted={setPendingFiles} />

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-100">
          <button
            type="button"
            disabled={busy}
            onClick={() => void addItem()}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50 transition"
          >
            {itemCount === 0 ? "Add Item" : "Add Another Item"}
          </button>
          <span className="text-xs text-gray-400">
            You can add multiple items before submitting
          </span>
        </div>
      </div>
    </div>
  );
}
