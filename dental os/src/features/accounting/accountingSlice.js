import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { accountingApi } from './accountingApi';

function errPayload(err, fallback) {
  return err.response?.data || { message: fallback };
}

/* --------------------------------------------------------------- Summary */

export const fetchSummary = createAsyncThunk(
  'accounting/fetchSummary',
  async (params, { rejectWithValue }) => {
    try {
      return await accountingApi.getSummary(params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load summary'));
    }
  },
);

/* --------------------------------------------------------------- Expenses */

export const fetchExpenses = createAsyncThunk(
  'accounting/fetchExpenses',
  async (params, { rejectWithValue }) => {
    try {
      return await accountingApi.listExpenses(params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load expenses'));
    }
  },
);

export const createExpense = createAsyncThunk(
  'accounting/createExpense',
  async (payload, { rejectWithValue }) => {
    try {
      const { expense } = await accountingApi.createExpense(payload);
      return expense;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create expense'));
    }
  },
);

export const deleteExpense = createAsyncThunk(
  'accounting/deleteExpense',
  async (id, { rejectWithValue }) => {
    try {
      await accountingApi.deleteExpense(id);
      return id;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to delete expense'));
    }
  },
);

/* ----------------------------------------------------------- Owner drawings */

export const fetchDrawings = createAsyncThunk(
  'accounting/fetchDrawings',
  async (params, { rejectWithValue }) => {
    try {
      return await accountingApi.listDrawings(params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load drawings'));
    }
  },
);

export const createDrawing = createAsyncThunk(
  'accounting/createDrawing',
  async (payload, { rejectWithValue }) => {
    try {
      const { drawing } = await accountingApi.createDrawing(payload);
      return drawing;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create drawing'));
    }
  },
);

export const deleteDrawing = createAsyncThunk(
  'accounting/deleteDrawing',
  async (id, { rejectWithValue }) => {
    try {
      await accountingApi.deleteDrawing(id);
      return id;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to delete drawing'));
    }
  },
);

/* --------------------------------------------------------------- Commissions */

export const fetchCommissions = createAsyncThunk(
  'accounting/fetchCommissions',
  async (params, { rejectWithValue }) => {
    try {
      return await accountingApi.listCommissions(params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load commissions'));
    }
  },
);

export const updateCommission = createAsyncThunk(
  'accounting/updateCommission',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { commission } = await accountingApi.updateCommission(id, payload);
      return commission;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update commission'));
    }
  },
);

/* --------------------------------------------------------------- slice */

const initialState = {
  summary: null,
  expenses: { items: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 }, status: 'idle', error: null },
  drawings: { items: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 }, status: 'idle', error: null },
  commissions: { items: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 }, status: 'idle', error: null },
  summaryStatus: 'idle',
  summaryError: null,
  formStatus: 'idle',
  formError: null,
};

function replaceExpense(state, expense) {
  const idx = state.expenses.items.findIndex((e) => e._id === expense._id);
  if (idx >= 0) state.expenses.items[idx] = expense;
  else state.expenses.items.unshift(expense);
}

function replaceDrawing(state, drawing) {
  const idx = state.drawings.items.findIndex((d) => d._id === drawing._id);
  if (idx >= 0) state.drawings.items[idx] = drawing;
  else state.drawings.items.unshift(drawing);
}

function replaceCommission(state, commission) {
  const idx = state.commissions.items.findIndex((c) => c._id === commission._id);
  if (idx >= 0) state.commissions.items[idx] = commission;
  else state.commissions.items.unshift(commission);
}

const accountingSlice = createSlice({
  name: 'accounting',
  initialState,
  reducers: {
    resetAccounting() {
      return initialState;
    },
    resetFormState(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      /* summary */
      .addCase(fetchSummary.pending, (state) => {
        state.summaryStatus = 'loading';
        state.summaryError = null;
      })
      .addCase(fetchSummary.fulfilled, (state, action) => {
        state.summary = action.payload;
        state.summaryStatus = 'succeeded';
      })
      .addCase(fetchSummary.rejected, (state, action) => {
        state.summaryStatus = 'failed';
        state.summaryError = action.payload;
      })

      /* expenses */
      .addCase(fetchExpenses.pending, (state) => {
        state.expenses.status = 'loading';
        state.expenses.error = null;
      })
      .addCase(fetchExpenses.fulfilled, (state, action) => {
        state.expenses.items = action.payload.expenses;
        state.expenses.pagination = action.payload.pagination;
        state.expenses.status = 'succeeded';
      })
      .addCase(fetchExpenses.rejected, (state, action) => {
        state.expenses.status = 'failed';
        state.expenses.error = action.payload;
      })
      .addCase(createExpense.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createExpense.fulfilled, (state, action) => {
        replaceExpense(state, action.payload);
        state.summaryStatus = 'idle';
        state.formStatus = 'succeeded';
      })
      .addCase(createExpense.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(deleteExpense.fulfilled, (state, action) => {
        state.expenses.items = state.expenses.items.filter((e) => e._id !== action.payload);
        state.summaryStatus = 'idle';
      })

      /* drawings */
      .addCase(fetchDrawings.pending, (state) => {
        state.drawings.status = 'loading';
        state.drawings.error = null;
      })
      .addCase(fetchDrawings.fulfilled, (state, action) => {
        state.drawings.items = action.payload.drawings;
        state.drawings.pagination = action.payload.pagination;
        state.drawings.status = 'succeeded';
      })
      .addCase(fetchDrawings.rejected, (state, action) => {
        state.drawings.status = 'failed';
        state.drawings.error = action.payload;
      })
      .addCase(createDrawing.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createDrawing.fulfilled, (state, action) => {
        replaceDrawing(state, action.payload);
        state.summaryStatus = 'idle';
        state.formStatus = 'succeeded';
      })
      .addCase(createDrawing.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(deleteDrawing.fulfilled, (state, action) => {
        state.drawings.items = state.drawings.items.filter((d) => d._id !== action.payload);
        state.summaryStatus = 'idle';
      })

      /* commissions */
      .addCase(fetchCommissions.pending, (state) => {
        state.commissions.status = 'loading';
        state.commissions.error = null;
      })
      .addCase(fetchCommissions.fulfilled, (state, action) => {
        state.commissions.items = action.payload.commissions;
        state.commissions.pagination = action.payload.pagination;
        state.commissions.status = 'succeeded';
      })
      .addCase(fetchCommissions.rejected, (state, action) => {
        state.commissions.status = 'failed';
        state.commissions.error = action.payload;
      })
      .addCase(updateCommission.fulfilled, replaceCommission);
  },
});

export const { resetAccounting, resetFormState } = accountingSlice.actions;

export default accountingSlice.reducer;
