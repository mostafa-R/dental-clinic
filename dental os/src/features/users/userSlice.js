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
      .addCase(createUser.fulfilled, (state, action) => {
        const u = action.payload.user;
        const idx = state.items.findIndex((x) => x._id === u._id);
        if (idx >= 0) state.items[idx] = u;
        else state.items.unshift(u);
        state.formStatus = 'succeeded';
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        const idx = state.items.findIndex((u) => u._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.items = state.items.filter((u) => u._id !== action.payload);
      })
      .addCase(toggleUserActive.fulfilled, (state, action) => {
        const idx = state.items.findIndex((u) => u._id === action.payload._id);
        if (idx >= 0) state.items[idx] = action.payload;
      })
      .addCase(fetchMyPermissions.fulfilled, (state, action) => {
        state.myPermissions = action.payload;
        state.permissionsStatus = 'succeeded';
      });
  },
});

export const { resetFormState } = userSlice.actions;
export default userSlice.reducer;
