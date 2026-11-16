# System test results

A system test uses the whole application the way a user would, with nothing mocked: the real Express app, the real login and session checks, and a real PostgreSQL database. Each case calls the API over HTTP.

Run on **16 Nov 2026**. Script: `server/scripts/system-suite.js` (named so that `npm test` does not pick it up).

## How to run

```
createdb taskmanager_test
psql -d taskmanager_test -f db/schema.sql
cd server
DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/taskmanager_test npm run test:system
```

The script empties most tables, so it refuses to run unless the database name ends in `_test`.

## Result

**18 of 18 system test cases passed.**

| Case | Requirement | What is checked | Result |
|---|---|---|---|
| SYS-01 | TM-F-001 | Register a new account; duplicate email is rejected (409) | PASS |
| SYS-02 | TM-F-002, TM-SR-004 | Login returns a token; wrong password is 401; logout revokes the token | PASS |
| SYS-03 | TM-SR-002 | Passwords are stored as bcrypt hashes, never as plain text | PASS |
| SYS-04 | TM-F-010, TM-F-011, TM-F-013 | Create, edit, complete and reopen a task | PASS |
| SYS-05 | TM-F-014, TM-F-015, TM-F-016 | Search, filter by tag, priority and status, and sort the list | PASS |
| SYS-06 | TM-SR-003 | A user cannot read, edit or delete another user's task (403); missing task is 404 | PASS |
| SYS-07 | TM-F-012, TM-NF-005 | Delete is soft; owner restores it; another user cannot (404) | PASS |
| SYS-08 | TM-NF-005 | Purge removes only tasks deleted over 30 days ago | PASS |
| SYS-09 | TM-F-020, TM-F-021, TM-F-031 | Assign a task to a teammate, add a comment, teammate gets an in-app notification | PASS |
| SYS-10 | TM-F-022 | Share a list with VIEW permission; only the list owner can share | PASS |
| SYS-11 | TM-F-030 | A task due in about 24 hours produces one in-app reminder; running the check again does not repeat it | PASS |
| SYS-12 | TM-F-003 | Five wrong passwords lock the account (423) even for the right password; success earlier resets the count | PASS |
| SYS-13 | TM-F-004 | Password reset: token works once, new password works, old does not | PASS |
| SYS-14 | TM-F-050, TM-F-051, TM-SR-003 | Admin lists, disables and deletes users; a normal user gets 403; admin actions are in the audit log | PASS |
| SYS-15 | TM-F-040 | Dashboard summary returns task counts for the signed-in user | PASS |
| SYS-16 | TM-F-041 | CSV export lists the user's tasks; PDF returns 501; unknown format 400 | PASS |
| SYS-17 | TM-NF-002 | Health probes: liveness is ok; readiness checks the database | PASS |
| SYS-18 | TM-SR-005 | Failed logins are recorded with hashed identifiers; repeated failures raise an alert | PASS |

## Defects found by the system test

| ID | Found by | Defect | Fix | Status |
|---|---|---|---|---|
| SD-1 | SYS-13 | `POST /auth/password-reset/request` returned a server error for any existing account in the real application. The auth router imports `sendPasswordResetEmail` from `mockEmail.js`, but that function was never exported, and the unit tests passed their own mailer so they did not notice. | Added `sendPasswordResetEmail` to `server/src/modules/auth/mockEmail.js` and a unit test (`mockEmail.test.js`) that fails if a mailer is not exported. | Fixed. SYS-13 now passes. |

