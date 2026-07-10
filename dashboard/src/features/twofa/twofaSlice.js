import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const get2faStatus = createAsyncThunk(
  "twofa/getStatus",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/2fa/status");
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to get 2FA status");
    }
  },
);

export const setup2fa = createAsyncThunk(
  "twofa/setup",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/2fa/setup");
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to setup 2FA");
    }
  },
);

export const verify2fa = createAsyncThunk(
  "twofa/verify",
  async (token, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/2fa/verify", { token });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to verify 2FA");
    }
  },
);

export const disable2fa = createAsyncThunk(
  "twofa/disable",
  async (token, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/2fa/disable", { token });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to disable 2FA");
    }
  },
);

const twofaSlice = createSlice({
  name: "twofa",
  initialState: {
    enabled: false,
    setupData: null,
    loading: false,
    verifying: false,
    disabling: false,
    error: null,
  },
  reducers: {
    clearSetupData: (state) => { state.setupData = null; },
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(get2faStatus.fulfilled, (state, action) => { state.enabled = action.payload.enabled; })
      .addCase(setup2fa.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(setup2fa.fulfilled, (state, action) => {
        state.loading = false;
        state.setupData = action.payload;
      })
      .addCase(setup2fa.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(verify2fa.pending, (state) => { state.verifying = true; state.error = null; })
      .addCase(verify2fa.fulfilled, (state) => {
        state.verifying = false;
        state.enabled = true;
        state.setupData = null;
      })
      .addCase(verify2fa.rejected, (state, action) => { state.verifying = false; state.error = action.payload; })
      .addCase(disable2fa.pending, (state) => { state.disabling = true; state.error = null; })
      .addCase(disable2fa.fulfilled, (state) => { state.disabling = false; state.enabled = false; })
      .addCase(disable2fa.rejected, (state, action) => { state.disabling = false; state.error = action.payload; });
  },
});

export const { clearSetupData, clearError } = twofaSlice.actions;
export default twofaSlice.reducer;
