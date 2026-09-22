import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { billingApi } from './billingApi';

const initialQuery = { search: '', status: undefined, patient: undefined, page: 1, limit: 20 };

export const fetchInvoices = createAsyncThunk(
  'billing/fetchList',
  async (params, { rejectWithValue }) => {
    try {
      return await billingApi.list(params);
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load invoices');
    }
  },
);

export const fetchBillingSummary = createAsyncThunk(
  'billing/fetchSummary',
  async (_, { rejectWithValue }) => {
    try {
      return await billingApi.summary();
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load billing summary');
    }
  },
);

export const createInvoice = createAsyncThunk(
  'billing/create',
  async (payload, { rejectWithValue }) => {
    try {
      const { invoice } = await billingApi.create(payload);
      return invoice;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to create invoice' });
    }
  },
);

export const updateInvoice = createAsyncThunk(
  'billing/update',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { invoice } = await billingApi.update(id, payload);
      return invoice;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to update invoice' });
    }
  },
);

export const recordPayment = createAsyncThunk(
  'billing/payment',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { invoice } = await billingApi.addPayment(id, payload);
      return invoice;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to record payment' });
    }
  },
);

export const voidInvoice = createAsyncThunk(
  'billing/void',
  async ({ id, reason }, { rejectWithValue }) => {
    try {
      const { invoice } = await billingApi.void(id, { reason });
      return invoice;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to void invoice' });
    }
  },
);

export const refundPayment = createAsyncThunk(
  'billing/refund',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { invoice } = await billingApi.refund(id, payload);
      return invoice;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to refund payment' });
    }
  },
);

export const fetchAgingReport = createAsyncThunk(
  'billing/fetchAging',
  async (_, { rejectWithValue }) => {
    try {
      return await billingApi.aging();
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load aging report');
    }
  },
);

const billingSlice = createSlice({
  name: 'billing',
  initialState: {
    items: [],
    pagination: { page: 1, limit: 20, total: 0, pages: 1 },
    query: { ...initialQuery },
    status: 'idle',
    error: null,
    summary: null,
    summaryStatus: 'idle',
    formStatus: 'idle',
    formError: null,
    paymentStatus: 'idle',
    paymentError: null,
    voidStatus: 'idle',
    voidError: null,
    aging: null,
    agingStatus: 'idle',
  },
  reducers: {
    setSearch(state, action) {
      state.query.search = action.payload;
      state.query.page = 1;
    },
    setStatusFilter(state, action) {
      state.query.status = action.payload;
      state.query.page = 1;
    },
    setPage(state, action) {
      state.query.page = action.payload;
    },
    resetBilling(state) {
      state.items = [];
      state.query = { ...initialQuery };
      state.status = 'idle';
      state.error = null;
      state.summary = null;
      state.summaryStatus = 'idle';
      state.aging = null;
      state.agingStatus = 'idle';
    },
    resetFormState(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
    resetPaymentState(state) {
      state.paymentStatus = 'idle';
      state.paymentError = null;
    },
    resetVoidState(state) {
      state.voidStatus = 'idle';
      state.voidError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInvoices.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchInvoices.fulfilled, (state, action) => {
        state.items = action.payload.invoices;
        state.pagination = action.payload.pagination;
        state.status = 'succeeded';
      })
      .addCase(fetchInvoices.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(fetchBillingSummary.pending, (state) => {
        state.summaryStatus = 'loading';
      })
      .addCase(fetchBillingSummary.fulfilled, (state, action) => {
        state.summary = action.payload.summary || action.payload;
        state.summaryStatus = 'succeeded';
      })
      .addCase(fetchBillingSummary.rejected, (state) => {
        state.summaryStatus = 'failed';
      })
      .addCase(createInvoice.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createInvoice.fulfilled, (state) => {
        state.formStatus = 'succeeded';
        state.formError = null;
      })
      .addCase(createInvoice.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updateInvoice.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updateInvoice.fulfilled, (state, action) => {
        const idx = state.items.findIndex((i) => i._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
        state.formStatus = 'succeeded';
        state.formError = null;
      })
      .addCase(updateInvoice.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(recordPayment.pending, (state) => {
        state.paymentStatus = 'loading';
        state.paymentError = null;
      })
      .addCase(recordPayment.fulfilled, (state, action) => {
        const idx = state.items.findIndex((i) => i._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
        state.paymentStatus = 'succeeded';
        state.paymentError = null;
      })
      .addCase(recordPayment.rejected, (state, action) => {
        state.paymentStatus = 'failed';
        state.paymentError = action.payload;
      })
      .addCase(voidInvoice.pending, (state) => {
        state.voidStatus = 'loading';
        state.voidError = null;
      })
      .addCase(voidInvoice.fulfilled, (state, action) => {
        const idx = state.items.findIndex((i) => i._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
        state.voidStatus = 'succeeded';
        state.voidError = null;
      })
      .addCase(voidInvoice.rejected, (state, action) => {
        state.voidStatus = 'failed';
        state.voidError = action.payload;
      })
      .addCase(refundPayment.pending, (state) => {
        state.paymentStatus = 'loading';
        state.paymentError = null;
      })
      .addCase(refundPayment.fulfilled, (state, action) => {
        const idx = state.items.findIndex((i) => i._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
        state.paymentStatus = 'succeeded';
        state.paymentError = null;
      })
      .addCase(refundPayment.rejected, (state, action) => {
        state.paymentStatus = 'failed';
        state.paymentError = action.payload;
      })
      .addCase(fetchAgingReport.pending, (state) => {
        state.agingStatus = 'loading';
      })
      .addCase(fetchAgingReport.fulfilled, (state, action) => {
        state.aging = action.payload;
        state.agingStatus = 'succeeded';
      })
      .addCase(fetchAgingReport.rejected, (state) => {
        state.agingStatus = 'failed';
      });
  },
});

export const {
  setSearch,
  setStatusFilter,
  setPage,
  resetBilling,
  resetFormState,
  resetPaymentState,
  resetVoidState,
} = billingSlice.actions;

export default billingSlice.reducer;
