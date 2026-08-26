/**
 * WebsitePicker: lists only the websites the client owns and lets them select one.
 */
import { useEffect, useState } from "react";

import type { Website } from "@crp/shared";
import { endpoints } from "../api/endpoints.js";

export interface WebsitePickerProps {
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

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }
  if (websites === null) {
    return <div className="text-gray-500 animate-pulse">Loading websites...</div>;
  }

  return (
    <section aria-label="website picker">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Choose a website</h2>
      <p className="text-sm text-gray-500 mb-6">
        Select the website you want to request changes on. The inspector will open it in a popup.
      </p>
      {websites.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">🌐</div>
          <p className="text-gray-500">You do not own any websites yet.</p>
          <p className="text-sm text-gray-400 mt-1">Ask an admin to set up a website for you.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {websites.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => onSelect(w)}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-primary/40 hover:bg-primary-light/20 transition text-left group"
            >
              <div className="w-10 h-10 bg-primary-light rounded-lg flex items-center justify-center text-primary text-lg group-hover:bg-primary group-hover:text-white transition">
                🌐
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 group-hover:text-primary truncate">
                  {w.name}
                </div>
                <div className="text-sm text-gray-400 truncate">{w.url}</div>
              </div>
              <svg className="w-5 h-5 text-gray-300 group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
