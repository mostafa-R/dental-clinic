import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadSiteAdmin } from './siteAuthSlice';

export default function SiteProtectedRoute() {
  const dispatch = useDispatch();
  const { admin, status } = useSelector((s) => s.siteAuth);

  useEffect(() => {
    if (!admin && status === 'idle') {
      dispatch(loadSiteAdmin());
    }
  }, [dispatch, admin, status]);

  if (!admin && (status === 'loading' || status === 'idle')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/platform/login" replace />;
  }

  return <Outlet />;
}