import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchErrorLogs = createAsyncThunk(
  "errorLogs/fetch",
  async (params = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/error-logs", { params });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to fetch error logs");
    }
  },
);

export const fetchErrorLogStats = createAsyncThunk(
  "errorLogs/fetchStats",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/error-logs/stats");
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to fetch stats");
    }
  },
);

const errorLogsSlice = createSlice({
  name: "errorLogs",
  initialState: {
    logs: [],
    stats: null,
    pagination: { page: 1, limit: 50, total: 0, pages: 1 },
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchErrorLogs.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchErrorLogs.fulfilled, (state, action) => {
        state.loading = false;
        state.logs = action.payload.logs;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchErrorLogs.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchErrorLogStats.fulfilled, (state, action) => { state.stats = action.payload; });
  },
});

export default errorLogsSlice.reducer;
