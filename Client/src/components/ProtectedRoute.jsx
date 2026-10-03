import { useEffect } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadCurrentUser, verifyImpersonation } from '../features/auth/authSlice';
import { fetchMyPermissions } from '../features/users/userSlice';
import { usePermissionRevalidation } from '../lib/roles';
import { subscribeBranch, disconnectSocket } from '../lib/socket';
import FullPageLoader from './FullPageLoader';
import SuspendedScreen from './SuspendedScreen';

export default function ProtectedRoute() {
  const dispatch = useDispatch();
  const { user, status } = useSelector((s) => s.auth);
  const permissionsStatus = useSelector((s) => s.users.permissionsStatus);
  const [searchParams, setSearchParams] = useSearchParams();

  // Redeem an impersonation handoff code that landed on a protected route
  // directly. The code is single-use and 60s-lived, and is stripped from the
  // address bar before the request so it cannot be re-shared.
  useEffect(() => {
    const code = searchParams.get('impersonation_code');
    if (!code) return;
    dispatch(verifyImpersonation({ code }));
    // Build the cleaned query from the router's own params instead of
    // `window.location`: the router is the source of truth for the current
    // location, so reading window directly could rewrite the URL to a
    // different route than the one mounted (and would break under a basename).
    const clean = new URLSearchParams(searchParams);
    clean.delete('impersonation_code');
    setSearchParams(clean, { replace: true });
  }, [dispatch, searchParams, setSearchParams]);

  useEffect(() => {
    if (!user && status === 'idle') {
      dispatch(loadCurrentUser());
    }
  }, [dispatch, user, status]);

  useEffect(() => {
    if (user && permissionsStatus === 'idle') {
      dispatch(fetchMyPermissions());
    }
  }, [dispatch, user, permissionsStatus]);

  // A plan downgrade or role edit made by an admin must reach open tabs, not
  // just the next page load.
  usePermissionRevalidation();

  useEffect(() => {
    if (user?.branch?._id) {
      subscribeBranch(user.branch._id);
    }
    return () => { disconnectSocket(); };
  }, [user?.branch?._id]);

  if (!user && (status === 'loading' || status === 'idle')) {
    return <FullPageLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (permissionsStatus === 'loading' || permissionsStatus === 'idle') {
    return <FullPageLoader />;
  }

  // Check tenant suspension
  const tenantStatus = user.tenant?.status;
  const tenantActive = user.tenant?.isActive;
  if (tenantStatus === 'suspended' || tenantStatus === 'cancelled' || tenantActive === false) {
    return <SuspendedScreen />;
  }

  return <Outlet />;
}