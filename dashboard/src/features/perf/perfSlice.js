import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchPerfStats = createAsyncThunk(
  "perf/fetchPerfStats",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get("/perf");
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch performance stats",
      );
    }
  },
);

export const resetPerfStats = createAsyncThunk(
  "perf/resetPerfStats",
  async (_, { rejectWithValue }) => {
    try {
      await api.post("/perf/reset");
      return true;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to reset performance stats",
      );
    }
  },
);

const initialState = {
  data: null,
  loading: false,
  resetting: false,
  error: null,
};

const perfSlice = createSlice({
  name: "perf",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPerfStats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPerfStats.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.data || action.payload;
      })
      .addCase(fetchPerfStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(resetPerfStats.pending, (state) => {
        state.resetting = true;
      })
      .addCase(resetPerfStats.fulfilled, (state) => {
        state.resetting = false;
        state.data = null;
      })
      .addCase(resetPerfStats.rejected, (state, action) => {
        state.resetting = false;
        state.error = action.payload;
      });
  },
});

export const { clearError } = perfSlice.actions;
export default perfSlice.reducer;
