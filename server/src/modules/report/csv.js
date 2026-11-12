'use strict';

const EXPORT_COLUMNS = [
  ['id', 'Task ID'],
  ['title', 'Title'],
  ['description', 'Description'],
  ['status', 'Status'],
  ['priority', 'Priority'],
  ['due_date', 'Due date (UTC)'],
  ['created_at', 'Created at (UTC)'],
  ['completed_at', 'Completed at (UTC)'],
  ['owner_email', 'Owner email'],
  ['assignee_email', 'Assignee email'],
  ['list_name', 'List'],
  ['tags', 'Tags'],
];

function csvSafeValue(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Prevent spreadsheet formula execution when untrusted task text is opened in Excel/Sheets.
  if (/^[\t\r ]*[=+@-]/.test(text)) text = `'${text}`;
  return text;
}

function csvCell(value) {
  const text = csvSafeValue(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const header = EXPORT_COLUMNS.map(([, label]) => csvCell(label)).join(',');
  const data = (rows || []).map((row) =>
    EXPORT_COLUMNS.map(([key]) => csvCell(row[key])).join(',')
  );
  // BOM makes UTF-8 text open reliably in common spreadsheet applications.
  return `\uFEFF${[header, ...data].join('\r\n')}\r\n`;
}

module.exports = { EXPORT_COLUMNS, csvSafeValue, csvCell, toCsv };
