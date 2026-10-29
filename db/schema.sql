-- Task Manager Application: PostgreSQL schema (from SAD section 3.6 data entities)

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  status        VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  email_verified BOOLEAN     NOT NULL DEFAULT FALSE,
  failed_count  INTEGER      NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  token_id   VARCHAR(36) PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE email_verification_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

CREATE TABLE tasks (
  id           SERIAL PRIMARY KEY,
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  due_date     TIMESTAMPTZ,
  priority     VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  status       VARCHAR(15) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ            -- soft delete; purge after 30 days (TM-NF-005)
);
CREATE INDEX idx_tasks_owner    ON tasks(owner_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status   ON tasks(status);
CREATE INDEX idx_tasks_due      ON tasks(due_date);
CREATE INDEX idx_tasks_priority ON tasks(priority);

CREATE TABLE tags (
  id       SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name     VARCHAR(50) NOT NULL,
  UNIQUE (owner_id, name)
);

CREATE TABLE task_tags (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX idx_task_tags_tag ON task_tags(tag_id);

CREATE TABLE task_lists (
  id       SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name     VARCHAR(100) NOT NULL
);

CREATE TABLE list_shares (
  id         SERIAL PRIMARY KEY,
  list_id    INTEGER NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission VARCHAR(5) NOT NULL CHECK (permission IN ('VIEW', 'EDIT')),
  UNIQUE (list_id, user_id)
);

-- Optional link from a task to a list (needed for list sharing, TM-F-022)
ALTER TABLE tasks ADD COLUMN list_id INTEGER REFERENCES task_lists(id) ON DELETE SET NULL;

CREATE TABLE comments (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_task ON comments(task_id);

CREATE TABLE notifications (
  id       SERIAL PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type     VARCHAR(30) NOT NULL,      -- e.g. DUE_REMINDER, TASK_ASSIGNED
  task_id  INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  channel  VARCHAR(10) NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'EMAIL')),
  sent_at  TIMESTAMPTZ,
  read_at  TIMESTAMPTZ
);
CREATE INDEX idx_notifications_user ON notifications(user_id);

CREATE TABLE password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ              -- single use
);

CREATE TABLE audit_log (
  id        SERIAL PRIMARY KEY,
  actor_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action    VARCHAR(50) NOT NULL,     -- e.g. USER_DISABLED, USER_DELETED, LOGIN_FAILED
  target_id INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome   VARCHAR(20) NOT NULL DEFAULT 'SUCCESS'
);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
