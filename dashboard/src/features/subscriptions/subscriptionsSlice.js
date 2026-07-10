import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchSubscriptions = createAsyncThunk(
  "subscriptions/fetchSubscriptions",
  async (params, { rejectWithValue }) => {
    try {
      const response = await api.get("/subscriptions", { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch subscriptions",
      );
    }
  },
);

export const fetchRevenueStats = createAsyncThunk(
  "subscriptions/fetchRevenueStats",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get("/subscriptions/revenue");
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch revenue stats",
      );
    }
  },
);

export const updateSubscription = createAsyncThunk(
  "subscriptions/updateSubscription",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/subscriptions/${id}`, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to update subscription",
      );
    }
  },
);

export const processPayment = createAsyncThunk(
  "subscriptions/processPayment",
  async ({ tenantId, data }, { rejectWithValue }) => {
    try {
      const response = await api.post(
        `/subscriptions/${tenantId}/payment`,
        data,
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to process payment",
      );
    }
  },
);

const initialState = {
  items: [],
  revenueStats: {
    totalRevenue: 0,
    monthlyRecurring: 0,
    yearlyRecurring: 0,
    pendingPayments: [],
    revenueByMonth: [],
    revenueByPlan: [],
  },
  loading: false,
  error: null,
};

const subscriptionsSlice = createSlice({
  name: "subscriptions",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSubscriptions.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchSubscriptions.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchSubscriptions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchRevenueStats.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchRevenueStats.fulfilled, (state, action) => {
        state.loading = false;
        state.revenueStats = action.payload;
      })
      .addCase(fetchRevenueStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(updateSubscription.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (s) => s._id === action.payload._id,
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
      });
  },
});

export const { clearError } = subscriptionsSlice.actions;
export default subscriptionsSlice.reducer;
