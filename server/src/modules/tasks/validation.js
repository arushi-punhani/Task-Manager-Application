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

module.exports = { validateTaskFields, toTask, PRIORITIES, STATUSES };
