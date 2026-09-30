import { useEffect, useCallback, useMemo, useRef } from 'react';
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

  // Poll unread counts every 3s to keep sidebar/topbar badges accurate
  const pollingRef = useRef(null);
  useEffect(() => {
    if (!user || !chatEnabled) return;
    pollingRef.current = setInterval(() => {
      dispatch(fetchUnreadCounts());
    }, 3000);
    return () => clearInterval(pollingRef.current);
  }, [dispatch, user, chatEnabled]);

  const handleMessage = useCallback((msg) => {
    if (!chatEnabled) return;
    if (String(msg.sender._id) === String(user?._id)) return;
    dispatch(addMessage(msg));
    if (document.hidden) {
      playNotificationSound();
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && msg.sender?.name) {
        // Never put message text in the OS notification. The OS notification
        // layer is outside the app: it is shown on the lock screen, mirrored to
        // paired devices and watches, and persisted by the OS notification
        // centre. Chat bodies carry PHI (patient names, treatment details), so
        // those would leave the audited system and land on unmanaged hardware
        // that the clinic's access controls and audit log do not cover.
        // A count-only prompt is enough to prompt the user to open the app.
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
    ['chat:message', handleMessage],
    ['chat:read', handleRead],
  ], [handleMessage, handleRead]);

  useSocket(events);

  return null;
}
