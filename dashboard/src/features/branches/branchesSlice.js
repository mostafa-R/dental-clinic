import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchBranches = createAsyncThunk(
  "branches/fetchBranches",
  async (params, { rejectWithValue }) => {
    try {
      const response = await api.get("/branches", { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch branches",
      );
    }
  },
);

export const fetchBranchById = createAsyncThunk(
  "branches/fetchBranchById",
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.get(`/branches/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch branch",
      );
    }
  },
);

export const createBranch = createAsyncThunk(
  "branches/createBranch",
  async (data, { rejectWithValue }) => {
    try {
      const response = await api.post("/branches", data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to create branch",
      );
    }
  },
);

export const updateBranch = createAsyncThunk(
  "branches/updateBranch",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/branches/${id}`, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to update branch",
      );
    }
  },
);

export const deleteBranch = createAsyncThunk(
  "branches/deleteBranch",
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/branches/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to delete branch",
      );
    }
  },
);

const initialState = {
  items: [],
  selectedBranch: null,
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  },
  filters: {
    search: "",
    tenant: "",
  },
  loading: false,
  error: null,
};

const branchesSlice = createSlice({
  name: "branches",
  initialState,
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    setPage: (state, action) => {
      state.pagination.page = action.payload;
    },
    clearSelectedBranch: (state) => {
      state.selectedBranch = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBranches.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBranches.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.branches;
        state.pagination = {
          ...state.pagination,
          ...action.payload.pagination,
        };
      })
      .addCase(fetchBranches.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchBranchById.fulfilled, (state, action) => {
        state.selectedBranch = action.payload;
      })
      .addCase(createBranch.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(updateBranch.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (b) => b._id === action.payload._id,
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.selectedBranch?._id === action.payload._id) {
          state.selectedBranch = action.payload;
        }
      })
      .addCase(deleteBranch.fulfilled, (state, action) => {
        state.items = state.items.filter((b) => b._id !== action.payload);
      });
  },
});

export const { setFilters, setPage, clearSelectedBranch, clearError } =
  branchesSlice.actions;
export default branchesSlice.reducer;
