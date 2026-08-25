/**
 * ChangeComposer: the in-progress change-request composer.
 *
 * - The per-item form is driven by Change_Type: Add -> single content field;
 *   Delete -> single content field with NO attachments; Update -> current +
 *   updated value fields (Req 8.2-8.4, 8.8).
 * - Description and required content are validated client-side; on error the
 *   entered values are retained (Req 8.5, 8.6).
 * - "Done" adds the item (with its component reference + screenshot from the
 *   latest inspector capture) via POST /api/change-requests/:id/items and lets
 *   the client continue with another item (Req 8.9, 10.1, 10.2).
 * - "Submit" is disabled while there are zero items (Req 10.4) and otherwise
 *   submits the request (Req 11.1).
 *
 * Screenshot note: the inspector provides a screenshot data URL. The backend's
 * addItem accepts screenshot metadata by opaque storage key; we pass a
 * capture-derived key plus mime/width/height. (The design's separate
 * screenshots-upload route is not used; the item carries its screenshot inline.)
 *
 * Requirements: 8.1-8.6, 8.8, 8.9, 10.1, 10.2, 10.4, 11.1
 */
import { useState } from "react";

import { ChangeType, MAX_CONTENT_LENGTH, MAX_DESCRIPTION_LENGTH, type ChangeRequest, type Website } from "@crp/shared";
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

export function ChangeComposer({
  website,
  draft,
  latestCapture,
  onConsumedCapture,
  onDone,
}: ChangeComposerProps) {
  const [changeType, setChangeType] = useState<ChangeType>(ChangeType.Add);
  const [description, setDescription] = useState("");
  const [contentAdd, setContentAdd] = useState("");
  const [contentDelete, setContentDelete] = useState("");
  const [contentCurrent, setContentCurrent] = useState("");
  const [contentUpdated, setContentUpdated] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [itemCount, setItemCount] = useState(0);
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setDescription("");
    setContentAdd("");
    setContentDelete("");
    setContentCurrent("");
    setContentUpdated("");
    setErrors({});
  }

  /** Client-side validation mirroring the backend rules; retains values. */
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
      if (!nonBlankWithin(contentCurrent, MAX_CONTENT_LENGTH))
        e.contentCurrent = "Current value is required.";
      if (!nonBlankWithin(contentUpdated, MAX_CONTENT_LENGTH))
        e.contentUpdated = "Updated value is required.";
    }
    return Object.keys(e).length > 0 ? e : null;
  }

  async function onAddItem(continueAfter: boolean) {
    const invalid = validate();
    if (invalid) {
      setErrors(invalid); // values are retained in state (Req 8.5, 8.6)
      return;
    }
    if (!latestCapture) {
      setErrors({ form: "Select a component with the inspector before adding an item." });
      return;
    }

    const body: AddItemBody = {
      changeType,
      description,
      contentAdd: changeType === ChangeType.Add ? contentAdd : null,
      contentDelete: changeType === ChangeType.Delete ? contentDelete : null,
      contentCurrent: changeType === ChangeType.Update ? contentCurrent : null,
      contentUpdated: changeType === ChangeType.Update ? contentUpdated : null,
      component: {
        selector: latestCapture.selector,
        htmlMeta: latestCapture.htmlMeta,
      },
      screenshot: {
        storageKey: latestCapture.screenshot.dataUrl,
        mime: latestCapture.screenshot.mime,
        width: latestCapture.screenshot.width,
        height: latestCapture.screenshot.height,
      },
    };

    setBusy(true);
    try {
      await endpoints.addItem(draft.id, body);
      setItemCount((n) => n + 1);
      onConsumedCapture();
      resetForm();
      if (!continueAfter) {
        // Nothing else; the client can now submit or add another.
      }
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "Could not add the change item.";
      setErrors((prev) => ({ ...prev, form: message }));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    setBusy(true);
    try {
      await endpoints.submit(draft.id);
      onDone();
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "Could not submit the request.";
      setErrors((prev) => ({ ...prev, form: message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="change composer">
      <h2>Compose changes for {website.name}</h2>
      <p>
        Items added: <span data-testid="item-count">{itemCount}</span>
      </p>

      <form
        aria-label="change item form"
        onSubmit={(e) => {
          e.preventDefault();
          void onAddItem(true);
        }}
      >
        <label>
          Change type
          <select
            value={changeType}
            onChange={(e) => setChangeType(e.target.value as ChangeType)}
          >
            <option value={ChangeType.Add}>Add</option>
            <option value={ChangeType.Update}>Update</option>
            <option value={ChangeType.Delete}>Delete</option>
          </select>
        </label>

        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="description"
          />
        </label>
        {errors.description && <p role="alert">{errors.description}</p>}

        {changeType === ChangeType.Add && (
          <label>
            Content to add
            <textarea
              value={contentAdd}
              onChange={(e) => setContentAdd(e.target.value)}
              aria-label="content to add"
            />
          </label>
        )}
        {errors.contentAdd && <p role="alert">{errors.contentAdd}</p>}

        {changeType === ChangeType.Delete && (
          <label>
            Content to remove
            <textarea
              value={contentDelete}
              onChange={(e) => setContentDelete(e.target.value)}
              aria-label="content to remove"
            />
          </label>
        )}
        {errors.contentDelete && <p role="alert">{errors.contentDelete}</p>}

        {changeType === ChangeType.Update && (
          <>
            <label>
              Current value
              <textarea
                value={contentCurrent}
                onChange={(e) => setContentCurrent(e.target.value)}
                aria-label="current value"
              />
            </label>
            {errors.contentCurrent && <p role="alert">{errors.contentCurrent}</p>}
            <label>
              Updated value
              <textarea
                value={contentUpdated}
                onChange={(e) => setContentUpdated(e.target.value)}
                aria-label="updated value"
              />
            </label>
            {errors.contentUpdated && <p role="alert">{errors.contentUpdated}</p>}
          </>
        )}

        {/* Attachments only for Add/Update (hidden for Delete). */}
        <AttachmentInput changeType={changeType} onFilesAccepted={() => {}} />

        {errors.form && <p role="alert">{errors.form}</p>}

        <div>
          <button type="button" disabled={busy} onClick={() => void onAddItem(false)}>
            Done (add item)
          </button>
          <button type="button" disabled={busy} onClick={() => void onAddItem(true)}>
            Add another
          </button>
        </div>
      </form>

      <button
        type="button"
        disabled={busy || itemCount === 0}
        onClick={() => void onSubmit()}
        aria-label="submit change request"
      >
        Submit
      </button>
    </section>
  );
}
