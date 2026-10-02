Task Manager Application

A web/mobile task management application that lets individuals and teams create, organise, assign, track and report on tasks, with secure accounts, reminders and an admin console.

Project status: this repository currently contains the design and test documentation for v1.0 (SRS, Software Architecture and Design Specification, Software Test Plan). Implementation follows the architecture described in docs/.

Table of Contents
Features
Architecture
Tech Stack
Non-Functional Targets
Security
API Overview
Documentation
Testing
Team
Features
Module	Capabilities
Authentication & Accounts	Registration, login with email and password, lockout after 5 consecutive failed attempts, password reset via time-limited email link
Task Management	Create, edit and delete tasks (with confirmation), mark complete / reopen, categories and tags, search, filter and sort
Collaboration	Assign tasks to teammates, comment on shared tasks, share task lists with view or edit permission
Notifications & Reminders	Reminder before due date, notification to a teammate when a task is assigned
Reporting & Dashboard	Dashboard of task counts by status, export task list as CSV or PDF
Administration	View, disable or delete user accounts, audit log of all admin actions

Out of scope for v1.0: third-party calendar/email provider integration and payment/billing.

Architecture

A layered, modular monolith: client → REST API layer → six business modules → data access layer → relational database, with an external notification/email service. Microservices were rejected as too complex for the project's scale; stateless API instances can still be scaled horizontally.

Component	Responsibility
Web / Mobile Client	Responsive UI (≥ 360 px), WCAG 2.1 AA
API Layer	TLS termination, JWT validation, RBAC, input validation
AuthModule	Registration, login, lockout, password reset, JWT
TaskModule	Task CRUD, tags, search/filter/sort, soft delete (30-day recovery)
CollabModule	Assignment, comments, list sharing
NotifModule	In-app/email notifications and reminder scheduler
ReportModule	Dashboard summary and CSV/PDF export
AdminModule	User management and audit log
Data Access Layer	Repositories / ORM, parameterised queries
Tech Stack

The requirements do not fix a stack; this is the proposed stack from the SAD and may change.

Layer	Technology
Client	React (responsive web app)
Backend	Node.js, Express (REST/JSON)
Database	PostgreSQL
Security	TLS 1.2+, bcrypt/Argon2, JWT, RBAC middleware
Notifications	External email service (sandbox/mock in test)
Testing & tooling	Selenium, Postman, JMeter, Jira, axe/WAVE
Non-Functional Targets
ID	Target
TM-NF-001	Response time ≤ 2 s (95th percentile, up to 500 concurrent users)
TM-NF-002	99.5% monthly uptime
TM-NF-003	Scales to 10,000 users / 1,000,000 tasks without degradation
TM-NF-004	WCAG 2.1 AA accessibility
TM-NF-005	Deleted tasks recoverable for 30 days
TM-NF-006	Usable on desktop and mobile (≥ 360 px width)
Security
TLS 1.2+ on all client-server communication
Salted password hashing (bcrypt/Argon2); no plaintext storage
Role-based access control on task access, edit and delete
JWT sessions with expiry and invalidation on logout
Logging and alerting on repeated failed authentication; audit log for admin actions

A STRIDE threat model is included in the SAD (section 3.9).

API Overview

Base path /api/v1, JSON over HTTPS. Bearer JWT required except register, login and password reset.

Area	Endpoints
Auth	POST /auth/register, /auth/login, /auth/logout, /auth/password-reset/request, /auth/password-reset/confirm
Tasks	POST /tasks, GET /tasks, PATCH /tasks/{id}, DELETE /tasks/{id}, POST /tasks/{id}/complete, /reopen
Collaboration	POST /tasks/{id}/assign, /tasks/{id}/comments, /lists/{id}/shares
Reporting	GET /dashboard/summary, GET /tasks/export?format=csv|pdf
Admin	GET /admin/users, PATCH /admin/users/{id}/status, DELETE /admin/users/{id}, GET /admin/audit-logs

Error format: {status, code, message, requestId}. Full definitions are in the SAD (section 4.3).

Documentation
Document	Description
Software Architecture and Design Specification (PDF)	Architecture, component and sequence diagrams, API design, security, UX
Software Architecture and Design Specification (DOCX)	Editable version
Software Requirements Specification v1.0	Requirements baseline (02-09-2026)
Software Test Plan v1.0	Test strategy, schedule and RTM (17-09-2026)
Testing

Unit tests per module, integration tests (UI ↔ REST API ↔ DB ↔ notification service), system and acceptance tests, plus regression, performance, security (fuzzing, penetration testing of auth flows) and accessibility testing. Every requirement is traced to a test case in the RTM. See the Software Test Plan for entry/exit criteria and schedule.

Team

Team 6, Software Engineering course.

Name	Role
Aryan Burman	Team Lead / Developer
Arya M G	Product Owner
Arushi Punhani	QA Lead
Arnav Sharma	Test Engineer

Course Coordinator: Asha Kumari

License

To be decided by the team (add a LICENSE file before making the repository public).
