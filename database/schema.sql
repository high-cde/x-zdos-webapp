-- Reference DDL for database/migrations/001_initial.js.
-- Do not apply this file directly; use the explicit node-pg-migrate command.
CREATE TABLE workspaces (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id text PRIMARY KEY,
  oidc_issuer text NOT NULL,
  oidc_subject text NOT NULL,
  email text NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_oidc_identity_unique UNIQUE (oidc_issuer, oidc_subject)
);

CREATE TABLE workspace_memberships (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('viewer','member','manager','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_memberships_pk PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE missions (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  domain text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','blocked','completed','cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  owner_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT missions_owner_membership_fk FOREIGN KEY (workspace_id, owner_id) REFERENCES workspace_memberships(workspace_id,user_id)
);
CREATE INDEX missions_workspace_id_idx ON missions(workspace_id, id);
CREATE INDEX missions_workspace_id_status_idx ON missions(workspace_id, status, id);

CREATE TABLE events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_actor_membership_fk FOREIGN KEY (workspace_id, actor_id) REFERENCES workspace_memberships(workspace_id,user_id)
);
CREATE INDEX events_workspace_id_created_at_idx ON events(workspace_id, created_at);

CREATE TABLE sessions (
  id_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE oidc_transactions (
  id_hash text PRIMARY KEY,
  state text NOT NULL,
  nonce text NOT NULL,
  code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL
);
