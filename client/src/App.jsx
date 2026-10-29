import { Routes, Route, Link } from 'react-router-dom';
import Placeholder from './pages/Placeholder.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TaskDetail from './pages/TaskDetail.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Link to="/">Tasks</Link>
        <Link to="/tasks/1">Task detail demo</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/login">Login</Link>
        <Link to="/register">Register</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Placeholder title="Task list (Aryan: TM-F-010 to TM-F-013)" />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Placeholder title="Admin (Arnav: TM-F-050, TM-F-051)" />} />
        <Route path="/login" element={<Placeholder title="Login (Arya builds the page; Arushi builds the API)" />} />
        <Route path="/register" element={<Placeholder title="Register (Arya builds the page; Arushi builds the API)" />} />
      </Routes>
    </div>
  );
}
