import { configureStore } from '@reduxjs/toolkit';
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
import rolesReducer from '../features/roles/rolesSlice';
import uiReducer from '../features/ui/uiSlice';
import usersReducer from '../features/users/userSlice';
import walletReducer from '../features/wallet/walletSlice';

export const store = configureStore({
  reducer: {
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
    roles: rolesReducer,
    ui: uiReducer,
    users: usersReducer,
    wallet: walletReducer,
  },
});
