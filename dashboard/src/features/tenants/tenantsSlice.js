import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchTenants = createAsyncThunk(
  "tenants/fetchTenants",
  async (params, { rejectWithValue }) => {
    try {
      const response = await api.get("/tenants", { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch tenants",
      );
    }
  },
);

export const fetchTenantById = createAsyncThunk(
  "tenants/fetchTenantById",
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.get(`/tenants/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch tenant",
      );
    }
  },
);

export const createTenant = createAsyncThunk(
  "tenants/createTenant",
  async (data, { rejectWithValue }) => {
    try {
      const response = await api.post("/tenants", data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to create tenant",
      );
    }
  },
);

export const updateTenant = createAsyncThunk(
  "tenants/updateTenant",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/tenants/${id}`, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to update tenant",
      );
    }
  },
);

export const suspendTenant = createAsyncThunk(
  "tenants/suspendTenant",
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.put(`/tenants/${id}/suspend`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to suspend tenant",
      );
    }
  },
);

export const archiveTenant = createAsyncThunk(
  "tenants/archiveTenant",
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.put(`/tenants/${id}/archive`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to archive tenant",
      );
    }
  },
);

export const deleteTenant = createAsyncThunk(
  "tenants/deleteTenant",
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/tenants/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to delete tenant",
      );
    }
  },
);

export const activateTenant = createAsyncThunk(
  "tenants/activateTenant",
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.put(`/tenants/${id}/activate`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to activate tenant",
      );
    }
  },
);

const initialState = {
  items: [],
  selectedTenant: null,
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  },
  filters: {
    status: "",
    plan: "",
    search: "",
  },
  loading: false,
  error: null,
};

const tenantsSlice = createSlice({
  name: "tenants",
  initialState,
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    setPage: (state, action) => {
      state.pagination.page = action.payload;
    },
    clearSelectedTenant: (state) => {
      state.selectedTenant = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch tenants
      .addCase(fetchTenants.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTenants.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.tenants || [];
        state.pagination = {
          ...state.pagination,
          ...action.payload.pagination,
        };
      })
      .addCase(fetchTenants.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch single tenant
      .addCase(fetchTenantById.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTenantById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedTenant = action.payload;
      })
      .addCase(fetchTenantById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create tenant
      .addCase(createTenant.pending, (state) => {
        state.loading = true;
      })
      .addCase(createTenant.fulfilled, (state, action) => {
        state.loading = false;
        const { adminCredentials: _adminCredentials, encryptionKey: _encryptionKey, ...tenantData } = action.payload;
        state.items.unshift(tenantData);
      })
      .addCase(createTenant.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update tenant
      .addCase(updateTenant.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (t) => t._id === action.payload._id,
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.selectedTenant?._id === action.payload._id) {
          state.selectedTenant = action.payload;
        }
      })
      // Suspend/Activate
      .addCase(suspendTenant.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (t) => t._id === action.payload._id,
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
      })
      .addCase(activateTenant.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (t) => t._id === action.payload._id,
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
      })
      // Archive
      .addCase(archiveTenant.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (t) => t._id === action.payload._id,
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
      })
      // Delete
      .addCase(deleteTenant.fulfilled, (state, action) => {
        state.items = state.items.filter((t) => t._id !== action.payload);
      });
  },
});

export const { setFilters, setPage, clearSelectedTenant, clearError } =
  tenantsSlice.actions;
export default tenantsSlice.reducer;
