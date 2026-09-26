import { combineReducers, configureStore } from '@reduxjs/toolkit';
import accountingReducer from '../features/accounting/accountingSlice';
import appointmentReducer from '../features/appointments/appointmentSlice';
import authReducer from '../features/auth/authSlice';
import billingReducer from '../features/billing/billingSlice';
import branchReducer from '../features/branches/branchSlice';
import chatReducer from '../features/chat/chatSlice';
import dashboardReducer from '../features/dashboard/dashboardSlice';
import emrReducer from '../features/emr/emrSlice';
import inventoryReducer from '../features/inventory/inventorySlice';
import patientsReducer from '../features/patients/patientSlice';
import recallsReducer from '../features/recalls/recallSlice';
import rolesReducer from '../features/roles/rolesSlice';
import uiReducer from '../features/ui/uiSlice';
import usersReducer from '../features/users/userSlice';
import walletReducer from '../features/wallet/walletSlice';
import { RESET_ALL } from './resetAll';

const appReducer = combineReducers({
  accounting: accountingReducer,
  appointments: appointmentReducer,
  auth: authReducer,
  billing: billingReducer,
  branches: branchReducer,
  chat: chatReducer,
  dashboard: dashboardReducer,
  emr: emrReducer,
  inventory: inventoryReducer,
  patients: patientsReducer,
  recalls: recallsReducer,
  roles: rolesReducer,
  ui: uiReducer,
  users: usersReducer,
  wallet: walletReducer,
});

/**
 * Handing `undefined` to the combined reducer re-initialises every slice, so
 * one dispatch drops all cached PHI at the end of a session. `ui` is reset too:
 * it holds toasts and the confirm dialog, and a lingering one can carry a
 * patient name.
 */
const rootReducer = (state, action) => {
  if (action.type === RESET_ALL) return appReducer(undefined, action);
  return appReducer(state, action);
};

export const store = configureStore({
  reducer: rootReducer,
});
