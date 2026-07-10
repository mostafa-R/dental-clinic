import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchPlatformSettings = createAsyncThunk(
  "platform/fetchPlatformSettings",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get("/platform/settings");
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch platform settings",
      );
    }
  },
);

export const updatePlatformSettings = createAsyncThunk(
  "platform/updatePlatformSettings",
  async (data, { rejectWithValue }) => {
    try {
      const response = await api.put("/platform/settings", data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to update platform settings",
      );
    }
  },
);

const initialState = {
  settings: {
    autoSuspendDays: 30,
    emailNotifications: true,
    maintenanceMode: false,
    allowedDomains: [],
    maxTenants: 1000,
    defaultPlan: "starter",
    trialDays: 14,
  },
  loading: false,
  error: null,
};

const platformSlice = createSlice({
  name: "platform",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlatformSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPlatformSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.settings = action.payload;
      })
      .addCase(fetchPlatformSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updatePlatformSettings.pending, (state) => {
        state.loading = true;
      })
      .addCase(updatePlatformSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.settings = action.payload;
      })
      .addCase(updatePlatformSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearError } = platformSlice.actions;
export default platformSlice.reducer;
