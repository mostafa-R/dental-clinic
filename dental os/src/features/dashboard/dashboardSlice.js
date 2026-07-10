import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { dashboardApi } from './dashboardApi';

export const fetchDashboardStats = createAsyncThunk(
  'dashboard/fetchStats',
  async (_, { rejectWithValue }) => {
    try {
      return await dashboardApi.getStats();
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load dashboard');
    }
  },
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState: {
    stats: null,
    status: 'idle',
    error: null,
  },
  reducers: {
    resetDashboard(state) {
      state.stats = null;
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardStats.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchDashboardStats.fulfilled, (state, action) => {
        state.stats = action.payload;
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(fetchDashboardStats.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      });
  },
});

export const { resetDashboard } = dashboardSlice.actions;

export default dashboardSlice.reducer;
