import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import './Admin.css';

const PAGE_SIZE = 50;

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function getLogRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.logs)) return data.logs;
  if (Array.isArray(data?.auditLogs)) return data.auditLogs;
  if (Array.isArray(data?.entries)) return data.entries;
  return [];
}

function actionLabel(action) {
  return String(action || 'UNKNOWN').replaceAll('_', ' ').toLowerCase();
}

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ limit: PAGE_SIZE, offset: 0, total: 0 });
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState('');
  const [logRows, setLogRows] = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const [logError, setLogError] = useState('');
  const [busyUserId, setBusyUserId] = useState(null);
  const [notice, setNotice] = useState('');

  const loadUsers = useCallback(async (offset = pagination.offset) => {
    setUserLoading(true);
    setUserError('');
    try {
      const data = await api(`/admin/users?limit=${PAGE_SIZE}&offset=${offset}`);
      setUsers(Array.isArray(data?.users) ? data.users : []);
      setPagination({
        limit: Number(data?.pagination?.limit) || PAGE_SIZE,
        offset: Number(data?.pagination?.offset) || 0,
        total: Number(data?.pagination?.total) || 0,
      });
    } catch (error) {
      setUserError(error.message || 'Unable to load users.');
    } finally {
      setUserLoading(false);
    }
  }, [pagination.offset]);

  const loadAuditLogs = useCallback(async () => {
    setLogLoading(true);
    setLogError('');
    try {
      const data = await api(`/admin/audit-logs?limit=${PAGE_SIZE}&offset=0`);
      setLogRows(getLogRows(data));
    } catch (error) {
      setLogRows([]);
      if (error.status === 501) {
        setLogError('The audit-log viewing endpoint is not available yet. The admin page is connected to it and will display entries once the audit-log API is implemented.');
      } else {
        setLogError(error.message || 'Unable to load the audit log.');
      }
    } finally {
      setLogLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadUsers(pagination.offset);
    loadAuditLogs();
  }, [loadAuditLogs, loadUsers, pagination.offset]);

  useEffect(() => {
    loadUsers(0);
    loadAuditLogs();
    // Initial load only. Pagination is handled by the explicit page controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateUserStatus(user) {
    const nextStatus = user.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';
    const verb = nextStatus === 'DISABLED' ? 'disable' : 'enable';
    if (!window.confirm(`Are you sure you want to ${verb} ${user.email}?`)) return;

    setBusyUserId(user.id);
    setNotice('');
    setUserError('');
    try {
      await api(`/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setNotice(`${user.email} was ${nextStatus === 'DISABLED' ? 'disabled' : 'enabled'}.`);
      await loadUsers(pagination.offset);
      await loadAuditLogs();
    } catch (error) {
      setUserError(error.message || `Unable to ${verb} this account.`);
    } finally {
      setBusyUserId(null);
    }
  }

  async function deleteUser(user) {
    const confirmed = window.confirm(
      `Permanently delete ${user.email}? This cannot be undone and may also delete data linked to this account.`,
    );
    if (!confirmed) return;

    setBusyUserId(user.id);
    setNotice('');
    setUserError('');
    try {
      await api(`/admin/users/${user.id}`, { method: 'DELETE' });
      setNotice(`${user.email} was deleted.`);
      const nextOffset = users.length === 1 && pagination.offset > 0
        ? Math.max(0, pagination.offset - pagination.limit)
        : pagination.offset;
      await loadUsers(nextOffset);
      await loadAuditLogs();
    } catch (error) {
      setUserError(error.message || 'Unable to delete this account.');
    } finally {
      setBusyUserId(null);
    }
  }

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const hasUsers = users.length > 0;

  return (
    <main className="admin-page" aria-labelledby="admin-title">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">ADMINISTRATION</p>
          <h1 id="admin-title">Admin panel</h1>
          <p className="admin-intro">Manage user accounts and review administrative activity.</p>
        </div>
        <button className="admin-button admin-button--secondary" type="button" onClick={refreshAll} disabled={userLoading || logLoading}>
          {userLoading || logLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {userError && <div className="admin-alert" role="alert">{userError}</div>}

      <section className="admin-section" aria-labelledby="admin-users-title" aria-busy={userLoading}>
        <div className="admin-section-heading">
          <div>
            <h2 id="admin-users-title">Users</h2>
            <p>{pagination.total} account{pagination.total === 1 ? '' : 's'} in the system</p>
          </div>
          <span className="admin-section-tag">USER MANAGEMENT</span>
        </div>

        {userLoading ? (
          <p className="admin-state" role="status">Loading users…</p>
        ) : userError && !hasUsers ? (
          <p className="admin-state">User list could not be loaded.</p>
        ) : !hasUsers ? (
          <p className="admin-state">No users were found.</p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="admin-visually-hidden">Registered users and account-management actions</caption>
                <thead>
                  <tr>
                    <th scope="col">User</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Email verified</th>
                    <th scope="col">Joined</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const disabled = user.status === 'DISABLED';
                    const busy = busyUserId === user.id;
                    return (
                      <tr key={user.id}>
                        <td>
                          <span className="admin-user-email">{user.email}</span>
                          <span className="admin-user-id">ID {user.id}</span>
                        </td>
                        <td><span className={`admin-role admin-role--${String(user.role).toLowerCase()}`}>{user.role}</span></td>
                        <td><span className={`admin-status ${disabled ? 'admin-status--disabled' : 'admin-status--active'}`}>{user.status}</span></td>
                        <td>{user.emailVerified ? 'Yes' : 'No'}</td>
                        <td>{formatDate(user.createdAt)}</td>
                        <td>
                          <div className="admin-actions">
                            <button
                              className="admin-button admin-button--secondary"
                              type="button"
                              onClick={() => updateUserStatus(user)}
                              disabled={busy}
                              aria-label={`${disabled ? 'Enable' : 'Disable'} ${user.email}`}
                            >
                              {busy ? 'Working…' : disabled ? 'Enable' : 'Disable'}
                            </button>
                            <button
                              className="admin-button admin-button--danger"
                              type="button"
                              onClick={() => deleteUser(user)}
                              disabled={busy}
                              aria-label={`Delete ${user.email}`}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="admin-pagination">
              <span>Page {currentPage} of {pageCount}</span>
              <div className="admin-actions">
                <button
                  className="admin-button admin-button--secondary"
                  type="button"
                  onClick={() => loadUsers(Math.max(0, pagination.offset - pagination.limit))}
                  disabled={pagination.offset === 0 || userLoading}
                >
                  Previous
                </button>
                <button
                  className="admin-button admin-button--secondary"
                  type="button"
                  onClick={() => loadUsers(pagination.offset + pagination.limit)}
                  disabled={pagination.offset + pagination.limit >= pagination.total || userLoading}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-labelledby="admin-audit-title" aria-busy={logLoading}>
        <div className="admin-section-heading">
          <div>
            <h2 id="admin-audit-title">Audit log</h2>
            <p>Recent administrative actions</p>
          </div>
          <span className="admin-section-tag">ACTIVITY</span>
        </div>

        {logLoading ? (
          <p className="admin-state" role="status">Loading audit log…</p>
        ) : logError ? (
          <div className="admin-audit-unavailable" role="status">
            <strong>Audit log is not available yet</strong>
            <p>{logError}</p>
            <button className="admin-button admin-button--secondary" type="button" onClick={loadAuditLogs}>Try again</button>
          </div>
        ) : logRows.length === 0 ? (
          <p className="admin-state">No audit entries were found.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-audit-table">
              <caption className="admin-visually-hidden">Recent administrative audit events</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Administrator</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target user ID</th>
                  <th scope="col">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {logRows.map((entry, index) => (
                  <tr key={entry.id ?? `${entry.timestamp ?? entry.created_at ?? 'log'}-${index}`}>
                    <td>{formatDate(entry.timestamp ?? entry.createdAt ?? entry.created_at)}</td>
                    <td>{entry.actorEmail ?? entry.actor_email ?? (entry.actorId ?? entry.actor_id ?? 'System')}</td>
                    <td><span className="admin-action-label">{actionLabel(entry.action)}</span></td>
                    <td>{entry.targetId ?? entry.target_id ?? '—'}</td>
                    <td>{entry.outcome ?? 'SUCCESS'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
