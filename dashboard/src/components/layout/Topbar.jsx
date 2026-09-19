import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  acknowledgeAllAlerts,
  fetchActiveAlerts,
  fetchAlertSummary,
} from "../../features/alerts/alertsSlice";
import { logout } from "../../features/auth/authSlice";
import { setTheme, toggleSidebar } from "../../features/ui/uiSlice";
import Badge from "../ui/Badge";
import {
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  BellIcon,
  ExclamationTriangleIcon,
  MoonIcon,
  SunIcon,
  XMarkIcon,
} from "../ui/icons";
import { canUserAccess } from "../../lib/permissions";
import { getRelativeTime } from "../../lib/format";
import { t } from "../../lib/i18n";

const severityBadge = (severity) =>
  severity === "critical" ? "danger" : severity === "warning" ? "warning" : "info";

function CriticalToasts({ toasts, language, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 end-4 z-[60] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-800 shadow-lg p-4 max-w-sm"
        >
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              {t("alertsToastNewCritical", language)}
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{toast.title}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{toast.message}</p>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white shrink-0"
            aria-label={t("close", language)}
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Topbar({ title }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { theme, language } = useSelector((state) => state.ui);
  const { active, summary } = useSelector((state) => state.alerts);
  const [bellOpen, setBellOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const shownCritical = useRef(new Set());
  const bellRef = useRef(null);

  const canViewAlerts = canUserAccess(user, "alerts");

  useEffect(() => {
    if (!canViewAlerts) return;
    dispatch(fetchActiveAlerts());
    dispatch(fetchAlertSummary());
    const timer = setInterval(() => {
      dispatch(fetchActiveAlerts());
      dispatch(fetchAlertSummary());
    }, 30000);
    return () => clearInterval(timer);
  }, [dispatch, canViewAlerts]);

  useEffect(() => {
    if (!canViewAlerts || active.length === 0) return;
    const recent = Date.now() - 5 * 60 * 1000;
    const freshCritical = active.filter(
      (a) =>
        a.severity === "critical" &&
        new Date(a.firstSeenAt).getTime() >= recent &&
        !shownCritical.current.has(a._id),
    );
    if (freshCritical.length === 0) return;

    freshCritical.forEach((a) => shownCritical.current.add(a._id));
    setToasts((prev) =>
      [...prev, ...freshCritical.map((a) => ({ id: a._id, title: a.title, message: a.message }))].slice(-3),
    );
    freshCritical.forEach((a) => {
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== a._id));
      }, 8000);
    });
  }, [active, canViewAlerts]);

  useEffect(() => {
    if (!bellOpen) return;
    const onClickOutside = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [bellOpen]);

  const handleLogout = async () => {
    await dispatch(logout());
    navigate("/login");
  };

  const toggleTheme = () => {
    dispatch(setTheme(theme === "light" ? "dark" : "light"));
  };

  const handleMarkAllRead = async () => {
    await dispatch(acknowledgeAllAlerts());
    dispatch(fetchActiveAlerts());
    dispatch(fetchAlertSummary());
  };

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <Bars3Icon className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Alerts bell */}
          {canViewAlerts && (
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setBellOpen((v) => !v)}
                className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                title={t("alertsBellTitle", language)}
              >
                <BellIcon className="w-5 h-5" />
                {summary.active > 0 && (
                  <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {summary.active > 99 ? "99+" : summary.active}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute end-0 mt-2 w-80 max-h-96 overflow-auto rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("alertsBellTitle", language)}
                    </p>
                    {active.length > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {t("alertsMarkAllRead", language)}
                      </button>
                    )}
                  </div>

                  {active.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
                      {t("alertsNoOpen", language)}
                    </p>
                  ) : (
                    <ul>
                      {active.slice(0, 8).map((alert) => (
                        <li
                          key={alert._id}
                          className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50"
                        >
                          <div className="flex items-start gap-2">
                            <Badge variant={severityBadge(alert.severity)} size="sm">
                              {alert.severity}
                            </Badge>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                                {alert.title}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {alert.message}
                              </p>
                            </div>
                          </div>
                          <p className="ps-1 mt-1 text-[10px] text-slate-400">
                            {getRelativeTime(alert.lastSeenAt, language)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <button
                    onClick={() => {
                      setBellOpen(false);
                      navigate("/alerts");
                    }}
                    className="w-full text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 py-3 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    {t("alertsViewAll", language)}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            {theme === "light" ? (
              <MoonIcon className="w-5 h-5" />
            ) : (
              <SunIcon className="w-5 h-5" />
            )}
          </button>

          {/* User menu */}
          <div className="flex items-center gap-3 ps-3 border-s border-slate-200 dark:border-slate-700">
            <div className="text-sm text-end hidden sm:block">
              <p className="font-medium text-slate-900 dark:text-white">
                {user?.name || "Admin"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                {user?.role ? user.role.replace(/_/g, " ") : t("superAdmin", language)}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              title={t("logout", language)}
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <CriticalToasts toasts={toasts} language={language} onDismiss={(id) => setToasts((prev) => prev.filter((x) => x.id !== id))} />
    </header>
  );
}