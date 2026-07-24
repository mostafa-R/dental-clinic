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
      });
  },
});

export const {
  setSearch,
  setPage,
  setStatusFilter,
  resetPatients,
  resetFormState,
} = patientsSlice.actions;

export default patientsSlice.reducer;
