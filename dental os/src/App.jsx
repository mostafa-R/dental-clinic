import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import RequirePermission from './components/RequirePermission';
import RoleRedirect from './components/RoleRedirect';

const Login = lazy(() => import('./features/auth/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Patients = lazy(() => import('./pages/Patients'));
const PatientEmr = lazy(() => import('./pages/PatientEmr'));
const Appointments = lazy(() => import('./pages/Appointments'));
const Branches = lazy(() => import('./pages/Branches'));
const Billing = lazy(() => import('./pages/Billing'));
const Accounting = lazy(() => import('./pages/Accounting'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Roles = lazy(() => import('./pages/Roles'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Chat = lazy(() => import('./pages/Chat'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center p-16">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
        Loading…
      </div>
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<RoleRedirect />} />
            <Route path="dashboard" element={<RequirePermission module="dashboard"><Dashboard /></RequirePermission>} />
            <Route path="patients" element={<RequirePermission module="patients"><Patients /></RequirePermission>} />
            <Route path="patients/:id/emr" element={<RequirePermission module="emr"><PatientEmr /></RequirePermission>} />
            <Route path="appointments" element={<RequirePermission module="appointments"><Appointments /></RequirePermission>} />
            <Route path="branches" element={<RequirePermission module="branches"><Branches /></RequirePermission>} />
            <Route path="billing" element={<RequirePermission module="billing"><Billing /></RequirePermission>} />
            <Route path="accounting" element={<RequirePermission module="accounting"><Accounting /></RequirePermission>} />
            <Route path="inventory" element={<RequirePermission module="inventory"><Inventory /></RequirePermission>} />
            <Route path="roles" element={<RequirePermission module="roles"><Roles /></RequirePermission>} />
            <Route path="users" element={<RequirePermission module="users"><Users /></RequirePermission>} />
            <Route path="settings" element={<RequirePermission module="settings"><Settings /></RequirePermission>} />
             <Route path="chat" element={<RequirePermission module="chat"><Chat /></RequirePermission>} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
