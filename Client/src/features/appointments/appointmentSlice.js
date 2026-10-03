import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { appointmentApi } from './appointmentApi';
import { localDateString } from '../../lib/clinicTime';
import { errPayload } from '../../lib/errors';

export const fetchAppointments = createAsyncThunk(
  'appointments/fetchList',
  async (params, { rejectWithValue }) => {
    try {
      return await appointmentApi.list(params);
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load appointments'));
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
      return rejectWithValue(errPayload(err, 'Failed to create appointment'));
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
      return rejectWithValue(errPayload(err, 'Failed to update appointment'));
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
      return rejectWithValue(errPayload(err, 'Failed to update status'));
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
      return rejectWithValue(errPayload(err, 'Failed to cancel appointment'));
    }
  },
);

export const fetchQueue = createAsyncThunk(
  'appointments/fetchQueue',
  async (_, { rejectWithValue }) => {
    try {
      return await appointmentApi.queue();
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load queue'));
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
      return rejectWithValue(errPayload(err, 'Failed to call next patient'));
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
    // requestId of the newest in-flight list request; older responses are
    // ignored so they cannot overwrite the current day's appointments.
    currentRequestId: null,
    formStatus: 'idle',
    formError: null,
    queue: { waiting: [], inChair: [], completedToday: 0, completedIds: [], updatedAt: null },
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
        // Compare calendar days in the clinic's zone, not the browser's:
        // a late-evening completion in a clinic ahead of the receptionist
        // (or behind them) otherwise counted for the wrong day.
        const start = new Date(incoming.start || Date.now());
        if (localDateString(start.getTime()) === localDateString(Date.now())) {
          // The guard used to be `completedToday === 0`, which conflated "have we
          // counted this patient" with "how many have we counted". The first
          // completion of the day set it to 1 and every later one was skipped, so
          // the queue permanently reported 1 regardless of the real total. Track
          // the ids instead: it still absorbs a duplicate socket event for the
          // same appointment, but each distinct patient now adds one.
          if (!state.queue.completedIds?.includes(incoming._id)) {
            state.queue.completedIds = [...(state.queue.completedIds || []), incoming._id];
            state.queue.completedToday += 1;
          }
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
      .addCase(fetchAppointments.pending, (state, action) => {
        state.status = 'loading';
        state.error = null;
        state.currentRequestId = action.meta.requestId;
      })
      .addCase(fetchAppointments.fulfilled, (state, action) => {
        // The queue mounts, seeds its date, and polls, so two list requests are
        // routinely in flight at once. Without this guard a slow response for a
        // previously-selected day can land after the current one and silently
        // replace the list, which is how the queue ends up showing the wrong
        // day. Only the newest request is allowed to write.
        if (action.meta.requestId !== state.currentRequestId) return;
        state.items = action.payload.appointments;
        state.pagination = action.payload.pagination;
        state.status = 'succeeded';
      })
      .addCase(fetchAppointments.rejected, (state, action) => {
        if (action.meta.requestId !== state.currentRequestId) return;
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
        const serverCount = typeof q.completedToday === 'number' ? q.completedToday : 0;
        // The queue is polled, so rebuilding `queue` wholesale here used to drop
        // the dedup set that keeps a repeated `queue.status.changed` from
        // counting one appointment twice. Keep it while the count is moving
        // forward; a count that went backwards means the queue moved to another
        // day, so the set has to start over.
        const sameDay = serverCount >= state.queue.completedToday;
        state.queue = {
          waiting: Array.isArray(q.waiting) ? q.waiting : [],
          inChair: Array.isArray(q.inChair) ? q.inChair : [],
          completedToday: serverCount,
          completedIds: sameDay ? state.queue.completedIds : [],
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
        const called = action.payload;
        // "No next patient" is a valid outcome, not a failure. The server
        // answers with an empty body when the waiting list is drained, and
        // reading `_id` off that threw inside the reducer, which takes the
        // whole store down and white-screens the queue.
        if (!called || !called._id) {
          state.callStatus = 'succeeded';
          return;
        }
        state.queue.inChair = state.queue.inChair.filter((a) => a._id !== called._id);
        state.queue.inChair.push(called);
        state.queue.inChair.sort((a, b) => new Date(a.start) - new Date(b.start));
        state.queue.waiting = state.queue.waiting.filter((a) => a._id !== called._id);
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
