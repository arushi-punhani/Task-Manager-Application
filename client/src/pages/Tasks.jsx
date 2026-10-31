import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import './Tasks.css';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const EMPTY_FORM = { title: '', description: '', dueDate: '', priority: 'MEDIUM' };
const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
const EMPTY_FILTERS = { q: '', status: '', priority: '', due: '', tag: '', sort: 'createdAt:desc' };
const DUE_OPTIONS = [['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Due in 7 days'], ['none', 'No due date']];
// "field:direction" pairs sent to the server as ?sort=&order= (TM-F-016).
const SORT_OPTIONS = [
  ['createdAt:desc', 'Newest first'],
  ['createdAt:asc', 'Oldest first'],
  ['dueDate:asc', 'Due date (soonest first)'],
  ['dueDate:desc', 'Due date (latest first)'],
  ['priority:desc', 'Priority (high first)'],
  ['priority:asc', 'Priority (low first)'],
];

function buildQuery(filters) {
  const params = new URLSearchParams();
  for (const key of ['q', 'status', 'priority', 'due', 'tag']) {
    if (filters[key].trim()) params.set(key, filters[key].trim());
  }
  const [sort, order] = filters.sort.split(':');
  params.set('sort', sort);
  params.set('order', order);
  return `?${params.toString()}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'No due date';
}

// TM-F-010 create, TM-F-011 edit, TM-F-012 delete (with confirmation), TM-F-013 complete or reopen,
// TM-F-015 search and filter, TM-F-016 sort (the list refreshes in place, with no page reload).
export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const latestRequest = useRef(0);
  const filtersActive = ['q', 'status', 'priority', 'due', 'tag'].some((key) => filters[key].trim() !== '');

  function handleError(error) {
    if (error.status === 401) {
      setNeedsLogin(true);
      setMessage('Please log in to see your tasks.');
    } else {
      setMessage(error.message);
    }
  }

  async function loadTasks(current = filters) {
    // Typing quickly sends several requests; only the newest answer may update the screen.
    const requestId = ++latestRequest.current;
    try {
      const data = await api(`/tasks${buildQuery(current)}`);
      if (requestId !== latestRequest.current) return;
      setTasks(data.tasks);
      setNeedsLogin(false);
    } catch (error) {
      if (requestId === latestRequest.current) handleError(error);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }

  // Reload when a filter or the sort order changes (a short pause while typing avoids a request per key press).
  useEffect(() => {
    const timer = setTimeout(() => loadTasks(), 250);
    return () => clearTimeout(timer);
  }, [filters]);

  function updateFilter(event) {
    setFilters({ ...filters, [event.target.name]: event.target.value });
  }

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  async function submitForm(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const body = {
      title: form.title,
      description: form.description,
      dueDate: form.dueDate || null,
      priority: form.priority,
    };
    try {
      if (editingId) {
        await api(`/tasks/${editingId}`, { method: 'PATCH', body });
        setMessage('Task updated.');
      } else {
        await api('/tasks', { method: 'POST', body });
        setMessage('Task created.');
      }
      resetForm();
      await loadTasks();
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(task) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description || '',
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      priority: task.priority,
    });
    setMessage('');
  }

  async function toggleComplete(task) {
    setMessage('');
    try {
      await api(`/tasks/${task.id}/${task.status === 'COMPLETED' ? 'reopen' : 'complete'}`, { method: 'POST' });
      await loadTasks();
    } catch (error) {
      handleError(error);
    }
  }

  async function removeTask(task) {
    // TM-F-012: the task is removed only after the user confirms.
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    setMessage('');
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' });
      if (editingId === task.id) resetForm();
      setMessage('Task deleted.');
      await loadTasks();
    } catch (error) {
      handleError(error);
    }
  }

  return (
    <section className="tasks-page">
      <h1>Tasks</h1>

      <form className="task-form" onSubmit={submitForm}>
        <h2>{editingId ? 'Edit task' : 'New task'}</h2>
        <label>
          Title
          <input name="title" value={form.title} onChange={updateField} maxLength={255} required />
        </label>
        <label>
          Description
          <textarea name="description" value={form.description} onChange={updateField} rows={3} />
        </label>
        <div className="task-form-row">
          <label>
            Due date
            <input type="date" name="dueDate" value={form.dueDate} onChange={updateField} />
          </label>
          <label>
            Priority
            <select name="priority" value={form.priority} onChange={updateField}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <div className="task-form-actions">
          <button type="submit" disabled={saving}>{editingId ? 'Save changes' : 'Add task'}</button>
          {editingId && <button type="button" className="secondary" onClick={resetForm}>Cancel</button>}
        </div>
      </form>

      <form className="task-filters" role="search" aria-label="Search, filter and sort tasks" onSubmit={(e) => e.preventDefault()}>
        <label className="filter-search">
          Search title
          <input type="search" name="q" value={filters.q} onChange={updateFilter} maxLength={100} placeholder="Search tasks" />
        </label>
        <label>
          Status
          <select name="status" value={filters.status} onChange={updateFilter}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </label>
        <label>
          Priority
          <select name="priority" value={filters.priority} onChange={updateFilter}>
            <option value="">All</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          Due date
          <select name="due" value={filters.due} onChange={updateFilter}>
            <option value="">Any</option>
            {DUE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Sort by
          <select name="sort" value={filters.sort} onChange={updateFilter}>
            {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {filtersActive && (
          <button type="button" className="secondary" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>
            Clear filters
          </button>
        )}
      </form>

      {message && (
        <p className="task-message" role="status">
          {message} {needsLogin && <Link to="/login">Go to login</Link>}
        </p>
      )}

      {loading ? (
        <p>Loading tasks...</p>
      ) : tasks.length === 0 && !needsLogin ? (
        <p>{filtersActive ? 'No tasks match your filters.' : 'No tasks yet. Add your first one above.'}</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <li key={task.id} className={`task-item${task.status === 'COMPLETED' ? ' task-done' : ''}`}>
              <div className="task-main">
                <Link to={`/tasks/${task.id}`} className="task-title">{task.title}</Link>
                <span className={`badge priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                <span className="badge">{task.status.replace('_', ' ')}</span>
                <span className="task-due">{formatDate(task.dueDate)}</span>
                {task.description && <p className="task-description">{task.description}</p>}
              </div>
              <div className="task-actions">
                <button type="button" onClick={() => toggleComplete(task)}>
                  {task.status === 'COMPLETED' ? 'Reopen' : 'Complete'}
                </button>
                <button type="button" className="secondary" onClick={() => startEdit(task)}>Edit</button>
                <button type="button" className="danger" onClick={() => removeTask(task)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
