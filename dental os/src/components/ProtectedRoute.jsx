import { useEffect } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadCurrentUser, setCredentials } from '../features/auth/authSlice';
import SuspendedScreen from './SuspendedScreen';

export default function ProtectedRoute() {
  const dispatch = useDispatch();
  const { user, status } = useSelector((s) => s.auth);
  const [searchParams] = useSearchParams();

  // Handle impersonation token from URL query param
  useEffect(() => {
    const token = searchParams.get('impersonation');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        dispatch(setCredentials({
          _id: payload.sub,
          role: payload.role,
          branch: payload.branch ? { _id: payload.branch } : null,
          tenant: { _id: payload.tenant },
          _impersonating: true,
          _impersonator: payload.impersonatorName || 'Admin',
        }));
        // Clean URL without reload
        window.history.replaceState({}, '', window.location.pathname);
      } catch {
        // Invalid token — ignore
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user && status === 'idle') {
      dispatch(loadCurrentUser());
    }
  }, [dispatch, user, status]);

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

  // Check tenant suspension
  const tenantStatus = user.tenant?.status;
  const tenantActive = user.tenant?.isActive;
  if (tenantStatus === 'suspended' || tenantStatus === 'cancelled' || tenantActive === false) {
    return <SuspendedScreen />;
  }

  return <Outlet />;
}