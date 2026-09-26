import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { userApi } from './userApi';

export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async (_, { rejectWithValue }) => {
    try {
      return await userApi.list();
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to load users' });
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
      return rejectWithValue(err.response?.data || { message: 'Failed to create user' });
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
      return rejectWithValue(err.response?.data || { message: 'Failed to update user' });
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
      return rejectWithValue(err.response?.data || { message: 'Failed to delete user' });
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
      return rejectWithValue(err.response?.data || { message: 'Failed to toggle user status' });
    }
  },
);

export const fetchMyPermissions = createAsyncThunk(
  'users/fetchMyPermissions',
  async (_, { rejectWithValue }) => {
    try {
      return await userApi.myPermissions();
    } catch (err) {
      return rejectWithValue(err.response?.data || { message: 'Failed to load permissions' });
    }
  },
);

const initialState = {
  items: [],
  status: 'idle',
  error: null,
  formStatus: 'idle',
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
    // Plan reassignment / account switch must never reuse stale entitlements.
    // Dispatched on logout + login, and on 403 plan-denied (see lib/axios).
    resetPermissions(state) {
      state.myPermissions = null;
      state.permissionsStatus = 'idle';
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
        else state.items.unshift(u);
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
        state.items = state.items.filter((u) => u._id !== action.payload);
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

export const { resetFormState, resetPermissions } = userSlice.actions;
export default userSlice.reducer;
