# Deviations from the submitted documents (SRS, SAD, Test Plan)

Team 6, Task Manager Application. Status recorded on **16 Nov 2026** against the latest `main` (code last changed by PR #81, commit `a9acbc2`; since then only documentation and the demo seed script changed). The unit tests pass (173 test cases), the system tests pass (18 of 18) and line, branch and function coverage are 87.1%, 81.2% and 82.9% (see section 4). The development freeze was 30 Oct 2026; several features were merged after it (see P7). Each deviation below is something we will explain at the final demo.

## 1. Process deviations

| # | What happened | Why | Effect |
|---|---|---|---|
| P1 | Sprint 1 (19-23 Oct) was not run in that week. It was compressed into 27-30 Oct and overlapped with Sprint 2 (26-30 Oct). | The team started late. | Sprint 1 and Sprint 2 work was merged in the same days. We did not backdate any issue or commit. |
| P2 | The backlog was completed after the planned dates. Requirement issues #28-#32 were added on 27-28 Oct, and further issues (UI, tests, seed data, demo video, validation) were added on 27-29 Oct to make Sprint 1 a realistic size. | The first pass of the backlog did not cover every FR and NFR in the SRS, and some stories needed splitting. | All 31 SRS requirements now have an issue with story points, a sprint and an assignee. |
| P3 | The repo skeleton (`client/`, `server/`, `docs/`, CI workflow) was pushed directly to `main` by the repo owner. | The branch and PR workflow could not start until the skeleton existed. | Every feature after the skeleton went through a pull request. |
| P4 | Some Sprint 1 task PRs (#53-#59) were raised as a stack of branches in one evening and their base was changed to `main` before merging. | The task stories build on each other (create, access control, edit, complete, delete, UI, tests). | History is the same as separate PRs; each one links its issue. |
| P5 | AI assistance (Claude) was used to write parts of the code, tests and documents, as the assignment allows (Sprint 1 item e). Some commits carry a `Co-Authored-By` line. | Time pressure. | Each author reviewed, ran and tested the code and can explain it. Tests were also run against a real PostgreSQL database and in a browser. |
| P6 | The Sprint 1 demo video (`docs/demo/sprint1-video.mp4`) was committed directly to `main` by the Dev Lead instead of through a pull request. | A mistake when uploading the file: it was committed on `main` rather than on a branch. | The video is in the repo, and card #43 was closed manually. |
| P7 | Several features were merged after the 30 Oct freeze: CSV export and responsive/accessibility changes (12 Nov), account lockout, password reset API, HTTPS enforcement and health probes (13 Nov), due-date reminders (13 Nov), and assignment notifications, list sharing and failed-login alerts (15 Nov). | Teammates' Sprint 2 stories were not finished by the freeze. | These merges are after the freeze and we did not backdate anything. Their dates are visible in the commit and PR history. The requirement table below describes `main` as it is now. |
| P8 | A fix to `server/scripts/seed-demo.js` (explicit type casts so `npm run db:seed` works on PostgreSQL 18) was committed directly to `main` on 16 Nov (commit `d70f9bf`), not through a pull request. | The Dev Lead edited the file while preparing the Sprint 2 demo and committed it on `main` by mistake. | It only changes the demo seed script, not the application. It was tested against a real PostgreSQL database. |

## 2. Requirement status (all 31 SRS requirements)

"Done" means the behaviour is on `main` and has automated tests. "API only" means the server feature works and is tested, but the web UI has no page for it. "Partial" and "Not built" are the deviations from the SRS.

| Req | Requirement | Status | Notes |
|---|---|---|---|
| TM-F-001 | Register with email and password | Done | API, tests and the register page. Verification email is a mock (see D1). |
| TM-F-002 | Login with session token | Done | API, JWT, session table and the login page. |
| TM-F-003 | Lock account after 5 failed logins | Done | The fifth consecutive bad password locks the account for 15 minutes (HTTP 423). A successful login clears the counter. |
| TM-F-004 | Password reset by time-limited link | API only | Reset tokens are hashed, expire after 30 minutes and are used once. The email is mocked (D1). There is no reset page in the UI. The system test found that the reset request crashed for existing accounts because the default mock mailer was missing; this is fixed (defect SD-1 in TEST_RESULTS_SYSTEM.md). |
| TM-F-010 | Create task | Done | TC-Task-01. |
| TM-F-011 | Edit task | Done | TC-Task-02. |
| TM-F-012 | Delete task (soft delete, confirmation) | Done | TC-Task-03. |
| TM-F-013 | Complete and reopen task | Done | TC-Task-04. |
| TM-F-014 | Categories and tags | Done | Free-text tags, no separate category list (D4). TC-Task-05. |
| TM-F-015 | Search and filter | Done | Title search; status, priority, tag and due-date filters. TC-Task-06. |
| TM-F-016 | Sort task list | Done | Due date, priority, creation date, no page reload. TC-Task-07. |
| TM-F-020 | Assign task to a teammate | Done | Task detail page. |
| TM-F-021 | Comments on shared or assigned tasks | Done | Task detail page. |
| TM-F-022 | Share list with view or edit permission | API only | Create and manage shares through the API, with access rules enforced (TM-SR-003). No sharing screen in the UI. |
| TM-F-030 | Due-date reminder | Partial | One in-app reminder is created about 24 hours before the due time, found by polling every 30 seconds. The reminder time is not configurable and there is no email or push reminder. API only: the UI does not show reminders. |
| TM-F-031 | Notify teammate on assignment | Partial | In-app notification plus a mock email (D1). API only: the UI does not show notifications. |
| TM-F-040 | Dashboard summary | Done | Dashboard page. |
| TM-F-041 | Export tasks as CSV or PDF | Partial | CSV export works from the Dashboard. PDF export returns 501 (not included). |
| TM-F-050 | Admin: view, disable, delete users | Done | API, tests and an Admin page. |
| TM-F-051 | Audit log of admin actions | Done | Admin actions, task deletes, restores and purges are logged, and admins can view the log through the audit log endpoint. |
| TM-NF-001 | Response time p95 at most 2 s | Not measured | No load or performance test was run. |
| TM-NF-002 | Uptime at least 99.5% | Not measured | Liveness/readiness probes and restart guidance are in `docs/OPERATIONS.md`. There is no deployed service or monitoring period. |
| TM-NF-003 | Scale to 10,000 users and 1,000,000 tasks | Not measured | Indexes exist on the common filter columns (`db/schema.sql`), but no load test was run. |
| TM-NF-004 | WCAG 2.1 AA | Partial | Skip link, navigation landmark, labelled fields, visible focus and status messages, checked by automated tests. No formal accessibility audit (TC-UX-01) was run. |
| TM-NF-005 | Deleted task recoverable for 30 days, then purged | Done | Restore by the owner and a daily purge job. TC-Data-01. |
| TM-NF-006 | Responsive, 360 px and up | Partial | Minimum width and breakpoints are set and tested in the stylesheets; only the Tasks page was checked in a real browser at 360 px. |
| TM-SR-001 | TLS 1.2 or higher | Partial | Production mode rejects non-HTTPS requests (it trusts `X-Forwarded-Proto` when `TRUST_PROXY` is set). TLS 1.2+ must be configured at the proxy or host in front of the server. Local development stays on HTTP and no deployed TLS setup was verified. |
| TM-SR-002 | Salted password hashing | Done | See D2 (bcryptjs). |
| TM-SR-003 | Role-based access control | Done | 403 for other users' tasks, 404 for missing tasks. TC-Sec-03. |
| TM-SR-004 | Session tokens with expiry | Done | JWT with expiry, checked against a session table; logout revokes the session. |
| TM-SR-005 | Log and alert on repeated failed logins | Partial | Failed logins are recorded (identifiers hashed). Five failures in 10 minutes for an account or IP raises an alert in the audit log. No external alert delivery (email, chat) is configured. |

## 3. Design and behaviour deviations (what was built differently from the documents)

| # | Document says | What we built | Reason |
|---|---|---|---|
| D1 | Verification, password reset and notification emails go through an external email service (SRS TM-F-001, TM-F-004, SAD notification service). | A mock service. Verification and password reset links, and assignment notification emails, are printed in the server console and nothing is sent. | No real email provider in this version, as stated in the README from the start. |
| D2 | Passwords hashed with bcrypt or Argon2 (TM-SR-002). | `bcryptjs` (a pure JavaScript bcrypt). | It installs on every machine without native build tools. The algorithm is still salted bcrypt. |
| D3 | Errors use one JSON format `{status, code, message, requestId}` (SAD 4.4). | Errors return `{ "error": "message" }`, and validation errors add a `details` list. HTTP status codes follow the SAD (400, 401, 403, 404, 409). | Simpler for the client. No request IDs or error codes yet. |
| D4 | Tasks are organised by "categories or custom tags" (TM-F-014). | One mechanism: free-text tags (up to 10 per task, stored in lower case). A category is just a tag. | The acceptance criterion only needs filtering by a category or tag. |
| D5 | Search by "title, status, due date, priority, or tag" (TM-F-015). | Title text search only (descriptions and tags are not searched). Due date is filtered as overdue, today, next 7 days, none, or one exact date. | Matches the SRS wording. "Today" and "7 days" use the database server's time zone. |
| D6 | Task response `{id, title, description, dueDate, priority, status, tags[], createdAt}` (SAD). | The same fields plus `completedAt`, `ownerId` and `assigneeId`. | Needed by the UI for completion time and ownership. |
| D7 | Login should require a verified email (implied by TM-F-001). | Login works without clicking the verification link, because the link is only printed in the server console. | The email is a mock (D1). |
| D8 | A purge job removes tasks after 30 days (SAD, TM-NF-005). | The job runs inside the server process, once at start-up and then every 24 hours. It can also be run by hand with `npm run purge`. | There is no separate scheduler in a local project. If the server is off, the purge happens at the next start. |
| D9 | Only "recoverable for 30 days" (TM-NF-005). | Only the task owner can restore it. Restoring someone else's task, or a task past 30 days, returns 404 (not 403) so its existence is not revealed. | Safer default. |
| D10 | Task list for a user. | The list returns at most 100 tasks. There is no paging. | Enough for the demo and tests. |
| D11 | Users sign in through the login page. | The login and register pages now exist. The `DEV_FAKE_USER_ID` option (development only, one fixed user) is still in the server for demos, but it is no longer needed. | It was added while the login and register pages were unfinished. This option is documented in `docs/HOW_TO_RUN.md` and must never be used in a shared or deployed environment. |
| D12 | Tags on a shared task. | A user with EDIT access can change the tags of a shared task; the tags are saved under the task owner's tags. | Keeps tag names consistent per owner. |
| D13 | Reminders are configurable and can be sent by email (TM-F-030). | A fixed in-app reminder about 24 hours before the due time, found by polling every 30 seconds. | Keeps the feature small and testable without an email provider. |
| D14 | Export as CSV or PDF (TM-F-041). | CSV only. The PDF request returns 501 with a clear message. | CSV covers the main use; PDF was out of scope for the time left. |
| D15 | Sharing, notifications, reminders and password reset are user features. | They work through the API and are covered by tests, but the web UI has no screens for them. | UI work was not finished. They are shown in the demo through the API. |
| D16 | The task detail page uses the signed-in user's session. | The task detail page (assign and comments, TM-F-020 and TM-F-021) has its own "Login token" box. The user pastes a token and clicks "Load task details" before teammates and comments appear. It is not connected to the login page, and it only loads tasks the signed-in user can access. | The page was built against the API before the login page was merged and was not reconnected. |

## 4. Testing

| Kind | Result | Report |
|---|---|---|
| Unit tests (mock database) | 173 test cases in 26 files, all passing | [TEST_RESULTS_UNIT.md](TEST_RESULTS_UNIT.md) |
| System tests (real application and real PostgreSQL) | 18 of 18 cases passing | [TEST_RESULTS_SYSTEM.md](TEST_RESULTS_SYSTEM.md) |
| Code coverage (unit tests, server code) | 87.14% line, 81.19% branch, 82.93% function | [TEST_COVERAGE.md](TEST_COVERAGE.md) |

Other test records: `TEST_RESULTS_TASKS.md`, `TEST_RESULTS_TASKS_SPRINT2.md`, `TEST_RESULTS_AUTH.md` and `TEST_RESULTS_ADMIN_REPORTS.md`.

Deviations in testing:
- The unit tests use a mock database and cannot prove the SQL is valid, so we added the system tests and the real-database scripts.
- The system tests call the API; they do not drive the web pages. The React client has no automated tests and no coverage figure. The Tasks page was checked by hand in a browser.
- Coverage is measured on the unit tests only, so it understates what the system tests also exercise.
- Not run: performance (TC-Perf-01), uptime, scalability, a formal accessibility audit (TC-UX-01) and TLS checks. These need a deployed environment or special tooling.
- Test Plan cases for the features marked "Not measured" above were not executed.

## 5. Demo videos

- Sprint 1 video: `docs/demo/sprint1-video.mp4` (see P6).
- Sprint 2 video (about 2 minutes): `docs/demo/sprint2-video.mp4`. It was compressed (H.264, 1280 px wide) so the file is small enough to push to GitHub, and it was added through a pull request.

## 6. Keeping this document correct

If anything else is merged before the demo, change its row in section 2 and remove any deviation that no longer applies. The status line at the top says which commit the table describes.
