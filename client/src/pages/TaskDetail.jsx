import { useState } from 'react';
import { useParams } from 'react-router-dom';
import './TaskDetail.css';

export default function TaskDetail() {
  const { id } = useParams();
  const [token, setToken] = useState('');
  const [task, setTask] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function request(path, method = 'GET', body) {
    const response = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function loadDetails() {
    if (!token.trim()) {
      setMessage('Enter your valid login token first.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const [taskData, commentData, userData] = await Promise.all([
        request(`/tasks/${id}`),
        request(`/tasks/${id}/comments`),
        request('/users/assignees')
      ]);
      setTask(taskData.task);
      setComments(commentData.comments || []);
      setAssignees(userData.assignees || []);
      setAssigneeId(taskData.task.assignee_id
        ? String(taskData.task.assignee_id) : '');
      setMessage('Task details loaded.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function assignTask(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await request(`/tasks/${id}/assign`, 'POST', {
        assigneeId: Number(assigneeId)
      });
      await loadDetails();
      setMessage('Task assignment saved.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function addComment(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await request(`/tasks/${id}/comments`, 'POST', { text: comment });
      setComment('');
      await loadDetails();
      setMessage('Comment added successfully.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="task-detail">
      <header className="task-detail__header">
        <p className="task-detail__eyebrow">TASK MANAGER / TASKS</p>
        <h1>{task?.title || 'Task details'}</h1>
        <p>Task ID: {id}</p>
        {task && (
          <div className="task-detail__meta">
            <span>Status: {task.status}</span>
            <span>Priority: {task.priority}</span>
            {task.description && <p>{task.description}</p>}
          </div>
        )}
      </header>

      <section className="task-detail__panel">
        <label htmlFor="api-token">Login token</label>
        <input
          id="api-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={event => setToken(event.target.value)}
          placeholder="Paste your login token"
        />
        <small>Use your own valid API login token. It stays in this page's state.</small>
        <button type="button" disabled={busy || !token.trim()}
          onClick={loadDetails}>
          Load task details
        </button>
      </section>

      <div className="task-detail__grid">
        <section className="task-detail__panel">
          <h2>Assign task</h2>
          <form onSubmit={assignTask}>
            <label htmlFor="assignee">Choose a teammate</label>
            <select
              id="assignee"
              required
              value={assigneeId}
              onChange={event => setAssigneeId(event.target.value)}
            >
              <option value="">Select a teammate</option>
              {assignees.map(user => (
                <option key={user.id} value={user.id}>
                  {user.email} (ID: {user.id})
                </option>
              ))}
            </select>
            <button disabled={busy || !token.trim() || !assigneeId} type="submit">
              Assign task
            </button>
          </form>
        </section>

        <section className="task-detail__panel">
          <h2>Comments</h2>
          <form onSubmit={addComment}>
            <label htmlFor="comment">Write a comment</label>
            <textarea
              id="comment"
              rows="4"
              maxLength="2000"
              required
              value={comment}
              onChange={event => setComment(event.target.value)}
              placeholder="Share an update with your team..."
            />
            <button disabled={busy || !token.trim()} type="submit">
              Add comment
            </button>
          </form>
        </section>
      </div>

      {message && <p className="task-detail__message" role="status">{message}</p>}

      <section className="task-detail__panel">
        <h2>Previous comments ({comments.length})</h2>
        {comments.length === 0 ? (
          <p>No comments loaded yet. Enter your token and select Load task details.</p>
        ) : (
          <ul className="task-detail__comments">
            {comments.map(item => (
              <li key={item.id}>
                <p>{item.text}</p>
                <small>
                  {item.author_email || `User ${item.author_id}`}
                  {item.created_at
                    ? ` · ${new Date(item.created_at).toLocaleString()}`
                    : ''}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
