'use strict';
const crypto = require('node:crypto');

const WINDOW_MINUTES = 10;
const ALERT_THRESHOLD = 5;

function digest(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function createFailedLoginMonitor({ db, secret = process.env.SECURITY_LOG_SALT || process.env.JWT_SECRET, logger = console } = {}) {
  const database = db || require('../../config/db');
  if (!secret) throw new Error('SECURITY_LOG_SALT or JWT_SECRET must be configured for login security monitoring.');

  async function recordFailedLogin({ email, userId = null, ipAddress = null } = {}) {
    const normalisedEmail = String(email || '').trim().toLowerCase();
    const ip = String(ipAddress || 'unknown').trim() || 'unknown';
    // Only keyed hashes of identifiers are persisted; raw emails are never written to security events.
    const subjects = [
      { type: 'ACCOUNT', hash: digest(secret, `account:${normalisedEmail || 'unknown'}`) },
      { type: 'IP', hash: digest(secret, `ip:${ip}`) },
    ].sort((a, b) => a.hash.localeCompare(b.hash));

    const client = typeof database.connect === 'function' ? await database.connect() : database;
    const newAlerts = [];
    let counts = { account: 0, ip: 0 };
    try {
      await client.query('BEGIN');
      // Serialize concurrent attempts for the same subject so the threshold alert is emitted once.
      for (const subject of subjects) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [subject.hash]);
      }
      for (const subject of subjects) {
        await client.query(
          `INSERT INTO auth_security_events
             (event_type, subject_type, subject_hash, user_id, remote_ip, occurred_at)
           VALUES ('FAILED_LOGIN', $1, $2, $3, NULLIF($4, 'unknown')::inet, now())`,
          [subject.type, subject.hash, userId, ip]
        );
      }

      for (const subject of subjects) {
        const countResult = await client.query(
          `SELECT COUNT(*)::int AS count
             FROM auth_security_events
            WHERE event_type = 'FAILED_LOGIN'
              AND subject_type = $1
              AND subject_hash = $2
              AND occurred_at >= now() - ($3::int * interval '1 minute')`,
          [subject.type, subject.hash, WINDOW_MINUTES]
        );
        counts[subject.type.toLowerCase()] = Number(countResult.rows[0]?.count) || 0;
      }

      // Prefer account-scoped evidence; use IP scope when attempts are distributed over accounts.
      const candidate = counts.account >= ALERT_THRESHOLD
        ? subjects.find((subject) => subject.type === 'ACCOUNT')
        : counts.ip >= ALERT_THRESHOLD
          ? subjects.find((subject) => subject.type === 'IP')
          : null;
      if (candidate) {
        const existingAlert = await client.query(
          `SELECT 1 FROM auth_security_events
            WHERE event_type = 'BRUTE_FORCE_ALERT'
              AND subject_type = $1
              AND subject_hash = $2
              AND occurred_at >= now() - ($3::int * interval '1 minute')
            LIMIT 1`,
          [candidate.type, candidate.hash, WINDOW_MINUTES]
        );
        if (existingAlert.rowCount === 0) {
          const alertCount = counts[candidate.type.toLowerCase()];
          await client.query(
            `INSERT INTO auth_security_events
               (event_type, subject_type, subject_hash, user_id, remote_ip, occurred_at)
             VALUES ('BRUTE_FORCE_ALERT', $1, $2, $3, NULLIF($4, 'unknown')::inet, now())`,
            [candidate.type, candidate.hash, userId, ip]
          );
          await client.query(
            `INSERT INTO audit_log (actor_id, action, target_id, timestamp, outcome)
             VALUES (NULL, 'BRUTE_FORCE_ALERT', $1, now(), 'ALERT')`,
            [userId]
          );
          newAlerts.push({ subjectType: candidate.type, count: alertCount });
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
      throw error;
    } finally {
      if (typeof client.release === 'function') {
        client.release();
      }
    }

    for (const alert of newAlerts) {
      // Structured event is the application-log alert sink; no credential or raw identifier is logged.
      logger.warn(JSON.stringify({
        event: 'SECURITY_ALERT',
        alertType: 'BRUTE_FORCE_LOGIN',
        subjectType: alert.subjectType,
        failedAttemptsInWindow: alert.count,
        windowMinutes: WINDOW_MINUTES,
        userId: userId || null,
        occurredAt: new Date().toISOString(),
      }));
    }

    return { counts, alertsCreated: newAlerts.length };
  }

  return { recordFailedLogin };
}

async function recordFailedLogin(input, options = {}) {
  const secret = options.secret || process.env.SECURITY_LOG_SALT || process.env.JWT_SECRET;
  if (!secret) throw new Error('SECURITY_LOG_SALT or JWT_SECRET must be configured for login security monitoring.');
  return createFailedLoginMonitor({ db: options.db, secret, logger: options.logger }).recordFailedLogin(input);
}

module.exports = { createFailedLoginMonitor, recordFailedLogin, WINDOW_MINUTES, ALERT_THRESHOLD };
