import { createSlice } from '@reduxjs/toolkit';
import { toFriendlyError } from '../../lib/errors';

let toastSeq = 0;

const initialState = {
  open: false,
  title: '',
  message: '',
  fields: [],
  toasts: [],
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showErrorDialog(state, action) {
      const { title, message, fields } = toFriendlyError(action.payload);
      if (fields.length > 0) {
        state.open = true;
        state.title = title;
        state.message = message;
        state.fields = fields;
        return;
      }
      toastSeq += 1;
      state.toasts.push({ id: toastSeq, type: 'error', title, message });
    },
    clearErrorDialog(state) {
      state.open = false;
    },
    pushToast(state, action) {
      toastSeq += 1;
      state.toasts.push({ id: toastSeq, ...action.payload });
    },
    dismissToast(state, action) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action) {
      state.sidebarCollapsed = action.payload;
    },
    toggleMobileSidebar(state) {
      state.mobileSidebarOpen = !state.mobileSidebarOpen;
    },
    setMobileSidebarOpen(state, action) {
      state.mobileSidebarOpen = action.payload;
    },
  },
});

export const {
  showErrorDialog,
  clearErrorDialog,
  pushToast,
  dismissToast,
  toggleSidebar,
  setSidebarCollapsed,
  toggleMobileSidebar,
  setMobileSidebarOpen,
} = uiSlice.actions;

export default uiSlice.reducer;
