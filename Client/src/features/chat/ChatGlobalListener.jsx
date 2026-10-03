import { useEffect, useCallback, useMemo } from 'react';
import { SOCKET_EVENTS } from '../../lib/socketEvents';
import { useDispatch, useSelector } from 'react-redux';
import { useSocket } from '../../hooks/useSocket';
import { addMessage, fetchUnreadCounts, markMessagesAsRead } from './chatSlice';
import { playNotificationSound } from '../../lib/notificationSound';
import { usePermission } from '../../lib/roles';
import { useT } from '../../lib/i18n';

export default function ChatGlobalListener() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  // Plan AND role, via the canonical predicate. Reading
  // `user.tenant.planModules` directly here was wrong twice over: a system
  // admin has no tenant, so they saw the Chat page and the sidebar entry but
  // got no badge, no socket events and no notifications; and a user whose plan
  // includes chat but whose role does not polled /unread every 3s and collected
  // a steady stream of 403s.
  const chatEnabled = usePermission('chat', 'read');
  const { t } = useT();

  useEffect(() => {
    if (user && chatEnabled) {
      dispatch(fetchUnreadCounts());
    }
  }, [dispatch, user, chatEnabled]);

  // A 3s poll here meant 1,200 requests per hour per signed-in user — ~12k/hour
  // at ten concurrent users — to draw one badge, while the server was already
  // pushing the same change over the socket. The socket is the source of truth;
  // this refetch only covers the two gaps it cannot see: a tab that was
  // backgrounded (socket events were missed or the OS throttled them) and the
  // window between login and the first `chat:read`.
  useEffect(() => {
    if (!user || !chatEnabled) return undefined;
    const refreshOnVisible = () => {
      if (!document.hidden) dispatch(fetchUnreadCounts());
    };
    document.addEventListener('visibilitychange', refreshOnVisible);
    window.addEventListener('focus', refreshOnVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshOnVisible);
      window.removeEventListener('focus', refreshOnVisible);
    };
  }, [dispatch, user, chatEnabled]);

  const handleMessage = useCallback((msg) => {
    if (!chatEnabled) return;
    if (String(msg.sender._id) === String(user?._id)) return;
    dispatch(addMessage(msg));
    if (document.hidden) {
      playNotificationSound();
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && msg.sender?.name) {
        // PHI BOUNDARY — read before routing anything else through this path.
        // The notification title is `msg.sender.name` and the body is a static
        // count prompt. Nothing from the conversation reaches the OS.
        //
        // Message body: omitted deliberately. The OS notification layer is
        // outside the app — it is shown on the lock screen, mirrored to paired
        // devices and watches, and persisted by the OS notification centre.
        // Chat bodies carry PHI (patient names, treatment details), so those
        // would leave the audited system and land on unmanaged hardware that
        // the clinic's access controls and audit log do not cover.
        //
        // Sender name: acceptable *only* while this path is staff-to-staff.
        // Staff names are not themselves PHI, but they can be identifying in
        // some jurisdictions, and the moment a patient-facing message is routed
        // here the sender becomes a patient and this title is PHI. Before
        // wiring any patient channel to this listener, drop to a count-only
        // title.
        new Notification(msg.sender.name, {
          body: t('chat.newMessageNotification'),
          icon: '/favicon.ico',
        });
      }
    }
  }, [dispatch, user, chatEnabled, t]);

  const handleRead = useCallback((payload) => {
    if (!chatEnabled) return;
    dispatch(markMessagesAsRead(payload));
    dispatch(fetchUnreadCounts());
  }, [dispatch, chatEnabled]);

  const events = useMemo(() => [
    [SOCKET_EVENTS.CHAT_MESSAGE, handleMessage],
    [SOCKET_EVENTS.CHAT_READ, handleRead],
  ], [handleMessage, handleRead]);

  useSocket(events);

  return null;
}
