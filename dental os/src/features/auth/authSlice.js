import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { authApi } from './authApi';

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (payload, { rejectWithValue }) => {
    try {
      const { user } = await authApi.login(payload);
      return user;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Login failed' });
    }
  },
);

export const loadCurrentUser = createAsyncThunk(
  'auth/loadCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const { user } = await authApi.getMe();
      return user;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Session expired');
    }
  },
);

export const refreshSession = createAsyncThunk(
  'auth/refreshSession',
  async (_, { rejectWithValue }) => {
    try {
      await authApi.refresh();
      const { user } = await authApi.getMe();
      return user;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Refresh failed');
    }
  },
);

export const verifyImpersonation = createAsyncThunk(
  'auth/verifyImpersonation',
  async (token, { rejectWithValue }) => {
    try {
      const { user } = await authApi.verifyImpersonation(token);
      return user;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Invalid impersonation token');
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    status: 'idle',
    error: null,
  },
  reducers: {
    setCredentials(state, action) {
      state.user = action.payload;
      state.status = 'succeeded';
      state.error = null;
    },
    logout(state) {
      state.user = null;
      state.status = 'idle';
      state.error = null;
    },
    clearError(state) {
      state.error = null;
    },
    setPreferences(state, action) {
      if (state.user) {
        state.user = { ...state.user, preferences: { ...state.user.preferences, ...action.payload } };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(loadCurrentUser.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loadCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(loadCurrentUser.rejected, (state, action) => {
        state.user = null;
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(refreshSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(refreshSession.rejected, (state) => {
        state.user = null;
        state.status = 'failed';
      })
      .addCase(verifyImpersonation.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(verifyImpersonation.rejected, (state, action) => {
        state.user = null;
        state.status = 'failed';
        state.error = action.payload;
      });
  },
});

export const { setCredentials, logout, clearError, setPreferences } = authSlice.actions;

export default authSlice.reducer;
