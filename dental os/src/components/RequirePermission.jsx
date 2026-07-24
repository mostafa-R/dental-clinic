import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

export default function RequirePermission({ module, action, children }) {
  const myPermissions = useSelector((s) => s.users.myPermissions);
  const permissionsStatus = useSelector((s) => s.users.permissionsStatus);

  if (permissionsStatus === 'loading' || permissionsStatus === 'idle') return null;

  if (permissionsStatus === 'failed' || !myPermissions) {
    return <Navigate to="/login" replace />;
  }

  if (myPermissions.isSystemAdmin) return children;

  const actions = myPermissions.permissions?.[module];
  if (actions && actions.length > 0 && (!action || actions.includes(action))) {
    return children;
  }

  return <Navigate to="/dashboard" replace />;
}
