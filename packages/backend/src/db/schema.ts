/**
 * BugPixel schema v2 - Flattened model (1 request = 1 change)
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('Client', 'Developer', 'Admin')),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS website (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES project (id),
  owner_client_id TEXT NOT NULL REFERENCES user (id),
  name            TEXT NOT NULL,
  url             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignment (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL UNIQUE REFERENCES project (id),
  developer_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL
);

-- change_request: one request = one change. No child items table.
CREATE TABLE IF NOT EXISTS change_request (
  id              TEXT PRIMARY KEY,
  website_id      TEXT NOT NULL REFERENCES website (id),
  client_id       TEXT NOT NULL REFERENCES user (id),
  status          TEXT NOT NULL CHECK (status IN ('Submitted', 'InProgress', 'Done', 'Cancelled')),
  priority        TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
  change_type     TEXT NOT NULL CHECK (change_type IN ('Add', 'Update', 'Delete')),
  description     TEXT NOT NULL,
  content_add     TEXT,
  content_current TEXT,
  content_updated TEXT,
  content_delete  TEXT,
  selector        TEXT,
  html_meta       TEXT,
  created_at      TEXT NOT NULL,
  due_date        TEXT
);

-- screenshot: multiple per request (different angles/states of same issue)
CREATE TABLE IF NOT EXISTS screenshot (
  id                TEXT PRIMARY KEY,
  change_request_id TEXT NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
  storage_key       TEXT NOT NULL,
  mime              TEXT NOT NULL,
  width             INTEGER NOT NULL,
  height            INTEGER NOT NULL,
  created_at        TEXT NOT NULL
);

-- attachment: optional files on a request
CREATE TABLE IF NOT EXISTS attachment (
  id                TEXT PRIMARY KEY,
  change_request_id TEXT NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
  storage_key       TEXT NOT NULL,
  filename          TEXT NOT NULL,
  mime              TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL
);

-- note: conversation on a change request (supports text + optional image)
CREATE TABLE IF NOT EXISTS note (
  id                TEXT PRIMARY KEY,
  change_request_id TEXT NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
  author_id         TEXT NOT NULL REFERENCES user (id),
  content           TEXT NOT NULL,
  image_storage_key TEXT,
  created_at        TEXT NOT NULL
);

-- activity: audit log of status transitions
CREATE TABLE IF NOT EXISTS activity (
  id                TEXT PRIMARY KEY,
  change_request_id TEXT NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
  actor_id          TEXT NOT NULL REFERENCES user (id),
  action            TEXT NOT NULL,
  detail            TEXT,
  created_at        TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_website_owner_client ON website (owner_client_id);
CREATE INDEX IF NOT EXISTS idx_website_project ON website (project_id);
CREATE INDEX IF NOT EXISTS idx_change_request_client ON change_request (client_id);
CREATE INDEX IF NOT EXISTS idx_change_request_website ON change_request (website_id);
CREATE INDEX IF NOT EXISTS idx_change_request_status ON change_request (status);
CREATE INDEX IF NOT EXISTS idx_screenshot_request ON screenshot (change_request_id);
CREATE INDEX IF NOT EXISTS idx_attachment_request ON attachment (change_request_id);
CREATE INDEX IF NOT EXISTS idx_assignment_developer ON assignment (developer_id);
CREATE INDEX IF NOT EXISTS idx_note_request ON note (change_request_id);
CREATE INDEX IF NOT EXISTS idx_activity_request ON activity (change_request_id);
`;
