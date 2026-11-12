# Production health and restart guidance

The API exposes two probes:

- `GET /api/v1/health` is a liveness check. It returns `200` while the Node.js process can serve requests.
- `GET /api/v1/health/ready` is a readiness check. It runs `SELECT 1` against PostgreSQL and returns `200` only when the API can reach its database; a database failure returns `503`.

Configure the hosting platform's liveness probe to call `/api/v1/health` and restart the service when the process exits or fails its liveness policy. Configure its readiness probe to call `/api/v1/health/ready`, so traffic is sent only when PostgreSQL is reachable. For a systemd host, run the API as a service with `Restart=on-failure` and `RestartSec=5`; keep `DATABASE_URL`, `JWT_SECRET`, and `NODE_ENV=production` in a protected environment file.

The 99.5% uptime target requires a deployed service and monitoring over a measurement period. This repository has no deployment or uptime history, so the target remains unverified and must not be reported as achieved. Record uptime from the hosting provider's monitoring or an external probe after deployment.
