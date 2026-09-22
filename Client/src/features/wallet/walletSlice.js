import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { accountingApi } from '../accounting/accountingApi';

function errPayload(err, fallback) {
  return err.response?.data || { message: fallback };
}

export const fetchWallet = createAsyncThunk(
  'wallet/fetchWallet',
  async (patientId, { rejectWithValue }) => {
    try {
      const { wallet } = await accountingApi.getWallet(patientId);
      return wallet;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load wallet'));
    }
  },
);

export const addTransaction = createAsyncThunk(
  'wallet/addTransaction',
  async ({ patientId, payload }, { rejectWithValue }) => {
    try {
      const { wallet } = await accountingApi.addWalletTransaction(patientId, payload);
      return wallet;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to add transaction'));
    }
  },
);

export const fetchInstallmentPlans = createAsyncThunk(
  'wallet/fetchInstallmentPlans',
  async ({ patientId, params }, { rejectWithValue }) => {
    try {
      return await accountingApi.listInstallments(patientId, params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load installment plans'));
    }
  },
);

export const createInstallmentPlan = createAsyncThunk(
  'wallet/createInstallmentPlan',
  async ({ patientId, payload }, { rejectWithValue }) => {
    try {
      const { installmentPlan } = await accountingApi.createInstallment(patientId, payload);
      return installmentPlan;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create installment plan'));
    }
  },
);

export const payInstallmentPlan = createAsyncThunk(
  'wallet/payInstallmentPlan',
  async ({ patientId, planId, payload }, { rejectWithValue }) => {
    try {
      const { installmentPlan } = await accountingApi.payInstallment(patientId, planId, payload);
      return installmentPlan;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to pay installment'));
    }
  },
);

export const updateInstallmentPlan = createAsyncThunk(
  'wallet/updateInstallmentPlan',
  async ({ patientId, planId, payload }, { rejectWithValue }) => {
    try {
      const { installmentPlan } = await accountingApi.updateInstallment(patientId, planId, payload);
      return installmentPlan;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update installment plan'));
    }
  },
);

export const generateInvoiceFromPlan = createAsyncThunk(
  'wallet/generateInvoiceFromPlan',
  async ({ patientId, planId, payload }, { rejectWithValue }) => {
    try {
      return await accountingApi.generateInvoice(patientId, planId, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to generate invoice'));
    }
  },
);

const initialState = {
  wallet: null,
  walletStatus: 'idle',
  walletError: null,

  plans: { items: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 }, status: 'idle', error: null },

  transactionStatus: 'idle',
  transactionError: null,

  formStatus: 'idle',
  formError: null,
};

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    resetWallet() {
      return initialState;
    },
    resetFormState(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
    resetTransactionState(state) {
      state.transactionStatus = 'idle';
      state.transactionError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      /* wallet */
      .addCase(fetchWallet.pending, (state) => {
        state.walletStatus = 'loading';
        state.walletError = null;
      })
      .addCase(fetchWallet.fulfilled, (state, action) => {
        state.wallet = action.payload;
        state.walletStatus = 'succeeded';
      })
      .addCase(fetchWallet.rejected, (state, action) => {
        state.walletStatus = 'failed';
        state.walletError = action.payload;
      })

      /* add transaction */
      .addCase(addTransaction.pending, (state) => {
        state.transactionStatus = 'loading';
        state.transactionError = null;
      })
      .addCase(addTransaction.fulfilled, (state, action) => {
        state.wallet = action.payload;
        state.transactionStatus = 'succeeded';
      })
      .addCase(addTransaction.rejected, (state, action) => {
        state.transactionStatus = 'failed';
        state.transactionError = action.payload;
      })

      /* installment plans */
      .addCase(fetchInstallmentPlans.pending, (state) => {
        state.plans.status = 'loading';
        state.plans.error = null;
      })
      .addCase(fetchInstallmentPlans.fulfilled, (state, action) => {
        state.plans.items = action.payload.installmentPlans;
        state.plans.pagination = action.payload.pagination;
        state.plans.status = 'succeeded';
      })
      .addCase(fetchInstallmentPlans.rejected, (state, action) => {
        state.plans.status = 'failed';
        state.plans.error = action.payload;
      })

      .addCase(createInstallmentPlan.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createInstallmentPlan.fulfilled, (state, action) => {
        state.plans.items.unshift(action.payload);
        state.formStatus = 'succeeded';
      })
      .addCase(createInstallmentPlan.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })

      .addCase(payInstallmentPlan.fulfilled, (state, action) => {
        const idx = state.plans.items.findIndex((p) => p._id === action.payload._id);
        if (idx >= 0) state.plans.items[idx] = action.payload;
        state.formStatus = 'succeeded';
      })

      .addCase(updateInstallmentPlan.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updateInstallmentPlan.fulfilled, (state, action) => {
        const idx = state.plans.items.findIndex((p) => p._id === action.payload._id);
        if (idx >= 0) state.plans.items[idx] = action.payload;
        state.formStatus = 'succeeded';
      })
      .addCase(updateInstallmentPlan.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })

      .addCase(generateInvoiceFromPlan.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(generateInvoiceFromPlan.fulfilled, (state) => {
        state.formStatus = 'succeeded';
      })
      .addCase(generateInvoiceFromPlan.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      });
  },
});

export const { resetWallet, resetFormState, resetTransactionState } = walletSlice.actions;

export default walletSlice.reducer;
