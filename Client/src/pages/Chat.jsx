import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import ChatSidebar from "../features/chat/ChatSidebar";
import {
  fetchMessages,
  fetchStaff,
  fetchUnreadCounts,
  markChannelRead,
  markRead,
  setActiveChat,
} from "../features/chat/chatSlice";
import MessageInput from "../features/chat/MessageInput";
import MessageList from "../features/chat/MessageList";
import { useT } from "../lib/i18n";
import { useSocketConnectionStatus } from "../lib/socket";

// POLL_INTERVAL removed: ChatGlobalListener already receives chat:message socket
// events and dispatches addMessage. Polling every 10s meant ~360 redundant
// GETs/hour/open tab that scrolled the message list away from the reader.

export default function Chat() {
  const { t } = useT();
  const dispatch = useDispatch();
  const { activeChat, messages } = useSelector((s) => s.chat);
  const user = useSelector((s) => s.auth.user);
  const socketStatus = useSocketConnectionStatus();
  const sentReadRef = useRef(new Set());

  useEffect(() => {
    dispatch(fetchStaff());
    dispatch(fetchUnreadCounts());
  }, [dispatch]);

  // Fetch messages when switching chats, but don't poll. The socket delivers
  // new messages in real-time. Only refetch on tab focus when the socket was
  // disconnected or throttled while backgrounded.
  useEffect(() => {
    if (!activeChat) return;
    const params =
      activeChat.type === "dm"
        ? { recipient: activeChat.id }
        : { channel: activeChat.id };
    dispatch(fetchMessages(params));

    if (activeChat.type === "channel") {
      dispatch(markChannelRead(activeChat.id));
    }
  }, [activeChat, dispatch]);

  // Visibility-gated refetch: covers the gap when the socket was down.
  useEffect(() => {
    if (!activeChat) return undefined;
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        socketStatus !== "connected"
      ) {
        const params =
          activeChat.type === "dm"
            ? { recipient: activeChat.id }
            : { channel: activeChat.id };
        dispatch(fetchMessages(params));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [activeChat, dispatch, socketStatus]);

  useEffect(() => {
    sentReadRef.current = new Set();
  }, [activeChat]);

  useEffect(() => {
    if (activeChat?.type !== "dm" || !messages.length || !user) return;
    const unreadIds = messages
      .filter(
        (m) =>
          !m.isRead &&
          String(m.recipient) === String(user._id) &&
          !sentReadRef.current.has(m._id),
      )
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
    ? activeChat.type === "dm"
      ? activeChat.name
      : t(`chat.channel.${activeChat.id}`)
    : t("chat.selectChat");

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <ChatSidebar
        activeChat={activeChat}
        onSelectChat={handleSelectChat}
        className={activeChat ? "hidden lg:flex" : "flex"}
      />
      <div
        className={`${activeChat ? "flex" : "hidden"} min-h-0 flex-1 flex-col lg:flex`}
      >
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
          {activeChat && (
            <button
              type="button"
              onClick={() => dispatch(setActiveChat(null))}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
              aria-label={t("common.back")}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5m7-7-7 7 7 7" />
              </svg>
            </button>
          )}
          <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">
            {chatTitle}
          </h2>
        </header>
        <MessageList />
        <MessageInput />
      </div>
    </div>
  );
}
