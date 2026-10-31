# Deviations from the submitted documents (SRS, SAD, Test Plan)

Team 6, Task Manager Application. Status recorded on **30 Oct 2026 (development freeze)** against `main` at commit `d90c6f1`, plus pull requests #64, #65 and #66 (Aryan, Sprint 2), which were open and passing their checks when this was written. Each deviation below is something we will explain at the final demo.

## 1. Process deviations

| # | What happened | Why | Effect |
|---|---|---|---|
| P1 | Sprint 1 (19-23 Oct) was not run in that week. It was compressed into 27-30 Oct and overlapped with Sprint 2 (26-30 Oct). | The team started late. | Sprint 1 and Sprint 2 work was merged in the same days. We did not backdate any issue or commit. |
| P2 | The backlog was completed after the planned dates. Requirement issues #28-#32 were added on 27-28 Oct, and further issues (UI, tests, seed data, demo video, validation) were added on 27-29 Oct to make Sprint 1 a realistic size. | The first pass of the backlog did not cover every FR and NFR in the SRS, and some stories needed splitting. | All 31 SRS requirements now have an issue with story points, a sprint and an assignee. |
| P3 | The repo skeleton (`client/`, `server/`, `docs/`, CI workflow) was pushed directly to `main` by the repo owner. | The branch and PR workflow could not start until the skeleton existed. | Every feature after the skeleton went through a pull request. |
| P4 | Some Sprint 1 task PRs (#53-#59) were raised as a stack of branches in one evening and their base was changed to `main` before merging. | The task stories build on each other (create, access control, edit, complete, delete, UI, tests). | History is the same as separate PRs; each one links its issue. |
| P5 | AI assistance (Claude) was used to write parts of the code, tests and documents, as the assignment allows (Sprint 1 item e). Commits made with it carry a `Co-Authored-By` line. | Time pressure. | Each author reviewed, ran and tested the code and can explain it. Tests were also run against a real PostgreSQL database and in a browser. |

## 2. Requirement status (all 31 SRS requirements)

"Done" means the behaviour is on `main` (or in a listed open PR) and has automated tests. "Partial" and "Not built" are the deviations from the SRS.

| Req | Requirement | Status | Notes |
|---|---|---|---|
| TM-F-001 | Register with email and password | Partial | API and tests done (Arushi). Verification email is a mock (see D1). The register page in the UI is still a placeholder. |
| TM-F-002 | Login with session token | Partial | API, JWT and session table done and tested. The login page in the UI is still a placeholder. |
| TM-F-003 | Lock account after 5 failed logins | Not built | Planned for Sprint 2, not completed. |
| TM-F-004 | Password reset by time-limited link | Not built | The two endpoints exist and return 501. |
| TM-F-010 | Create task | Done | Aryan. TC-Task-01. |
| TM-F-011 | Edit task | Done | Aryan. TC-Task-02. |
| TM-F-012 | Delete task (soft delete, confirmation) | Done | Aryan. TC-Task-03. |
| TM-F-013 | Complete and reopen task | Done | Aryan. TC-Task-04. |
| TM-F-014 | Categories and tags | Done in PR #65 | Free-text tags, no separate category list (see D4). TC-Task-05. |
| TM-F-015 | Search and filter | Done in PR #64 | Title search; status, priority, tag and due-date filters. TC-Task-06. |
| TM-F-016 | Sort task list | Done in PR #64 | Due date, priority, creation date, no page reload. TC-Task-07. |
| TM-F-020 | Assign task to a teammate | Done | Arya. |
| TM-F-021 | Comments on shared or assigned tasks | Done | Arya. Task detail page. |
| TM-F-022 | Share list with view or edit permission | Not built | The access rules for shares are enforced (TM-SR-003), but the endpoint to create a share returns 501. |
| TM-F-030 | Due-date reminder | Not built | |
| TM-F-031 | Notify teammate on assignment | Not built | The endpoint returns 501. |
| TM-F-040 | Dashboard summary | Done | Arnav. |
| TM-F-041 | Export tasks as CSV or PDF | Not built | The endpoint returns 501. |
| TM-F-050 | Admin: view, disable, delete users | Partial | API and tests done. The admin page in the UI is still a placeholder. |
| TM-F-051 | Audit log of admin actions | Partial | Admin actions and task deletes are written to the audit log (restores and purges too, with PR #66). The endpoint to view the log returns 501. |
| TM-NF-001 | Response time p95 at most 2 s | Not measured | No load or performance test was run. |
| TM-NF-002 | Uptime at least 99.5% | Not measured | Needs a deployed system; the project runs locally only. |
| TM-NF-003 | Scale to 10,000 users and 1,000,000 tasks | Not measured | Indexes exist on the common filter columns (see `db/schema.sql`), but no load test was run. |
| TM-NF-004 | WCAG 2.1 AA | Partial | Labelled form fields, visible focus states, keyboard-usable controls and status messages on the Tasks and Dashboard pages. No formal accessibility audit (TC-UX-01) was run. |
| TM-NF-005 | Deleted task recoverable for 30 days, then purged | Done in PR #66 | Restore by the owner and a daily purge job. TC-Data-01. |
| TM-NF-006 | Responsive, 360 px and up | Partial | Tasks page checked in a browser at 360 px with no horizontal scroll. Other pages were not checked. |
| TM-SR-001 | TLS 1.2 or higher | Not built | The app runs over plain HTTP locally. TLS belongs to the deployment. |
| TM-SR-002 | Salted password hashing | Done | See D2 (bcryptjs). |
| TM-SR-003 | Role-based access control | Done | 403 for other users' tasks, 404 for missing tasks. TC-Sec-03. |
| TM-SR-004 | Session tokens with expiry | Done | JWT with expiry, checked against a session table; logout revokes the session. |
| TM-SR-005 | Log and alert on repeated failed logins | Not built | Depends on TM-F-003. |

## 3. Design and behaviour deviations (what was built differently from the documents)

| # | Document says | What we built | Reason |
|---|---|---|---|
| D1 | Verification and notification emails go through an external email service (SRS TM-F-001, SAD notification service). | A mock service. The verification link is printed in the server console and nothing is sent. | No real email provider in this version, as stated in the README from the start. |
| D2 | Passwords hashed with bcrypt or Argon2 (TM-SR-002). | `bcryptjs` (a pure JavaScript bcrypt). | It installs on every machine without native build tools. The algorithm is still salted bcrypt. |
| D3 | Errors use one JSON format `{status, code, message, requestId}` (SAD 4.4). | Errors return `{ "error": "message" }`, and validation errors add a `details` list. HTTP status codes follow the SAD (400, 401, 403, 404, 409). | Simpler for the client. No request IDs or error codes yet. |
| D4 | Tasks are organised by "categories or custom tags" (TM-F-014). | One mechanism: free-text tags (up to 10 per task, stored in lower case). A category is just a tag. | The acceptance criterion only needs filtering by a category or tag. |
| D5 | Search by "title, status, due date, priority, or tag" (TM-F-015). | Title text search only (descriptions and tags are not searched). Due date is filtered as overdue, today, next 7 days, none, or one exact date. | Matches the SRS wording. "Today" and "7 days" use the database server's time zone. |
| D6 | Task response `{id, title, description, dueDate, priority, status, tags[], createdAt}` (SAD). | The same fields plus `completedAt`, `ownerId` and `assigneeId`. | Needed by the UI for completion time and ownership. |
| D7 | Login should require a verified email (implied by TM-F-001). | Login works without clicking the verification link, because the link is only printed in the server console. | The email is a mock (D1). |
| D8 | A purge job removes tasks after 30 days (SAD, TM-NF-005). | The job runs inside the server process, once at start-up and then every 24 hours. It can also be run by hand with `npm run purge`. | There is no separate scheduler in a local project. If the server is off, the purge happens at the next start. |
| D9 | Only "recoverable for 30 days" (TM-NF-005). | Only the task owner can restore it. Restoring someone else's task, or a task past 30 days, returns 404 (not 403) so its existence is not revealed. | Safer default. |
| D10 | Task list for a user. | The list returns at most 100 tasks. There is no paging. | Enough for the demo and tests. |
| D11 | Users sign in through the login page. | For the demo videos, the server can be started with `DEV_FAKE_USER_ID` (development only), which treats every request as one fixed user. | The login and register pages were not finished. This option is documented in `docs/HOW_TO_RUN.md` and must never be used in a shared or deployed environment. |
| D12 | Tags on a shared task. | A user with EDIT access can change the tags of a shared task; the tags are saved under the task owner's tags. | Keeps tag names consistent per owner. |

## 4. Testing deviations

- Automated tests use a mock database. Because mock tests cannot prove the SQL is valid, we also run repeatable checks against a real PostgreSQL database (`server/scripts/smoke-tasks.js`, `smoke-tasks-sprint2.js`). Results are in `TEST_RESULTS_TASKS.md` and `TEST_RESULTS_TASKS_SPRINT2.md`.
- Browser checks of the Tasks page were run by hand (not part of CI) and are described in those two files.
- Not run: performance (TC-Perf-01), uptime, scalability, accessibility audit (TC-UX-01) and TLS checks. These need a deployed environment or special tooling.
- The Test Plan cases for features marked "Not built" above were not executed.

## 5. Demo videos

- Sprint 1 (1 minute) and Sprint 2 (2 minutes) videos are in the `docs/demo/` folder when uploaded. They use the development login option (D11) unless the login page was merged before recording.

## 6. Keeping this document correct

If a pull request listed as open or "Not built" is merged before the demo, change its row in section 2 and remove any deviation that no longer applies. The status line at the top says which commit the table describes.
