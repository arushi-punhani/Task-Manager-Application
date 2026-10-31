import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function updateField(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      await api('/auth/register', {
        method: 'POST',
        body: form,
      });

      setMessage('Registration successful. You can now log in.');

      setTimeout(() => {
        navigate('/login');
      }, 1000);
    } catch (error) {
      setMessage(error.message || 'Unable to register.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Create Account</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Email</label><br />
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={updateField}
            required
          />
        </div>

        <br />

        <div>
          <label>Password</label><br />
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={updateField}
            required
          />
        </div>

        <br />

        <button type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Register'}
        </button>
      </form>

      {message && <p>{message}</p>}

      <p>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}