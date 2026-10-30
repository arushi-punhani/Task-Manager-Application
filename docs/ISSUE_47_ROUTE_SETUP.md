# Issue #47 — Admin page route integration

The ZIP adds `client/src/pages/Admin.jsx` and `client/src/pages/Admin.css`.

In the existing `client/src/App.jsx`, make only these two targeted edits. Do not replace the whole App.jsx file because the UI shell may contain teammates' routes and layout changes.

1. Add this import with the other page imports:

```jsx
import Admin from './pages/Admin.jsx';
```

2. Find the existing `/admin` route and change only its element to `Admin`:

```jsx
<Route path="/admin" element={<Admin />} />
```

Keep all other routes and imports unchanged.

## API integration

The page uses the existing `api()` helper in `client/src/api.js` and these endpoints:

- `GET /api/v1/admin/users?limit=50&offset=0`
- `PATCH /api/v1/admin/users/:id/status` with `{ "status": "ACTIVE" | "DISABLED" }`
- `DELETE /api/v1/admin/users/:id`
- `GET /api/v1/admin/audit-logs?limit=50&offset=0`

The user-management endpoints are supplied by the merged #24 backend. In the version of the #24 router reviewed while preparing this page, `/audit-logs` still returned 501 for TM-F-051. The page handles that response with a clear message rather than fabricating audit data. Once the #25 endpoint is available, the log table will render returned `logs`, `auditLogs`, `entries`, or array data.

## Safety and behavior

- All requests go through the existing API helper, which attaches the stored bearer token.
- The server remains responsible for admin authorization.
- Disable/enable and delete actions ask for confirmation.
- Delete is described as permanent because the database schema cascades user deletion to related data.
- The page displays API errors and does not pretend an action succeeded when the server rejects it.
- The table scrolls horizontally on narrow screens; buttons and interactive controls have keyboard focus styles.

## Verification

From `client/` run:

```bash
npm ci
npm run build
```

Test `/admin` with an authenticated ADMIN account. A normal USER account should receive a 403 response from the protected admin API.
