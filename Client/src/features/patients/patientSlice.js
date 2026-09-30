import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { patientApi } from './patientApi';

const initialQuery = { search: '', page: 1, limit: 20, isActive: undefined };

export const fetchPatients = createAsyncThunk(
  'patients/fetchList',
  async (params, { rejectWithValue }) => {
    try {
      return await patientApi.list(params);
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load patients');
    }
  },
);

export const createPatient = createAsyncThunk(
  'patients/create',
  async (payload, { rejectWithValue }) => {
    try {
      const { patient } = await patientApi.create(payload);
      return patient;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to create patient' });
    }
  },
);

export const updatePatient = createAsyncThunk(
  'patients/update',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { patient } = await patientApi.update(id, payload);
      return patient;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to update patient' });
    }
  },
);

export const archivePatient = createAsyncThunk(
  'patients/archive',
  async (id, { rejectWithValue }) => {
    try {
      await patientApi.archive(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to archive patient' });
    }
  },
);

export const fetchDuplicates = createAsyncThunk(
  'patients/fetchDuplicates',
  async (_, { rejectWithValue }) => {
    try {
      return await patientApi.duplicates();
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to check duplicates' });
    }
  },
);

/**
 * Merges every duplicate in a group in one request. The server wraps the whole
 * set in a single transaction, so this either lands completely or not at all -
 * there is no partial-merge state left behind for the operator to reconcile.
 *
 * Replaces the per-record `mergePatients` thunk: merging a group is one
 * operator decision, and fanning it out into N requests made "some merged"
 * a reachable outcome.
 */
export const mergePatientsBatch = createAsyncThunk(
  'patients/mergeBatch',
  async ({ merges }, { rejectWithValue }) => {
    try {
      const result = await patientApi.mergeBatch(merges);
      return result;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to merge patients' });
    }
  },
);

/**
 * Drops merged records from the duplicate groups.
 *
 * `count` has to be recomputed from the filtered list. The single-merge case
 * got away with `g.patients.length - 1` only because one record left per call;
 * for a batch that would leave a stale count and keep empty groups on screen.
 */
function pruneMerged(groups, mergedIds) {
  const removed = new Set(mergedIds);
  return groups
    .map((g) => {
      const patients = g.patients.filter((p) => !removed.has(p._id));
      return { ...g, patients, count: patients.length };
    })
    .filter((g) => g.count > 1);
}

const patientsSlice = createSlice({
  name: 'patients',
  initialState: {
    items: [],
    pagination: { page: 1, limit: 20, total: 0, pages: 1 },
    query: { ...initialQuery },
    status: 'idle',
    error: null,
    formStatus: 'idle',
    formError: null,
    duplicates: { groups: [], total: 0, status: 'idle', error: null, open: false },
    mergeStatus: 'idle',
    mergeError: null,
  },
  reducers: {
    setSearch(state, action) {
      state.query.search = action.payload;
      state.query.page = 1;
    },
    setPage(state, action) {
      state.query.page = action.payload;
    },
    setStatusFilter(state, action) {
      state.query.isActive = action.payload;
      state.query.page = 1;
    },
    resetPatients(state) {
      state.items = [];
      state.query = { ...initialQuery };
      state.status = 'idle';
      state.error = null;
    },
    resetFormState(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
    openDuplicates(state) {
      state.duplicates.open = true;
    },
    closeDuplicates(state) {
      state.duplicates.open = false;
      state.duplicates.groups = [];
      state.duplicates.total = 0;
      state.duplicates.status = 'idle';
      state.duplicates.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPatients.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchPatients.fulfilled, (state, action) => {
        state.items = action.payload.patients;
        state.pagination = action.payload.pagination;
        state.status = 'succeeded';
      })
      .addCase(fetchPatients.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(createPatient.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createPatient.fulfilled, (state) => {
        state.formStatus = 'succeeded';
        state.formError = null;
      })
      .addCase(createPatient.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updatePatient.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updatePatient.fulfilled, (state, action) => {
        const idx = state.items.findIndex((p) => p._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
        state.formStatus = 'succeeded';
        state.formError = null;
      })
      .addCase(updatePatient.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(archivePatient.fulfilled, (state, action) => {
        const patient = state.items.find((p) => p._id === action.payload);
        if (patient) patient.isActive = false;
      })
      .addCase(fetchDuplicates.pending, (state) => {
        state.duplicates.status = 'loading';
        state.duplicates.error = null;
      })
      .addCase(fetchDuplicates.fulfilled, (state, action) => {
        state.duplicates.groups = action.payload.groups;
        state.duplicates.total = action.payload.total;
        state.duplicates.status = 'succeeded';
      })
      .addCase(fetchDuplicates.rejected, (state, action) => {
        state.duplicates.status = 'failed';
        state.duplicates.error = action.payload;
      })
      .addCase(mergePatientsBatch.pending, (state) => {
        state.mergeStatus = 'loading';
        state.mergeError = null;
      })
      .addCase(mergePatientsBatch.fulfilled, (state, action) => {
        const mergedIds = (action.payload?.results || []).map((r) => r.mergedId);
        if (mergedIds.length > 0) {
          state.items = state.items.filter((p) => !mergedIds.includes(p._id));
          state.duplicates.groups = pruneMerged(state.duplicates.groups, mergedIds);
          state.duplicates.total = state.duplicates.groups.length;
        }
        state.mergeStatus = 'succeeded';
        state.mergeError = null;
      })
      // A rejected batch means nothing was merged, so the groups are left
      // exactly as they were - there is nothing to reconcile.
      .addCase(mergePatientsBatch.rejected, (state, action) => {
        state.mergeStatus = 'failed';
        state.mergeError = action.payload;
      });
  },
});

export const {
  setSearch,
  setPage,
  setStatusFilter,
  resetPatients,
  resetFormState,
  openDuplicates,
  closeDuplicates,
} = patientsSlice.actions;

export default patientsSlice.reducer;
