-- Sprint 2 / TM-SR-005: privacy-preserving failed-login telemetry.
-- Run once against the existing project database. Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS auth_security_events (
  id           BIGSERIAL PRIMARY KEY,
  event_type   VARCHAR(30) NOT NULL CHECK (event_type IN ('FAILED_LOGIN', 'BRUTE_FORCE_ALERT')),
  subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('ACCOUNT', 'IP')),
  subject_hash CHAR(64) NOT NULL,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  remote_ip    INET,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_security_subject_window
  ON auth_security_events(subject_type, subject_hash, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_security_ip_window
  ON auth_security_events(remote_ip, event_type, occurred_at DESC);

COMMIT;
