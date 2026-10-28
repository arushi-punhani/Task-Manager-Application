# How to run (local development)

## Prerequisites
Node.js 18 or later, PostgreSQL 14 or later, Git.

## 1. Database
```
createdb taskmanager
psql -d taskmanager -f db/schema.sql
```
(On Windows, use the SQL Shell (psql) from the PostgreSQL install, or pgAdmin's Query Tool to run `db/schema.sql`.)

## 2. Server
```
cd server
cp .env.example .env        # then edit .env: DATABASE_URL and JWT_SECRET
npm install
npm run dev                 # http://localhost:4000/api/v1/health
npm test
```

## 3. Client
```
cd client
npm install
npm run dev                 # http://localhost:5173
```
The client proxies `/api` to the server on port 4000.

## Working before login exists
In `server/.env` set `DEV_FAKE_USER_ID=1` (and `NODE_ENV=development`). The server then treats every request as user 1 (role USER; set `DEV_FAKE_USER_ROLE=ADMIN` to test admin endpoints). Insert a matching row into `users` first. **Remove this once real login is merged. Never set it in any shared or deployed environment.**

## Where code goes
One folder per module in `server/src/modules/`: auth, tasks, collab, notif, report, admin. Each has a `routes.js` with every endpoint from the SAD as a stub that returns 501. Replace a stub with the real code for your story, and keep the story ID (for example TM-F-010) in your commit message and PR.
