import { Routes, Route, Link } from 'react-router-dom';
import Placeholder from './pages/Placeholder.jsx';

// UI-SHELL (owner: Arya). Each team member adds their own pages as routes here.
export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: 16 }}>
      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Link to="/">Tasks</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/login">Login</Link>
        <Link to="/register">Register</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Placeholder title="Task list (Aryan: TM-F-010 to TM-F-013)" />} />
        <Route path="/dashboard" element={<Placeholder title="Dashboard (Arnav: TM-F-040)" />} />
        <Route path="/admin" element={<Placeholder title="Admin (Arnav: TM-F-050, TM-F-051)" />} />
        <Route path="/login" element={<Placeholder title="Login (Arya builds the page; Arushi builds the API)" />} />
        <Route path="/register" element={<Placeholder title="Register (Arya builds the page; Arushi builds the API)" />} />
      </Routes>
    </div>
  );
}
