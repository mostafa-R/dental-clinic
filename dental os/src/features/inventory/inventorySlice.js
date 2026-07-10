import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { inventoryApi } from './inventoryApi';

function errPayload(err, fallback) {
  return err.response?.data || { message: fallback };
}

export const fetchItems = createAsyncThunk(
  'inventory/fetchItems',
  async (params, { rejectWithValue }) => {
    try {
      return await inventoryApi.list(params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load inventory'));
    }
  },
);

export const createItem = createAsyncThunk(
  'inventory/createItem',
  async (payload, { rejectWithValue }) => {
    try {
      const { item } = await inventoryApi.create(payload);
      return item;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create item'));
    }
  },
);

export const updateItem = createAsyncThunk(
  'inventory/updateItem',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { item } = await inventoryApi.update(id, payload);
      return item;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update item'));
    }
  },
);

export const deleteItem = createAsyncThunk(
  'inventory/deleteItem',
  async (id, { rejectWithValue }) => {
    try {
      await inventoryApi.delete(id);
      return id;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to delete item'));
    }
  },
);

export const adjustStock = createAsyncThunk(
  'inventory/adjustStock',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { item } = await inventoryApi.adjust(id, payload);
      return item;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to adjust stock'));
    }
  },
);

const initialState = {
  items: [],
  pagination: { page: 1, limit: 50, total: 0, pages: 1 },
  stats: { lowStockCount: 0 },
  query: { search: '', category: '', lowStock: undefined, page: 1, limit: 50 },
  status: 'idle',
  error: null,
  formStatus: 'idle',
  formError: null,
};

function replaceItem(state, item) {
  const idx = state.items.findIndex((i) => i._id === item._id);
  if (idx >= 0) state.items[idx] = item;
  else state.items.unshift(item);
}

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setSearch(state, action) {
      state.query.search = action.payload;
      state.query.page = 1;
    },
    setCategoryFilter(state, action) {
      state.query.category = action.payload;
      state.query.page = 1;
    },
    setLowStockFilter(state, action) {
      state.query.lowStock = action.payload;
      state.query.page = 1;
    },
    setPage(state, action) {
      state.query.page = action.payload;
    },
    resetInventory(state) {
      state.items = [];
      state.query = { search: '', category: '', lowStock: undefined, page: 1, limit: 50 };
      state.status = 'idle';
      state.error = null;
    },
    resetFormState(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchItems.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchItems.fulfilled, (state, action) => {
        state.items = action.payload.items;
        state.pagination = action.payload.pagination;
        state.stats = action.payload.stats;
        state.status = 'succeeded';
      })
      .addCase(fetchItems.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(createItem.fulfilled, (state, action) => {
        replaceItem(state, action.payload);
        state.formStatus = 'succeeded';
      })
      .addCase(createItem.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updateItem.fulfilled, replaceItem)
      .addCase(adjustStock.fulfilled, replaceItem)
      .addCase(deleteItem.fulfilled, (state, action) => {
        state.items = state.items.filter((i) => i._id !== action.payload);
      });
  },
});

export const {
  setSearch,
  setCategoryFilter,
  setLowStockFilter,
  setPage,
  resetInventory,
  resetFormState,
} = inventorySlice.actions;

export default inventorySlice.reducer;
