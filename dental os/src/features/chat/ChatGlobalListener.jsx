import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getSocket } from '../../lib/socket';
import { useSocket } from '../../hooks/useSocket';
import { addMessage, fetchUnreadCounts, markMessagesAsRead } from './chatSlice';
import { playNotificationSound } from '../../lib/notificationSound';

export default function ChatGlobalListener() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  // Only poll/act on chat when the tenant's plan includes the chat module —
  // otherwise every fetch 403s ("Your plan does not include the chat module").
  const chatEnabled = !!user?.tenant?.planModules?.includes('chat');

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
        new Notification(msg.sender.name, { body: msg.content, icon: '/favicon.ico' });
      }
    }
  }, [dispatch, user, chatEnabled]);

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
