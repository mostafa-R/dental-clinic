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

export const fetchQueue = createAsyncThunk(
  'appointments/fetchQueue',
  async (_, { rejectWithValue }) => {
    try {
      return await appointmentApi.queue();
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to load queue' });
    }
  },
);

export const callNextPatient = createAsyncThunk(
  'appointments/callNext',
  async (body, { rejectWithValue }) => {
    try {
      const { appointment } = await appointmentApi.callNext(body);
      return appointment;
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to call next patient' });
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
    queue: { waiting: [], inChair: [], completedToday: 0, updatedAt: null },
    queueStatus: 'idle',
    queueError: null,
    callStatus: 'idle',
    callError: null,
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
    /** Apply a queue room real-time update (queue.patient.called / queue.status.changed). */
    upsertQueueFromSocket(state, action) {
      const incoming = action.payload;
      if (!incoming || !incoming._id) return;
      const moveTo = (list) => {
        const idx = list.findIndex((a) => a._id === incoming._id);
        if (idx >= 0) {
          list[idx] = incoming;
        } else {
          list.push(incoming);
        }
        list.sort((a, b) => new Date(a.start) - new Date(b.start));
        return list;
      };
      const emptied = (list) => list.filter((a) => a._id !== incoming._id);

      if (incoming.status === 'checked_in') {
        state.queue.waiting = moveTo([...state.queue.waiting]);
        state.queue.inChair = emptied(state.queue.inChair);
      } else if (incoming.status === 'in_progress') {
        state.queue.inChair = moveTo([...state.queue.inChair]);
        state.queue.waiting = emptied(state.queue.waiting);
      } else if (incoming.status === 'completed') {
        state.queue.waiting = emptied(state.queue.waiting);
        state.queue.inChair = emptied(state.queue.inChair);
        if (state.queue.completedToday === 0) {
          const today = new Date();
          const start = new Date(incoming.start || Date.now());
          const sameDay =
            start.getFullYear() === today.getFullYear() &&
            start.getMonth() === today.getMonth() &&
            start.getDate() === today.getDate();
          if (sameDay) state.queue.completedToday += 1;
        }
      } else {
        state.queue.waiting = emptied(state.queue.waiting);
        state.queue.inChair = emptied(state.queue.inChair);
      }
      state.queue.updatedAt = new Date().toISOString();
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
      .addCase(createAppointment.fulfilled, (state) => {
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
      })
      .addCase(fetchQueue.pending, (state) => {
        state.queueStatus = 'loading';
        state.queueError = null;
      })
      .addCase(fetchQueue.fulfilled, (state, action) => {
        const q = action.payload ?? {};
        state.queue = {
          waiting: Array.isArray(q.waiting) ? q.waiting : [],
          inChair: Array.isArray(q.inChair) ? q.inChair : [],
          completedToday: typeof q.completedToday === 'number' ? q.completedToday : 0,
          updatedAt: q.updatedAt ?? null,
        };
        state.queueStatus = 'succeeded';
      })
      .addCase(fetchQueue.rejected, (state, action) => {
        state.queueStatus = 'failed';
        state.queueError = action.payload;
      })
      .addCase(callNextPatient.pending, (state) => {
        state.callStatus = 'loading';
        state.callError = null;
      })
      .addCase(callNextPatient.fulfilled, (state, action) => {
        state.queue.inChair = state.queue.inChair.filter((a) => a._id !== action.payload._id);
        state.queue.inChair.push(action.payload);
        state.queue.inChair.sort((a, b) => new Date(a.start) - new Date(b.start));
        state.queue.waiting = state.queue.waiting.filter((a) => a._id !== action.payload._id);
        state.callStatus = 'succeeded';
      })
      .addCase(callNextPatient.rejected, (state, action) => {
        state.callStatus = 'failed';
        state.callError = action.payload;
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
  upsertQueueFromSocket,
} = appointmentsSlice.actions;

export default appointmentsSlice.reducer;
