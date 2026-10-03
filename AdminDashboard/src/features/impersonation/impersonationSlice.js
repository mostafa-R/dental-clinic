import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/axios";

/**
 * The impersonation grant lives here, in module scope, rather than in Redux
 * state.
 *
 * The token authorises the platform console to act as the impersonated user, so
 * it is a credential rather than app data. In the store it was fully
 * serializable and therefore visible to Redux DevTools, to any browser
 * extension with store access, and to every middleware/logger in the chain.
 * "Held in memory only" in a Redux comment was not true — Redux state is the
 * most-inspected memory in a React app.
 *
 * A module-scoped binding is still readable by anything that can import this
 * file, but it is not enumerable on the state tree and never reaches DevTools,
 * time-travel, or a persisted-state snapshot. `endImpersonation` is the only
 * consumer, and it needs the value exactly once.
 */
let activeImpersonationToken = null;

/** Test-only: drop the module-scoped token between cases. */
export function __resetImpersonationToken() {
  activeImpersonationToken = null;
}

export const startImpersonation = createAsyncThunk(
  "impersonation/start",
  async ({ tenantId, userId }, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/impersonation/start", { tenantId, userId });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to start impersonation");
    }
  },
);

export const endImpersonation = createAsyncThunk(
  "impersonation/end",
  async (_, { rejectWithValue }) => {
    // The server requires the token back so it can verify the `impersonator`
    // claim matches the calling site admin before revoking the target user.
    if (!activeImpersonationToken) return rejectWithValue("No active impersonation session");
    const token = activeImpersonationToken;
    try {
      await api.post("/impersonation/end", { impersonationToken: token });
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || "Failed to end impersonation");
    } finally {
      // Drop it either way. On success the session is gone; on failure the
      // local grant is worthless to an attacker without the server-side half,
      // and keeping it would leave a credential pinned in memory that the user
      // cannot clear (they would have to reload).
      activeImpersonationToken = null;
    }
  },
);

const impersonationSlice = createSlice({
  name: "impersonation",
  initialState: {
    active: false,
    // Single-use, 60-second code used to hand the session to the clinic origin.
    handoffCode: null,
    targetUser: null,
    targetTenant: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearImpersonation: (state) => {
      state.active = false;
      state.handoffCode = null;
      state.targetUser = null;
      state.targetTenant = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startImpersonation.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(startImpersonation.fulfilled, (state, action) => {
        state.loading = false;
        state.active = true;
        activeImpersonationToken = action.payload.impersonationToken || null;
        state.handoffCode = action.payload.handoffCode || null;
        state.targetUser = action.payload.user;
        state.targetTenant = action.payload.tenant;
      })
      .addCase(startImpersonation.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(endImpersonation.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(endImpersonation.fulfilled, (state) => {
        state.loading = false;
        state.active = false;
        state.handoffCode = null;
        state.targetUser = null;
        state.targetTenant = null;
      })
      // A failed teardown still clears the banner. Previously `active` stayed
      // true, so the console kept showing the impersonated user's identity with
      // a "Stop" button that could not work: retrying fired the same failing
      // request, leaving the operator stuck in a session they cannot leave.
      // The server-side session is the authority; a stale local banner is worse
      // than an honest "could not confirm", which `error` still reports.
      .addCase(endImpersonation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.active = false;
        state.handoffCode = null;
        state.targetUser = null;
        state.targetTenant = null;
      });
  },
});

export const { clearImpersonation } = impersonationSlice.actions;
export default impersonationSlice.reducer;
