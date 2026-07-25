import { lazy, Suspense, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
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
            <Route path="/" element={<Dashboard />} />
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/branches" element={<Branches />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/admins" element={<Admins />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/error-logs" element={<ErrorLogs />} />
            <Route path="/feature-flags" element={<FeatureFlags />} />
            <Route path="/health" element={<Health />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/quarantine" element={<Quarantine />} />
            <Route path="/backups" element={<Backups />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
