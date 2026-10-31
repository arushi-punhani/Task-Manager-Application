// Input validation for task endpoints (VALIDATION, TM-F-010 / TM-F-011).
// Returns { errors: [...messages], value: {...cleaned fields} }. Nothing here touches the database.
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];

function validateTaskFields(body, { requireTitle = false, allowStatus = false } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = [];
  const value = {};

  if (requireTitle || input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.trim() === '') {
      errors.push('title is required');
    } else if (input.title.trim().length > 255) {
      errors.push('title must be 255 characters or fewer');
    } else {
      value.title = input.title.trim();
    }
  }

  if (input.description !== undefined) {
    if (input.description !== null && typeof input.description !== 'string') {
      errors.push('description must be text');
    } else if (typeof input.description === 'string' && input.description.length > 5000) {
      errors.push('description must be 5000 characters or fewer');
    } else {
      value.description = input.description;
    }
  }

  if (input.dueDate !== undefined) {
    if (input.dueDate === null || input.dueDate === '') {
      value.dueDate = null;
    } else {
      const parsed = typeof input.dueDate === 'string' ? new Date(input.dueDate) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        errors.push('dueDate must be a valid date');
      } else {
        value.dueDate = parsed.toISOString();
      }
    }
  }

  if (input.priority !== undefined) {
    const priority = typeof input.priority === 'string' ? input.priority.toUpperCase() : '';
    if (!PRIORITIES.includes(priority)) {
      errors.push('priority must be LOW, MEDIUM or HIGH');
    } else {
      value.priority = priority;
    }
  }

  if (allowStatus && input.status !== undefined) {
    const status = typeof input.status === 'string' ? input.status.toUpperCase() : '';
    if (!STATUSES.includes(status)) {
      errors.push('status must be PENDING, IN_PROGRESS or COMPLETED');
    } else {
      value.status = status;
    }
  }

  return { errors, value };
}

// Database row -> API shape from the SAD: {id, title, description, dueDate, priority, status, tags[], createdAt}
function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    completedAt: row.completed_at,
    ownerId: row.owner_id,
    assigneeId: row.assignee_id,
    tags: [], // categories and tags arrive with TM-F-014 (Sprint 2)
    createdAt: row.created_at,
  };
}

// Query string for GET /tasks (TM-F-015 search and filter, TM-F-016 sort).
//   q=<text in title>  status=  priority=  tag=  due=overdue|today|week|none|YYYY-MM-DD
//   sort=createdAt|dueDate|priority  order=asc|desc
const SORT_FIELDS = ['createdAt', 'dueDate', 'priority'];
const DUE_FILTERS = ['overdue', 'today', 'week', 'none'];
// Newest first, earliest due date first and HIGH priority first unless the caller says otherwise.
const DEFAULT_ORDER = { createdAt: 'desc', dueDate: 'asc', priority: 'desc' };

function validDay(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function parseListQuery(query) {
  const input = query && typeof query === 'object' ? query : {};
  const errors = [];
  const value = {};
  // ?q=a&q=b arrives as an array; only the first value is used.
  const text = (key) => {
    const raw = Array.isArray(input[key]) ? input[key][0] : input[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== 'string') { errors.push(`${key} must be text`); return undefined; }
    const trimmed = raw.trim();
    return trimmed === '' ? undefined : trimmed;
  };

  const q = text('q');
  if (q !== undefined) {
    if (q.length > 100) errors.push('q must be 100 characters or fewer');
    else value.q = q;
  }

  const status = text('status');
  if (status !== undefined) {
    if (!STATUSES.includes(status.toUpperCase())) errors.push('status must be PENDING, IN_PROGRESS or COMPLETED');
    else value.status = status.toUpperCase();
  }

  const priority = text('priority');
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority.toUpperCase())) errors.push('priority must be LOW, MEDIUM or HIGH');
    else value.priority = priority.toUpperCase();
  }

  const tag = text('tag');
  if (tag !== undefined) {
    if (tag.length > 50) errors.push('tag must be 50 characters or fewer');
    else value.tag = tag.toLowerCase();
  }

  const due = text('due');
  if (due !== undefined) {
    if (DUE_FILTERS.includes(due.toLowerCase())) value.due = due.toLowerCase();
    else if (validDay(due)) value.due = due;
    else errors.push('due must be overdue, today, week, none or a date (YYYY-MM-DD)');
  }

  const sort = text('sort');
  if (sort !== undefined) {
    if (!SORT_FIELDS.includes(sort)) errors.push('sort must be createdAt, dueDate or priority');
    else value.sort = sort;
  }
  value.sort = value.sort || 'createdAt';

  const order = text('order');
  if (order !== undefined) {
    if (!['asc', 'desc'].includes(order.toLowerCase())) errors.push('order must be asc or desc');
    else value.order = order.toLowerCase();
  }
  value.order = value.order || DEFAULT_ORDER[value.sort];

  return { errors, value };
}

module.exports = { validateTaskFields, parseListQuery, toTask, PRIORITIES, STATUSES, SORT_FIELDS, DUE_FILTERS };
