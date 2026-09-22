import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchTenantDetail = createAsyncThunk(
  "tenantDetail/fetchTenantDetail",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/tenants/${id}`);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch tenant",
      );
    }
  },
);

export const fetchTenantStats = createAsyncThunk(
  "tenantDetail/fetchTenantStats",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/tenants/${id}/stats`);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch tenant stats",
      );
    }
  },
);

export const fetchTenantBranches = createAsyncThunk(
  "tenantDetail/fetchTenantBranches",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/branches", {
        params: { tenant: id, limit: 100 },
      });
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch branches",
      );
    }
  },
);

export const fetchTenantUsers = createAsyncThunk(
  "tenantDetail/fetchTenantUsers",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/users/by-tenant/${id}`);
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch users",
      );
    }
  },
);

export const fetchTenantAuditLogs = createAsyncThunk(
  "tenantDetail/fetchTenantAuditLogs",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/audit-logs", {
        params: { targetType: "tenant", targetId: id, limit: 100 },
      });
      return data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch activity",
      );
    }
  },
);

const initialState = {
  tenant: null,
  stats: null,
  branches: [],
  users: [],
  activity: [],
  loading: false,
  error: null,
};

const tenantDetailSlice = createSlice({
  name: "tenantDetail",
  initialState,
  reducers: {
    clearTenantDetail: (state) => {
      state.tenant = null;
      state.stats = null;
      state.branches = [];
      state.users = [];
      state.activity = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenantDetail.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTenantDetail.fulfilled, (state, action) => {
        state.loading = false;
        state.tenant = action.payload;
      })
      .addCase(fetchTenantDetail.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchTenantStats.fulfilled, (state, action) => {
        state.stats = action.payload;
      })
      .addCase(fetchTenantBranches.fulfilled, (state, action) => {
        state.branches = action.payload?.branches || [];
      })
      .addCase(fetchTenantUsers.fulfilled, (state, action) => {
        state.users = action.payload?.users || [];
      })
      .addCase(fetchTenantAuditLogs.fulfilled, (state, action) => {
        state.activity = action.payload?.logs || [];
      });
  },
});

export const { clearTenantDetail } = tenantDetailSlice.actions;
export default tenantDetailSlice.reducer;