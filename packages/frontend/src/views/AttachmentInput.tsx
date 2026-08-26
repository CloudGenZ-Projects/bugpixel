/**
 * AttachmentInput: shown only for Add/Update (hidden for Delete).
 * Client-side PDF/image + <=10MB pre-check.
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

  if (changeType === ChangeType.Delete) return null;

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    const ok: File[] = [];
    for (const f of files) {
      if (!isSupported(f.type)) {
        setError(`Unsupported file: ${f.name}. Only PDF or images allowed.`);
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
    <div className="mt-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Attachments <span className="text-gray-400 font-normal">(optional, PDF or image, ≤ 10 MB)</span>
      </label>
      <input
        type="file"
        multiple
        accept="application/pdf,image/*"
        onChange={onChange}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-200 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 file:cursor-pointer"
      />
      {accepted.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {accepted.map((n) => (
            <span key={n} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-md">
              📎 {n}
            </span>
          ))}
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 mt-1">{error}</p>
      )}
    </div>
  );
}
