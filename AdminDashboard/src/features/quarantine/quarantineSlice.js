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
    mutatingId: null,
    error: null,
  },
  reducers: {
    clearQuarantineError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAbuseChecks.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchAbuseChecks.fulfilled, (state, action) => {
        state.loading = false;
        const payload = action.payload || [];
        state.checks = payload.map((c) => ({
          tenantId: c.tenantId,
          name: c.name,
          plan: c.plan,
          quarantined: !c.isActive,
          warnings: c.flagged && c.reason ? [c.reason] : [],
        }));
      })
      .addCase(fetchAbuseChecks.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(setQuarantine.pending, (state, action) => {
        state.mutatingId = action.meta.arg?.tenantId || null;
        state.error = null;
      })
      .addCase(setQuarantine.fulfilled, (state, action) => {
        state.mutatingId = null;
        const payload = action.payload || {};
        const tenantId = action.meta.arg?.tenantId;
        state.checks = state.checks.map((check) =>
          check.tenantId === tenantId
            ? {
                ...check,
                quarantined: payload.quarantined ?? (payload.isActive === false ? true : true),
                quarantineReason: payload.reason ?? action.meta.arg?.reason ?? check.quarantineReason,
              }
            : check,
        );
      })
      .addCase(setQuarantine.rejected, (state, action) => {
        state.mutatingId = null;
        state.error = action.payload;
      })
      .addCase(removeQuarantine.pending, (state, action) => {
        state.mutatingId = action.meta.arg || null;
        state.error = null;
      })
      .addCase(removeQuarantine.fulfilled, (state, action) => {
        state.mutatingId = null;
        const payload = action.payload || {};
        const tenantId = action.meta.arg;
        state.checks = state.checks.map((check) =>
          check.tenantId === tenantId
            ? {
                ...check,
                quarantined: payload.quarantined ?? (payload.isActive === true ? false : true),
                quarantineReason: payload.reason === undefined ? null : payload.reason,
              }
            : check,
        );
      })
      .addCase(removeQuarantine.rejected, (state, action) => {
        state.mutatingId = null;
        state.error = action.payload;
      });
  },
});

export const { clearQuarantineError } = quarantineSlice.actions;
export default quarantineSlice.reducer;
