-- Change Request Portal — SQLite schema (DDL)
--
-- Mirrors the design ERD. Conventions:
--   * All primary keys are TEXT UUID strings.
--   * All timestamps are ISO-8601 text.
--   * Column names are snake_case here and map to the camelCase fields of the
--     @crp/shared entity interfaces (e.g. owner_client_id <-> ownerClientId).
--   * Foreign keys are enforced (PRAGMA foreign_keys = ON is set by createDb).
--
-- Requirements: 2.1 (single role per user), 14.3 (at most one active assignment
-- per project), 13.2 (developer removal cascades assignments).

-- user: any authenticated actor. Holds exactly one role (Requirement 2.1).
CREATE TABLE IF NOT EXISTS user (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('Client', 'Developer', 'Admin')),
  created_at    TEXT NOT NULL
);

-- project: the unit of work a Website belongs to and Developers are assigned to.
CREATE TABLE IF NOT EXISTS project (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- website: owned by exactly one Client, belongs to exactly one Project.
CREATE TABLE IF NOT EXISTS website (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES project (id),
  owner_client_id TEXT NOT NULL REFERENCES user (id),
  name            TEXT NOT NULL,
  url             TEXT NOT NULL
);

-- assignment: an Admin-managed Developer <-> Project association.
-- UNIQUE(project_id) enforces at most one active assignment per Project (14.3).
-- ON DELETE CASCADE on developer_id removes assignments when a developer is
-- removed from the roster (13.2).
CREATE TABLE IF NOT EXISTS assignment (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL UNIQUE REFERENCES project (id),
  developer_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL
);

-- change_request: a report composed of one or more change_items for one website.
CREATE TABLE IF NOT EXISTS change_request (
  id           TEXT PRIMARY KEY,
  website_id   TEXT NOT NULL REFERENCES website (id),
  client_id    TEXT NOT NULL REFERENCES user (id),
  status       TEXT NOT NULL
                 CHECK (status IN ('Draft', 'Submitted', 'AwaitingDeveloperAssignment')),
  created_at   TEXT NOT NULL,
  submitted_at TEXT
);

-- change_item: a single requested change; only the content columns relevant to
-- change_type are populated. Deleting a request removes its items.
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

-- component_reference: the selected on-page component. selector/html_meta optional.
CREATE TABLE IF NOT EXISTS component_reference (
  id             TEXT PRIMARY KEY,
  change_item_id TEXT NOT NULL REFERENCES change_item (id) ON DELETE CASCADE,
  selector       TEXT,
  html_meta      TEXT
);

-- screenshot: the required capture for a change_item, referenced by storage_key.
CREATE TABLE IF NOT EXISTS screenshot (
  id             TEXT PRIMARY KEY,
  change_item_id TEXT NOT NULL REFERENCES change_item (id) ON DELETE CASCADE,
  storage_key    TEXT NOT NULL,
  mime           TEXT NOT NULL,
  width          INTEGER NOT NULL,
  height         INTEGER NOT NULL
);

-- attachment: optional PDF/image on an Add or Update change_item.
CREATE TABLE IF NOT EXISTS attachment (
  id             TEXT PRIMARY KEY,
  change_item_id TEXT NOT NULL REFERENCES change_item (id) ON DELETE CASCADE,
  storage_key    TEXT NOT NULL,
  filename       TEXT NOT NULL,
  mime           TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL
);

-- Helpful indexes for the role-scoped listing queries used downstream.
CREATE INDEX IF NOT EXISTS idx_website_owner_client ON website (owner_client_id);
CREATE INDEX IF NOT EXISTS idx_website_project ON website (project_id);
CREATE INDEX IF NOT EXISTS idx_change_request_client ON change_request (client_id);
CREATE INDEX IF NOT EXISTS idx_change_request_website ON change_request (website_id);
CREATE INDEX IF NOT EXISTS idx_change_item_request ON change_item (change_request_id);
CREATE INDEX IF NOT EXISTS idx_assignment_developer ON assignment (developer_id);
