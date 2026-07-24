import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchGlobalStats = createAsyncThunk(
  "analytics/fetchGlobalStats",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get("/analytics/stats");
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch stats",
      );
    }
  },
);

export const fetchGrowthData = createAsyncThunk(
  "analytics/fetchGrowthData",
  async (period, { rejectWithValue }) => {
    try {
      const response = await api.get("/analytics/growth", {
        params: { period },
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch growth data",
      );
    }
  },
);

export const fetchTenantUsage = createAsyncThunk(
  "analytics/fetchTenantUsage",
  async (tenantId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/analytics/usage/${tenantId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch usage",
      );
    }
  },
);

const initialState = {
  stats: {
    totalTenants: 0,
    activeTenants: 0,
    totalRevenue: 0,
    monthlyRecurring: 0,
    totalPatients: 0,
    totalAppointments: 0,
    newTenantsThisMonth: 0,
    churnRate: 0,
  },
  growthData: {
    tenants: [],
    revenue: [],
    patients: [],
  },
  tenantUsage: null,
  loading: false,
  error: null,
};

const analyticsSlice = createSlice({
  name: "analytics",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchGlobalStats.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchGlobalStats.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload || state.stats;
      })
      .addCase(fetchGlobalStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchGrowthData.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchGrowthData.fulfilled, (state, action) => {
        state.loading = false;
        state.growthData = action.payload;
      })
      .addCase(fetchGrowthData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchTenantUsage.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTenantUsage.fulfilled, (state, action) => {
        state.loading = false;
        state.tenantUsage = action.payload;
      })
      .addCase(fetchTenantUsage.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearError } = analyticsSlice.actions;
export default analyticsSlice.reducer;
