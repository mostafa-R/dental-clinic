import { lazy, Suspense, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import RequireAccess from "./components/RequireAccess";
import DashboardLayout from "./components/layout/DashboardLayout";
import { PageLoader } from "./components/ui/Spinner";
import { getCurrentUser } from "./features/auth/authSlice";

const Login = lazy(() => import("./features/auth/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tenants = lazy(() => import("./pages/Tenants"));
const Branches = lazy(() => import("./pages/Branches"));
const Billing = lazy(() => import("./pages/Billing"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Admins = lazy(() => import("./pages/Admins"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const ErrorLogs = lazy(() => import("./pages/ErrorLogs"));
const FeatureFlags = lazy(() => import("./pages/FeatureFlags"));
const Health = lazy(() => import("./pages/Health"));
const Plans = lazy(() => import("./pages/Plans"));
const Quarantine = lazy(() => import("./pages/Quarantine"));
const Settings = lazy(() => import("./pages/Settings"));
const Backups = lazy(() => import("./pages/Backups"));
const Performance = lazy(() => import("./pages/Performance"));

function App() {
  const dispatch = useDispatch();
  const { _initialized, loading } = useSelector((state) => state.auth);
  const { theme, language } = useSelector((state) => state.ui);

  useEffect(() => {
    if (!_initialized && !loading) {
      dispatch(getCurrentUser());
    }
  }, [dispatch, _initialized, loading]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  if (!_initialized) {
    return <PageLoader />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route
              path="/"
              element={
                <RequireAccess accessKey="dashboard">
                  <Dashboard />
                </RequireAccess>
              }
            />
            <Route
              path="/tenants"
              element={
                <RequireAccess accessKey="tenants">
                  <Tenants />
                </RequireAccess>
              }
            />
            <Route
              path="/branches"
              element={
                <RequireAccess accessKey="branches">
                  <Branches />
                </RequireAccess>
              }
            />
            <Route
              path="/billing"
              element={
                <RequireAccess accessKey="billing">
                  <Billing />
                </RequireAccess>
              }
            />
            <Route
              path="/analytics"
              element={
                <RequireAccess accessKey="analytics">
                  <Analytics />
                </RequireAccess>
              }
            />
            <Route
              path="/admins"
              element={
                <RequireAccess accessKey="admins">
                  <Admins />
                </RequireAccess>
              }
            />
            <Route
              path="/audit-logs"
              element={
                <RequireAccess accessKey="auditLogs">
                  <AuditLogs />
                </RequireAccess>
              }
            />
            <Route
              path="/error-logs"
              element={
                <RequireAccess accessKey="errorLogs">
                  <ErrorLogs />
                </RequireAccess>
              }
            />
            <Route
              path="/feature-flags"
              element={
                <RequireAccess accessKey="featureFlags">
                  <FeatureFlags />
                </RequireAccess>
              }
            />
            <Route
              path="/health"
              element={
                <RequireAccess accessKey="health">
                  <Health />
                </RequireAccess>
              }
            />
            <Route
              path="/plans"
              element={
                <RequireAccess accessKey="plans">
                  <Plans />
                </RequireAccess>
              }
            />
            <Route
              path="/quarantine"
              element={
                <RequireAccess accessKey="quarantine">
                  <Quarantine />
                </RequireAccess>
              }
            />
            <Route
              path="/backups"
              element={
                <RequireAccess accessKey="backups">
                  <Backups />
                </RequireAccess>
              }
            />
            <Route
              path="/performance"
              element={
                <RequireAccess accessKey="performance">
                  <Performance />
                </RequireAccess>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAccess accessKey="settings">
                  <Settings />
                </RequireAccess>
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
