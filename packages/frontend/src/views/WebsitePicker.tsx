/**
 * WebsitePicker: lists only the websites the client owns (GET /api/websites) and
 * lets the client select exactly one to start a change request (Req 4.1, 4.4).
 */
import { useEffect, useState } from "react";

import type { Website } from "@crp/shared";
import { endpoints } from "../api/endpoints.js";

export interface WebsitePickerProps {
  /** Invoked with the chosen website when the client selects one. */
  onSelect: (website: Website) => void;
}

export function WebsitePicker({ onSelect }: WebsitePickerProps) {
  const [websites, setWebsites] = useState<Website[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    endpoints
      .websites()
      .then((r) => setWebsites(r.websites))
      .catch(() => setError("Unable to load your websites."));
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (websites === null) return <div>Loading…</div>;

  return (
    <section aria-label="website picker">
      <h2>Choose a website</h2>
      {websites.length === 0 ? (
        <p role="status">You do not own any websites yet.</p>
      ) : (
        <ul>
          {websites.map((w) => (
            <li key={w.id}>
              <button type="button" onClick={() => onSelect(w)}>
                {w.name} — {w.url}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
