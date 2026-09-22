import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchAlerts = createAsyncThunk(
  "alerts/fetch",
  async (params = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/alerts", { params });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to fetch alerts");
    }
  },
);

export const fetchAlertSummary = createAsyncThunk(
  "alerts/fetchSummary",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/alerts/summary");
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to fetch alert summary");
    }
  },
);

export const fetchActiveAlerts = createAsyncThunk(
  "alerts/fetchActive",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/alerts/active", { params: { limit: 10 } });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to fetch alerts");
    }
  },
);

export const acknowledgeAlert = createAsyncThunk(
  "alerts/acknowledge",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.post(`/alerts/${id}/acknowledge`);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to acknowledge alert");
    }
  },
);

export const resolveAlert = createAsyncThunk(
  "alerts/resolve",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.post(`/alerts/${id}/resolve`);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to resolve alert");
    }
  },
);

export const acknowledgeAllAlerts = createAsyncThunk(
  "alerts/acknowledgeAll",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/alerts/read-all");
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to acknowledge alerts");
    }
  },
);

const applyMutation = (state, action) => {
  const alert = action.payload?.alert;
  if (!alert) return;
  state.managingId = null;
  state.alerts = state.alerts.map((a) => (a._id === alert._id ? alert : a));
  state.active = state.active.filter((a) => a._id !== alert._id);
};

const alertsSlice = createSlice({
  name: "alerts",
  initialState: {
    alerts: [],
    active: [],
    summary: { active: 0, acknowledged: 0, resolved: 0, open: 0, bySeverity: { critical: 0, warning: 0, info: 0 } },
    pagination: { page: 1, limit: 25, total: 0, pages: 1 },
    loading: false,
    managingId: null,
    error: null,
  },
  reducers: {
    clearAlertsError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAlerts.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchAlerts.fulfilled, (state, action) => {
        state.loading = false;
        state.alerts = action.payload.alerts || [];
        state.pagination = action.payload.pagination || state.pagination;
      })
      .addCase(fetchAlerts.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(fetchAlertSummary.fulfilled, (state, action) => {
        state.summary = action.payload?.summary
          ? { ...state.summary, ...action.payload.summary }
          : state.summary;
      })
      .addCase(fetchActiveAlerts.fulfilled, (state, action) => {
        state.active = action.payload.alerts || [];
      })
      .addCase(acknowledgeAlert.pending, (state, action) => { state.managingId = action.meta.arg; state.error = null; })
      .addCase(acknowledgeAlert.fulfilled, applyMutation)
      .addCase(acknowledgeAlert.rejected, (state, action) => { state.managingId = null; state.error = action.payload; })
      .addCase(resolveAlert.pending, (state, action) => { state.managingId = action.meta.arg; state.error = null; })
      .addCase(resolveAlert.fulfilled, applyMutation)
      .addCase(resolveAlert.rejected, (state, action) => { state.managingId = null; state.error = action.payload; })
      .addCase(acknowledgeAllAlerts.pending, (state) => { state.error = null; })
      .addCase(acknowledgeAllAlerts.fulfilled, (state) => {
        state.active = [];
        state.alerts = state.alerts.map((a) =>
          a.status === "active"
            ? { ...a, status: "acknowledged", acknowledgedAt: new Date().toISOString() }
            : a,
        );
        state.summary.open = 0;
        state.summary.active = 0;
      })
      .addCase(acknowledgeAllAlerts.rejected, (state, action) => { state.error = action.payload; });
  },
});

export const { clearAlertsError } = alertsSlice.actions;
export default alertsSlice.reducer;