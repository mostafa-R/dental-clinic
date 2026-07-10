import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { branchApi } from './branchApi';

export const fetchBranches = createAsyncThunk(
  'branches/fetchList',
  async (params, { rejectWithValue }) => {
    try {
      return await branchApi.list(params);
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load branches');
    }
  },
);

export const createBranch = createAsyncThunk(
  'branches/create',
  async (payload, { rejectWithValue }) => {
    try {
      const { branch } = await branchApi.create(payload);
      return branch;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to create branch' });
    }
  },
);

export const updateBranch = createAsyncThunk(
  'branches/update',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { branch } = await branchApi.update(id, payload);
      return branch;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to update branch' });
    }
  },
);

export const deleteBranch = createAsyncThunk(
  'branches/delete',
  async (id, { rejectWithValue }) => {
    try {
      await branchApi.delete(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to delete branch' });
    }
  },
);

const branchSlice = createSlice({
  name: 'branches',
  initialState: {
    items: [],
    status: 'idle',
    error: null,
    formStatus: 'idle',
    formError: null,
  },
  reducers: {
    resetFormState(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBranches.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchBranches.fulfilled, (state, action) => {
        state.items = action.payload.branches;
        state.status = 'succeeded';
      })
      .addCase(fetchBranches.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(createBranch.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createBranch.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
        state.formStatus = 'succeeded';
      })
      .addCase(createBranch.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updateBranch.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updateBranch.fulfilled, (state, action) => {
        const idx = state.items.findIndex((b) => b._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
        state.formStatus = 'succeeded';
      })
      .addCase(updateBranch.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(deleteBranch.fulfilled, (state, action) => {
        state.items = state.items.filter((b) => b._id !== action.payload);
      });
  },
});

export const { resetFormState } = branchSlice.actions;

export default branchSlice.reducer;
