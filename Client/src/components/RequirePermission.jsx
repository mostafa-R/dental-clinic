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

  // Enforce subscription entitlement at route level: module must be in the
  // tenant's plan AND granted by role. Backend already intersects, this is
  // defense-in-depth so a direct URL never renders a gated screen.
  if (Array.isArray(myPermissions.planModules) && module && !myPermissions.planModules.includes(module)) {
    return <Navigate to="/dashboard" replace />;
  }

  const actions = myPermissions.permissions?.[module];
  if (actions && actions.length > 0 && (!action || actions.includes(action))) {
    return children;
  }

  return <Navigate to="/dashboard" replace />;
}
