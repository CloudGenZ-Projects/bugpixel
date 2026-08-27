/**
 * Searchable Project Selector Dropdown.
 * Minimalist, clean design suitable for 2 to 100+ projects.
 * Supports "All Projects (Combined)" and real-time search filtering.
 */
import { useEffect, useRef, useState } from "react";

export interface ProjectOption {
  id: string;
  name: string;
  count?: number;
}

interface Props {
  projects: ProjectOption[];
  selectedId: string | "ALL";
  onSelect: (projectId: string | "ALL") => void;
  showAllOption?: boolean;
}

export function ProjectSelector({
  projects,
  selectedId,
  onSelect,
  showAllOption = true,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      // Auto-focus search input
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Filter projects by search query
  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const selectedProject = projects.find((p) => p.id === selectedId);
  const selectedLabel =
    selectedId === "ALL"
      ? "All Projects (Combined)"
      : selectedProject?.name ?? "Select Project";

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Selector Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 rounded-lg text-sm font-medium text-gray-800 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <span className="text-gray-400">
          {selectedId === "ALL" ? "🌐" : "📁"}
        </span>
        <span className="max-w-[200px] truncate">{selectedLabel}</span>
        <span className="text-xs text-gray-400 font-normal">
          ({selectedId === "ALL" ? projects.length : 1})
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 animate-in fade-in duration-100">
          {/* Search Input */}
          <div className="px-2.5 pb-2">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:bg-white focus:outline-none focus:border-primary transition-colors"
              />
              <svg
                className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
            {/* All Projects Option */}
            {showAllOption && (!query || "all projects combined".includes(query.toLowerCase())) && (
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelect("ALL");
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors ${
                    selectedId === "ALL"
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span>🌐</span>
                    <span className="truncate">All Projects (Combined)</span>
                  </div>
                  <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    {projects.length}
                  </span>
                </button>
              </div>
            )}

            {/* Individual Projects */}
            <div className="p-1 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-gray-400">
                  No projects found
                </div>
              ) : (
                filtered.map((p) => {
                  const isSelected = selectedId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onSelect(p.id);
                        setIsOpen(false);
                        setQuery("");
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors ${
                        isSelected
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-gray-400">📁</span>
                        <span className="truncate">{p.name}</span>
                      </div>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-primary shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
