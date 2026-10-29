# Test results: task features (Sprint 1, card TEST-S1-TASKS)

Recorded 29 Oct 2026. Covers the Test Plan cases for tasks and task access: TC-Task-01 to TC-Task-04 and TC-Sec-03.

## 1. Automated unit and route tests (mock database)

Run with `cd server && npm test`. These run in CI on every pull request.

| Test Plan case | Requirement | Test file | Tests | Result |
|---|---|---|---|---|
| TC-Task-01 Create task | TM-F-010 | `server/test/tasks.create.test.js`, `tasks.list.test.js` | 11 + 2 | Pass |
| TC-Task-02 Edit task | TM-F-011 | `server/test/tasks.edit.test.js` | 12 | Pass |
| TC-Task-03 Delete task (confirmation, soft delete, logged) | TM-F-012 | `server/test/tasks.delete.test.js` | 5 | Pass |
| TC-Task-04 Complete / reopen | TM-F-013 | `server/test/tasks.complete.test.js` | 6 | Pass |
| TC-Sec-03 Access control (403 on other users' tasks) | TM-SR-003 | `server/test/taskAccess.test.js`, plus the 403 cases in each file above | 17 | Pass |

The whole server suite (all modules) is 69 tests, 69 passing.

Not covered yet (Sprint 2): TC-Task-05 (categories and tags), TC-Task-06 (search and filter), TC-Task-07 (sort).

## 2. Check against a real PostgreSQL database

Mock tests cannot prove the SQL is valid, so `server/scripts/smoke-tasks.js` runs the real task routes against a real database loaded from `db/schema.sql`, with five users (owner, stranger, VIEW share, EDIT share, assignee).

```
createdb taskmanager_test
psql -d taskmanager_test -f db/schema.sql
DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/taskmanager_test node server/scripts/smoke-tasks.js
```

It refuses to run unless the database name ends in `_test`, because it empties tables.

Result on 29 Oct 2026: **28 of 28 checks passed.** The checks cover create (201 and 400), the list (owner, stranger and shared user), edit by owner and EDIT share, 403 for a stranger, a VIEW share and the assignee, 404 for a missing task, complete and reopen with the completion timestamp, 409 when reopening a task that is not completed, delete by the owner only, the row kept with `deleted_at` set, exactly one `TASK_DELETED` audit entry, and 404 on a second delete or on editing a deleted task.

This check found one bug that the mock tests missed: changing a task's status in an edit failed in PostgreSQL ("inconsistent types deduced for parameter"). It was fixed in the edit commit (the status parameter is cast to text).

## 3. Check in a browser

The Tasks page (`/`) was run against the real server and database and driven in Chromium: empty state, create (HIGH priority, due date), blank title blocked, complete and reopen, edit with the form prefilled, newest task listed first, delete with the confirmation prompt, no horizontal scrolling at 360 px width, and no console errors. All 12 steps passed. These browser steps are not part of CI; repeat them by hand to re-verify.

## Deviations and limits

- Tags on tasks are returned as an empty list until TM-F-014 (Sprint 2).
- The list endpoint returns up to 100 tasks, newest first, with no filter or sort yet (TM-F-015, TM-F-016).
- The browser check used a development shortcut for the signed-in user (`DEV_FAKE_USER_ID`), not the login page, because the login page is built separately.
