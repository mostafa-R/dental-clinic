import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { logout } from "../../features/auth/authSlice";
import { setTheme, toggleSidebar } from "../../features/ui/uiSlice";
import {
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  MoonIcon,
  SunIcon,
} from "../ui/icons";
import { t } from "../../lib/i18n";

export default function Topbar({ title }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { theme, language } = useSelector((state) => state.ui);

  const handleLogout = async () => {
    await dispatch(logout());
    navigate("/login");
  };

  const toggleTheme = () => {
    dispatch(setTheme(theme === "light" ? "dark" : "light"));
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
    </header>
  );
}
