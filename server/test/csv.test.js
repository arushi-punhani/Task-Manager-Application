'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCell, toCsv, EXPORT_COLUMNS } = require('../src/modules/report/csv');

test('CSV quotes commas, double quotes and line breaks correctly', () => {
  assert.equal(csvCell('Planning, "Q4"\nfollow-up'), '"Planning, ""Q4""\nfollow-up"');
});

test('CSV prevents spreadsheet formula execution in user-controlled values', () => {
  assert.equal(csvCell('=HYPERLINK("https://bad")'), '"\'=HYPERLINK(""https://bad"")"');
  assert.equal(csvCell('  @SUM(A1:A2)'), "'  @SUM(A1:A2)");
});

test('CSV contains the complete fixed field set and preserves nulls as empty cells', () => {
  const csv = toCsv([{ id: 7, title: 'Task', description: null, status: 'PENDING', priority: 'HIGH', tags: 'home, work' }]);
  const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(EXPORT_COLUMNS.length, 12);
  assert.match(lines[0], /Task ID,Title,Description,Status,Priority/);
  assert.match(lines[1], /^7,Task,,PENDING,HIGH/);
  assert.match(lines[1], /"home, work"$/);
});

test('CSV emits a UTF-8 BOM and CRLF records for spreadsheet compatibility', () => {
  const csv = toCsv([]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.endsWith('\r\n'));
});
