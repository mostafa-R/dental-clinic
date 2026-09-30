import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../lib/axios";

const BASE = "/analytics/platform";

/**
 * Every endpoint here is individually gated by `requireSitePermission(...)` on
 * the server, so a 403 is an expected outcome for a given role, not an error.
 * These thunks surface that as `forbidden` rather than a generic failure so the
 * UI can hide the tab instead of showing an error toast.
 */
const platformEndpoint = (name, path, { params, transform } = {}) =>
  createAsyncThunk(`platformAnalytics/${name}`, async (_, { rejectWithValue }) => {
    try {
      const response = await api.get(path, params ? { params } : undefined);
      return transform ? transform(response.data) : response.data;
    } catch (error) {
      return rejectWithValue({
        message: error.response?.data?.message || `Failed to fetch ${name}`,
        status: error.response?.status || null,
      });
    }
  });

export const fetchPlatformOverview = platformEndpoint("overview", `${BASE}/overview`);
export const fetchFinancialAnalytics = platformEndpoint("financial", `${BASE}/financial`);
export const fetchInventoryAnalytics = platformEndpoint("inventory", `${BASE}/inventory`);
export const fetchPatientAnalytics = platformEndpoint("patients", `${BASE}/patients`);
export const fetchAppointmentAnalytics = platformEndpoint("appointments", `${BASE}/appointments`);
export const fetchDoctorPerformance = platformEndpoint("doctors", `${BASE}/doctors`);
export const fetchTreatmentAnalytics = platformEndpoint("treatments", `${BASE}/treatments`);
export const fetchSaaSBillingAnalytics = platformEndpoint("saasBilling", `${BASE}/saas-billing`);
export const fetchSecurityMonitoring = platformEndpoint("security", `${BASE}/security`);
export const fetchSystemActivity = platformEndpoint("activity", `${BASE}/activity`);
export const fetchUsageAnalytics = platformEndpoint("usage", `${BASE}/usage`);
export const fetchBackgroundJobs = platformEndpoint("jobs", `${BASE}/jobs`);
/**
 * `/roles` answers with the SITE_ROLES constant, i.e. a `{ SUPER_ADMIN: "super_admin", ... }`
 * map rather than an array. Flatten it to `[{ key, value }]` so the tab can render it directly.
 */
export const fetchSiteRoles = platformEndpoint("roles", `${BASE}/roles`, {
  transform: (data) =>
    Object.entries(data?.roles || {}).map(([key, value]) => ({ key, value })),
});

const initialState = {
  overview: null,
  financial: null,
  inventory: null,
  patients: null,
  appointments: null,
  doctors: null,
  treatments: null,
  saasBilling: null,
  security: null,
  activity: null,
  usage: null,
  jobs: null,
  roles: [],
  // Per-section status so one forbidden tab cannot blank the whole page.
  loading: {},
  error: {},
};

/**
 * Maps each section thunk to its slice slot.
 */
const SECTIONS = [
  [fetchPlatformOverview, "overview"],
  [fetchFinancialAnalytics, "financial"],
  [fetchInventoryAnalytics, "inventory"],
  [fetchPatientAnalytics, "patients"],
  [fetchAppointmentAnalytics, "appointments"],
  [fetchDoctorPerformance, "doctors"],
  [fetchTreatmentAnalytics, "treatments"],
  [fetchSaaSBillingAnalytics, "saasBilling"],
  [fetchSecurityMonitoring, "security"],
  [fetchSystemActivity, "activity"],
  [fetchUsageAnalytics, "usage"],
  [fetchBackgroundJobs, "jobs"],
  [fetchSiteRoles, "roles"],
];

/**
 * Wire a thunk to its slice slot. Each section tracks its own loading/error so
 * a 403 on one tab leaves the others intact.
 */
function bindSection(builder, thunk, slot) {
  builder
    .addCase(thunk.pending, (state) => {
      state.loading[slot] = true;
      state.error[slot] = null;
    })
    .addCase(thunk.fulfilled, (state, action) => {
      state.loading[slot] = false;
      state[slot] = action.payload;
    })
    .addCase(thunk.rejected, (state, action) => {
      state.loading[slot] = false;
      state.error[slot] = action.payload || null;
    });
}

const platformAnalyticsSlice = createSlice({
  name: "platformAnalytics",
  initialState,
  reducers: {
    clearSectionError: (state, action) => {
      delete state.error[action.payload];
    },
    resetPlatformAnalytics: () => initialState,
  },
  extraReducers: (builder) => {
    for (const [thunk, slot] of SECTIONS) {
      bindSection(builder, thunk, slot);
    }
  },
});

export const { clearSectionError, resetPlatformAnalytics } =
  platformAnalyticsSlice.actions;
export default platformAnalyticsSlice.reducer;
