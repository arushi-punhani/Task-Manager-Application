import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import './Tasks.css';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const EMPTY_FORM = { title: '', description: '', dueDate: '', priority: 'MEDIUM' };

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'No due date';
}

// TM-F-010 create, TM-F-011 edit, TM-F-012 delete (with confirmation), TM-F-013 complete or reopen.
export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  function handleError(error) {
    if (error.status === 401) {
      setNeedsLogin(true);
      setMessage('Please log in to see your tasks.');
    } else {
      setMessage(error.message);
    }
  }

  async function loadTasks() {
    try {
      const data = await api('/tasks');
      setTasks(data.tasks);
      setNeedsLogin(false);
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTasks(); }, []);

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

      {message && (
        <p className="task-message" role="status">
          {message} {needsLogin && <Link to="/login">Go to login</Link>}
        </p>
      )}

      {loading ? (
        <p>Loading tasks...</p>
      ) : tasks.length === 0 && !needsLogin ? (
        <p>No tasks yet. Add your first one above.</p>
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
