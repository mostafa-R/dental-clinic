import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { recallApi } from './recallApi';

function errPayload(err, fallback) {
  return err.response?.data || { message: fallback };
}

export const fetchRecalls = createAsyncThunk(
  'recalls/fetchList',
  async (params, { rejectWithValue }) => {
    try {
      return await recallApi.list(params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load recalls'));
    }
  },
);

export const createRecall = createAsyncThunk(
  'recalls/create',
  async (payload, { rejectWithValue }) => {
    try {
      const { recall } = await recallApi.create(payload);
      return recall;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create recall'));
    }
  },
);

const transitionThunk = (name, fn) => createAsyncThunk(
  `recalls/${name}`,
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { recall } = await fn(id, payload);
      return recall;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update recall'));
    }
  },
);

export const contactRecall = transitionThunk('contact', (id, payload) => recallApi.contact(id, payload));
export const postponeRecall = transitionThunk('postpone', (id, payload) => recallApi.postpone(id, payload));
export const scheduleRecall = transitionThunk('schedule', (id, payload) => recallApi.schedule(id, payload));
export const completeRecall = transitionThunk('complete', (id, payload) => recallApi.complete(id, payload));
export const dismissRecall = transitionThunk('dismiss', (id, payload) => recallApi.dismiss(id, payload));

function upsertItem(state, recall) {
  const idx = state.items.findIndex((r) => r._id === recall._id);
  if (idx >= 0) state.items[idx] = recall;
  else state.items.unshift(recall);
}

const recallSlice = createSlice({
  name: 'recalls',
  initialState: {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    status: 'idle',
    error: null,
    formStatus: 'idle',
    formError: null,
  },
  reducers: {
    resetRecallForm(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecalls.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchRecalls.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.items || [];
        state.total = action.payload.total || 0;
        state.page = action.payload.page || 1;
        state.limit = action.payload.limit || 20;
      })
      .addCase(fetchRecalls.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addMatcher(
        (a) => a.type.startsWith('recalls/') && a.type.endsWith('/pending') && !a.type.includes('fetchList'),
        (state) => {
          state.formStatus = 'loading';
          state.formError = null;
        },
      )
      .addMatcher(
        (a) => a.type.startsWith('recalls/') && a.type.endsWith('/fulfilled') && !a.type.includes('fetchList'),
        (state, action) => {
          state.formStatus = 'succeeded';
          if (action.payload?._id) upsertItem(state, action.payload);
        },
      )
      .addMatcher(
        (a) => a.type.startsWith('recalls/') && a.type.endsWith('/rejected') && !a.type.includes('fetchList'),
        (state, action) => {
          state.formStatus = 'failed';
          state.formError = action.payload;
        },
      );
  },
});

export const { resetRecallForm } = recallSlice.actions;
export default recallSlice.reducer;
