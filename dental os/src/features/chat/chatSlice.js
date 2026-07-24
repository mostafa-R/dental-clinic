import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { chatApi } from './chatApi';

function errPayload(err, fallback) {
  return err.response?.data || { message: fallback };
}

export const fetchStaff = createAsyncThunk(
  'chat/fetchStaff',
  async (_, { rejectWithValue }) => {
    try {
      return await chatApi.listStaff();
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load staff'));
    }
  },
);

export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async (params, { rejectWithValue }) => {
    try {
      return await chatApi.listMessages(params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load messages'));
    }
  },
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (payload, { rejectWithValue }) => {
    try {
      return await chatApi.sendMessage(payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to send message'));
    }
  },
);

export const fetchUnreadCounts = createAsyncThunk(
  'chat/fetchUnreadCounts',
  async (_, { rejectWithValue }) => {
    try {
      return await chatApi.getUnreadCounts();
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load unread counts'));
    }
  },
);

export const markRead = createAsyncThunk(
  'chat/markRead',
  async (messageIds, { rejectWithValue }) => {
    try {
      await chatApi.markRead(messageIds);
      return messageIds;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to mark read'));
    }
  },
);

export const markChannelRead = createAsyncThunk(
  'chat/markChannelRead',
  async (channel, { rejectWithValue }) => {
    try {
      await chatApi.markChannelRead(channel);
      return channel;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to mark channel read'));
    }
  },
);

const initialState = {
  activeChat: null,
  staff: [],
  messages: [],
  status: 'idle',
  error: null,
  sendingStatus: 'idle',
  unread: {},
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveChat(state, action) {
      state.activeChat = action.payload;
      state.messages = [];
      if (action.payload?.type === 'dm') {
        state.unread[action.payload.id] = 0;
      } else if (action.payload?.type === 'channel') {
        state.unread[`channel:${action.payload.id}`] = 0;
      }
    },
    addMessage(state, action) {
      const msg = action.payload;
      if (!msg) return;
      const msgId = msg._id;
      if (msgId && state.messages.some((m) => m._id === msgId)) return;
      const senderId = msg.sender?._id ? String(msg.sender._id) : null;
      if (!state.activeChat) {
        if (msg.channel) {
          state.unread[`channel:${msg.channel}`] = (state.unread[`channel:${msg.channel}`] || 0) + 1;
        } else if (senderId) {
          state.unread[senderId] = (state.unread[senderId] || 0) + 1;
        }
        return;
      }
      const recipientId = msg.recipient ? String(msg.recipient) : null;
      const belongs = state.activeChat.type === 'dm'
        ? (senderId && senderId === String(state.activeChat.id)) || (recipientId && recipientId === String(state.activeChat.id))
        : msg.channel === state.activeChat.id;
      if (belongs) {
        state.messages.push(msg);
        if (state.activeChat.type === 'dm') {
          state.unread[state.activeChat.id] = 0;
        } else if (state.activeChat.type === 'channel') {
          state.unread[`channel:${state.activeChat.id}`] = 0;
        }
      } else if (msg.channel) {
        state.unread[`channel:${msg.channel}`] = (state.unread[`channel:${msg.channel}`] || 0) + 1;
      } else if (senderId) {
        state.unread[senderId] = (state.unread[senderId] || 0) + 1;
      }
    },
    clearChat(state) {
      state.activeChat = null;
      state.messages = [];
      state.status = 'idle';
      state.error = null;
    },
    clearUnread(state, action) {
      const id = action.payload;
      if (id) state.unread[id] = 0;
    },
    markMessagesAsRead(state, action) {
      const { messageIds } = action.payload;
      state.messages = state.messages.map((m) =>
        messageIds.includes(m._id) ? { ...m, isRead: true } : m,
      );
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStaff.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchStaff.fulfilled, (state, action) => {
        state.staff = action.payload.staff;
        state.status = 'succeeded';
      })
      .addCase(fetchStaff.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      });
    builder
      .addCase(fetchMessages.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.messages = action.payload.messages;
        state.status = 'succeeded';
        if (state.activeChat?.type === 'dm') {
          state.unread[state.activeChat.id] = 0;
        } else if (state.activeChat?.type === 'channel') {
          state.unread[`channel:${state.activeChat.id}`] = 0;
        }
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(sendMessage.pending, (state) => {
        state.sendingStatus = 'loading';
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.sendingStatus = 'succeeded';
        state.messages.push(action.payload.message);
      })
      .addCase(sendMessage.rejected, (state) => {
        state.sendingStatus = 'failed';
      });
    builder
      .addCase(fetchUnreadCounts.fulfilled, (state, action) => {
        state.unread = action.payload.unread;
      });
    builder.addCase(markRead.fulfilled, (state, action) => {
      const readIds = action.payload;
      state.messages = state.messages.map((m) =>
        readIds.includes(m._id) ? { ...m, isRead: true } : m,
      );
    });
  },
});

export const { setActiveChat, addMessage, clearChat, clearUnread, markMessagesAsRead } = chatSlice.actions;

export default chatSlice.reducer;