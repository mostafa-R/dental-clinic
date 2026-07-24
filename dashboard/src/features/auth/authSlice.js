import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const login = createAsyncThunk(
  "auth/login",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await api.post("/auth/login", credentials);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "Login failed");
    }
  },
);

export const verify2faLogin = createAsyncThunk(
  "auth/verify2faLogin",
  async ({ adminId, challengeToken, token, backupCode }, { rejectWithValue }) => {
    try {
      const response = await api.post("/2fa/verify-login", {
        adminId,
        challengeToken,
        token,
        backupCode,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || "2FA verification failed");
    }
  },
);

export const logout = createAsyncThunk("auth/logout", async () => {
  try {
    await api.post("/auth/logout");
  } catch {
    // Server cookie clear may fail if already logged out, that's fine
  }
});

export const getCurrentUser = createAsyncThunk(
  "auth/getCurrentUser",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get("/auth/me");
      return response.data.user || response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to get user",
      );
    }
  },
);

const initialState = {
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  _initialized: false,
  requires2fa: false,
  challengeToken: null,
  challengeAdminId: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clear2faChallenge: (state) => {
      state.requires2fa = false;
      state.challengeToken = null;
      state.challengeAdminId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        const payload = action.payload;
        if (payload.requires2fa) {
          state.requires2fa = true;
          state.challengeToken = payload.challengeToken;
          state.challengeAdminId = payload.adminId;
          state.isAuthenticated = false;
          state.user = null;
        } else {
          state.user = payload.user;
          state.isAuthenticated = true;
          state.requires2fa = false;
          state.challengeToken = null;
          state.challengeAdminId = null;
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // 2FA Login
      .addCase(verify2faLogin.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verify2faLogin.fulfilled, (state, action) => {
        state.loading = false;
        state.requires2fa = false;
        state.challengeToken = null;
        state.challengeAdminId = null;
        state.user = action.payload.user;
        state.isAuthenticated = true;
      })
      .addCase(verify2faLogin.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Logout
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.requires2fa = false;
        state.challengeToken = null;
        state.challengeAdminId = null;
      })
      // Get current user
      .addCase(getCurrentUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
        state._initialized = true;
      })
      .addCase(getCurrentUser.rejected, (state) => {
        state.loading = false;
        state.user = null;
        state.isAuthenticated = false;
        state._initialized = true;
      });
  },
});

export const { clearError, clear2faChallenge } = authSlice.actions;
export default authSlice.reducer;
