import { useEffect } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadCurrentUser, verifyImpersonation } from '../features/auth/authSlice';
import { fetchMyPermissions } from '../features/users/userSlice';
import { subscribeBranch, disconnectSocket } from '../lib/socket';
import SuspendedScreen from './SuspendedScreen';

export default function ProtectedRoute() {
  const dispatch = useDispatch();
  const { user, status } = useSelector((s) => s.auth);
  const permissionsStatus = useSelector((s) => s.users.permissionsStatus);
  const [searchParams] = useSearchParams();

  // Handle impersonation token from URL query param — verify server-side
  useEffect(() => {
    const token = searchParams.get('impersonation');
    if (!token) return;
    dispatch(verifyImpersonation(token));
    window.history.replaceState({}, '', window.location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (user?.branch?._id) {
      subscribeBranch(user.branch._id);
    }
    return () => { disconnectSocket(); };
  }, [user?.branch?._id]);

  if (!user && (status === 'loading' || status === 'idle')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (permissionsStatus === 'loading' || permissionsStatus === 'idle') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  // Check tenant suspension
  const tenantStatus = user.tenant?.status;
  const tenantActive = user.tenant?.isActive;
  if (tenantStatus === 'suspended' || tenantStatus === 'cancelled' || tenantActive === false) {
    return <SuspendedScreen />;
  }

  return <Outlet />;
}