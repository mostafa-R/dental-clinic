import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import ChatGlobalListener from "../../features/chat/ChatGlobalListener";
import { applyServerPreferences } from "../../features/preferences/usePreferences";
import { initNotifications } from "../../lib/notificationSound";
import { setClinicTimeZone } from "../../lib/clinicTime";
import { useT } from "../../lib/i18n";
import Skeleton from "../ui/Skeleton";

function ImpersonationBanner() {
  const user = useSelector((s) => s.auth.user);
  const { t } = useT();
  if (!user?._impersonating) return null;

  return (
    <div className="bg-red-600 text-white text-sm px-4 py-2 flex items-center justify-between">
      <span>
        <strong>{t("impersonation.title")}</strong>{" "}
        {t("impersonation.actingAs")} {user.name || user.email}
        <span className="ms-2 text-red-200 text-xs">
          {" "}
          — {t("impersonation.logged")}
        </span>
      </span>
      <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
        {t("impersonation.by")} {user._impersonator || t("impersonation.admin")}
      </span>
    </div>
  );
}

/** Placeholder for a page chunk that has not arrived yet. */
function PageFallback() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function AppLayout() {
  const user = useSelector((s) => s.auth.user);
  const clinicTimezone = useSelector((s) => s.users?.myPermissions?.timezone);
  const location = useLocation();

  // The clinic's IANA zone is the reference for every date the UI renders or
  // submits. It arrives with the permissions payload and is re-applied whenever
  // that payload is refreshed, so a clinic that changes its timezone (or an
  // impersonation switch to another clinic) is picked up without a re-login.
  // Until it lands, date helpers fall back to the browser zone.
  useEffect(() => {
    setClinicTimeZone(clinicTimezone);
  }, [clinicTimezone]);

  // Apply server-stored preferences once the authenticated user is known.
  // Re-runs only when the user identity changes (login), so local toggles
  // made during the session are never clobbered.
  useEffect(() => {
    applyServerPreferences(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  useEffect(() => {
    const handler = () => {
      initNotifications();
      document.removeEventListener("click", handler);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas dark:bg-slate-950">
      <ChatGlobalListener />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ImpersonationBanner />
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          {/* Page-level Suspense lives here, not only around `<Routes>` in
              App.jsx. Every page is a `lazy()` import, and with a single
              boundary at the top the whole shell — sidebar, topbar, banner —
              was replaced by the route skeleton on each navigation, so the app
              visibly blinked out and back and the sidebar lost scroll position
              and open state. Scoping the fallback to the outlet keeps the chrome
              mounted and only the page area waits. */}
          <Suspense fallback={<PageFallback />}>
            <div key={location.pathname} className="animate-page-in">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
