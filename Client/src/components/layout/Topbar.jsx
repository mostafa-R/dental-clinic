import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { authApi, clearClientSessionTraces } from "../../features/auth/authApi";
import { logout } from "../../features/auth/authSlice";
import PreferencesControls from "../../features/preferences/PreferencesControls";
import GlobalSearch from "../../features/search/GlobalSearch";
import { toggleMobileSidebar } from "../../features/ui/uiSlice";
import { useT } from "../../lib/i18n";
import { roleLabel } from "../../lib/roles";
import { disconnectSocket } from "../../lib/socket";

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function SettingsIconSmall() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.14A1.65 1.65 0 0 0 9.4 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.14A1.65 1.65 0 0 0 4.6 9.4a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.14a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.14a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function CalendarPlusIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="10" y1="16" x2="14" y2="16" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="7" width="20" height="4" rx="1" />
      <rect x="2" y="13" width="20" height="4" rx="1" />
      <rect x="2" y="1" width="20" height="4" rx="1" />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function useClickOutside(ref, handler) {
  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) handler();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ref, handler]);
}

export default function Topbar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const { t } = useT();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const chatUnread = useSelector((s) => s.chat.unread);
  const mobileOpen = useSelector((s) => s.ui.mobileSidebarOpen);
  const totalNotif = useMemo(
    () => Object.values(chatUnread).reduce((sum, n) => sum + n, 0),
    [chatUnread],
  );

  useClickOutside(menuRef, () => setShowUserMenu(false));
  useClickOutside(notifRef, () => setShowNotifMenu(false));

  const branchName = user?.branch?.name || t("topbar.noBranch");

  const onLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore server errors — always clear the local session below */
    } finally {
      const { resetPermissions } = await import("../../features/users/userSlice");
      dispatch(resetPermissions());
      dispatch(logout());
      disconnectSocket();
      clearClientSessionTraces();
    }
    navigate("/login", { replace: true });
  };

  const initials =
    user?.name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
      {/* Mobile menu toggle */}
      <button
        type="button"
        onClick={() => dispatch(toggleMobileSidebar())}
        className="-ms-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
        aria-label={t("topbar.toggleMenu")}
        aria-expanded={mobileOpen}
        aria-controls="app-mobile-nav"
      >
        <MenuIcon />
      </button>

      {/* Branch badge */}
      <div className="hidden items-center gap-2.5 sm:flex">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-50"
            style={{ animationDuration: '2.5s' }}
          />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
        </span>
        <div className="leading-tight">
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
            {t("topbar.branch")}
          </p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {branchName}
          </p>
        </div>
      </div>

      <div className="hidden border-s border-slate-200 ps-4 dark:border-slate-700 sm:block" />

      {/* Quick action shortcuts */}
      <div className="hidden items-center gap-1 sm:flex">
        <button
          type="button"
          onClick={() => navigate("/patients?new=1")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors duration-150 hover:border-brand/30 hover:bg-brand/5 hover:text-brand-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand dark:hover:bg-slate-800 dark:hover:text-brand-light"
        >
          <UserPlusIcon />
          {t("topbar.newPatient")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/appointments?new=1")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors duration-150 hover:border-brand/30 hover:bg-brand/5 hover:text-brand-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand dark:hover:bg-slate-800 dark:hover:text-brand-light"
        >
          <CalendarPlusIcon />
          {t("topbar.newAppointment")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/appointments?tab=queue")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors duration-150 hover:border-brand/30 hover:bg-brand/5 hover:text-brand-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand dark:hover:bg-slate-800 dark:hover:text-brand-light"
        >
          <QueueIcon />
          {t("topbar.liveQueue")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/billing?new=1")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors duration-150 hover:border-brand/30 hover:bg-brand/5 hover:text-brand-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand dark:hover:bg-slate-800 dark:hover:text-brand-light"
        >
          <InvoiceIcon />
          {t("topbar.newInvoice")}
        </button>
      </div>

      <div className="flex-1" />

      {/* Global search */}
      <GlobalSearch />

      <div className="flex-1" />

      {/* Right section */}
      <div className="ms-auto flex items-center gap-2 sm:gap-3">
        <PreferencesControls />

        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => {
              setShowNotifMenu((p) => !p);
              setShowUserMenu(false);
            }}
            className="relative rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label={t("topbar.notifications")}
          >
            <BellIcon />
            {totalNotif > 0 && (
              <>
                <span className="absolute end-1.5 top-1.5 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
                <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                  {totalNotif > 9 ? "9+" : totalNotif}
                </span>
              </>
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute end-0 top-full mt-1 w-72 origin-top-end rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800">
              {totalNotif > 0 ? (
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <p className="px-3 py-2 font-medium">
                    {t("topbar.unreadMessages")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/chat");
                      setShowNotifMenu(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-brand transition hover:bg-brand/10 dark:text-brand-light dark:hover:bg-brand/15"
                  >
                    <BellIcon />
                    <span>{t("topbar.viewChat")}</span>
                    <span className="ms-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">
                      {totalNotif}
                    </span>
                  </button>
                </div>
              ) : (
                <p className="px-3 py-4 text-center text-sm text-slate-400">
                  {t("topbar.noNotifications")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu((p) => !p)}
            className="flex items-center gap-2.5 rounded-xl p-1 pe-2 transition hover:bg-brand/10 dark:hover:bg-slate-800"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark text-sm font-bold text-white shadow-sm shadow-brand/30">
              {initials}
            </span>
            <div className="hidden text-start leading-tight md:block">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {user?.name}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {roleLabel(user?.role)}
              </p>
            </div>
            <ChevronDownIcon />
          </button>

          {showUserMenu && (
            <div className="absolute end-0 top-full mt-1 w-56 origin-top-end rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800">
              <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700 md:hidden">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {user?.name}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {roleLabel(user?.role)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigate("/settings");
                  setShowUserMenu(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:bg-brand/10 hover:text-brand-dark dark:text-slate-300 dark:hover:bg-brand/15"
              >
                <SettingsIconSmall />
                {t("settings.title")}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/15"
              >
                <LogOutIcon />
                {t("topbar.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
