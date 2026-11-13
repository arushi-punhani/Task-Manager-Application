require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');

const app = express();
// Set TRUST_PROXY=true only when the app is behind a trusted reverse proxy
// that overwrites X-Forwarded-Proto (for example, a TLS-terminating load balancer).
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(cors());
app.use(express.json());

// TLS terminates at the trusted hosting proxy in production. Reject direct
// plaintext requests so credentials and session tokens are never served over HTTP.
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.status(426).json({ error: 'HTTPS is required' });
  }
  return next();
});

const API = '/api/v1';

app.get(`${API}/health`, (req, res) => res.json({ status: 'ok' }));

app.use(`${API}/auth`, require('./modules/auth/routes'));
app.use(API, require('./modules/report/routes'));        // keep before tasks: /tasks/export vs /tasks/:id
app.use(`${API}/tasks`, require('./modules/tasks/routes'));
app.use(API, require('./modules/collab/routes'));
app.use(`${API}/notifications`, require('./modules/notif/routes'));
app.use(`${API}/admin`, require('./modules/admin/routes'));

app.use(errorHandler);

module.exports = app;
