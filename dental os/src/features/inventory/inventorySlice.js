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
  stats: { lowStockCount: 0, totalStockValue: 0 },
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
      .addCase(createItem.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createItem.fulfilled, (state, action) => {
        const item = action.payload;
        replaceItem(state, item);
        state.pagination.total += 1;
        state.pagination.pages = Math.ceil(state.pagination.total / state.pagination.limit);
        state.stats.totalStockValue += (item.costPerUnit || 0) * (item.quantity || 0);
        state.stats.lowStockCount += item.needsReorder ? 1 : 0;
        state.formStatus = 'succeeded';
      })
      .addCase(createItem.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updateItem.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updateItem.fulfilled, (state, action) => {
        const newItem = action.payload;
        const oldItem = state.items.find((i) => i._id === newItem._id);
        if (oldItem) {
          state.stats.totalStockValue += (newItem.costPerUnit || 0) * (newItem.quantity || 0)
            - (oldItem.costPerUnit || 0) * (oldItem.quantity || 0);
          if (newItem.needsReorder && !oldItem.needsReorder) state.stats.lowStockCount += 1;
          if (!newItem.needsReorder && oldItem.needsReorder) state.stats.lowStockCount -= 1;
        }
        replaceItem(state, newItem);
        state.formStatus = 'succeeded';
      })
      .addCase(updateItem.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(adjustStock.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(adjustStock.fulfilled, (state, action) => {
        const newItem = action.payload;
        const oldItem = state.items.find((i) => i._id === newItem._id);
        if (oldItem) {
          state.stats.totalStockValue += (newItem.costPerUnit || 0) * (newItem.quantity || 0)
            - (oldItem.costPerUnit || 0) * (oldItem.quantity || 0);
          if (newItem.needsReorder && !oldItem.needsReorder) state.stats.lowStockCount += 1;
          if (!newItem.needsReorder && oldItem.needsReorder) state.stats.lowStockCount -= 1;
        }
        replaceItem(state, newItem);
        state.formStatus = 'succeeded';
      })
      .addCase(adjustStock.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(deleteItem.fulfilled, (state, action) => {
        const deleted = state.items.find((i) => i._id === action.payload);
        if (deleted) {
          state.stats.totalStockValue -= (deleted.costPerUnit || 0) * (deleted.quantity || 0);
          if (deleted.needsReorder) state.stats.lowStockCount -= 1;
        }
        state.items = state.items.filter((i) => i._id !== action.payload);
        state.pagination.total = Math.max(0, state.pagination.total - 1);
        state.pagination.pages = Math.ceil(state.pagination.total / state.pagination.limit);
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
