/**
 * SQLite schema DDL for the Change Request Portal, embedded as a string.
 *
 * The canonical, human-readable copy also lives in `schema.sql` next to this
 * file. Duplicated here so the schema can be applied at runtime and in tests
 * without resolving a file path.
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

CREATE TABLE IF NOT EXISTS change_request (
  id           TEXT PRIMARY KEY,
  website_id   TEXT NOT NULL REFERENCES website (id),
  client_id    TEXT NOT NULL REFERENCES user (id),
  status       TEXT NOT NULL
                 CHECK (status IN ('Draft', 'Submitted', 'AwaitingDeveloperAssignment',
                                   'InProgress', 'Done', 'Rejected')),
  priority     TEXT NOT NULL DEFAULT 'Medium'
                 CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
  created_at   TEXT NOT NULL,
  submitted_at TEXT,
  due_date     TEXT
);

CREATE TABLE IF NOT EXISTS change_item (
  id                TEXT PRIMARY KEY,
  change_request_id TEXT NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
  change_type       TEXT NOT NULL CHECK (change_type IN ('Add', 'Update', 'Delete')),
  description       TEXT NOT NULL,
  content_add       TEXT,
  content_current   TEXT,
  content_updated   TEXT,
  content_delete    TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS component_reference (
  id             TEXT PRIMARY KEY,
  change_item_id TEXT NOT NULL REFERENCES change_item (id) ON DELETE CASCADE,
  selector       TEXT,
  html_meta      TEXT
);

CREATE TABLE IF NOT EXISTS screenshot (
  id             TEXT PRIMARY KEY,
  change_item_id TEXT NOT NULL REFERENCES change_item (id) ON DELETE CASCADE,
  storage_key    TEXT NOT NULL,
  mime           TEXT NOT NULL,
  width          INTEGER NOT NULL,
  height         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachment (
  id             TEXT PRIMARY KEY,
  change_item_id TEXT NOT NULL REFERENCES change_item (id) ON DELETE CASCADE,
  storage_key    TEXT NOT NULL,
  filename       TEXT NOT NULL,
  mime           TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS note (
  id                TEXT PRIMARY KEY,
  change_request_id TEXT NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
  author_id         TEXT NOT NULL REFERENCES user (id),
  content           TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_website_owner_client ON website (owner_client_id);
CREATE INDEX IF NOT EXISTS idx_website_project ON website (project_id);
CREATE INDEX IF NOT EXISTS idx_change_request_client ON change_request (client_id);
CREATE INDEX IF NOT EXISTS idx_change_request_website ON change_request (website_id);
CREATE INDEX IF NOT EXISTS idx_change_request_status ON change_request (status);
CREATE INDEX IF NOT EXISTS idx_change_item_request ON change_item (change_request_id);
CREATE INDEX IF NOT EXISTS idx_assignment_developer ON assignment (developer_id);
CREATE INDEX IF NOT EXISTS idx_note_request ON note (change_request_id);
`;
