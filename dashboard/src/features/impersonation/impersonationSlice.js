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
  async (_, { rejectWithValue }) => {
    try {
      await api.post("/impersonation/end");
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to end impersonation");
    }
  },
);

const impersonationSlice = createSlice({
  name: "impersonation",
  initialState: {
    active: false,
    token: null,
    targetUser: null,
    targetTenant: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearImpersonation: (state) => {
      state.active = false;
      state.token = null;
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
        state.targetUser = action.payload.user;
        state.targetTenant = action.payload.tenant;
      })
      .addCase(startImpersonation.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(endImpersonation.fulfilled, (state) => {
        state.active = false;
        state.token = null;
        state.targetUser = null;
        state.targetTenant = null;
      });
  },
});

export const { clearImpersonation } = impersonationSlice.actions;
export default impersonationSlice.reducer;
