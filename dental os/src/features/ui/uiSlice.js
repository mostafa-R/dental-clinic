import { createSlice } from '@reduxjs/toolkit';
import { toFriendlyError } from '../../lib/errors';

const initialState = {
  open: false,
  title: '',
  message: '',
  fields: [],
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showErrorDialog(state, action) {
      const { title, message, fields } = toFriendlyError(action.payload);
      state.open = true;
      state.title = title;
      state.message = message;
      state.fields = fields;
    },
    clearErrorDialog(state) {
      state.open = false;
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
  toggleSidebar,
  setSidebarCollapsed,
  toggleMobileSidebar,
  setMobileSidebarOpen,
} = uiSlice.actions;

export default uiSlice.reducer;
