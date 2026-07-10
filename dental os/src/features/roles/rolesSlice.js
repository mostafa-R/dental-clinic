import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { rolesApi } from './rolesApi';

function errPayload(err, fallback) {
  return err.response?.data || { message: fallback };
}

export const fetchRoles = createAsyncThunk(
  'roles/fetchRoles',
  async (_, { rejectWithValue }) => {
    try {
      return await rolesApi.list();
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load roles'));
    }
  },
);

export const createRole = createAsyncThunk(
  'roles/createRole',
  async (payload, { rejectWithValue }) => {
    try {
      const { role } = await rolesApi.create(payload);
      return role;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create role'));
    }
  },
);

export const updateRole = createAsyncThunk(
  'roles/updateRole',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      const { role } = await rolesApi.update(id, payload);
      return role;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update role'));
    }
  },
);

export const deleteRole = createAsyncThunk(
  'roles/deleteRole',
  async (id, { rejectWithValue }) => {
    try {
      await rolesApi.delete(id);
      return id;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to delete role'));
    }
  },
);

const initialState = {
  items: [],
  status: 'idle',
  error: null,
  formStatus: 'idle',
  formError: null,
};

function replaceRole(state, role) {
  const idx = state.items.findIndex((r) => r._id === role._id);
  if (idx >= 0) state.items[idx] = role;
  else state.items.push(role);
}

const rolesSlice = createSlice({
  name: 'roles',
  initialState,
  reducers: {
    resetFormState(state) {
      state.formStatus = 'idle';
      state.formError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRoles.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.items = action.payload.roles;
        state.status = 'succeeded';
      })
      .addCase(fetchRoles.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(createRole.fulfilled, (state, action) => {
        replaceRole(state, action.payload);
        state.formStatus = 'succeeded';
      })
      .addCase(createRole.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updateRole.fulfilled, replaceRole)
      .addCase(deleteRole.fulfilled, (state, action) => {
        state.items = state.items.filter((r) => r._id !== action.payload);
      });
  },
});

export const { resetFormState } = rolesSlice.actions;

export default rolesSlice.reducer;
