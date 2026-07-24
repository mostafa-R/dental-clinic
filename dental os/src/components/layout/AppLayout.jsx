import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ChatGlobalListener from '../../features/chat/ChatGlobalListener';
import { applyServerPreferences } from '../../features/preferences/usePreferences';
import { initNotifications } from '../../lib/notificationSound';

function ImpersonationBanner() {
  const user = useSelector((s) => s.auth.user);
  if (!user?._impersonating) return null;

  return (
    <div className="bg-red-600 text-white text-sm px-4 py-2 flex items-center justify-between">
      <span>
        <strong>Impersonation Mode:</strong> You are acting as {user.name || user.email}
        <span className="ml-2 text-red-200 text-xs"> — All actions are logged</span>
      </span>
      <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
        by {user._impersonator || 'Admin'}
      </span>
    </div>
  );
}

export default function AppLayout() {
  const user = useSelector((s) => s.auth.user);

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
      document.removeEventListener('click', handler);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <ChatGlobalListener />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ImpersonationBanner />
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}