require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());

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
