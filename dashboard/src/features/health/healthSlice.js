import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchHealth = createAsyncThunk(
  "health/fetch",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/health");
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to fetch health");
    }
  },
);

const healthSlice = createSlice({
  name: "health",
  initialState: {
    data: null,
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchHealth.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchHealth.fulfilled, (state, action) => { state.loading = false; state.data = action.payload; })
      .addCase(fetchHealth.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export default healthSlice.reducer;
