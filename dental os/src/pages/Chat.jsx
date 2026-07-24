import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStaff, fetchMessages, setActiveChat, fetchUnreadCounts, markRead, markChannelRead } from '../features/chat/chatSlice';
import ChatSidebar from '../features/chat/ChatSidebar';
import MessageList from '../features/chat/MessageList';
import MessageInput from '../features/chat/MessageInput';
import { useT } from '../lib/i18n';

const POLL_INTERVAL = 10000;

export default function Chat() {
  const { t } = useT();
  const dispatch = useDispatch();
  const { activeChat, messages } = useSelector((s) => s.chat);
  const user = useSelector((s) => s.auth.user);
  const pollRef = useRef();
  const sentReadRef = useRef(new Set());

  useEffect(() => {
    dispatch(fetchStaff());
    dispatch(fetchUnreadCounts());
  }, [dispatch]);

  const startPolling = useCallback((params) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        dispatch(fetchMessages(params));
      }
    }, POLL_INTERVAL);
  }, [dispatch]);

  useEffect(() => {
    if (!activeChat) return;
    const params = activeChat.type === 'dm'
      ? { recipient: activeChat.id }
      : { channel: activeChat.id };
    dispatch(fetchMessages(params));
    startPolling(params);
    if (activeChat.type === 'channel') {
      dispatch(markChannelRead(activeChat.id));
    }
    return () => clearInterval(pollRef.current);
  }, [activeChat, dispatch, startPolling]);

  useEffect(() => {
    sentReadRef.current = new Set();
  }, [activeChat]);

  useEffect(() => {
    if (activeChat?.type !== 'dm' || !messages.length || !user) return;
    const unreadIds = messages
      .filter((m) => !m.isRead && String(m.recipient) === String(user._id) && !sentReadRef.current.has(m._id))
      .map((m) => m._id);
    if (unreadIds.length) {
      unreadIds.forEach((id) => sentReadRef.current.add(id));
      dispatch(markRead(unreadIds));
    }
  }, [messages, activeChat, user, dispatch]);

  const handleSelectChat = (chat) => {
    dispatch(setActiveChat(chat));
  };

  const chatTitle = activeChat
    ? activeChat.type === 'dm'
      ? activeChat.name
      : t(`chat.channel.${activeChat.id}`)
    : t('chat.selectChat');

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <ChatSidebar activeChat={activeChat} onSelectChat={handleSelectChat} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center border-b border-slate-200 px-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{chatTitle}</h2>
        </header>
        <MessageList />
        <MessageInput />
      </div>
    </div>
  );
}
