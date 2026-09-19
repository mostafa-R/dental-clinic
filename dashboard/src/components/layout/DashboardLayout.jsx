import { useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useLocation, Outlet, useNavigate } from "react-router-dom";
import { endImpersonation } from "../../features/impersonation/impersonationSlice";
import CommandPalette from "../CommandPalette";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { t } from "../../lib/i18n";
import { canUserAccess } from "../../lib/permissions";

const KEY_JUMPS = {
  d: { href: "/", accessKey: "dashboard" },
  t: { href: "/tenants", accessKey: "tenants" },
  a: { href: "/analytics", accessKey: "analytics" },
  b: { href: "/billing", accessKey: "billing" },
  p: { href: "/plans", accessKey: "plans" },
  l: { href: "/alerts", accessKey: "alerts" },
  s: { href: "/settings", accessKey: "settings" },
};

const navigation = [
  { nameKey: "dashboard", href: "/" },
  { nameKey: "tenants", href: "/tenants" },
  { nameKey: "branches", href: "/branches" },
  { nameKey: "plans", href: "/plans" },
  { nameKey: "billing", href: "/billing" },
  { nameKey: "analytics", href: "/analytics" },
  { nameKey: "admins", href: "/admins" },
  { nameKey: "featureFlags", href: "/feature-flags" },
  { nameKey: "quarantine", href: "/quarantine" },
  { nameKey: "health", href: "/health" },
  { nameKey: "performance", href: "/performance" },
  { nameKey: "auditLogs", href: "/audit-logs" },
  { nameKey: "errorLogs", href: "/error-logs" },
  { nameKey: "alerts", href: "/alerts" },
  { nameKey: "backups", href: "/backups" },
  { nameKey: "settings", href: "/settings" },
];

function ImpersonationBanner() {
  const dispatch = useDispatch();
  const { active, targetUser, targetTenant } = useSelector((state) => state.impersonation);
  const { language } = useSelector((state) => state.ui);

  if (!active) return null;

  return (
    <div className="bg-red-600 text-white text-sm px-4 py-2 flex items-center justify-between">
      <span>
        <strong>{t("impersonationWarning", language)}:</strong>{" "}
        {targetUser?.name} ({targetUser?.email}) @ {targetTenant?.name}
        <span className="ml-2 text-red-200 text-xs">{t("impersonationDesc", language)}</span>
      </span>
      <button
        onClick={() => dispatch(endImpersonation())}
        className="bg-white text-red-600 px-3 py-1 rounded text-xs font-medium hover:bg-red-50"
      >
        {t("stopImpersonation", language)}
      </button>
    </div>
  );
}

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarCollapsed, language } = useSelector((state) => state.ui);
  const { user } = useSelector((state) => state.auth);
  const pendingG = useRef(false);
  const gTimer = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag) || e.target?.isContentEditable) return;
      if (e.key === "g" || e.key === "G") {
        pendingG.current = true;
        if (gTimer.current) clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => {
          pendingG.current = false;
        }, 800);
        return;
      }
      if (pendingG.current) {
        pendingG.current = false;
        if (gTimer.current) clearTimeout(gTimer.current);
        const jump = KEY_JUMPS[e.key.toLowerCase()];
        if (jump && canUserAccess(user, jump.accessKey)) {
          e.preventDefault();
          navigate(jump.href);
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (gTimer.current) clearTimeout(gTimer.current);
    };
  }, [navigate, user]);

  const currentNav = navigation.find(
    (item) => item.href === location.pathname,
  );
  const pageTitle = currentNav ? t(currentNav.nameKey, language) : "";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <ImpersonationBanner />
      <Sidebar />
      <main
        className={`transition-all duration-300 ${
          sidebarCollapsed ? "ms-20" : "ms-64"
        }`}
      >
        <Topbar title={pageTitle} />
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
