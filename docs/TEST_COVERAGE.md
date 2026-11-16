# Code coverage report (line, branch, function)

Measured on **16 Nov 2026** with the Node.js built-in coverage (V8), over the whole server source (`server/src`), while running the unit tests.

## How to run

```
cd server
npm run test:coverage
```

## Overall result

| Measure | Coverage |
|---|---|
| **Line coverage** | **87.14%** |
| **Branch coverage** | **81.19%** |
| **Function coverage** | **82.93%** |

## Per file

| File | Line % | Branch % | Function % | Uncovered lines |
|---|---|---|---|---|
| `src/app.js` | 81.82 | 50.00 | 66.67 | 18-19 27-32 |
| `src/config/db.js` | 100.00 | 100.00 | 100.00 | - |
| `src/jobs/dueDateReminders.js` | 62.63 | 100.00 | 50.00 | 56-92 |
| `src/jobs/purgeDeletedTasks.js` | 100.00 | 100.00 | 100.00 | - |
| `src/middleware/auth.js` | 71.70 | 66.67 | 75.00 | 11-16 31-39 |
| `src/middleware/errorHandler.js` | 100.00 | 66.67 | 100.00 | - |
| `src/middleware/taskAccess.js` | 96.30 | 92.86 | 100.00 | 48-49 |
| `src/modules/admin/routes.js` | 96.92 | 68.63 | 100.00 | 171-172 196-197 215-216 244-245 |
| `src/modules/auth/failedLoginMonitor.js` | 94.31 | 60.71 | 85.71 | 90-91 117-121 |
| `src/modules/auth/mockEmail.js` | 57.89 | 100.00 | 33.33 | 1-3 9-13 |
| `src/modules/auth/routes.js` | 71.77 | 64.86 | 50.00 | 55-56 82-83 107-111 163-164 175-176 180-201 205-239 |
| `src/modules/collab/routes.js` | 72.88 | 76.47 | 62.50 | 38-48 53-71 76-104 131-134 145-146 165-166 170-177 |
| `src/modules/notif/routes.js` | 100.00 | 100.00 | 100.00 | - |
| `src/modules/report/csv.js` | 100.00 | 88.24 | 100.00 | - |
| `src/modules/report/routes.js` | 98.36 | 81.25 | 100.00 | 110-111 |
| `src/modules/tasks/routes.js` | 96.12 | 88.00 | 100.00 | 119-120 135-136 163-164 242-243 278-279 298-299 |
| `src/modules/tasks/validation.js` | 100.00 | 96.25 | 100.00 | - |
| **All files** | **87.14** | **81.19** | **82.93** | |

## How to read this

- **Line coverage** is the share of code lines that ran during the tests. **Branch coverage** is the share of `if` / `else` and other decision paths that ran. **Function coverage** is the share of functions that were called.
- The lowest files are `src/app.js` (the HTTPS check and database error path), `src/jobs/dueDateReminders.js` (the timer, which the unit tests do not start), `src/middleware/auth.js`, `src/modules/auth/routes.js` (the password reset routes at lines 175 to 239), `src/modules/collab/routes.js` and `src/modules/auth/mockEmail.js` (the console printing lines).
- Several of those uncovered paths are exercised by the system tests against the real database (for example password reset in SYS-13, assigning in SYS-09 and sharing in SYS-10), but the figures above count the unit tests only. We did not merge the two measurements, so the real coverage is somewhat higher than shown.
- These figures cover the server only. The React client has no automated tests, so it has no coverage figure.
- Coverage shows which code ran, not that the checks are strong. The 100% files still depend on what each test asserts.
