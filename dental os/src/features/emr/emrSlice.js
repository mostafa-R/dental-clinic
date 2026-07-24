import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { emrApi } from './emrApi';

function errPayload(err, fallback) {
  return err.response?.data || { message: fallback };
}

/* --------------------------------------------------------------- Dental chart */

export const fetchChart = createAsyncThunk(
  'emr/fetchChart',
  async (patientId, { rejectWithValue }) => {
    try {
      return await emrApi.getChart(patientId);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load dental chart'));
    }
  },
);

export const saveTooth = createAsyncThunk(
  'emr/saveTooth',
  async ({ patientId, number, payload }, { rejectWithValue }) => {
    try {
      return await emrApi.updateTooth(patientId, number, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update tooth'));
    }
  },
);

export const saveChart = createAsyncThunk(
  'emr/saveChart',
  async ({ patientId, payload }, { rejectWithValue }) => {
    try {
      return await emrApi.updateChart(patientId, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update chart'));
    }
  },
);

/* ------------------------------------------------------------- Treatment plans */

export const fetchPlans = createAsyncThunk(
  'emr/fetchPlans',
  async ({ patientId, params }, { rejectWithValue }) => {
    try {
      return await emrApi.listPlans(patientId, params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load treatment plans'));
    }
  },
);

export const createPlan = createAsyncThunk(
  'emr/createPlan',
  async ({ patientId, payload }, { rejectWithValue }) => {
    try {
      return await emrApi.createPlan(patientId, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create treatment plan'));
    }
  },
);

export const updatePlan = createAsyncThunk(
  'emr/updatePlan',
  async ({ patientId, planId, payload }, { rejectWithValue }) => {
    try {
      return await emrApi.updatePlan(patientId, planId, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update treatment plan'));
    }
  },
);

export const archivePlan = createAsyncThunk(
  'emr/archivePlan',
  async ({ patientId, planId }, { rejectWithValue }) => {
    try {
      return await emrApi.archivePlan(patientId, planId);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to archive treatment plan'));
    }
  },
);

export const addPlanItem = createAsyncThunk(
  'emr/addPlanItem',
  async ({ patientId, planId, payload }, { rejectWithValue }) => {
    try {
      return await emrApi.addItem(patientId, planId, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to add treatment item'));
    }
  },
);

export const updatePlanItem = createAsyncThunk(
  'emr/updatePlanItem',
  async ({ patientId, planId, itemId, payload }, { rejectWithValue }) => {
    try {
      return await emrApi.updateItem(patientId, planId, itemId, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update treatment item'));
    }
  },
);

export const removePlanItem = createAsyncThunk(
  'emr/removePlanItem',
  async ({ patientId, planId, itemId }, { rejectWithValue }) => {
    try {
      return await emrApi.removeItem(patientId, planId, itemId);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to remove treatment item'));
    }
  },
);

/* --------------------------------------------------------------- Prescriptions */

export const fetchPrescriptions = createAsyncThunk(
  'emr/fetchPrescriptions',
  async ({ patientId, params }, { rejectWithValue }) => {
    try {
      return await emrApi.listPrescriptions(patientId, params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load prescriptions'));
    }
  },
);

export const createPrescription = createAsyncThunk(
  'emr/createPrescription',
  async ({ patientId, payload }, { rejectWithValue }) => {
    try {
      return await emrApi.createPrescription(patientId, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create prescription'));
    }
  },
);

export const updatePrescription = createAsyncThunk(
  'emr/updatePrescription',
  async ({ patientId, rxId, payload }, { rejectWithValue }) => {
    try {
      return await emrApi.updatePrescription(patientId, rxId, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update prescription'));
    }
  },
);

export const deletePrescription = createAsyncThunk(
  'emr/deletePrescription',
  async ({ patientId, rxId }, { rejectWithValue }) => {
    try {
      await emrApi.deletePrescription(patientId, rxId);
      return rxId;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to delete prescription'));
    }
  },
);

/* -------------------------------------------------------------- Clinical notes */

export const fetchNotes = createAsyncThunk(
  'emr/fetchNotes',
  async ({ patientId, params }, { rejectWithValue }) => {
    try {
      return await emrApi.listNotes(patientId, params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load clinical notes'));
    }
  },
);

export const createNote = createAsyncThunk(
  'emr/createNote',
  async ({ patientId, payload }, { rejectWithValue }) => {
    try {
      return await emrApi.createNote(patientId, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create clinical note'));
    }
  },
);

export const updateNote = createAsyncThunk(
  'emr/updateNote',
  async ({ patientId, noteId, payload }, { rejectWithValue }) => {
    try {
      return await emrApi.updateNote(patientId, noteId, payload);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update clinical note'));
    }
  },
);

export const deleteNote = createAsyncThunk(
  'emr/deleteNote',
  async ({ patientId, noteId }, { rejectWithValue }) => {
    try {
      await emrApi.deleteNote(patientId, noteId);
      return noteId;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to delete clinical note'));
    }
  },
);

/* ----------------------------------------------------------------------- slice */

const initialState = {
  patientId: null,
  chart: { data: null, status: 'idle', error: null },
  plans: { items: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 }, status: 'idle', error: null },
  prescriptions: { items: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 }, status: 'idle', error: null },
  notes: { items: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 }, status: 'idle', error: null },
  formStatus: 'idle',
  formError: null,
};

function replacePlan(state, action) {
  const plan = action.payload.plan;
  const idx = state.plans.items.findIndex((p) => p._id === plan._id);
  if (idx >= 0) state.plans.items[idx] = plan;
  else state.plans.items.unshift(plan);
}

const emrSlice = createSlice({
  name: 'emr',
  initialState,
  reducers: {
    setEmrPatient(state, action) {
      // Reset everything when switching the active patient on the EMR page.
      const id = action.payload;
      if (state.patientId === id) return;
      return { ...initialState, patientId: id };
    },
    resetEmr() {
      return initialState;
    },
    resetFormState(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      /* chart */
      .addCase(fetchChart.pending, (state) => {
        state.chart.status = 'loading';
        state.chart.error = null;
      })
      .addCase(fetchChart.fulfilled, (state, action) => {
        state.chart.data = action.payload.chart;
        state.chart.status = 'succeeded';
      })
      .addCase(fetchChart.rejected, (state, action) => {
        state.chart.status = 'failed';
        state.chart.error = action.payload;
      })
      .addCase(saveTooth.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(saveTooth.fulfilled, (state, action) => {
        state.chart.data = action.payload.chart;
        state.formStatus = 'succeeded';
      })
      .addCase(saveTooth.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(saveChart.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(saveChart.fulfilled, (state, action) => {
        state.chart.data = action.payload.chart;
        state.formStatus = 'succeeded';
      })
      .addCase(saveChart.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })

      /* plans */
      .addCase(fetchPlans.pending, (state) => {
        state.plans.status = 'loading';
        state.plans.error = null;
      })
      .addCase(fetchPlans.fulfilled, (state, action) => {
        state.plans.items = action.payload.plans;
        state.plans.pagination = action.payload.pagination;
        state.plans.status = 'succeeded';
      })
      .addCase(fetchPlans.rejected, (state, action) => {
        state.plans.status = 'failed';
        state.plans.error = action.payload;
      })
      .addCase(createPlan.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createPlan.fulfilled, (state, action) => {
        state.plans.items.unshift(action.payload.plan);
        state.formStatus = 'succeeded';
      })
      .addCase(createPlan.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updatePlan.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updatePlan.fulfilled, replacePlan)
      .addCase(updatePlan.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(archivePlan.fulfilled, replacePlan)
      .addCase(addPlanItem.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(addPlanItem.fulfilled, replacePlan)
      .addCase(addPlanItem.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updatePlanItem.fulfilled, replacePlan)
      .addCase(removePlanItem.fulfilled, replacePlan)

      /* prescriptions */
      .addCase(fetchPrescriptions.pending, (state) => {
        state.prescriptions.status = 'loading';
        state.prescriptions.error = null;
      })
      .addCase(fetchPrescriptions.fulfilled, (state, action) => {
        state.prescriptions.items = action.payload.prescriptions;
        state.prescriptions.pagination = action.payload.pagination;
        state.prescriptions.status = 'succeeded';
      })
      .addCase(fetchPrescriptions.rejected, (state, action) => {
        state.prescriptions.status = 'failed';
        state.prescriptions.error = action.payload;
      })
      .addCase(createPrescription.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createPrescription.fulfilled, (state, action) => {
        state.prescriptions.items.unshift(action.payload.prescription);
        state.formStatus = 'succeeded';
      })
      .addCase(createPrescription.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updatePrescription.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updatePrescription.fulfilled, (state, action) => {
        const rx = action.payload.prescription;
        const idx = state.prescriptions.items.findIndex((p) => p._id === rx._id);
        if (idx >= 0) state.prescriptions.items[idx] = rx;
        state.formStatus = 'succeeded';
      })
      .addCase(updatePrescription.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(deletePrescription.fulfilled, (state, action) => {
        state.prescriptions.items = state.prescriptions.items.filter((p) => p._id !== action.payload);
      })

      /* notes */
      .addCase(fetchNotes.pending, (state) => {
        state.notes.status = 'loading';
        state.notes.error = null;
      })
      .addCase(fetchNotes.fulfilled, (state, action) => {
        state.notes.items = action.payload.notes;
        state.notes.pagination = action.payload.pagination;
        state.notes.status = 'succeeded';
      })
      .addCase(fetchNotes.rejected, (state, action) => {
        state.notes.status = 'failed';
        state.notes.error = action.payload;
      })
      .addCase(createNote.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createNote.fulfilled, (state, action) => {
        state.notes.items.unshift(action.payload.note);
        state.formStatus = 'succeeded';
      })
      .addCase(createNote.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updateNote.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updateNote.fulfilled, (state, action) => {
        const note = action.payload.note;
        const idx = state.notes.items.findIndex((n) => n._id === note._id);
        if (idx >= 0) state.notes.items[idx] = note;
        state.formStatus = 'succeeded';
      })
      .addCase(updateNote.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(deleteNote.fulfilled, (state, action) => {
        state.notes.items = state.notes.items.filter((n) => n._id !== action.payload);
      });
  },
});

export const { setEmrPatient, resetEmr, resetFormState } = emrSlice.actions;

export default emrSlice.reducer;
