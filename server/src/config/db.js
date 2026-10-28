require('dotenv').config();
const { Pool } = require('pg');

// Data Access Layer entry point: all modules query the database through this pool,
// always with parameterised queries (pool.query('... $1', [value])).
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
