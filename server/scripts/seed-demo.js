const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const DEMO_PASSWORD = 'DemoPass123!';
const DEMO_USERS = [
  { email: 'admin@taskmanager.local', role: 'ADMIN' },
  { email: 'arushi@taskmanager.local', role: 'USER' },
  { email: 'aryan@taskmanager.local', role: 'USER' },
];

const DEMO_TASKS = [
  { owner: 'admin@taskmanager.local', title: 'Review the task board', description: 'Check the team task board before the demo.', priority: 'HIGH', status: 'PENDING', dueOffsetDays: 2 },
  { owner: 'arushi@taskmanager.local', title: 'Prepare the Sprint demo', description: 'Walk through registration, login, and task management.', priority: 'HIGH', status: 'IN_PROGRESS', dueOffsetDays: 1 },
  { owner: 'aryan@taskmanager.local', title: 'Write task test cases', description: 'Cover create, update, completion, and delete flows.', priority: 'MEDIUM', status: 'COMPLETED', dueOffsetDays: -1 },
  { owner: 'arushi@taskmanager.local', assignee: 'aryan@taskmanager.local', title: 'Review task test coverage', description: 'Review the test suite before the release.', priority: 'LOW', status: 'PENDING', dueOffsetDays: 3 },
];

async function seedDemoData(db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const userIds = {};
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    for (const user of DEMO_USERS) {
      const result = await client.query(
        `INSERT INTO users (email, password_hash, role, status, email_verified, failed_count, locked_until)
         VALUES ($1, $2, $3, 'ACTIVE', TRUE, 0, NULL)
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           status = 'ACTIVE',
           email_verified = TRUE,
           failed_count = 0,
           locked_until = NULL
         RETURNING id, email`,
        [user.email, passwordHash, user.role],
      );
      userIds[result.rows[0].email] = result.rows[0].id;
    }

    for (const task of DEMO_TASKS) {
      const dueDate = new Date(Date.now() + task.dueOffsetDays * 24 * 60 * 60 * 1000);
      const completedAt = task.status === 'COMPLETED' ? new Date() : null;
      await client.query(
        `INSERT INTO tasks (owner_id, assignee_id, title, description, due_date, priority, status, completed_at)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8
         WHERE NOT EXISTS (
           SELECT 1 FROM tasks WHERE owner_id = $1 AND title = $3 AND deleted_at IS NULL
         )`,
        [
          userIds[task.owner],
          task.assignee ? userIds[task.assignee] : null,
          task.title,
          task.description,
          dueDate,
          task.priority,
          task.status,
          completedAt,
        ],
      );
    }

    await client.query('COMMIT');
    return { users: DEMO_USERS.length, tasks: DEMO_TASKS.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo accounts in production.');
    process.exitCode = 1;
  } else {
    seedDemoData()
      .then(({ users, tasks }) => {
        console.log(`Seeded ${users} demo users and ${tasks} sample tasks.`);
        console.log(`Demo password for all accounts: ${DEMO_PASSWORD}`);
      })
      .catch((error) => {
        console.error('Demo seed failed:', error.message);
        process.exitCode = 1;
      })
      .finally(() => pool.end());
  }
}

module.exports = { seedDemoData, DEMO_PASSWORD, DEMO_USERS, DEMO_TASKS };