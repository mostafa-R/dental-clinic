import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { defaultRouteFor } from '../lib/roles';

export default function RoleRedirect() {
  const user = useSelector((s) => s.auth.user);
  return <Navigate to={defaultRouteFor(user?.role)} replace />;
}
