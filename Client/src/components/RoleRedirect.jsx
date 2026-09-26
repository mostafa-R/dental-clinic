import { Navigate } from 'react-router-dom';
import { useLandingPath } from '../lib/roles';

export default function RoleRedirect() {
  // Reactive, and permission-aware: falls back to the first page this user can
  // actually open, so a role without its preferred module is not redirected
  // into a 403 loop.
  const to = useLandingPath();
  return <Navigate to={to} replace />;
}
