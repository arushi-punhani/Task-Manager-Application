import { Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import TaskDetail from './pages/TaskDetail.jsx';
import Tasks from './pages/Tasks.jsx';
import Admin from './pages/Admin.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/register.jsx';

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
        <Route path="/" element={<Tasks />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />

        {/* Arya's Login and Register UI */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </div>
  );
}