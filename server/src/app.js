require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const db = require('./config/db');

const app = express();
app.use(cors());
app.use(express.json());

const API = '/api/v1';

app.get(`${API}/health`, (req, res) => res.json({ status: 'ok' }));
app.get(`${API}/health/ready`, async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ status: 'ready' });
  } catch (_error) {
    return res.status(503).json({ status: 'unavailable' });
  }
});

app.use(`${API}/auth`, require('./modules/auth/routes'));
app.use(API, require('./modules/report/routes'));        // keep before tasks: /tasks/export vs /tasks/:id
app.use(`${API}/tasks`, require('./modules/tasks/routes'));
app.use(API, require('./modules/collab/routes'));
app.use(`${API}/notifications`, require('./modules/notif/routes'));
app.use(`${API}/admin`, require('./modules/admin/routes'));

app.use(errorHandler);

module.exports = app;
