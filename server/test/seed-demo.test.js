const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { seedDemoData, DEMO_PASSWORD, DEMO_USERS, DEMO_TASKS } = require('../scripts/seed-demo');

function createMockDb({ failOnTask = false } = {}) {
  const statements = [];
  let nextUserId = 1;
  let nextTask = 0;
  let released = false;
  return {
    statements,
    get released() { return released; },
    async connect() {
      return {
        async query(sql, params = []) {
          statements.push({ sql, params });
          if (sql.includes('INSERT INTO users')) {
            assert.equal(await bcrypt.compare(DEMO_PASSWORD, params[1]), true);
            return { rows: [{ id: nextUserId++, email: params[0] }] };
          }
          if (sql.includes('INSERT INTO tasks')) {
            if (failOnTask) throw new Error('task insert failed');
            nextTask += 1;
          }
          return { rows: [] };
        },
        release() { released = true; },
      };
    },
  };
}

test('demo seed creates three demo users and four sample tasks in one transaction', async () => {
  const db = createMockDb();
  const result = await seedDemoData(db);

  assert.deepEqual(result, { users: 3, tasks: 4 });
  assert.equal(DEMO_USERS.filter((user) => user.role === 'ADMIN').length, 1);
  assert.equal(DEMO_USERS.filter((user) => user.role === 'USER').length, 2);
  assert.equal(DEMO_TASKS.length, 4);
  assert.equal(db.statements[0].sql, 'BEGIN');
  assert.equal(db.statements.filter(({ sql }) => sql.includes('INSERT INTO users')).length, 3);
  assert.equal(db.statements.filter(({ sql }) => sql.includes('INSERT INTO tasks')).length, 4);
  assert.ok(db.statements.every(({ sql }) => !/TRUNCATE|DELETE FROM/i.test(sql)));
  assert.equal(db.statements.at(-1).sql, 'COMMIT');
  assert.equal(db.released, true);
});

test('demo seed rolls back and releases the connection when a write fails', async () => {
  const db = createMockDb({ failOnTask: true });
  await assert.rejects(seedDemoData(db), /task insert failed/);
  assert.equal(db.statements.at(-1).sql, 'ROLLBACK');
  assert.equal(db.released, true);
});