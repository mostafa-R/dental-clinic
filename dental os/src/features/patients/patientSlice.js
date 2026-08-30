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

export const mergePatients = createAsyncThunk(
  'patients/merge',
  async ({ duplicateId, survivorId }, { rejectWithValue }) => {
    try {
      const result = await patientApi.merge(duplicateId, survivorId);
      return { result, duplicateId };
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to merge patients' });
    }
  },
);

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
      .addCase(mergePatients.pending, (state) => {
        state.mergeStatus = 'loading';
        state.mergeError = null;
      })
      .addCase(mergePatients.fulfilled, (state, action) => {
        state.items = state.items.filter((p) => p._id !== action.payload.duplicateId);
        state.duplicates.groups = state.duplicates.groups
          .map((g) => ({
            ...g,
            patients: g.patients.filter((p) => p._id !== action.payload.duplicateId),
            count: g.patients.length - 1,
          }))
          .filter((g) => g.count > 1);
        state.duplicates.total = state.duplicates.groups.length;
        state.mergeStatus = 'succeeded';
        state.mergeError = null;
      })
      .addCase(mergePatients.rejected, (state, action) => {
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
