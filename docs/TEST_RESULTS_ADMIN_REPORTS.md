# Test results: dashboard and admin (Sprint 1, issues #25 and #48)

## Scope and traceability

This report records the automated coverage for the three test-plan identifiers required by issue #48 and the audit-logging requirement in issue #25.

| Test Plan case | Requirement | Automated coverage | Expected result |
|---|---|---|---|
| TC-Report-01 | TM-F-040 dashboard status and overdue summary | `server/test/dashboard.test.js` | Dashboard returns numeric pending, in-progress, completed and overdue counts for the signed-in user; an empty result returns zero counts. |
| TC-Admin-01 | TM-F-050 admin account management | `server/test/admin.test.js` | Admin can list users with bounded pagination and public fields; non-admin users are denied. Existing tests also cover disable/enable/delete operations and self-protection. |
| TC-Admin-02 | TM-F-051 audit log of admin actions | `server/test/admin.test.js`, `server/test/admin.audit.test.js` | Successful user-list/status/delete actions write audit rows tied to the acting admin and action type. Audit rows are retrievable with actor identity, action, target, timestamp, outcome and pagination. Invalid pagination and non-admin access are rejected. |

## Audit-log data

The `audit_log` table stores `actor_id`, `action`, `target_id`, `timestamp` (database default `now()`), and `outcome`. The retrieval endpoint joins `users` to return `actorEmail` alongside `actorId`. Audit rows for a deleted target remain available because `target_id` is not a foreign key. `actor_id` uses `ON DELETE SET NULL` in the existing schema.

## Execution record

A pre-change complete server-suite run on 30 October 2026 reported **85 tests passed, 0 failed**. That run predates the three new audit-log retrieval tests added in this change and must not be represented as verification of those new tests.

After applying this patch, run from `server`:

```powershell
npm test
```

Record the new suite total and confirm zero failures here before treating the updated implementation as fully verified or merging it. The dashboard and existing admin write tests were included in the earlier 85-test run; the new audit-log read endpoint tests require this fresh run.

## Test environment and limits

- Test runner: Node.js built-in `node:test`.
- Automated route tests use injected/mock database queries.
- The separate manual PostgreSQL check previously performed for the admin account workflow confirmed `USER_DISABLED`, `USER_ENABLED`, and `USER_DELETED` rows with actor ID 1 and `SUCCESS` outcomes.
- Automated tests do not replace an integration test against a clean PostgreSQL database.
