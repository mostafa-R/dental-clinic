import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchTenantModules = createAsyncThunk(
  "featureFlags/fetchTenantModules",
  async (tenantId, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/feature-flags/${tenantId}`);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to fetch modules");
    }
  },
);

export const toggleModule = createAsyncThunk(
  "featureFlags/toggleModule",
  async ({ tenantId, module, enabled }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/feature-flags/${tenantId}/toggle`, { module, enabled });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to toggle module");
    }
  },
);

export const setModules = createAsyncThunk(
  "featureFlags/setModules",
  async ({ tenantId, modules }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/feature-flags/${tenantId}/modules`, { modules });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to set modules");
    }
  },
);

const featureFlagsSlice = createSlice({
  name: "featureFlags",
  initialState: {
    tenants: {},
    loading: false,
    toggling: false,
    error: null,
  },
  reducers: {
    clearTenantModules: (state, action) => { delete state.tenants[action.payload]; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenantModules.pending, (state) => { state.loading = true; })
      .addCase(fetchTenantModules.fulfilled, (state, action) => {
        state.loading = false;
        state.tenants[action.meta.arg] = {
          plan: action.payload.plan,
          enabledModules: action.payload.enabledModules || [],
          availableModules: action.payload.availableModules || [],
        };
      })
      .addCase(fetchTenantModules.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(toggleModule.pending, (state) => { state.toggling = true; })
      .addCase(toggleModule.fulfilled, (state, action) => {
        state.toggling = false;
        const tenant = state.tenants[action.meta.arg.tenantId];
        if (tenant) tenant.enabledModules = action.payload.enabledModules || [];
      })
      .addCase(toggleModule.rejected, (state, action) => { state.toggling = false; state.error = action.payload; })
      .addCase(setModules.fulfilled, (state, action) => {
        const tenant = state.tenants[action.meta.arg.tenantId];
        if (tenant) tenant.enabledModules = action.payload.enabledModules || [];
      });
  },
});

export const { clearTenantModules } = featureFlagsSlice.actions;
export default featureFlagsSlice.reducer;
