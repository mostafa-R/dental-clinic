import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const startImpersonation = createAsyncThunk(
  "impersonation/start",
  async ({ tenantId, userId }, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/impersonation/start", { tenantId, userId });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to start impersonation");
    }
  },
);

export const endImpersonation = createAsyncThunk(
  "impersonation/end",
  async (_, { getState, rejectWithValue }) => {
    // The server requires the token back so it can verify the `impersonator`
    // claim matches the calling site admin before revoking the target user.
    const token = getState().impersonation.token;
    if (!token) return rejectWithValue("No active impersonation session");
    try {
      await api.post("/impersonation/end", { impersonationToken: token });
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to end impersonation");
    }
  },
);

const impersonationSlice = createSlice({
  name: "impersonation",
  initialState: {
    active: false,
    // Held in memory only so `endImpersonation` can present the grant back to
    // the server. It is never persisted and never placed in a URL.
    token: null,
    // Single-use, 60-second code used to hand the session to the clinic origin.
    handoffCode: null,
    targetUser: null,
    targetTenant: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearImpersonation: (state) => {
      state.active = false;
      state.token = null;
      state.handoffCode = null;
      state.targetUser = null;
      state.targetTenant = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startImpersonation.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(startImpersonation.fulfilled, (state, action) => {
        state.loading = false;
        state.active = true;
        state.token = action.payload.impersonationToken;
        state.handoffCode = action.payload.handoffCode || null;
        state.targetUser = action.payload.user;
        state.targetTenant = action.payload.tenant;
      })
      .addCase(startImpersonation.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(endImpersonation.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(endImpersonation.fulfilled, (state) => {
        state.loading = false;
        state.active = false;
        state.token = null;
        state.handoffCode = null;
        state.targetUser = null;
        state.targetTenant = null;
      })
      .addCase(endImpersonation.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { clearImpersonation } = impersonationSlice.actions;
export default impersonationSlice.reducer;
