import { useSelector } from "react-redux";
import { NavLink } from "react-router-dom";
import {
  BuildingOfficeIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CogIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  HomeIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  ToggleIcon,
} from "../ui/icons";
import { t } from "../../lib/i18n";

const navigation = [
  { nameKey: "dashboard", href: "/", icon: HomeIcon },
  { nameKey: "tenants", href: "/tenants", icon: BuildingOfficeIcon },
  { nameKey: "branches", href: "/branches", icon: BuildingOfficeIcon },
  { nameKey: "billing", href: "/billing", icon: CreditCardIcon },
  { nameKey: "analytics", href: "/analytics", icon: ChartBarIcon },
  { nameKey: "admins", href: "/admins", icon: ShieldCheckIcon },
  { nameKey: "auditLogs", href: "/audit-logs", icon: CheckCircleIcon },
  { nameKey: "errorLogs", href: "/error-logs", icon: ExclamationTriangleIcon },
  { nameKey: "featureFlags", href: "/feature-flags", icon: ToggleIcon },
  { nameKey: "health", href: "/health", icon: HeartIcon },
  { nameKey: "quarantine", href: "/quarantine", icon: NoSymbolIcon },
  { nameKey: "plans", href: "/plans", icon: Squares2X2Icon },
  { nameKey: "settings", href: "/settings", icon: CogIcon },
];

export default function Sidebar() {
  const { sidebarCollapsed } = useSelector((state) => state.ui);
  const { language } = useSelector((state) => state.ui);

  return (
    <aside
      className={`fixed inset-y-0 start-0 z-50 flex flex-col bg-white dark:bg-slate-800 border-e border-slate-200 dark:border-slate-700 transition-all duration-300 ${
        sidebarCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">DO</span>
          </div>
          {!sidebarCollapsed && (
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              Dental OS
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.nameKey}
            to={item.href}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!sidebarCollapsed && <span>{t(item.nameKey, language)}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        {!sidebarCollapsed && (
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
            Site Dashboard v1.0
          </div>
        )}
      </div>
    </aside>
  );
}
