import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchAuditLogs = createAsyncThunk(
  "auditLogs/fetch",
  async (params = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/audit-logs", { params });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to fetch audit logs");
    }
  },
);

export const fetchAuditActions = createAsyncThunk(
  "auditLogs/fetchActions",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/audit-logs/actions");
      return data.actions;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to fetch actions");
    }
  },
);

const auditLogsSlice = createSlice({
  name: "auditLogs",
  initialState: {
    logs: [],
    actions: [],
    pagination: { page: 1, limit: 50, total: 0, pages: 1 },
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuditLogs.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchAuditLogs.fulfilled, (state, action) => {
        state.loading = false;
        state.logs = action.payload.logs || [];
        state.pagination = action.payload.pagination || state.pagination;
      })
      .addCase(fetchAuditLogs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchAuditActions.fulfilled, (state, action) => {
        state.actions = action.payload;
      });
  },
});

export default auditLogsSlice.reducer;
