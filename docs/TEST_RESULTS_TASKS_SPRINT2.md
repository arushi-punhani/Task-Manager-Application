# Test results: task features (Sprint 2)

Recorded 30 Oct 2026. Covers the Test Plan cases TC-Task-05 (tags), TC-Task-06 (search and filter), TC-Task-07 (sort) and TC-Data-01 (30-day recovery and purge). The Sprint 1 task cases are in `TEST_RESULTS_TASKS.md`.

## What was added

| Requirement | What the user gets | API |
|---|---|---|
| TM-F-016 Sort | Sort the list by creation date, due date or priority, in either direction, without reloading the page | `GET /api/v1/tasks?sort=createdAt\|dueDate\|priority&order=asc\|desc` |
| TM-F-015 Search and filter | Search by title text; filter by status, priority, tag and due date (overdue, today, next 7 days, no due date, or one exact date). Filters combine with AND | `GET /api/v1/tasks?q=&status=&priority=&tag=&due=` |
| TM-F-014 Tags | Up to 10 free-text tags per task (categories are tags), stored in lower case. Set when creating or editing a task, shown as chips, and clickable to filter | `tags: [...]` in `POST /tasks` and `PATCH /tasks/:id`; `tags` is returned on every task |
| TM-NF-005 Recovery and purge | A deleted task can be restored by its owner for 30 days. A job removes tasks deleted more than 30 days ago, and every purge and restore is written to the audit log | `GET /tasks/deleted`, `POST /tasks/:id/restore`; job in `server/src/jobs/purgeDeletedTasks.js` |

Defaults: newest first; due date soonest first (tasks with no due date last); priority HIGH first. An invalid value in any query parameter returns 400. All values are sent to PostgreSQL as parameters, and `%` and `_` in the search text are matched literally.

The purge job runs once when the server starts and then every 24 hours. Set `PURGE_DISABLED=true` in `server/.env` to switch it off, or run it by hand with `cd server && npm run purge`.

## 1. Automated unit and route tests (mock database)

Run with `cd server && npm test`. These run in CI on every pull request.

| Test Plan case | Requirement | Test file | Tests | Result |
|---|---|---|---|---|
| TC-Task-06 / TC-Task-07 Search, filter, sort (plus input validation) | TM-F-015, TM-F-016 | `server/test/tasks.search-sort.test.js` | 25 | Pass |
| TC-Task-05 Tags | TM-F-014 | `server/test/tasks.tags.test.js` | 13 | Pass |
| TC-Data-01 Restore and purge | TM-NF-005 | `server/test/tasks.purge-restore.test.js` | 7 | Pass |

The whole server suite (all modules) is 130 tests, 130 passing. Two existing create-task tests were updated because the create query now also carries the tag list.

## 2. Check against a real PostgreSQL database

`server/scripts/smoke-tasks-sprint2.js` runs the real task routes and the purge job against a real database loaded from `db/schema.sql`.

```
createdb taskmanager_test
psql -d taskmanager_test -f db/schema.sql
DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/taskmanager_test node server/scripts/smoke-tasks-sprint2.js
```

It refuses to run unless the database name ends in `_test`, because it empties tables.

Result on 30 Oct 2026: **30 of 30 checks passed**, and the Sprint 1 script `smoke-tasks.js` still passes **28 of 28** after the create and edit queries changed. The Sprint 2 checks cover each search, filter and sort option with real data; tags (stored once per owner, replaced on edit, kept when other fields change, cleared with an empty list, 403 for another user); the recently-deleted list; restore within 30 days (and 404 after 31 days, for another user, or for a task that was never deleted); the purge removing only the 31-day-old task and cascading its tag links; and the audit log entries `TASK_RESTORED` (by the owner) and `TASK_PURGED` (by the system).

## 3. Check in a browser

The Tasks page (`/`) was run against the real server and database and driven in Chromium: create four tasks with priorities, due dates and tags; newest-first default; sort by priority and by due date; search for "report"; the "No tasks match your filters" message; filter by priority and by overdue; click a tag chip to filter by it; edit a task's tags; delete a task, find it under "Show recently deleted" and restore it; no horizontal scrolling at 360 px width; no console errors. All steps passed. These browser steps are not part of CI; repeat them by hand to re-verify.

## Deviations and limits

- The category requirement (TM-F-014) is met with free-text tags; there is no separate category list.
- Search covers the task title only, as the SRS says. It does not search descriptions or tags.
- Filtering by "due" uses the database server's time zone for "today" and "next 7 days".
- The list returns up to 100 tasks. There is no paging yet.
- Tags are owned by the task owner. A user with EDIT access to a shared task can change its tags, and they are saved under the owner's tags.
- Restoring someone else's deleted task, or a task past 30 days, returns 404 rather than 403, so a deleted task's existence is not revealed.
- There is no page yet to view or restore tasks that were deleted by other users of a shared list; only the owner can restore.
- The browser check used a development shortcut for the signed-in user (`DEV_FAKE_USER_ID`), not the login page, because the login page is built separately.
