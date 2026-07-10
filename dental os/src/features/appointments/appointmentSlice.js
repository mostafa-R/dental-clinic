import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { appointmentApi } from './appointmentApi';

export const fetchAppointments = createAsyncThunk(
  'appointments/fetchList',
  async (params, { rejectWithValue }) => {
    try {
      return await appointmentApi.list(params);
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to load appointments' });
    }
  },
);

export const createAppointment = createAsyncThunk(
  'appointments/create',
  async (payload, { rejectWithValue }) => {
    try {
      const { appointment } = await appointmentApi.create(payload);
      return appointment;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to create appointment' });
    }
  },
);

export const updateAppointment = createAsyncThunk(
  'appointments/update',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { appointment } = await appointmentApi.update(id, payload);
      return appointment;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to update appointment' });
    }
  },
);

export const transitionAppointment = createAsyncThunk(
  'appointments/transition',
  async ({ id, status }, { rejectWithValue }) => {
    try {
      const { appointment } = await appointmentApi.transition(id, status);
      return appointment;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to update status' });
    }
  },
);

export const cancelAppointment = createAsyncThunk(
  'appointments/cancel',
  async (id, { rejectWithValue }) => {
    try {
      const { appointment } = await appointmentApi.cancel(id);
      return appointment;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to cancel appointment' });
    }
  },
);

const initialQuery = {
  date: '',
  from: '',
  to: '',
  doctor: '',
  patient: '',
  status: '',
  page: 1,
  limit: 100,
};

const appointmentsSlice = createSlice({
  name: 'appointments',
  initialState: {
    items: [],
    pagination: { page: 1, limit: 100, total: 0, pages: 1 },
    query: { ...initialQuery },
    status: 'idle',
    error: null,
    formStatus: 'idle',
    formError: null,
  },
  reducers: {
    setDate(state, action) {
      state.query.date = action.payload;
      state.query.page = 1;
    },
    setFromTo(state, action) {
      state.query.from = action.payload.from;
      state.query.to = action.payload.to;
      state.query.date = '';
      state.query.page = 1;
    },
    setDoctorFilter(state, action) {
      state.query.doctor = action.payload;
      state.query.page = 1;
    },
    setStatusFilter(state, action) {
      state.query.status = action.payload;
      state.query.page = 1;
    },
    setPatientFilter(state, action) {
      state.query.patient = action.payload;
      state.query.page = 1;
    },
    resetAppointments(state) {
      state.items = [];
      state.query = { ...initialQuery };
      state.status = 'idle';
      state.error = null;
    },
    resetFormState(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
    /** Apply a real-time update pushed from the server (socket). */
    upsertFromSocket(state, action) {
      const incoming = action.payload;
      const idx = state.items.findIndex((a) => a._id === incoming._id);
      if (idx >= 0) {
        state.items[idx] = incoming;
      } else {
        state.items.push(incoming);
      }
      state.items.sort((a, b) => new Date(a.start) - new Date(b.start));
    },
    removeFromSocket(state, action) {
      state.items = state.items.filter((a) => a._id !== action.payload._id);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAppointments.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchAppointments.fulfilled, (state, action) => {
        state.items = action.payload.appointments;
        state.pagination = action.payload.pagination;
        state.status = 'succeeded';
      })
      .addCase(fetchAppointments.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(createAppointment.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createAppointment.fulfilled, (state, action) => {
        state.items.push(action.payload);
        state.items.sort((a, b) => new Date(a.start) - new Date(b.start));
        state.formStatus = 'succeeded';
      })
      .addCase(createAppointment.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updateAppointment.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updateAppointment.fulfilled, (state, action) => {
        const idx = state.items.findIndex((a) => a._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
        state.formStatus = 'succeeded';
      })
      .addCase(updateAppointment.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(transitionAppointment.fulfilled, (state, action) => {
        const idx = state.items.findIndex((a) => a._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      })
      .addCase(cancelAppointment.fulfilled, (state, action) => {
        const idx = state.items.findIndex((a) => a._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      });
  },
});

export const {
  setDate,
  setFromTo,
  setDoctorFilter,
  setStatusFilter,
  setPatientFilter,
  resetAppointments,
  resetFormState,
  upsertFromSocket,
  removeFromSocket,
} = appointmentsSlice.actions;

export default appointmentsSlice.reducer;
