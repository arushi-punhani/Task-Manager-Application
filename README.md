# Task Manager Application (Team 6)

A task management tool to organize and track work progress. This repo holds our SE mini-project: the SRS, SAD and Test Plan (the specification) and the implementation built during Sprints 1 and 2.

## Team

| Name | SRN | Role |
|---|---|---|
| Arushi Punhani | PES2UG24CS086 | Repo owner, QA Lead. Reviews and merges all PRs |
| Aryan Burman | PES2UG24CS088 | Dev Lead / Team Lead |
| Arya M G | PES2UG24CS087 | Product Owner |
| Arnav Sharma | PES2UG24CS085 | Developer |

## Tech stack (from the SAD)

- **Client:** React single-page app, responsive (works at 360px and up)
- **Backend:** Node.js with Express, REST/JSON, base path `/api/v1`, one folder per module
- **Database:** PostgreSQL
- **Auth and security:** JWT with expiry, bcrypt password hashing, role-based access control (RBAC) middleware
- **Notifications:** mock or sandbox email service (no real email provider in this version)

Modules: AuthModule, TaskModule, CollabModule, NotifModule, ReportModule, AdminModule.

## Documents

Specification documents (follow these while building): `SRS`, `SAD`, `Test Plan`. Move the PDFs into a `docs/` folder as part of project setup.

## Timeline

Deliverables Part 2 asks for a backlog and two sprints. Sprint 1 (19-23 Oct) was missed, so both sprints are compressed into the remaining days.

| When | What |
|---|---|
| Tue 27 Oct | Set up GitHub Project, create backlog issues, set up repo skeleton and CI |
| Wed 28 - Thu 29 Oct | Sprint 1 work: core features. Record the 1-minute Sprint 1 demo video |
| Thu 29 - Fri 30 Oct | Sprint 2 work: remaining features. Record the 2-minute Sprint 2 demo video, finish documentation |
| Fri 30 Oct | Freeze development |

The delay is recorded in the deviations section below. Do not backdate issues or commits.

## Setup checklist

Arushi (repo owner):
1. Add Arnav, Arya and Aryan as repo collaborators (Settings, then Collaborators).
2. Create a GitHub Project (Board or Table) and link it to this repo.
3. Add a **Story Points** field (Number) and a **Sprint** field (Single select: Sprint 1, Sprint 2).
4. Share the project: add each teammate with the **Write** role (Project, then ... menu, Settings, Manage access). Optionally make it public so evaluators can view it.
5. Push the project skeleton: `client/`, `server/` (one folder per module), `docs/`, and this README with real run instructions.
6. Add a GitHub Actions workflow (`.github/workflows/ci.yml`) that builds and lints on every pull request.
7. Optional: add a branch protection rule on `main` that requires a pull request.

Everyone else:
1. Accept the repo invite and the project invite.
2. Confirm you can see the project and edit its fields.
3. Pull the skeleton before starting your first story.

## Backlog

Every requirement in the SRS becomes an issue in this repo and a card in the project, with the requirement ID in the title (for example `TM-F-010: Create task`), story points, a sprint and one assignee.

