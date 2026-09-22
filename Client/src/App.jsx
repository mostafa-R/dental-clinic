import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import RequirePermission from './components/RequirePermission';
import Skeleton from './components/ui/Skeleton';

const Login = lazy(() => import('./features/auth/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Patients = lazy(() => import('./pages/Patients'));
const PatientEmr = lazy(() => import('./pages/PatientEmr'));
const Appointments = lazy(() => import('./pages/Appointments'));
const Recalls = lazy(() => import('./pages/Recalls'));
const Branches = lazy(() => import('./pages/Branches'));
const Billing = lazy(() => import('./pages/Billing'));
const Accounting = lazy(() => import('./pages/Accounting'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Roles = lazy(() => import('./pages/Roles'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Chat = lazy(() => import('./pages/Chat'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Pricing = lazy(() => import('./pages/Pricing'));

function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="mt-4 h-6 w-24" />
            <Skeleton className="mt-2 h-4 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Pricing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="dashboard" element={<RequirePermission module="dashboard"><Dashboard /></RequirePermission>} />
            <Route path="patients" element={<RequirePermission module="patients"><Patients /></RequirePermission>} />
            <Route path="patients/:id/emr" element={<RequirePermission module="emr"><PatientEmr /></RequirePermission>} />
            <Route path="appointments" element={<RequirePermission module="appointments"><Appointments /></RequirePermission>} />
            <Route path="recalls" element={<RequirePermission module="appointments"><Recalls /></RequirePermission>} />
            <Route path="branches" element={<RequirePermission module="branches"><Branches /></RequirePermission>} />
            <Route path="billing" element={<RequirePermission module="billing"><Billing /></RequirePermission>} />
            <Route path="accounting" element={<RequirePermission module="accounting"><Accounting /></RequirePermission>} />
            <Route path="inventory" element={<RequirePermission module="inventory"><Inventory /></RequirePermission>} />
            <Route path="roles" element={<RequirePermission module="roles"><Roles /></RequirePermission>} />
            <Route path="users" element={<RequirePermission module="users"><Users /></RequirePermission>} />
            <Route path="settings" element={<RequirePermission module="settings"><Settings /></RequirePermission>} />
             <Route path="chat" element={<RequirePermission module="chat"><Chat /></RequirePermission>} />
            <Route path="*" element={<NotFound embedded />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default App;
