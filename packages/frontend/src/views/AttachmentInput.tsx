/**
 * AttachmentInput: shown only for Add/Update change types (hidden for Delete,
 * Req 8.8, 9.5). Performs a client-side PDF/image + <=10MB pre-check and reports
 * accepted files upward; rejected files surface an inline validation error
 * (Req 9.2, 9.3, 9.4).
 */
import { useState, type ChangeEvent } from "react";

import { ChangeType, MAX_ATTACHMENT_SIZE_BYTES } from "@crp/shared";

export interface AttachmentInputProps {
  changeType: ChangeType;
  onFilesAccepted: (files: File[]) => void;
}

function isSupported(mime: string): boolean {
  return mime === "application/pdf" || mime.startsWith("image/");
}

export function AttachmentInput({ changeType, onFilesAccepted }: AttachmentInputProps) {
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);

  // Delete change items omit the attachment control entirely (Req 8.8, 9.5).
  if (changeType === ChangeType.Delete) return null;

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    const ok: File[] = [];
    for (const f of files) {
      if (!isSupported(f.type)) {
        setError(`Unsupported file type: ${f.name}. Only PDF or image files are allowed.`);
        return;
      }
      if (f.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setError(`${f.name} exceeds the 10 MB limit.`);
        return;
      }
      ok.push(f);
    }
    setAccepted(ok.map((f) => f.name));
    onFilesAccepted(ok);
  }

  return (
    <div>
      <label>
        Attachments (PDF or image, ≤ 10 MB)
        <input
          type="file"
          multiple
          accept="application/pdf,image/*"
          onChange={onChange}
          aria-label="attachments"
        />
      </label>
      {accepted.length > 0 && (
        <ul>
          {accepted.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}
    </div>
  );
}
