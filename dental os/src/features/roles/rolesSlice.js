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

export const fetchModules = createAsyncThunk(
  'roles/fetchModules',
  async (_, { rejectWithValue }) => {
    try {
      return await rolesApi.listModules();
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load modules'));
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

export const fetchTemplates = createAsyncThunk(
  'roles/fetchTemplates',
  async (_, { rejectWithValue }) => {
    try {
      return await rolesApi.templates();
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load role templates'));
    }
  },
);

export const fetchMatrix = createAsyncThunk(
  'roles/fetchMatrix',
  async (_, { rejectWithValue }) => {
    try {
      return await rolesApi.matrix();
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to load permission matrix'));
    }
  },
);

export const createRoleFromTemplate = createAsyncThunk(
  'roles/createFromTemplate',
  async (payload, { rejectWithValue }) => {
    try {
      const { role } = await rolesApi.createFromTemplate(payload);
      return role;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to create role from template'));
    }
  },
);

export const setRolePermissions = createAsyncThunk(
  'roles/setPermissions',
  async ({ id, permissions }, { rejectWithValue }) => {
    try {
      const { role } = await rolesApi.setPermissions(id, permissions);
      return role;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to update permissions'));
    }
  },
);

export const toggleRoleStatus = createAsyncThunk(
  'roles/toggleStatus',
  async ({ id, isActive }, { rejectWithValue }) => {
    try {
      const { role } = await rolesApi.toggleStatus(id, isActive);
      return role;
    } catch (err) {
      return rejectWithValue(errPayload(err, 'Failed to toggle role status'));
    }
  },
);

const initialState = {
  items: [],
  modules: null,
  templates: null,
  matrix: null,
  status: 'idle',
  error: null,
  formStatus: 'idle',
  formError: null,
  matrixStatus: 'idle',
  matrixError: null,
  statusUpdate: 'idle',
  statusError: null,
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
      .addCase(fetchModules.fulfilled, (state, action) => {
        state.modules = action.payload;
      })
      .addCase(createRole.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createRole.fulfilled, (state, action) => {
        replaceRole(state, action.payload);
        state.formStatus = 'succeeded';
      })
      .addCase(createRole.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(updateRole.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(updateRole.fulfilled, (state, action) => {
        replaceRole(state, action.payload);
        state.formStatus = 'succeeded';
      })
      .addCase(updateRole.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(deleteRole.fulfilled, (state, action) => {
        state.items = state.items.filter((r) => r._id !== action.payload);
      })
      .addCase(fetchTemplates.fulfilled, (state, action) => {
        state.templates = action.payload;
      })
      .addCase(fetchMatrix.pending, (state) => {
        state.matrixStatus = 'loading';
        state.matrixError = null;
      })
      .addCase(fetchMatrix.fulfilled, (state, action) => {
        state.matrix = action.payload;
        state.matrixStatus = 'succeeded';
      })
      .addCase(fetchMatrix.rejected, (state, action) => {
        state.matrixStatus = 'failed';
        state.matrixError = action.payload;
      })
      .addCase(createRoleFromTemplate.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(createRoleFromTemplate.fulfilled, (state, action) => {
        replaceRole(state, action.payload);
        state.formStatus = 'succeeded';
      })
      .addCase(createRoleFromTemplate.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(setRolePermissions.pending, (state) => {
        state.formStatus = 'loading';
        state.formError = null;
      })
      .addCase(setRolePermissions.fulfilled, (state, action) => {
        replaceRole(state, action.payload);
        state.formStatus = 'succeeded';
      })
      .addCase(setRolePermissions.rejected, (state, action) => {
        state.formStatus = 'failed';
        state.formError = action.payload;
      })
      .addCase(toggleRoleStatus.pending, (state) => {
        state.statusUpdate = 'loading';
        state.statusError = null;
      })
      .addCase(toggleRoleStatus.fulfilled, (state, action) => {
        replaceRole(state, action.payload);
        state.statusUpdate = 'succeeded';
      })
      .addCase(toggleRoleStatus.rejected, (state, action) => {
        state.statusUpdate = 'failed';
        state.statusError = action.payload;
      });
  },
});

export const { resetFormState } = rolesSlice.actions;

export default rolesSlice.reducer;
