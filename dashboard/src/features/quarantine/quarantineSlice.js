import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchAbuseChecks = createAsyncThunk(
  "quarantine/fetchChecks",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/quarantine/checks");
      return data.checks;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to fetch abuse checks");
    }
  },
);

export const setQuarantine = createAsyncThunk(
  "quarantine/set",
  async ({ tenantId, reason }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/quarantine/${tenantId}`, { reason });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to quarantine tenant");
    }
  },
);

export const removeQuarantine = createAsyncThunk(
  "quarantine/remove",
  async (tenantId, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/quarantine/${tenantId}/remove`);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to remove quarantine");
    }
  },
);

const quarantineSlice = createSlice({
  name: "quarantine",
  initialState: {
    checks: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAbuseChecks.pending, (state) => { state.loading = true; })
      .addCase(fetchAbuseChecks.fulfilled, (state, action) => { state.loading = false; state.checks = action.payload; })
      .addCase(fetchAbuseChecks.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export default quarantineSlice.reducer;
