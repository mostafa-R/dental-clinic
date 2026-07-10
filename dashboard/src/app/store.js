import { configureStore } from "@reduxjs/toolkit";
import adminsReducer from "../features/admins/adminsSlice";
import analyticsReducer from "../features/analytics/analyticsSlice";
import auditLogsReducer from "../features/auditLogs/auditLogsSlice";
import authReducer from "../features/auth/authSlice";
import branchesReducer from "../features/branches/branchesSlice";
import errorLogsReducer from "../features/errorLogs/errorLogsSlice";
import featureFlagsReducer from "../features/featureFlags/featureFlagsSlice";
import healthReducer from "../features/health/healthSlice";
import impersonationReducer from "../features/impersonation/impersonationSlice";
import plansReducer from "../features/plans/plansSlice";
import platformReducer from "../features/platform/platformSlice";
import quarantineReducer from "../features/quarantine/quarantineSlice";
import subscriptionsReducer from "../features/subscriptions/subscriptionsSlice";
import tenantsReducer from "../features/tenants/tenantsSlice";
import twofaReducer from "../features/twofa/twofaSlice";
import uiReducer from "../features/ui/uiSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    tenants: tenantsReducer,
    branches: branchesReducer,
    subscriptions: subscriptionsReducer,
    analytics: analyticsReducer,
    admins: adminsReducer,
    auditLogs: auditLogsReducer,
    errorLogs: errorLogsReducer,
    plans: plansReducer,
    platform: platformReducer,
    ui: uiReducer,
    twofa: twofaReducer,
    featureFlags: featureFlagsReducer,
    impersonation: impersonationReducer,
    quarantine: quarantineReducer,
    health: healthReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});
