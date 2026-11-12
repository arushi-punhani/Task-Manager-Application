import { useCallback, useEffect, useState } from 'react';
import { api, downloadFile } from '../api.js';
import './Dashboard.css';

const METRICS = [
  { key: 'pending', title: 'Pending', description: 'Tasks waiting to be started', className: 'dashboard-card--pending' },
  { key: 'inProgress', title: 'In progress', description: 'Tasks currently being worked on', className: 'dashboard-card--progress' },
  { key: 'completed', title: 'Completed', description: 'Tasks marked as completed', className: 'dashboard-card--completed' },
  { key: 'overdue', title: 'Overdue', description: 'Uncompleted tasks with a past due date', className: 'dashboard-card--overdue' },
];

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportMessage, setExportMessage] = useState('');

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/dashboard/summary');
      setSummary({
        pending: Number(data?.pending) || 0,
        inProgress: Number(data?.inProgress) || 0,
        completed: Number(data?.completed) || 0,
        overdue: Number(data?.overdue) || 0,
      });
    } catch (err) {
      setError(err.message || 'Unable to load dashboard summary.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  async function handleExport() {
    setExporting(true);
    setExportError('');
    setExportMessage('');
    try {
      const result = await downloadFile('/tasks/export?format=csv', 'tasks-export.csv');
      setExportMessage(`Your CSV export is ready (${result.filename}).`);
    } catch (err) {
      setExportError(err.message || 'Unable to export tasks.');
    } finally { setExporting(false); }
  }

  return (
    <main className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard-header">
        <div className="dashboard-heading">
          <p className="dashboard-eyebrow">TASK OVERVIEW</p>
          <h1 id="dashboard-title">Dashboard</h1>
          <p className="dashboard-intro">A summary of tasks you own, are assigned to, or can access through a shared list.</p>
        </div>
        <div className="dashboard-actions" role="group" aria-label="Dashboard actions">
          <button className="dashboard-button dashboard-button--primary" type="button" onClick={handleExport} disabled={exporting} aria-busy={exporting}>
            {exporting ? 'Preparing CSV…' : 'Export tasks (CSV)'}
          </button>
          <button className="dashboard-button" type="button" onClick={loadSummary} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="dashboard-error" role="alert"><p>Could not load dashboard counts: {error}</p><button type="button" onClick={loadSummary} disabled={loading}>Try again</button></div>}
      <p className="sr-only" role="status" aria-live="polite">{exporting ? 'Preparing task export.' : exportMessage}</p>
      {exportError && <p className="dashboard-error-message" role="alert">CSV export failed: {exportError}</p>}
      {exportMessage && <p className="dashboard-success-message">{exportMessage}</p>}

      <section className="dashboard-grid" aria-label="Task counts" aria-busy={loading}>
        {METRICS.map((metric) => (
          <article className={`dashboard-card ${metric.className}`} key={metric.key}>
            <div className="dashboard-card-topline"><h2>{metric.title}</h2><span className="dashboard-card-dot" aria-hidden="true" /></div>
            <p className="dashboard-count" aria-live="polite">{summary === null ? '—' : summary[metric.key]}</p>
            <p className="dashboard-card-description">{metric.description}</p>
          </article>
        ))}
      </section>
      <p className="dashboard-note">The export includes every active task visible to your account (owned, assigned, or shared-list access), with task fields and tags. Deleted tasks are excluded. Dates are exported in UTC.</p>
    </main>
  );
}
