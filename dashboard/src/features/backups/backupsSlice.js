import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

export const fetchBackups = createAsyncThunk(
  "backups/fetchBackups",
  async (params, { rejectWithValue }) => {
    try {
      const response = await api.get("/backups", { params });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch backups",
      );
    }
  },
);

export const fetchBackupById = createAsyncThunk(
  "backups/fetchBackupById",
  async (id, { rejectWithValue }) => {
    try {
      const response = await api.get(`/backups/${id}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch backup",
      );
    }
  },
);

export const triggerBackup = createAsyncThunk(
  "backups/triggerBackup",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post("/backups");
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to trigger backup",
      );
    }
  },
);

const initialState = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  selectedBackup: null,
  loading: false,
  triggering: false,
  error: null,
};

const backupsSlice = createSlice({
  name: "backups",
  initialState,
  reducers: {
    clearSelectedBackup: (state) => {
      state.selectedBackup = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBackups.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBackups.fulfilled, (state, action) => {
        state.loading = false;
        const payload = action.payload;
        if (Array.isArray(payload)) {
          state.items = payload;
        } else if (payload && typeof payload === "object") {
          state.items = payload.logs || payload.backups || payload.data || payload.items || [];
          state.pagination = {
            page: payload.page || 1,
            limit: payload.limit || 20,
            total: payload.total || 0,
            totalPages: payload.pages || 0,
          };
        } else {
          state.items = [];
        }
      })
      .addCase(fetchBackups.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchBackupById.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchBackupById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedBackup = action.payload.data || action.payload;
      })
      .addCase(fetchBackupById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(triggerBackup.pending, (state) => {
        state.triggering = true;
        state.error = null;
      })
      .addCase(triggerBackup.fulfilled, (state, action) => {
        state.triggering = false;
        const newBackup = action.payload.data || action.payload;
        if (newBackup && newBackup._id) {
          state.items.unshift(newBackup);
        }
      })
      .addCase(triggerBackup.rejected, (state, action) => {
        state.triggering = false;
        state.error = action.payload;
      });
  },
});

export const { clearSelectedBackup, clearError } = backupsSlice.actions;
export default backupsSlice.reducer;
