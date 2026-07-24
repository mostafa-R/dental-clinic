import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchPlans = createAsyncThunk(
  "plans/fetchPlans",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get("/plans");
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch plans",
      );
    }
  },
);

export const fetchPlanById = createAsyncThunk(
  "plans/fetchPlanById",
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.get(`/plans/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch plan",
      );
    }
  },
);

export const createPlan = createAsyncThunk(
  "plans/createPlan",
  async (data, { rejectWithValue }) => {
    try {
      const response = await api.post("/plans", data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to create plan",
      );
    }
  },
);

export const updatePlan = createAsyncThunk(
  "plans/updatePlan",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/plans/${id}`, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to update plan",
      );
    }
  },
);

export const deletePlan = createAsyncThunk(
  "plans/deletePlan",
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/plans/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to delete plan",
      );
    }
  },
);

const initialState = {
  items: [],
  selectedPlan: null,
  loading: false,
  error: null,
};

const plansSlice = createSlice({
  name: "plans",
  initialState,
  reducers: {
    clearSelectedPlan: (state) => {
      state.selectedPlan = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch plans
      .addCase(fetchPlans.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPlans.fulfilled, (state, action) => {
        state.loading = false;
        state.items = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchPlans.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch single plan
      .addCase(fetchPlanById.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchPlanById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedPlan = action.payload;
      })
      .addCase(fetchPlanById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create plan
      .addCase(createPlan.pending, (state) => {
        state.loading = true;
      })
      .addCase(createPlan.fulfilled, (state, action) => {
        state.loading = false;
        state.items.push(action.payload);
      })
      .addCase(createPlan.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update plan
      .addCase(updatePlan.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (p) => p._id === action.payload._id,
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.selectedPlan?._id === action.payload._id) {
          state.selectedPlan = action.payload;
        }
      })
      // Delete plan
      .addCase(deletePlan.fulfilled, (state, action) => {
        state.items = state.items.filter((p) => p._id !== action.payload);
      });
  },
});

export const { clearSelectedPlan, clearError } = plansSlice.actions;
export default plansSlice.reducer;
