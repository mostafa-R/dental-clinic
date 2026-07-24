import { useSelector } from "react-redux";
import { NavLink } from "react-router-dom";
import {
  ArrowUpTrayIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  CogIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  HomeIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  ToggleIcon,
  UsersIcon,
} from "../ui/icons";
import { t } from "../../lib/i18n";

const navigation = [
  // Overview
  { nameKey: "dashboard", href: "/", icon: HomeIcon, group: "overview" },
  
  // Core Management
  { nameKey: "tenants", href: "/tenants", icon: BuildingOfficeIcon, group: "core" },
  { nameKey: "branches", href: "/branches", icon: UsersIcon, group: "core" },
  { nameKey: "plans", href: "/plans", icon: Squares2X2Icon, group: "core" },
  
  // Finance
  { nameKey: "billing", href: "/billing", icon: CreditCardIcon, group: "finance" },
  { nameKey: "analytics", href: "/analytics", icon: ChartBarIcon, group: "finance" },
  
  // Security & Admin
  { nameKey: "admins", href: "/admins", icon: ShieldCheckIcon, group: "security" },
  { nameKey: "featureFlags", href: "/feature-flags", icon: ToggleIcon, group: "security" },
  { nameKey: "quarantine", href: "/quarantine", icon: NoSymbolIcon, group: "security" },
  
  // Monitoring
  { nameKey: "health", href: "/health", icon: HeartIcon, group: "monitoring" },
  { nameKey: "performance", href: "/performance", icon: ClockIcon, group: "monitoring" },
  { nameKey: "auditLogs", href: "/audit-logs", icon: CheckCircleIcon, group: "monitoring" },
  { nameKey: "errorLogs", href: "/error-logs", icon: ExclamationTriangleIcon, group: "monitoring" },
  
  // System
  { nameKey: "backups", href: "/backups", icon: ArrowUpTrayIcon, group: "system" },
  { nameKey: "settings", href: "/settings", icon: CogIcon, group: "system" },
];

export default function Sidebar() {
  const { sidebarCollapsed } = useSelector((state) => state.ui);
  const { language } = useSelector((state) => state.ui);

  // Group navigation items
  const groupedNav = navigation.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const groups = [
    { key: "overview", label: "" },
    { key: "core", label: "Management" },
    { key: "finance", label: "Finance" },
    { key: "security", label: "Security" },
    { key: "monitoring", label: "Monitoring" },
    { key: "system", label: "System" },
  ];

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
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {groups.map((group, groupIndex) => (
          <div key={group.key}>
            {groupIndex > 0 && (
              <div className="my-3 border-t border-slate-200 dark:border-slate-700" />
            )}
            {!sidebarCollapsed && group.label && (
              <div className="px-3 mb-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {group.label}
              </div>
            )}
            <div className="space-y-1">
              {groupedNav[group.key]?.map((item) => (
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
                  title={sidebarCollapsed ? t(item.nameKey, language) : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!sidebarCollapsed && <span>{t(item.nameKey, language)}</span>}
                </NavLink>
              ))}
            </div>
          </div>
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
