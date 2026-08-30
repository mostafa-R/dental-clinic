import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { siteAuthApi } from './siteAuthApi';

export const siteLogin = createAsyncThunk(
  'siteAuth/login',
  async (payload, { rejectWithValue }) => {
    try {
      return await siteAuthApi.login(payload);
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Login failed' });
    }
  },
);

export const siteVerify2fa = createAsyncThunk(
  'siteAuth/verify2fa',
  async (payload, { rejectWithValue }) => {
    try {
      return await siteAuthApi.verify2faLogin(payload);
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Verification failed' });
    }
  },
);

export const loadSiteAdmin = createAsyncThunk(
  'siteAuth/load',
  async (_, { rejectWithValue }) => {
    try {
      const { user } = await siteAuthApi.getMe();
      return user;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Session expired');
    }
  },
);

export const siteLogout = createAsyncThunk(
  'siteAuth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await siteAuthApi.logout();
      return null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Logout failed');
    }
  },
);

const siteAuthSlice = createSlice({
  name: 'siteAuth',
  initialState: {
    admin: null,
    status: 'idle',
    error: null,
    challenge: null,
  },
  reducers: {
    clearSiteError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(siteLogin.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(siteLogin.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.error = null;
        if (action.payload.requires2fa) {
          state.challenge = {
            adminId: action.payload.adminId,
            challengeToken: action.payload.challengeToken,
          };
          state.admin = null;
        } else {
          state.challenge = null;
          state.admin = action.payload.user;
        }
      })
      .addCase(siteLogin.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(siteVerify2fa.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.error = null;
        state.challenge = null;
        state.admin = action.payload.user;
      })
      .addCase(siteVerify2fa.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(loadSiteAdmin.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loadSiteAdmin.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.error = null;
        state.admin = action.payload;
      })
      .addCase(loadSiteAdmin.rejected, (state, action) => {
        state.status = 'failed';
        state.admin = null;
        state.error = action.payload;
      })
      .addCase(siteLogout.fulfilled, (state) => {
        state.admin = null;
        state.status = 'idle';
        state.challenge = null;
        state.error = null;
      });
  },
});

export const { clearSiteError } = siteAuthSlice.actions;

export default siteAuthSlice.reducer;