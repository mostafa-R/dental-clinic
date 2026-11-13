import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { automationApi } from './automationApi';
import { errPayload } from '../../lib/errors';

export const fetchAutomations = createAsyncThunk(
  'automations/fetchList',
  async (params, { rejectWithValue }) => {
    try {
      return await automationApi.list(params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load automations'));
    }
  },
);

export const fetchAutomationTriggers = createAsyncThunk(
  'automations/fetchTriggers',
  async (_, { rejectWithValue }) => {
    try {
      return await automationApi.listTriggers();
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load automation triggers'));
    }
  },
);

export const fetchAutomationRuns = createAsyncThunk(
  'automations/fetchRuns',
  async (params, { rejectWithValue }) => {
    try {
      return await automationApi.listRuns(params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load automation runs'));
    }
  },
);

export const createAutomation = createAsyncThunk(
  'automations/create',
  async (payload, { rejectWithValue }) => {
    try {
      const { automation } = await automationApi.create(payload);
      return automation;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create automation'));
    }
  },
);

export const updateAutomation = createAsyncThunk(
  'automations/update',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { automation } = await automationApi.update(id, payload);
      return automation;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update automation'));
    }
  },
);

export const deleteAutomation = createAsyncThunk(
  'automations/delete',
  async (id, { rejectWithValue }) => {
    try {
      await automationApi.remove(id);
      return id;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to delete automation'));
    }
  },
);

export const installAutomationTemplates = createAsyncThunk(
  'automations/installTemplates',
  async (_, { rejectWithValue }) => {
    try {
      return await automationApi.installTemplates();
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to install automation templates'));
    }
  },
);

export const testAutomation = createAsyncThunk(
  'automations/test',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      return await automationApi.test(id, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to test automation'));
    }
  },
);

const automationSlice = createSlice({
  name: 'automations',
  initialState: {
    items: [],
    status: 'idle',
    error: null,
    triggers: [],
    actionTypes: [],
    conditionOps: [],
    metaStatus: 'idle',
    runs: [],
    runsStatus: 'idle',
    runsError: null,
    formStatus: 'idle',
    formError: null,
    testStatus: 'idle',
    testError: null,
    testResult: null,
  },
  reducers: {
    resetAutomationFormState(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
    resetAutomationTestState(state) {
      state.testStatus = 'idle';
      state.testError = null;
      state.testResult = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAutomations.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchAutomations.fulfilled, (state, action) => {
        state.items = action.payload.automations || [];
        state.status = 'succeeded';
      })
      .addCase(fetchAutomations.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(fetchAutomationTriggers.pending, (state) => {
        state.metaStatus = 'loading';
      })
      .addCase(fetchAutomationTriggers.fulfilled, (state, action) => {
        state.triggers = action.payload.triggers || [];
        state.actionTypes = action.payload.actionTypes || [];
        state.conditionOps = action.payload.conditionOps || [];
        state.metaStatus = 'succeeded';
      })
      .addCase(fetchAutomationTriggers.rejected, (state) => {
        state.metaStatus = 'failed';
      })
      .addCase(fetchAutomationRuns.pending, (state) => {
        state.runsStatus = 'loading';
        state.runsError = null;
      })
      .addCase(fetchAutomationRuns.fulfilled, (state, action) => {
        state.runs = action.payload.runs || [];
        state.runsStatus = 'succeeded';
      })
      .addCase(fetchAutomationRuns.rejected, (state, action) => {
        state.runsStatus = 'failed';
        state.runsError = action.payload;
      })
      .addCase(createAutomation.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createAutomation.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
        state.formStatus = 'succeeded';
      })
      .addCase(createAutomation.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updateAutomation.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updateAutomation.fulfilled, (state, action) => {
        const idx = state.items.findIndex((a) => a._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
        state.formStatus = 'succeeded';
      })
      .addCase(updateAutomation.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(deleteAutomation.fulfilled, (state, action) => {
        state.items = state.items.filter((a) => a._id !== action.payload);
      })
      .addCase(installAutomationTemplates.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(installAutomationTemplates.fulfilled, (state) => {
        state.formStatus = 'succeeded';
      })
      .addCase(installAutomationTemplates.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(testAutomation.pending, (state) => {
        state.testStatus = 'loading';
        state.testError = null;
        state.testResult = null;
      })
      .addCase(testAutomation.fulfilled, (state, action) => {
        state.testStatus = 'succeeded';
        state.testResult = action.payload;
      })
      .addCase(testAutomation.rejected, (state, action) => {
        state.testStatus = 'failed';
        state.testError = action.payload;
      });
  },
});

export const { resetAutomationFormState, resetAutomationTestState } = automationSlice.actions;
export default automationSlice.reducer;
