import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

import { moduleForPath } from '../lib/routes';
import { useLandingPath, moduleAccessStatus } from '../lib/roles';
import AccessDenied from './AccessDenied';
import FullPageLoader from './FullPageLoader';

/** `/dashboard/` and `/dashboard` are the same page for loop-avoidance. */
const normalize = (path) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

/**
 * URL-level permission gate for the whole authenticated app.
 *
 * It resolves the module from `location.pathname` through the same
 * `lib/routes.js` registry the sidebar renders from, so a hand-typed,
 * bookmarked or shared URL is denied exactly like a hidden menu item — and,
 * just as importantly, a module can no longer sit in the sidebar while its URL
 * bounces, or be reachable by URL while absent from the menu.
 *
 * This replaced the per-route `<RequirePermission module=...>` wrappers in
 * `App.jsx`, which were a second copy of the predicate that could drift from the
 * sidebar's copy, and which had no coverage for nested paths.
 */
export default function ModuleGuard() {
  const location = useLocation();
  const myPermissions = useSelector((s) => s.users?.myPermissions);
  const permissionsStatus = useSelector((s) => s.users?.permissionsStatus);
  const landingPath = useLandingPath();

  // Unregistered paths (the 404 branch) need no module — let them render.
  const module = moduleForPath(location.pathname);
  if (!module) return <Outlet />;

  if (permissionsStatus === 'loading' || permissionsStatus === 'idle') {
    return <FullPageLoader />;
  }

  if (permissionsStatus === 'failed' || !myPermissions) {
    return <Navigate to="/login" replace />;
  }

  const reason = moduleAccessStatus(myPermissions, module);
  if (reason === 'granted') return <Outlet />;

  // Denied. Redirect to a page the user can actually open — but never redirect
  // to the page they are already on, which is what produced a same-path
  // redirect loop for a role with no `dashboard:read` grant.
  if (normalize(location.pathname) !== normalize(landingPath)) {
    return <Navigate to={landingPath} replace />;
  }

  // The landing route itself is denied, so there is nowhere left to send them.
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 dark:bg-slate-950">
      <AccessDenied reason={reason} module={module} />
    </div>
  );
}
