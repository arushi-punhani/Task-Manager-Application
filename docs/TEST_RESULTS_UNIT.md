# Unit test results

Run on **16 Nov 2026** against the latest `main` plus the fix described in [TEST_RESULTS_SYSTEM.md](TEST_RESULTS_SYSTEM.md) (defect SD-1). Tool: the built-in Node.js test runner (`node --test`, Node 22). The tests use a mock database, so they run anywhere with no setup.

## How to run

```
cd server
npm install
npm test
```

## Result

**173 test cases in 26 test files: 173 passed, 0 failed.** (The runner's own total reads 174 because it also counts the shared helper file `_taskTestHelpers.js` as one entry.)

| Test file | What it covers | Tests | Passed |
|---|---|---|---|
| `accessibilityResponsive.test.js` | Responsive layout and accessibility (TM-NF-004, TM-NF-006) | 5 | 5 |
| `admin.audit.test.js` | Audit log (TM-F-051) | 3 | 3 |
| `admin.test.js` | Admin user management (TM-F-050) | 9 | 9 |
| `auth.registration-login.test.js` | Registration and login (TM-F-001, TM-F-002) | 6 | 6 |
| `auth.test.js` | Auth, lockout, reset, HTTPS (TM-F-003, TM-F-004, TM-SR-001) | 5 | 5 |
| `collab.test.js` | Assign and comments (TM-F-020, TM-F-021) | 5 | 5 |
| `csv.test.js` | CSV formatting (TM-F-041) | 4 | 4 |
| `dashboard.test.js` | Dashboard (TM-F-040) | 3 | 3 |
| `dueDateReminders.test.js` | Due-date reminders (TM-F-030) | 7 | 7 |
| `export.test.js` | CSV export route (TM-F-041) | 3 | 3 |
| `failedLoginMonitor.test.js` | Failed-login monitor (TM-SR-005) | 4 | 4 |
| `failedLoginSecurity.test.js` | Failed-login security (TM-SR-005) | 2 | 2 |
| `health.test.js` | Health probes (TM-NF-002) | 3 | 3 |
| `listSharing.test.js` | List sharing (TM-F-022) | 8 | 8 |
| `mockEmail.test.js` | Mock mail service (TM-F-001, TM-F-004, TM-F-031) | 2 | 2 |
| `notifications.test.js` | Notifications (TM-F-031) | 4 | 4 |
| `seed-demo.test.js` | Demo seed script | 2 | 2 |
| `taskAccess.test.js` | Task access control (TM-SR-003) | 17 | 17 |
| `tasks.complete.test.js` | Complete and reopen (TM-F-013) | 6 | 6 |
| `tasks.create.test.js` | Create task (TM-F-010) | 11 | 11 |
| `tasks.delete.test.js` | Soft delete (TM-F-012) | 5 | 5 |
| `tasks.edit.test.js` | Edit task (TM-F-011) | 12 | 12 |
| `tasks.list.test.js` | Task list (TM-F-015) | 2 | 2 |
| `tasks.purge-restore.test.js` | Restore and purge (TM-NF-005) | 7 | 7 |
| `tasks.search-sort.test.js` | Search, filter, sort (TM-F-015, TM-F-016) | 25 | 25 |
| `tasks.tags.test.js` | Tags (TM-F-014) | 13 | 13 |
| **Total** | | **173** | **173** |

## Limits (stated honestly)

- Unit tests use a mock database, so they cannot prove that the SQL is valid. That is why the system tests and the real-database scripts exist.
- Only the server is unit tested. The React client has no automated unit tests; it was checked by hand in a browser.
- Code coverage for these tests is in [TEST_COVERAGE.md](TEST_COVERAGE.md).
