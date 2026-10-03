import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { userApi } from './userApi';
import { errPayload } from '../../lib/errors';
import { clearClinicTimeZone } from '../../lib/clinicTime';

export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async ({ page = 1, limit = 20, search } = {}, { rejectWithValue }) => {
    try {
      return await userApi.list({ page, limit, search: search || undefined });
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load users'));
    }
  },
);

export const createUser = createAsyncThunk(
  'users/createUser',
  async (payload, { rejectWithValue }) => {
    try {
      const result = await userApi.create(payload);
      return result;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create user'));
    }
  },
);

export const updateUser = createAsyncThunk(
  'users/updateUser',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { user } = await userApi.update(id, payload);
      return user;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update user'));
    }
  },
);

export const deleteUser = createAsyncThunk(
  'users/deleteUser',
  async (id, { rejectWithValue }) => {
    try {
      await userApi.delete(id);
      return id;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to delete user'));
    }
  },
);

export const toggleUserActive = createAsyncThunk(
  'users/toggleUserActive',
  async (id, { rejectWithValue }) => {
    try {
      const { user } = await userApi.toggleActive(id);
      return user;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to toggle user status'));
    }
  },
);

export const fetchMyPermissions = createAsyncThunk(
  'users/fetchMyPermissions',
  async (_, { rejectWithValue }) => {
    try {
      return await userApi.myPermissions();
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load permissions'));
    }
  },
);

const initialState = {
  items: [],
  // Server-owned. The page controls `page`/`limit` and reads `total`/`pages`
  // back for the pager; it must not derive them from `items.length`, which is
  // only ever the current page.
  pagination: { page: 1, limit: 20, total: 0, pages: 1 },
  status: 'idle',
  error: null,
  formStatus: 'idle',
  formError: null,
  myPermissions: null,
  permissionsStatus: 'idle',
};

const userSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    resetFormState(state) {
      state.formStatus = 'idle';
      state.error = null;
    },
    // Logout / account switch. The staff list is tenant-scoped, so leaving the
    // previous clinic's rows in state would render another tenant's staff to
    // the next user before their fetch resolves.
    resetUsers() {
      return initialState;
    },
    // Plan reassignment / account switch must never reuse stale entitlements.
    // Dispatched on logout + login, and on 403 plan-denied (see lib/axios).
    // The cached clinic timezone goes with it: leaving it behind would render
    // the next user's dates in the previous clinic's zone until the fresh
    // permissions payload arrives.
    resetPermissions(state) {
      state.myPermissions = null;
      state.permissionsStatus = 'idle';
      clearClinicTimeZone();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.items = action.payload.users;
        state.pagination = action.payload.pagination || state.pagination;
        state.status = 'succeeded';
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(createUser.pending, (state) => {
        // Required so the modal's Save button can disable: without a pending
        // case the button never enters a loading state and a double click
        // fires two POST /users, where the second fails on duplicate email and
        // reads as if the whole operation failed.
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createUser.fulfilled, (state, action) => {
        const u = action.payload.user;
        const idx = state.items.findIndex((x) => x._id === u._id);
        if (idx >= 0) state.items[idx] = u;
        // The server sorts by -createdAt, so a new user belongs on page 1. On
        // any later page inserting it would show a row that does not exist in
        // that slice of the result set; the socket-driven refetch fills it in.
        else if (state.pagination.page === 1) {
          state.items.unshift(u);
          state.pagination.total += 1;
        }
        state.formStatus = 'succeeded';
      })
      .addCase(createUser.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updateUser.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        const idx = state.items.findIndex((u) => u._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
        state.formStatus = 'succeeded';
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        const before = state.items.length;
        state.items = state.items.filter((u) => u._id !== action.payload);
        // Only counts as a removal if it was on this page; otherwise the row
        // was never here and decrementing would drift the pager.
        if (state.items.length < before) state.pagination.total = Math.max(0, state.pagination.total - 1);
      })
      .addCase(toggleUserActive.fulfilled, (state, action) => {
        const idx = state.items.findIndex((u) => u._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      })
      .addCase(fetchMyPermissions.pending, (state) => {
        state.permissionsStatus = 'loading';
      })
      .addCase(fetchMyPermissions.fulfilled, (state, action) => {
        state.myPermissions = action.payload;
        state.permissionsStatus = 'succeeded';
      })
      .addCase(fetchMyPermissions.rejected, (state) => {
        state.permissionsStatus = 'failed';
      });
  },
});

export const { resetFormState, resetPermissions, resetUsers } = userSlice.actions;
export default userSlice.reducer;
