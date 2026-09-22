import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchAdmins = createAsyncThunk(
  "admins/fetchAdmins",
  async (params, { rejectWithValue }) => {
    try {
      const response = await api.get("/admins", { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch admins",
      );
    }
  },
);

export const createAdmin = createAsyncThunk(
  "admins/createAdmin",
  async (data, { rejectWithValue }) => {
    try {
      const response = await api.post("/admins", data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to create admin",
      );
    }
  },
);

export const updateAdmin = createAsyncThunk(
  "admins/updateAdmin",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/admins/${id}`, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to update admin",
      );
    }
  },
);

export const deleteAdmin = createAsyncThunk(
  "admins/deleteAdmin",
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/admins/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to delete admin",
      );
    }
  },
);

const initialState = {
  items: [],
  selectedAdmin: null,
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  },
  filters: {
    role: "",
    search: "",
  },
  loading: false,
  error: null,
};

const adminsSlice = createSlice({
  name: "admins",
  initialState,
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    setPage: (state, action) => {
      state.pagination.page = action.payload;
    },
    clearSelectedAdmin: (state) => {
      state.selectedAdmin = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch admins
      .addCase(fetchAdmins.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAdmins.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.admins;
        state.pagination = {
          ...state.pagination,
          ...action.payload.pagination,
        };
      })
      .addCase(fetchAdmins.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create admin
      .addCase(createAdmin.pending, (state) => {
        state.loading = true;
      })
      .addCase(createAdmin.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload.admin || action.payload);
      })
      .addCase(createAdmin.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update admin
      .addCase(updateAdmin.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (a) => a._id === action.payload._id,
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.selectedAdmin?._id === action.payload._id) {
          state.selectedAdmin = action.payload;
        }
      })
      // Delete admin
      .addCase(deleteAdmin.fulfilled, (state, action) => {
        state.items = state.items.filter((a) => a._id !== action.payload);
      });
  },
});

export const { setFilters, setPage, clearSelectedAdmin, clearError } =
  adminsSlice.actions;
export default adminsSlice.reducer;
