import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (result.token) {
        setToken(result.token);
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = err.status === 423
        ? 'Too many failed attempts. This account is temporarily locked; try again after the lock period.'
        : err.status === 403
          ? 'This account is disabled. Contact an administrator.'
          : err.message || 'Unable to sign in.';
      setError(message);
    } finally { setBusy(false); }
  }

  return (
    <main className="login-page" aria-labelledby="login-title">
      <section className="login-card">
        <p className="login-eyebrow">TASK MANAGER</p>
        <h1 id="login-title">Sign in</h1>
        <p className="login-description">Use your account credentials to access your tasks and reports.</p>
        <form onSubmit={submit} noValidate>
          <div className="login-field">
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="login-secondary">
          Need an account? <Link to="/register">Create one here</Link>.
        </p>
        <Link to="/dashboard" className="login-back-link">Go to dashboard</Link>
      </section>
    </main>
  );
}
