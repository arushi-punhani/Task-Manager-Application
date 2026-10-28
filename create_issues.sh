#!/usr/bin/env bash
# Creates the Task Manager backlog as GitHub issues and adds them to the project.
# Run by Arushi (repo owner) after: gh auth login && gh auth refresh -s project
#
# Usage: ./create_issues.sh <project-number>
#   project-number: the number in the project URL, e.g. github.com/users/arushi-punhani/projects/3 -> 3
set -euo pipefail

REPO="arushi-punhani/Task-Manager-Application"
OWNER="arushi-punhani"
PROJECT_NUMBER="${1:?Usage: $0 <project-number>}"

# TODO: replace the three placeholders with the real GitHub usernames
ARUSHI="arushi-punhani"
ARYAN="Aryan-20-2006"
ARYA="mgarya"
ARNAV="Arnav1904"

# Labels (ignore errors if they already exist)
gh label create "sprint-1" --color 0E8A16 --repo "$REPO" 2>/dev/null || true
gh label create "sprint-2" --color 1D76DB --repo "$REPO" 2>/dev/null || true
gh label create "FR"  --color 5319E7 --repo "$REPO" 2>/dev/null || true
gh label create "NFR" --color FBCA04 --repo "$REPO" 2>/dev/null || true
gh label create "setup" --color BFD4F2 --repo "$REPO" 2>/dev/null || true

# Fields: id | title | points | sprint | assignee | type-label | description + acceptance criteria
# Fields are separated by '|'
while IFS='|' read -r id title pts sprint assignee kind body; do
  [ -z "$id" ] && continue
  full_title="$id: $title"
  full_body="**Story points:** $pts
**Sprint:** $sprint

$body

_Source: SRS / SAD. Follow the module and API design in the SAD._"
  url=$(gh issue create --repo "$REPO" \
        --title "$full_title" \
        --body "$full_body" \
        --assignee "$assignee" \
        --label "sprint-${sprint}" --label "$kind")
  echo "Created: $url"
  gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url" >/dev/null
done <<DATA
SETUP|Repo skeleton, DB schema, docs folder|5|1|$ARUSHI|setup|Create client/ and server/ (one folder per module: Auth, Task, Collab, Notif, Report, Admin), PostgreSQL schema from the SAD data model, move PDFs into docs/, README with run instructions. Acceptance: everyone can clone, install and start the app.
CI|GitHub Actions build and lint on pull requests|2|1|$ARUSHI|setup|Add .github/workflows/ci.yml that runs on pull_request. Acceptance: a PR shows a passing or failing check.
TM-F-001|Register with email and password|5|1|$ARUSHI|FR|Valid email and password (min 8 chars) creates an account and sends a verification email (mock service). AC-TM-F-001, test TC-Auth-01.
TM-F-002|Login with JWT|5|1|$ARUSHI|FR|Correct credentials return a valid session token; incorrect ones are rejected. Includes TM-SR-002 (salted bcrypt hashing) and TM-SR-004 (token expiry, invalidated on logout). AC-TM-F-002, TC-Auth-02.
TM-F-003|Lock account after 5 failed logins|3|2|$ARUSHI|FR|5th consecutive failure locks the account for 15 minutes and logs an audit entry. AC-TM-F-003, TC-Auth-03.
TM-F-004|Password reset via time-limited link|5|2|$ARUSHI|FR|Link expires after 30 minutes; a used link cannot be reused. AC-TM-F-004, TC-Auth-04.
TM-F-010|Create task|3|1|$ARYAN|FR|Authenticated user creates a task with title, description, due date and priority; it appears in the task list. AC-TM-F-010, TC-Task-01.
TM-F-011|Edit task|3|1|$ARYAN|FR|Owner edits title, description, due date, priority or status; changes persist and show immediately. Ownership check required. AC-TM-F-011, TC-Task-02.
TM-F-012|Delete task with confirmation (soft delete)|3|1|$ARYAN|FR|Task is removed from the list only after confirmation; soft delete, logged. AC-TM-F-012, TC-Task-03.
TM-F-013|Complete or reopen task|2|1|$ARYAN|FR|Status toggle updates task state and completion timestamp. AC-TM-F-013, TC-Task-04.
TM-SR-003|RBAC middleware|5|1|$ARYAN|FR|A user can only access, edit or delete tasks they own or were granted access to; other access returns 403. AC-TM-SR-003, TC-Sec-03.
TM-F-014|Categories and tags|5|2|$ARYAN|FR|Tasks can be organized with categories or custom tags and filtered by them. AC-TM-F-014, TC-Task-05.
TM-F-015|Search and filter|5|2|$ARYAN|FR|Search and filter by title, status, due date, priority or tag return only matching tasks. AC-TM-F-015, TC-Task-06.
TM-F-016|Sort task list|2|2|$ARYAN|FR|Sort by due date, priority or creation date without a full page reload. AC-TM-F-016, TC-Task-07.
TM-NF-005|30-day recoverable delete and purge job|3|2|$ARYAN|NFR|Deleted task is recoverable within 30 days and purged after. TC-Data-01.
DOCS|Demo videos, deviations document, final documentation|3|2|$ARYAN|setup|Record the Sprint 1 (1 min) and Sprint 2 (2 min) demo videos, keep the deviations list updated, finish documentation. Arushi checks against the Test Plan.
UI-SHELL|React app shell and login/register pages|5|1|$ARYA|setup|Routing, layout, API client, login and register pages. Other modules add their pages on top of this.
TM-F-020|Assign task to a teammate|5|1|$ARYA|FR|Assigned task appears in the teammate's task list. Requires multiple accounts. AC-TM-F-020, TC-Collab-01.
TM-F-021|Comments on shared or assigned tasks|3|1|$ARYA|FR|Comment is timestamped, attributed to the author and visible to all collaborators. AC-TM-F-021, TC-Collab-02.
TM-F-022|Share list with view or edit permission|5|2|$ARYA|FR|Shared users access the list according to the granted permission level. AC-TM-F-022, TC-Collab-03.
TM-F-031|Notify teammate on assignment|3|2|$ARYA|FR|Notification delivered immediately after assignment (in-app, mock email). Depends on TM-F-020. AC-TM-F-031, TC-Notif-02.
TM-F-030|Due-date reminder|5|2|$ARYA|FR|Reminder delivered within 1 minute of the scheduled time, using a scheduled job. AC-TM-F-030, TC-Notif-01.
TM-F-040|Dashboard: counts by status|3|1|$ARNAV|FR|Dashboard shows counts for pending, in progress, completed and overdue tasks that match the data. AC-TM-F-040, TC-Report-01.
TM-F-050|Admin: view, disable, delete users|5|1|$ARNAV|FR|Admin actions take effect immediately and are logged. Admin role only. AC-TM-F-050, TC-Admin-01.
TM-F-051|Audit log of admin actions|3|1|$ARNAV|FR|Every admin action creates a log entry with timestamp, admin identity and action type. AC-TM-F-051, TC-Admin-02.
TM-F-041|Export tasks as CSV (PDF if time allows)|3|2|$ARNAV|FR|Exported file contains all visible tasks with correct values. AC-TM-F-041, TC-Report-02.
TM-NF-004|Responsive layout and basic accessibility pass (NFR-004 and NFR-006)|3|2|$ARNAV|NFR|UI renders correctly from 360px width; labels and keyboard navigation checked. TC-UX-01, TC-UX-02.
DATA

echo
echo "Done. In the project table, fill the Story Points and Sprint columns (values are in each issue body and the sprint-1 / sprint-2 labels)."
