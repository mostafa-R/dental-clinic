import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  sidebarCollapsed: false,
  theme: localStorage.getItem("theme") || "light",
  language: localStorage.getItem("language") || "en",
  notifications: [],
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setTheme: (state, action) => {
      state.theme = action.payload;
      localStorage.setItem("theme", action.payload);
    },
    setLanguage: (state, action) => {
      state.language = action.payload;
      localStorage.setItem("language", action.payload);
    },
    addNotification: (state, action) => {
      state.notifications.push({
        id: Date.now(),
        ...action.payload,
      });
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(
        (n) => n.id !== action.payload,
      );
    },
  },
});

export const {
  toggleSidebar,
  setTheme,
  setLanguage,
  addNotification,
  removeNotification,
} = uiSlice.actions;

export default uiSlice.reducer;
