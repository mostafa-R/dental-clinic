// Chat feature barrel exports
export { chatApi } from './chatApi';
export {
  fetchStaff,
  fetchMessages,
  sendMessage,
  fetchUnreadCounts,
  markRead,
  markChannelRead,
  setActiveChat,
  addMessage,
  clearChat,
  clearUnread,
  markMessagesAsRead,
} from './chatSlice';
export { default as ChatGlobalListener } from './ChatGlobalListener';
export { default as ChatSidebar } from './ChatSidebar';
export { default as MessageInput } from './MessageInput';
export { default as MessageList } from './MessageList';