| ID | Story | Pts | Sprint | Assignee |
|---|---|---|---|---|
| SETUP | Repo skeleton, DB schema, README, docs folder | 5 | 1 | Arushi |
| CI | GitHub Actions on pull requests | 2 | 1 | Arushi |
| TM-F-001 | Register with email and password | 5 | 1 | Arushi |
| TM-F-002 | Login with JWT (includes TM-SR-002 hashing, TM-SR-004 expiry) | 5 | 1 | Arushi |
| TM-F-003 | Lock account after 5 failed logins | 3 | 2 | Arushi |
| TM-F-004 | Password reset via time-limited link | 5 | 2 | Arushi |
| TM-F-010 | Create task | 3 | 1 | Aryan |
| TM-F-011 | Edit task | 3 | 1 | Aryan |
| TM-F-012 | Delete task with confirmation (soft delete) | 3 | 1 | Aryan |
| TM-F-013 | Complete or reopen task | 2 | 1 | Aryan |
| TM-SR-003 | RBAC middleware (403 on other users' tasks) | 5 | 1 | Aryan |
| TM-F-014 | Categories and tags | 5 | 2 | Aryan |
| TM-F-015 | Search and filter | 5 | 2 | Aryan |
| TM-F-016 | Sort task list | 2 | 2 | Aryan |
| TM-NF-005 | 30-day recoverable delete and purge job | 3 | 2 | Aryan |
| DOCS | Demo videos, deviations document, final documentation | 3 | 2 | Aryan (Arushi checks against the Test Plan) |
| UI-SHELL | React app shell: routing, layout, API client, login and register pages | 5 | 1 | Arya |
| TM-F-020 | Assign task to a teammate | 5 | 1 | Arya |
| TM-F-021 | Comments on shared or assigned tasks | 3 | 1 | Arya |
| TM-F-022 | Share list with view or edit permission | 5 | 2 | Arya |
| TM-F-031 | Notify teammate on assignment (in-app, mock email) | 3 | 2 | Arya |
| TM-F-030 | Due-date reminder (scheduled job) | 5 | 2 | Arya |
| TM-F-040 | Dashboard: counts by status | 3 | 1 | Arnav |
| TM-F-050 | Admin: view, disable, delete users | 5 | 1 | Arnav |
| TM-F-051 | Audit log of admin actions | 3 | 1 | Arnav |
| TM-F-041 | Export tasks as CSV (PDF if time allows) | 3 | 2 | Arnav |
| TM-NF-004/006 | Responsive layout (360px and up) and basic accessibility pass | 3 | 2 | Arnav |

This split is a proposal. Confirm it as a team before creating the issues.

**If time runs short, cut in this order:** PDF export, TM-F-030 reminders, TM-F-022 list sharing, TM-NF-005 purge job. A working core matters more than full coverage.

## Workflow for every story

1. Pick a card assigned to you and move it to **In Progress**.
2. Create a branch from the latest `main`: `git checkout -b feature/<short-name>`.
3. Commit small and often. Mention the issue in the message (for example `Add task creation API, closes #4`).
4. Push the branch and open a pull request that links the issue.
5. Move the card to **In Review**. Arushi reviews and merges. Where possible, someone other than Arushi reviews her own PRs.
6. After merge the card moves to **Done**.

Rules:
- Nobody pushes directly to `main`.
- The assigned team member raises the PR; the repo owner merges it.
- Follow the SRS, SAD and Test Plan. Use the API paths and data model from the SAD.

## Deliverables

- **Sprint 1 demo video (about 1 minute):** shows a working product. Upload to this repo.
- **Sprint 2 demo video (about 2 minutes):** shows a working product with the remaining features. Upload to this repo.
- **Documentation:** complete and updated for what was actually built.
- **Freeze** the development cycle on Fri 30 Oct.
- **Final demo:** be ready to explain every deviation from the submitted documents.

## Deviations from submitted documents

The full list, with the status of all 31 SRS requirements, is in [docs/DEVIATIONS.md](docs/DEVIATIONS.md). Status below is as of 15 Nov 2026 on `main`. In short:

- Sprint 1 (19-23 Oct) was not run as planned. Work was compressed into 27-30 Oct and overlapped with Sprint 2. Several Sprint 2 features were merged after the 30 Oct freeze (12-15 Nov); nothing was backdated.
- Real email sending is replaced by a mock service (verification, password reset and assignment emails are printed in the server console).
- Password reset (TM-F-004), list sharing (TM-F-022), due-date reminders (TM-F-030) and assignment notifications (TM-F-031) work through the API only; the web UI has no screens for them. Reminders use a fixed 24-hour window.
- CSV export works; PDF export (TM-F-041) is not included and returns 501.
- Account lockout, the login, register and admin pages, the audit log endpoint and failed-login alerts are implemented. TLS is enforced in production mode only, and TLS 1.2+ must be set up at the host or proxy (TM-SR-001).
- Items that need a deployed system (uptime, load and response-time targets, a formal accessibility audit: TM-NF-001 to TM-NF-004) are documented rather than measured.

## Test results

- Sprint 1 task features: [docs/TEST_RESULTS_TASKS.md](docs/TEST_RESULTS_TASKS.md)
- Sprint 2 task features (tags, search, filter, sort, restore and purge): [docs/TEST_RESULTS_TASKS_SPRINT2.md](docs/TEST_RESULTS_TASKS_SPRINT2.md)
- Authentication: [docs/TEST_RESULTS_AUTH.md](docs/TEST_RESULTS_AUTH.md)
- Admin and reports: [docs/TEST_RESULTS_ADMIN_REPORTS.md](docs/TEST_RESULTS_ADMIN_REPORTS.md)
- Operations (health probes, deployment notes): [docs/OPERATIONS.md](docs/OPERATIONS.md)

## How to run

See [docs/HOW_TO_RUN.md](docs/HOW_TO_RUN.md) for database setup, environment variables, and commands to start and test the server and client.
